import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "").trim();
const BOOKINGS_FILE = process.env.BOOKINGS_FILE || "./data/bookings.jsonl";

const storagePath = path.resolve(__dirname, "..", BOOKINGS_FILE);

const allowedServiceTypes = new Set([
  "Oil change / maintenance",
  "Brake inspection / repair",
  "Check engine light diagnosis",
  "Battery / charging issue",
  "Steering / suspension concern",
  "Noise / vibration concern",
  "Pre-trip / seasonal inspection",
  "General diagnosis / other",
]);

const clean = (value) => String(value || "").trim();

const sanitizeBooking = (payload) => ({
  name: clean(payload.name),
  phone: clean(payload.phone),
  email: clean(payload.email),
  contactMethod: clean(payload.contactMethod),
  year: clean(payload.year),
  make: clean(payload.make),
  model: clean(payload.model),
  preferredDate: clean(payload.preferredDate),
  timeWindow: clean(payload.timeWindow),
  serviceType: clean(payload.serviceType),
  concern: clean(payload.concern),
  visitType: clean(payload.visitType),
  urgency: clean(payload.urgency),
});

const validateBooking = (booking) => {
  const errors = [];

  if (!booking.name) errors.push("Name is required.");
  if (!booking.phone) errors.push("Phone number is required.");
  if (!booking.contactMethod) errors.push("Preferred contact method is required.");
  if (!booking.year) errors.push("Vehicle year is required.");
  if (!booking.make) errors.push("Vehicle make is required.");
  if (!booking.model) errors.push("Vehicle model is required.");
  if (!booking.preferredDate) errors.push("Preferred date is required.");
  if (!booking.timeWindow) errors.push("Preferred time window is required.");
  if (!booking.serviceType) errors.push("Service type is required.");

  if (booking.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email)) {
    errors.push("Email is not valid.");
  }

  const yearNum = Number(booking.year);
  if (!Number.isInteger(yearNum) || yearNum < 1980 || yearNum > 2035) {
    errors.push("Vehicle year must be between 1980 and 2035.");
  }

  if (booking.serviceType && !allowedServiceTypes.has(booking.serviceType)) {
    errors.push("Service type is not recognized.");
  }

  if (booking.concern.length > 2500) {
    errors.push("Concern description is too long.");
  }

  return errors;
};

app.use(
  cors({
    origin(origin, callback) {
      if (!CORS_ORIGIN) return callback(null, true);
      if (!origin) return callback(null, true);
      return callback(origin === CORS_ORIGIN ? null : new Error("CORS blocked"), origin === CORS_ORIGIN);
    },
  })
);
app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sl-auto-booking-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/bookings", async (_req, res) => {
  try {
    await fs.mkdir(path.dirname(storagePath), { recursive: true });

    let raw = "";
    try {
      raw = await fs.readFile(storagePath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return res.json({ ok: true, bookings: [] });
      }
      throw error;
    }

    const bookings = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    return res.json({ ok: true, bookings });
  } catch (error) {
    console.error("Booking list failed:", error);
    return res.status(500).json({ ok: false, error: "Server error while loading bookings." });
  }
});

app.post("/api/bookings", async (req, res) => {
  try {
    if (clean(req.body.website)) {
      return res.status(400).json({ ok: false, error: "Spam rejected." });
    }

    const booking = sanitizeBooking(req.body);
    const errors = validateBooking(booking);

    if (errors.length) {
      return res.status(400).json({ ok: false, error: "Validation failed.", details: errors });
    }

    const record = {
      id: `bk_${Date.now()}`,
      createdAt: new Date().toISOString(),
      source: clean(req.body.source) || "website",
      status: "new",
      ...booking,
    };

    await fs.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.appendFile(storagePath, JSON.stringify(record) + "\n", "utf8");

    return res.status(201).json({
      ok: true,
      id: record.id,
      message: "Booking request saved.",
    });
  } catch (error) {
    console.error("Booking save failed:", error);
    return res.status(500).json({
      ok: false,
      error: "Server error while saving booking request.",
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Not found: ${req.method} ${req.path}` });
});

app.listen(PORT, () => {
  console.log(`SL Auto booking API listening on http://localhost:${PORT}`);
  console.log(`Booking storage file: ${storagePath}`);
});

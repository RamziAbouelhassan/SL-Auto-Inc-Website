import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BookingError,
  createBooking,
  createManualBooking,
  deleteBooking,
  getStorageDetails,
  listBookings,
  updateBooking,
  updateBookingArchive,
  updateBookingStatus,
} from "./lib/booking-service.mjs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const HOST = (process.env.HOST || "0.0.0.0").trim();
const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGIN = (process.env.CORS_ORIGIN || "").trim();
const frontendRoot = path.resolve(__dirname, "..", "..");

const getAccessibleUrls = (host, port) => {
  if (host !== "0.0.0.0" && host !== "::") {
    return [host === "127.0.0.1" ? `http://localhost:${port}` : `http://${host}:${port}`];
  }

  const urls = new Set([`http://localhost:${port}`]);
  const interfaces = os.networkInterfaces();

  Object.values(interfaces)
    .flat()
    .forEach((network) => {
      if (!network || network.internal || network.family !== "IPv4") return;
      urls.add(`http://${network.address}:${port}`);
    });

  return Array.from(urls);
};

const sendJsonError = (res, error, fallbackMessage) => {
  if (error instanceof BookingError) {
    const payload = { ok: false, error: error.message };
    if (error.details?.length) payload.details = error.details;
    return res.status(error.statusCode).json(payload);
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({ ok: false, error: fallbackMessage });
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
    return res.json({ ok: true, bookings: await listBookings() });
  } catch (error) {
    return sendJsonError(res, error, "Server error while loading bookings.");
  }
});

app.patch("/api/bookings/:id/status", async (req, res) => {
  try {
    const updatedBooking = await updateBookingStatus(req.params.id, req.body.status);
    return res.json({
      ok: true,
      booking: updatedBooking,
      message: "Booking status updated.",
    });
  } catch (error) {
    return sendJsonError(res, error, "Server error while updating booking status.");
  }
});

app.patch("/api/bookings/:id/archive", async (req, res) => {
  try {
    const updatedBooking = await updateBookingArchive(req.params.id, req.body.archived);
    return res.json({
      ok: true,
      booking: updatedBooking,
      message: updatedBooking.archivedAt ? "Booking archived." : "Booking restored.",
    });
  } catch (error) {
    return sendJsonError(res, error, "Server error while updating booking archive state.");
  }
});

app.patch("/api/bookings/:id", async (req, res) => {
  try {
    const updatedBooking = await updateBooking(req.params.id, req.body || {});
    return res.json({
      ok: true,
      booking: updatedBooking,
      message: "Booking request updated.",
    });
  } catch (error) {
    return sendJsonError(res, error, "Server error while updating booking request.");
  }
});

app.delete("/api/bookings/:id", async (req, res) => {
  try {
    const { deletedId } = await deleteBooking(req.params.id);
    return res.json({
      ok: true,
      deletedId,
      message: "Booking permanently deleted.",
    });
  } catch (error) {
    return sendJsonError(res, error, "Server error while deleting booking.");
  }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const record = await createBooking(req.body || {});
    return res.status(201).json({
      ok: true,
      id: record.id,
      message: "Booking request saved.",
    });
  } catch (error) {
    return sendJsonError(res, error, "Server error while saving booking request.");
  }
});

app.post("/api/bookings/manual", async (req, res) => {
  try {
    const record = await createManualBooking(req.body || {});
    return res.status(201).json({
      ok: true,
      booking: record,
      message: "Manual booking saved to accepted.",
    });
  } catch (error) {
    return sendJsonError(res, error, "Server error while saving manual booking.");
  }
});

app.use(
  express.static(frontendRoot, {
    extensions: ["html"],
  })
);

app.get("/booking", (_req, res) => {
  res.redirect(302, "/booking.html");
});

app.use((req, res) => {
  if (req.path.startsWith("/api/") || req.path === "/health") {
    return res.status(404).json({ ok: false, error: `Not found: ${req.method} ${req.path}` });
  }

  return res.status(404).type("text/plain").send(`Not found: ${req.method} ${req.path}`);
});

app.listen(PORT, HOST, () => {
  console.log("SL Auto ChatGPT site available at:");
  getAccessibleUrls(HOST, PORT).forEach((url) => {
    console.log(`- ${url}`);
  });
  const storageDetails = getStorageDetails();
  if (storageDetails.usingSupabase) {
    console.log("Booking storage: Supabase");
  } else {
    console.log(`Booking storage file: ${storageDetails.bookingsFile}`);
  }
});

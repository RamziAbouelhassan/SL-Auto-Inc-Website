import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");

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
const allowedBookingStatuses = new Set(["new", "accepted", "rejected"]);
const ARCHIVE_RETENTION_DAYS = 30;

export class BookingError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = "BookingError";
    this.statusCode = statusCode;
    this.details = Array.isArray(details) ? details : undefined;
  }
}

export const getStorageDetails = () => ({
  mode: resolveStorageMode(),
  bookingsFile: getStoragePath(),
  usingSupabase: resolveStorageMode() === "supabase",
});

export const sanitizeBooking = (payload) => ({
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

export const validateBooking = (booking) => {
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

  if (booking.preferredDate) {
    const preferredDate = new Date(`${booking.preferredDate}T12:00:00`);
    if (Number.isNaN(preferredDate.getTime())) {
      errors.push("Preferred date is not valid.");
    } else if (preferredDate.getDay() === 6) {
      errors.push("Saturday appointments are unavailable. Please choose another day.");
    }
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

export const listBookings = async () => {
  const storageMode = resolveStorageMode();
  const bookings =
    storageMode === "supabase" ? await listSupabaseBookings() : await readFileBookings();

  return bookings.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
};

export const createBooking = async (payload) => {
  return createBookingRecord(payload, {
    defaultSource: clean(payload.source) || "website",
    defaultStatus: "new",
    rejectSpam: true,
  });
};

export const createManualBooking = async (payload) =>
  createBookingRecord(payload, {
    defaultSource: clean(payload.source) || "manual-entry",
    defaultStatus: "accepted",
    rejectSpam: false,
  });

export const updateBooking = async (bookingId, payload) => {
  const bookingIdClean = clean(bookingId);
  if (!bookingIdClean) {
    throw new BookingError(400, "Booking id is required.");
  }

  if (clean(payload.website)) {
    throw new BookingError(400, "Spam rejected.");
  }

  const booking = sanitizeBooking(payload);
  const errors = validateBooking(booking);
  if (errors.length) {
    throw new BookingError(400, "Validation failed.", errors);
  }

  const updatedAt = new Date().toISOString();

  return resolveStorageMode() === "supabase"
    ? patchSupabaseBooking(bookingIdClean, {
        ...booking,
        updatedAt,
      })
    : patchFileBooking(bookingIdClean, (currentBooking) => ({
        ...currentBooking,
        ...booking,
        updatedAt,
      }));
};

export const updateBookingStatus = async (bookingId, statusInput) => {
  const bookingIdClean = clean(bookingId);
  const status = clean(statusInput).toLowerCase();

  if (!bookingIdClean) {
    throw new BookingError(400, "Booking id is required.");
  }

  if (!allowedBookingStatuses.has(status)) {
    throw new BookingError(400, "Status is not recognized.");
  }

  return resolveStorageMode() === "supabase"
    ? patchSupabaseBooking(bookingIdClean, {
        status,
        updatedAt: new Date().toISOString(),
      })
    : patchFileBooking(bookingIdClean, (currentBooking) => ({
        ...currentBooking,
        status,
        updatedAt: new Date().toISOString(),
      }));
};

export const updateBookingArchive = async (bookingId, archivedInput) => {
  const bookingIdClean = clean(bookingId);
  if (!bookingIdClean) {
    throw new BookingError(400, "Booking id is required.");
  }

  const shouldArchive = parseBoolean(archivedInput);
  const nowIso = new Date().toISOString();

  return resolveStorageMode() === "supabase"
    ? patchSupabaseBooking(bookingIdClean, null, (currentBooking) => {
        const currentStatus = clean(currentBooking.status).toLowerCase() || "new";
        if (shouldArchive && currentStatus === "new") {
          throw new BookingError(400, "Pending bookings cannot be archived yet.");
        }

        return {
          archivedAt: shouldArchive ? nowIso : null,
          updatedAt: nowIso,
        };
      })
    : patchFileBooking(bookingIdClean, (currentBooking) => {
        const currentStatus = clean(currentBooking.status).toLowerCase() || "new";
        if (shouldArchive && currentStatus === "new") {
          throw new BookingError(400, "Pending bookings cannot be archived yet.");
        }

        return {
          ...currentBooking,
          archivedAt: shouldArchive ? nowIso : null,
          updatedAt: nowIso,
        };
      });
};

export const deleteBooking = async (bookingId) => {
  const bookingIdClean = clean(bookingId);
  if (!bookingIdClean) {
    throw new BookingError(400, "Booking id is required.");
  }

  if (resolveStorageMode() === "supabase") {
    await deleteSupabaseBooking(bookingIdClean);
  } else {
    await deleteFileBooking(bookingIdClean);
  }

  return { deletedId: bookingIdClean };
};

const cleanNullable = (value) => {
  const cleaned = clean(value);
  return cleaned || null;
};

function clean(value) {
  return String(value || "").trim();
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = clean(value).toLowerCase();
  if (!normalized) return false;
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function getStoragePath() {
  const rawBookingsFile = process.env.BOOKINGS_FILE || "./data/bookings.jsonl";
  return path.resolve(BACKEND_ROOT, rawBookingsFile);
}

function getBookingStorageSetting() {
  return clean(process.env.BOOKING_STORAGE).toLowerCase();
}

function getSupabaseConfig() {
  return {
    url: clean(process.env.SUPABASE_URL).replace(/\/+$/, ""),
    serviceRoleKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    table: clean(process.env.SUPABASE_TABLE || "bookings"),
  };
}

function resolveStorageMode() {
  const bookingStorage = getBookingStorageSetting();
  const supabaseConfig = getSupabaseConfig();

  if (bookingStorage && bookingStorage !== "file" && bookingStorage !== "supabase") {
    throw new BookingError(500, `Unsupported BOOKING_STORAGE value: ${bookingStorage}`);
  }

  if (bookingStorage === "supabase") {
    ensureSupabaseConfigured();
    return "supabase";
  }

  if (bookingStorage === "file") {
    ensureFileStorageAllowed();
    return "file";
  }

  if (supabaseConfig.url && supabaseConfig.serviceRoleKey) {
    return "supabase";
  }

  ensureFileStorageAllowed();
  return "file";
}

function ensureSupabaseConfigured() {
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig.url || !supabaseConfig.serviceRoleKey) {
    throw new BookingError(
      500,
      "Supabase storage is selected, but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing."
    );
  }
}

function ensureFileStorageAllowed() {
  const netlifyEnabled = clean(process.env.NETLIFY).toLowerCase() === "true";
  const netlifyContext = clean(process.env.CONTEXT).toLowerCase();
  const isProductionNetlify = netlifyEnabled && netlifyContext && netlifyContext !== "dev";
  if (isProductionNetlify) {
    throw new BookingError(
      500,
      "File-based bookings are disabled on production Netlify deploys. Configure Supabase first."
    );
  }
}

function parseBookings(raw) {
  return raw
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
    .filter(Boolean);
}

function isArchiveExpired(booking, now = Date.now()) {
  const archivedAt = clean(booking.archivedAt);
  if (!archivedAt) return false;

  const archivedTime = new Date(archivedAt).getTime();
  if (!Number.isFinite(archivedTime)) return false;

  const retentionMs = ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return archivedTime + retentionMs <= now;
}

async function readFileBookings() {
  const storagePath = getStoragePath();
  await fs.mkdir(path.dirname(storagePath), { recursive: true });

  try {
    const raw = await fs.readFile(storagePath, "utf8");
    const parsed = parseBookings(raw);
    const activeBookings = parsed.filter((booking) => !isArchiveExpired(booking));

    if (activeBookings.length !== parsed.length) {
      await writeFileBookings(activeBookings);
    }

    return activeBookings;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function appendFileBooking(record) {
  const storagePath = getStoragePath();
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.appendFile(storagePath, JSON.stringify(record) + "\n", "utf8");
}

async function createBookingRecord(
  payload,
  { defaultSource = "website", defaultStatus = "new", rejectSpam = true } = {}
) {
  if (rejectSpam && clean(payload.website)) {
    throw new BookingError(400, "Spam rejected.");
  }

  if (!allowedBookingStatuses.has(defaultStatus)) {
    throw new BookingError(500, `Unsupported booking status: ${defaultStatus}`);
  }

  const booking = sanitizeBooking(payload);
  const errors = validateBooking(booking);
  if (errors.length) {
    throw new BookingError(400, "Validation failed.", errors);
  }

  const record = {
    id: `bk_${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: defaultSource,
    status: defaultStatus,
    archivedAt: null,
    updatedAt: null,
    ...booking,
  };

  if (resolveStorageMode() === "supabase") {
    return insertSupabaseBooking(record);
  }

  await appendFileBooking(record);
  return record;
}

async function writeFileBookings(bookings) {
  const storagePath = getStoragePath();
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  const serialized = bookings.map((booking) => JSON.stringify(booking)).join("\n");
  await fs.writeFile(storagePath, serialized ? serialized + "\n" : "", "utf8");
}

async function patchFileBooking(bookingId, updater) {
  const bookings = await readFileBookings();
  const bookingIndex = bookings.findIndex((booking) => clean(booking.id) === bookingId);

  if (bookingIndex < 0) {
    throw new BookingError(404, "Booking not found.");
  }

  const updatedBooking = updater(bookings[bookingIndex]);
  bookings[bookingIndex] = updatedBooking;
  await writeFileBookings(bookings);
  return updatedBooking;
}

async function deleteFileBooking(bookingId) {
  const bookings = await readFileBookings();
  const nextBookings = bookings.filter((booking) => clean(booking.id) !== bookingId);

  if (nextBookings.length === bookings.length) {
    throw new BookingError(404, "Booking not found.");
  }

  await writeFileBookings(nextBookings);
}

async function listSupabaseBookings() {
  ensureSupabaseConfigured();
  const supabaseConfig = getSupabaseConfig();

  const rows = await supabaseRequest(
    `${encodeURIComponent(supabaseConfig.table)}?select=*&order=created_at.desc`
  );
  const bookings = Array.isArray(rows) ? rows.map(mapSupabaseRowToBooking) : [];
  const expiredBookings = bookings.filter((booking) => isArchiveExpired(booking));

  if (expiredBookings.length) {
    await Promise.allSettled(expiredBookings.map((booking) => deleteSupabaseBooking(booking.id)));
  }

  return bookings.filter((booking) => !isArchiveExpired(booking));
}

async function insertSupabaseBooking(record) {
  const supabaseConfig = getSupabaseConfig();
  const rows = await supabaseRequest(encodeURIComponent(supabaseConfig.table), {
    method: "POST",
    body: [mapBookingToSupabaseRow(record)],
    prefer: "return=representation",
  });

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new BookingError(500, "Could not save booking request.");
  }

  return mapSupabaseRowToBooking(rows[0]);
}

async function patchSupabaseBooking(bookingId, partialUpdate, dynamicUpdater) {
  const supabaseConfig = getSupabaseConfig();
  const currentBooking = await getSupabaseBooking(bookingId);
  const updates = dynamicUpdater ? dynamicUpdater(currentBooking) : partialUpdate;

  const rows = await supabaseRequest(
    `${encodeURIComponent(supabaseConfig.table)}?id=eq.${encodeURIComponent(bookingId)}&select=*`,
    {
      method: "PATCH",
      body: mapBookingPatchToSupabaseRow(updates),
      prefer: "return=representation",
    }
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new BookingError(404, "Booking not found.");
  }

  return mapSupabaseRowToBooking(rows[0]);
}

async function deleteSupabaseBooking(bookingId) {
  const supabaseConfig = getSupabaseConfig();
  const rows = await supabaseRequest(
    `${encodeURIComponent(supabaseConfig.table)}?id=eq.${encodeURIComponent(bookingId)}&select=*`,
    {
      method: "DELETE",
      prefer: "return=representation",
    }
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new BookingError(404, "Booking not found.");
  }
}

async function getSupabaseBooking(bookingId) {
  const supabaseConfig = getSupabaseConfig();
  const rows = await supabaseRequest(
    `${encodeURIComponent(supabaseConfig.table)}?id=eq.${encodeURIComponent(bookingId)}&select=*&limit=1`
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new BookingError(404, "Booking not found.");
  }

  return mapSupabaseRowToBooking(rows[0]);
}

async function supabaseRequest(query, { method = "GET", body, prefer } = {}) {
  const supabaseConfig = getSupabaseConfig();
  const headers = {
    apikey: supabaseConfig.serviceRoleKey,
    Authorization: `Bearer ${supabaseConfig.serviceRoleKey}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (prefer) {
    headers.Prefer = prefer;
  }

  const response = await fetch(`${supabaseConfig.url}/rest/v1/${query}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const rawText = await response.text();
  const payload = rawText ? tryParseJson(rawText) : null;

  if (!response.ok) {
    const message =
      (payload && (payload.message || payload.error_description || payload.error)) ||
      rawText ||
      "Supabase request failed.";
    throw new BookingError(500, message);
  }

  return payload;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapSupabaseRowToBooking(row) {
  return {
    id: clean(row.id),
    createdAt: clean(row.created_at || row.createdAt),
    updatedAt: cleanNullable(row.updated_at || row.updatedAt),
    archivedAt: cleanNullable(row.archived_at || row.archivedAt),
    source: cleanNullable(row.source),
    status: cleanNullable(row.status),
    name: clean(row.name),
    phone: clean(row.phone),
    email: cleanNullable(row.email),
    contactMethod: cleanNullable(row.contact_method || row.contactMethod),
    year: clean(row.year),
    make: clean(row.make),
    model: clean(row.model),
    preferredDate: clean(row.preferred_date || row.preferredDate),
    timeWindow: clean(row.time_window || row.timeWindow),
    serviceType: clean(row.service_type || row.serviceType),
    concern: clean(row.concern),
    visitType: cleanNullable(row.visit_type || row.visitType),
    urgency: cleanNullable(row.urgency),
  };
}

function mapBookingToSupabaseRow(record) {
  return {
    id: record.id,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    archived_at: record.archivedAt,
    source: record.source,
    status: record.status,
    name: record.name,
    phone: record.phone,
    email: record.email,
    contact_method: record.contactMethod,
    year: record.year,
    make: record.make,
    model: record.model,
    preferred_date: record.preferredDate,
    time_window: record.timeWindow,
    service_type: record.serviceType,
    concern: record.concern,
    visit_type: record.visitType,
    urgency: record.urgency,
  };
}

function mapBookingPatchToSupabaseRow(partial) {
  const output = {};

  if (Object.hasOwn(partial, "name")) output.name = partial.name;
  if (Object.hasOwn(partial, "phone")) output.phone = partial.phone;
  if (Object.hasOwn(partial, "email")) output.email = partial.email;
  if (Object.hasOwn(partial, "contactMethod")) output.contact_method = partial.contactMethod;
  if (Object.hasOwn(partial, "year")) output.year = partial.year;
  if (Object.hasOwn(partial, "make")) output.make = partial.make;
  if (Object.hasOwn(partial, "model")) output.model = partial.model;
  if (Object.hasOwn(partial, "preferredDate")) output.preferred_date = partial.preferredDate;
  if (Object.hasOwn(partial, "timeWindow")) output.time_window = partial.timeWindow;
  if (Object.hasOwn(partial, "serviceType")) output.service_type = partial.serviceType;
  if (Object.hasOwn(partial, "concern")) output.concern = partial.concern;
  if (Object.hasOwn(partial, "visitType")) output.visit_type = partial.visitType;
  if (Object.hasOwn(partial, "urgency")) output.urgency = partial.urgency;
  if (Object.hasOwn(partial, "updatedAt")) output.updated_at = partial.updatedAt;
  if (Object.hasOwn(partial, "archivedAt")) output.archived_at = partial.archivedAt;
  if (Object.hasOwn(partial, "status")) output.status = partial.status;

  return output;
}

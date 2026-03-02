import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BookingError,
  createBooking,
  createManualBooking,
  deleteBooking,
  listBookings,
  updateBooking,
  updateBookingArchive,
  updateBookingStatus,
} from "../backend/src/lib/booking-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = (process.env.HOST || "0.0.0.0").trim();
const PORT = Number(process.env.PORT || 4310);
const WEB_ROOT = __dirname;
const JSON_LIMIT_BYTES = 100 * 1024;

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
]);

const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};

const sendText = (res, statusCode, body, contentType = "text/plain; charset=utf-8") => {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};

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
    return sendJson(res, error.statusCode, payload);
  }

  console.error(fallbackMessage, error);
  return sendJson(res, 500, { ok: false, error: fallbackMessage });
};

const readJsonBody = async (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > JSON_LIMIT_BYTES) {
        reject(new BookingError(413, "Request body is too large."));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new BookingError(400, "Request body must be valid JSON."));
      }
    });

    req.on("error", reject);
  });

const safeStaticPath = (pathname) => {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const resolvedPath = path.resolve(WEB_ROOT, `.${decodedPath}`);

  if (!resolvedPath.startsWith(WEB_ROOT)) {
    return null;
  }

  return resolvedPath;
};

const serveStaticFile = async (res, pathname) => {
  const filePath = safeStaticPath(pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES.get(extension) || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType, "Content-Length": file.length });
    res.end(file);
  } catch (error) {
    if (error?.code === "ENOENT") {
      sendText(res, 404, `Not found: ${pathname}`);
      return;
    }

    console.error("Static file error", error);
    sendText(res, 500, "Server error");
  }
};

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendText(res, 400, "Bad request");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "sl-auto-booking-api",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/bookings") {
    try {
      sendJson(res, 200, { ok: true, bookings: await listBookings() });
    } catch (error) {
      sendJsonError(res, error, "Server error while loading bookings.");
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/bookings") {
    try {
      const record = await createBooking(await readJsonBody(req));
      sendJson(res, 201, {
        ok: true,
        id: record.id,
        message: "Booking request saved.",
      });
    } catch (error) {
      sendJsonError(res, error, "Server error while saving booking request.");
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/bookings/manual") {
    try {
      const record = await createManualBooking(await readJsonBody(req));
      sendJson(res, 201, {
        ok: true,
        booking: record,
        message: "Manual booking saved to accepted.",
      });
    } catch (error) {
      sendJsonError(res, error, "Server error while saving manual booking.");
    }
    return;
  }

  const statusMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    try {
      const body = await readJsonBody(req);
      const booking = await updateBookingStatus(statusMatch[1], body.status);
      sendJson(res, 200, {
        ok: true,
        booking,
        message: "Booking status updated.",
      });
    } catch (error) {
      sendJsonError(res, error, "Server error while updating booking status.");
    }
    return;
  }

  const archiveMatch = pathname.match(/^\/api\/bookings\/([^/]+)\/archive$/);
  if (req.method === "PATCH" && archiveMatch) {
    try {
      const body = await readJsonBody(req);
      const booking = await updateBookingArchive(archiveMatch[1], body.archived);
      sendJson(res, 200, {
        ok: true,
        booking,
        message: booking.archivedAt ? "Booking archived." : "Booking restored.",
      });
    } catch (error) {
      sendJsonError(res, error, "Server error while updating booking archive state.");
    }
    return;
  }

  const bookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (bookingMatch && req.method === "PATCH") {
    try {
      const booking = await updateBooking(bookingMatch[1], await readJsonBody(req));
      sendJson(res, 200, {
        ok: true,
        booking,
        message: "Booking request updated.",
      });
    } catch (error) {
      sendJsonError(res, error, "Server error while updating booking request.");
    }
    return;
  }

  if (bookingMatch && req.method === "DELETE") {
    try {
      const { deletedId } = await deleteBooking(bookingMatch[1]);
      sendJson(res, 200, {
        ok: true,
        deletedId,
        message: "Booking permanently deleted.",
      });
    } catch (error) {
      sendJsonError(res, error, "Server error while deleting booking.");
    }
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(res, 404, { ok: false, error: `Not found: ${req.method} ${pathname}` });
    return;
  }

  serveStaticFile(res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log("SL Auto Admin available at:");
  getAccessibleUrls(HOST, PORT).forEach((url) => {
    console.log(`- ${url}`);
  });
  console.log("API health path: /health");
});

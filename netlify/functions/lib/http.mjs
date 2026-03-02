import { BookingError } from "../../../ChatGPT/backend/src/lib/booking-service.mjs";

const CORS_ORIGIN = String(process.env.CORS_ORIGIN || "").trim();

export const jsonResponse = (event, statusCode, payload, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...buildCorsHeaders(event),
    ...extraHeaders,
  },
  body: JSON.stringify(payload),
});

export const noContentResponse = (event, methods) => ({
  statusCode: 204,
  headers: {
    ...buildCorsHeaders(event),
    "Access-Control-Allow-Methods": methods.join(", "),
  },
  body: "",
});

export const methodNotAllowed = (event, methods) =>
  jsonResponse(
    event,
    405,
    {
      ok: false,
      error: `Method not allowed. Use ${methods.join(", ")}.`,
    },
    {
      Allow: methods.join(", "),
      "Access-Control-Allow-Methods": methods.join(", "),
    }
  );

export const parseJsonBody = (event) => {
  if (!event.body) return {};

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new BookingError(400, "Request body must be valid JSON.");
  }
};

export const getQueryParam = (event, key) => {
  const directValue = event.queryStringParameters?.[key];
  if (directValue) return String(directValue);

  if (event.rawUrl) {
    const url = new URL(event.rawUrl);
    return url.searchParams.get(key) || "";
  }

  return "";
};

export const assertAllowedOrigin = (event) => {
  if (!CORS_ORIGIN) return;

  const origin = event.headers?.origin || event.headers?.Origin || "";
  if (!origin || origin === CORS_ORIGIN) return;

  throw new BookingError(403, "CORS blocked.");
};

export const handleApiError = (event, error, fallbackMessage) => {
  if (error instanceof BookingError) {
    const payload = { ok: false, error: error.message };
    if (error.details?.length) payload.details = error.details;
    return jsonResponse(event, error.statusCode, payload);
  }

  console.error(fallbackMessage, error);
  return jsonResponse(event, 500, {
    ok: false,
    error: fallbackMessage,
  });
};

function buildCorsHeaders(event) {
  const requestOrigin = event.headers?.origin || event.headers?.Origin || "";

  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN || requestOrigin || "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

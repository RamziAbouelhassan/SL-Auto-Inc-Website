import { jsonResponse, noContentResponse } from "./lib/http.mjs";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return noContentResponse(event, ["GET", "OPTIONS"]);
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(event, 405, {
      ok: false,
      error: "Method not allowed. Use GET.",
    });
  }

  return jsonResponse(event, 200, {
    ok: true,
    service: "sl-auto-booking-api",
    timestamp: new Date().toISOString(),
  });
}

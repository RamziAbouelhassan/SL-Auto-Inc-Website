import { updateBookingArchive } from "../../ChatGPT/backend/src/lib/booking-service.mjs";
import {
  assertAllowedOrigin,
  getQueryParam,
  handleApiError,
  jsonResponse,
  methodNotAllowed,
  noContentResponse,
  parseJsonBody,
} from "./lib/http.mjs";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return noContentResponse(event, ["PATCH", "OPTIONS"]);
  }

  if (event.httpMethod !== "PATCH") {
    return methodNotAllowed(event, ["PATCH", "OPTIONS"]);
  }

  try {
    assertAllowedOrigin(event);
    const payload = parseJsonBody(event);
    const booking = await updateBookingArchive(getQueryParam(event, "id"), payload.archived);

    return jsonResponse(event, 200, {
      ok: true,
      booking,
      message: booking.archivedAt ? "Booking archived." : "Booking restored.",
    });
  } catch (error) {
    return handleApiError(event, error, "Server error while updating booking archive state.");
  }
}

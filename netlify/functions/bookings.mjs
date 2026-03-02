import { createBooking, listBookings } from "../../ChatGPT/backend/src/lib/booking-service.mjs";
import {
  assertAllowedOrigin,
  handleApiError,
  jsonResponse,
  methodNotAllowed,
  noContentResponse,
  parseJsonBody,
} from "./lib/http.mjs";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return noContentResponse(event, ["GET", "POST", "OPTIONS"]);
  }

  try {
    assertAllowedOrigin(event);

    if (event.httpMethod === "GET") {
      return jsonResponse(event, 200, {
        ok: true,
        bookings: await listBookings(),
      });
    }

    if (event.httpMethod === "POST") {
      const record = await createBooking(parseJsonBody(event));
      return jsonResponse(event, 201, {
        ok: true,
        id: record.id,
        message: "Booking request saved.",
      });
    }

    return methodNotAllowed(event, ["GET", "POST", "OPTIONS"]);
  } catch (error) {
    return handleApiError(event, error, "Server error while handling bookings.");
  }
}

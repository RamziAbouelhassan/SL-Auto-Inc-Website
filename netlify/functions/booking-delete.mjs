import { deleteBooking, updateBooking } from "../../ChatGPT/backend/src/lib/booking-service.mjs";
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
    return noContentResponse(event, ["PATCH", "DELETE", "OPTIONS"]);
  }

  try {
    assertAllowedOrigin(event);

    if (event.httpMethod === "PATCH") {
      const booking = await updateBooking(getQueryParam(event, "id"), parseJsonBody(event));

      return jsonResponse(event, 200, {
        ok: true,
        booking,
        message: "Booking request updated.",
      });
    }

    if (event.httpMethod !== "DELETE") {
      return methodNotAllowed(event, ["PATCH", "DELETE", "OPTIONS"]);
    }

    const result = await deleteBooking(getQueryParam(event, "id"));

    return jsonResponse(event, 200, {
      ok: true,
      deletedId: result.deletedId,
      message: "Booking permanently deleted.",
    });
  } catch (error) {
    return handleApiError(event, error, "Server error while handling booking.");
  }
}

(function () {
  "use strict";

  const STORAGE_KEY = "sl_auto_admin.web.apiBaseURL";
  const ARCHIVE_RETENTION_DAYS = 30;
  const API_SERVICE_NAME = "sl-auto-booking-api";
  const DEFAULT_API_PORT = "4310";
  const DETAIL_MODES = {
    desk: "desk",
    calendar: "calendar",
  };
  const DESK_FILTERS = {
    all: "all",
    today: "today",
    urgent: "urgent",
  };
  const VIEWS = {
    inbox: "inbox",
    rejected: "rejected",
    archived: "archived",
  };
  const ARCHIVED_FILTERS = {
    all: "all",
    completed: "completed",
    rejected: "rejected",
  };
  const STATUS_META = {
    new: { label: "New", tone: "blue" },
    accepted: { label: "Accepted", tone: "green" },
    rejected: { label: "Rejected", tone: "gray" },
  };
  const MANUAL_SOURCE_OPTIONS = ["Phone call", "Walk-in", "Existing customer", "Other"];
  const CONTACT_METHOD_OPTIONS = ["Phone call", "Text message", "Email"];
  const TIME_WINDOW_OPTIONS = [
    "Morning (9 AM - 12 PM)",
    "Midday (12 PM - 3 PM)",
    "Afternoon (3 PM - 6 PM)",
    "Flexible (shop can suggest best time)",
  ];
  const SERVICE_OPTIONS = [
    "Oil change / maintenance",
    "Brake inspection / repair",
    "Check engine light diagnosis",
    "Battery / charging issue",
    "Steering / suspension concern",
    "Noise / vibration concern",
    "Pre-trip / seasonal inspection",
    "General diagnosis / other",
  ];
  const VISIT_TYPE_OPTIONS = [
    "Not sure yet",
    "Drop-off",
    "Wait if possible",
    "Need shuttle / ride info (if available)",
  ];
  const URGENCY_OPTIONS = [
    "Standard booking request",
    "Soon (next 1-2 days)",
    "Urgent - vehicle issue affecting drivability",
  ];
  const app = document.getElementById("app");

  const state = {
    bookings: [],
    isLoading: false,
    updatingIds: new Set(),
    errorMessage: "",
    apiBaseUrl: loadStoredBaseUrl(),
    lastLoadedAt: null,
    currentView: VIEWS.inbox,
    archivedFilter: ARCHIVED_FILTERS.all,
    selectedBookingId: "",
    detailMode: DETAIL_MODES.desk,
    calendarMonth: getMonthStartValue(new Date()),
    selectedCalendarDate: getTodayDateValue(),
    deskSearchQuery: "",
    deskFilter: DESK_FILTERS.all,
    manualDraft: createDefaultManualDraft(),
    isCreatingManual: false,
    manualSuccessMessage: "",
    showManualForm: false,
    rescheduleDraft: createDefaultRescheduleDraft(),
    rescheduleCalendarMonth: getMonthStartValue(new Date()),
    isSavingReschedule: false,
    showRescheduleForm: false,
    sectionOpen: {
      pending: false,
      accepted: false,
    },
  };

  const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const dateOnlyFormatter = new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const monthTitleFormatter = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
  });
  const shortDateFormatter = new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const compactDateFormatter = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  });
  const timeOnlyFormatter = new Intl.DateTimeFormat("en-CA", {
    timeStyle: "short",
  });
  const weekdayFormatter = new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
  });
  const calendarWeekdayLabels = Array.from({ length: 7 }, (_, index) =>
    weekdayFormatter.format(new Date(2024, 0, 7 + index))
  );

  function formatDateInputValue(date) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
  }

  function getDateFromValue(value) {
    if (!value) return null;
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getMonthStartValue(date) {
    const monthDate = new Date(date);
    monthDate.setHours(12, 0, 0, 0);
    monthDate.setDate(1);
    return formatDateInputValue(monthDate);
  }

  function getTodayDateValue() {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return formatDateInputValue(today);
  }

  function getNextBookableDateValue() {
    const nextDate = new Date();
    nextDate.setHours(12, 0, 0, 0);

    while (nextDate.getDay() === 6) {
      nextDate.setDate(nextDate.getDate() + 1);
    }

    return formatDateInputValue(nextDate);
  }

  function createDefaultManualDraft() {
    return {
      source: "Phone call",
      name: "",
      phone: "",
      email: "",
      contactMethod: "Phone call",
      year: "",
      make: "",
      model: "",
      preferredDate: getNextBookableDateValue(),
      timeWindow: "Flexible (shop can suggest best time)",
      serviceType: "",
      concern: "",
      visitType: "Not sure yet",
      urgency: "Standard booking request",
    };
  }

  function createDefaultRescheduleDraft() {
    return {
      bookingId: "",
      preferredDate: getNextBookableDateValue(),
      timeWindow: TIME_WINDOW_OPTIONS[3],
    };
  }

  function normalizeManualDraft(values = {}) {
    return {
      ...createDefaultManualDraft(),
      ...Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, String(value ?? "").trim()])
      ),
    };
  }

  function getBookingDateValue(booking) {
    return booking?.preferredDate && getDateFromValue(booking.preferredDate) ? booking.preferredDate : "";
  }

  function sameMonth(dateValue, monthValue) {
    return String(dateValue || "").slice(0, 7) === String(monthValue || "").slice(0, 7);
  }

  function getVisibleCalendarBookings() {
    const counts = getCounts();
    return [...counts.pending, ...counts.accepted].filter((booking) => getBookingDateValue(booking));
  }

  function getBookingsForCalendarDate(dateValue) {
    return getVisibleCalendarBookings().filter((booking) => getBookingDateValue(booking) === dateValue);
  }

  function getBestCalendarDate(monthValue) {
    const today = getTodayDateValue();
    if (sameMonth(today, monthValue)) {
      return today;
    }

    const monthBooking = getVisibleCalendarBookings()
      .filter((booking) => sameMonth(getBookingDateValue(booking), monthValue))
      .sort((left, right) => String(getBookingDateValue(left)).localeCompare(String(getBookingDateValue(right))))[0];
    if (monthBooking) {
      return getBookingDateValue(monthBooking);
    }

    return monthValue;
  }

  function syncCalendarToSelection() {
    const selected = selectedBooking();
    const selectedDate = getBookingDateValue(selected);
    if (selectedDate) {
      state.selectedCalendarDate = selectedDate;
      state.calendarMonth = getMonthStartValue(getDateFromValue(selectedDate));
      return;
    }

    if (!sameMonth(state.selectedCalendarDate, state.calendarMonth)) {
      state.selectedCalendarDate = getBestCalendarDate(state.calendarMonth);
    }
  }

  function setDetailMode(mode) {
    if (!Object.values(DETAIL_MODES).includes(mode)) return;
    state.detailMode = mode;

    if (mode === DETAIL_MODES.calendar) {
      syncCalendarToSelection();
    }
  }

  function shiftCalendarMonth(monthDelta) {
    const monthDate = getDateFromValue(state.calendarMonth) || getDateFromValue(getTodayDateValue()) || new Date();
    monthDate.setMonth(monthDate.getMonth() + monthDelta);
    monthDate.setDate(1);
    state.calendarMonth = getMonthStartValue(monthDate);
    state.selectedCalendarDate = getBestCalendarDate(state.calendarMonth);
  }

  function buildCalendarDays(monthValue) {
    const monthDate = getDateFromValue(monthValue) || getDateFromValue(getTodayDateValue()) || new Date();
    const calendarStart = new Date(monthDate);
    calendarStart.setDate(1 - monthDate.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(calendarStart);
      date.setDate(calendarStart.getDate() + index);
      const dateValue = formatDateInputValue(date);
      return {
        date,
        dateValue,
        dayNumber: date.getDate(),
        isCurrentMonth: sameMonth(dateValue, monthValue),
        isToday: dateValue === getTodayDateValue(),
        bookings: getBookingsForCalendarDate(dateValue),
      };
    });
  }

  function readManualDraft(form) {
    if (!form) return normalizeManualDraft(state.manualDraft);

    const formData = new FormData(form);
    return normalizeManualDraft({
      source: formData.get("source"),
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      contactMethod: formData.get("contactMethod"),
      year: formData.get("year"),
      make: formData.get("make"),
      model: formData.get("model"),
      preferredDate: formData.get("preferredDate"),
      timeWindow: formData.get("timeWindow"),
      serviceType: formData.get("serviceType"),
      concern: formData.get("concern"),
      visitType: formData.get("visitType"),
      urgency: formData.get("urgency"),
    });
  }

  function readRescheduleDraft(form) {
    if (!form) return { ...state.rescheduleDraft };

    const formData = new FormData(form);
    return {
      bookingId: String(formData.get("bookingId") || "").trim(),
      preferredDate: String(formData.get("preferredDate") || "").trim(),
      timeWindow: String(formData.get("timeWindow") || "").trim(),
    };
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("hashchange", applyRouteFromHash);
  document.body.addEventListener("click", handleClick);
  document.body.addEventListener("input", handleManualDraftChange);
  document.body.addEventListener("input", handleDeskControlsChange);
  document.body.addEventListener("change", handleManualDraftChange);
  document.body.addEventListener("change", handleDeskControlsChange);
  document.body.addEventListener("submit", handleSubmit);

  function init() {
    applyRouteFromHash();
    render();
    loadBookings();
  }

  function loadStoredBaseUrl() {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;

    if (window.location.protocol.startsWith("http")) {
      const locationUrl = new URL(window.location.href);
      if (locationUrl.port === "3000") {
        locationUrl.port = DEFAULT_API_PORT;
        return locationUrl.origin;
      }

      return `${window.location.protocol}//${window.location.host}`;
    }

    return `http://localhost:${DEFAULT_API_PORT}`;
  }

  function normalizeBaseUrl(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function setHash(view, bookingId) {
    const params = new URLSearchParams();
    params.set("view", view);
    if (bookingId) params.set("booking", bookingId);
    const nextHash = params.toString();
    if (window.location.hash.slice(1) !== nextHash) {
      window.location.hash = nextHash;
    }
  }

  function applyRouteFromHash() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const view = params.get("view");
    const bookingId = params.get("booking") || "";

    if (view && Object.values(VIEWS).includes(view)) {
      state.currentView = view;
    }

    state.selectedBookingId = bookingId;
    reconcileSelection();
    render();
  }

  async function loadBookings() {
    state.isLoading = true;
    state.errorMessage = "";
    render();

    try {
      const resolvedBaseUrl = await resolveWorkingBaseUrl(state.apiBaseUrl);
      state.apiBaseUrl = resolvedBaseUrl;
      window.localStorage.setItem(STORAGE_KEY, resolvedBaseUrl);

      const payload = await fetchBookings(resolvedBaseUrl);
      state.bookings = sortBookings(payload.bookings);
      state.lastLoadedAt = new Date();
      reconcileSelection();
    } catch (error) {
      state.errorMessage = await describeConnectionError(state.apiBaseUrl, error);
    } finally {
      state.isLoading = false;
      render();
    }
  }

  async function mutateBooking(bookingId, url, method, body, fallbackError) {
    state.updatingIds.add(bookingId);
    state.errorMessage = "";
    render();

    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await parseResponse(response, fallbackError);

      if (payload.booking) {
        upsertBooking(payload.booking);
      } else if (payload.deletedId) {
        state.bookings = state.bookings.filter((booking) => booking.id !== payload.deletedId);
      }

      reconcileSelection();
    } catch (error) {
      state.errorMessage = error.message || fallbackError;
    } finally {
      state.updatingIds.delete(bookingId);
      render();
    }
  }

  async function parseResponse(response, fallbackError) {
    let payload = {};

    try {
      payload = await response.json();
    } catch (_error) {
      payload = {};
    }

    if (!response.ok) {
      const details = Array.isArray(payload.details) ? payload.details.join(" ") : "";
      const message = payload.error || details || fallbackError;
      throw new Error(message);
    }

    return payload;
  }

  async function fetchBookings(baseUrl) {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/bookings`);
    return parseResponse(response, "Server error loading bookings.");
  }

  async function resolveWorkingBaseUrl(baseUrl) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

    if (await isBookingApi(normalizedBaseUrl)) {
      return normalizedBaseUrl;
    }

    const fallbackBaseUrls = getFallbackBaseUrls(normalizedBaseUrl);

    for (const candidate of fallbackBaseUrls) {
      if (await isBookingApi(candidate)) {
        return candidate;
      }
    }

    return normalizedBaseUrl;
  }

  async function isBookingApi(baseUrl) {
    try {
      const response = await fetch(`${normalizeBaseUrl(baseUrl)}/health`);
      if (!response.ok) return false;

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("application/json")) return false;

      const payload = await response.json();
      return payload?.service === API_SERVICE_NAME;
    } catch (_error) {
      return false;
    }
  }

  function getFallbackBaseUrls(baseUrl) {
    const fallbacks = new Set();

    try {
      const parsedUrl = new URL(baseUrl);
      if (parsedUrl.port !== DEFAULT_API_PORT) {
        parsedUrl.port = DEFAULT_API_PORT;
        fallbacks.add(parsedUrl.origin);
      }

      if (parsedUrl.hostname === "localhost") {
        fallbacks.add(`http://127.0.0.1:${DEFAULT_API_PORT}`);
      }

      if (parsedUrl.hostname === "127.0.0.1") {
        fallbacks.add(`http://localhost:${DEFAULT_API_PORT}`);
      }
    } catch (_error) {
      fallbacks.add(`http://localhost:${DEFAULT_API_PORT}`);
      fallbacks.add(`http://127.0.0.1:${DEFAULT_API_PORT}`);
    }

    return Array.from(fallbacks);
  }

  async function describeConnectionError(baseUrl, error) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const genericMessage = error?.message || "Could not connect to booking API.";

    try {
      const healthResponse = await fetch(`${normalizedBaseUrl}/health`);
      const contentType = String(healthResponse.headers.get("content-type") || "").toLowerCase();

      if (contentType.includes("application/json")) {
        const payload = await healthResponse.json();
        if (healthResponse.ok && payload?.service === API_SERVICE_NAME) {
          return genericMessage;
        }
      } else {
        const bodyText = await healthResponse.text();
        if (looksLikePreviewServer(bodyText)) {
          return `${normalizedBaseUrl} is a preview/static server, not the booking API. Start ChatGPT/backend and use that port here instead.`;
        }
      }

      return `${normalizedBaseUrl} is responding, but it is not the SL Auto booking API. Start ChatGPT/backend and use that backend URL here.`;
    } catch (_probeError) {
      return `Could not reach the booking API at ${normalizedBaseUrl}. Start Web_Admin_App with npm start, then use that server URL here.`;
    }
  }

  function looksLikePreviewServer(bodyText) {
    const normalized = String(bodyText || "").toLowerCase();
    return (
      normalized.includes("___vscode_livepreview_injected_script") ||
      normalized.includes("<title>file not found</title>") ||
      normalized.includes("the file <b>")
    );
  }

  function upsertBooking(booking) {
    const nextBookings = [...state.bookings];
    const index = nextBookings.findIndex((entry) => entry.id === booking.id);

    if (index >= 0) {
      nextBookings[index] = booking;
    } else {
      nextBookings.unshift(booking);
    }

    nextBookings.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    state.bookings = nextBookings;
  }

  function sortBookings(bookings) {
    return Array.isArray(bookings)
      ? [...bookings].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
      : [];
  }

  function getResolvedStatus(booking) {
    const status = String(booking.status || "").toLowerCase();
    return STATUS_META[status] ? status : "new";
  }

  function isArchived(booking) {
    return Boolean(getArchivedDate(booking));
  }

  function isPending(booking) {
    return getResolvedStatus(booking) === "new";
  }

  function isUrgent(booking) {
    const urgency = String(booking.urgency || "").toLowerCase();
    return urgency.includes("urgent") || urgency.includes("drivability");
  }

  function getArchivedDate(booking) {
    if (!booking.archivedAt) return null;
    const date = new Date(booking.archivedAt);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getCreatedDate(booking) {
    const date = new Date(booking.createdAt);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDateTime(isoValue) {
    if (!isoValue) return "";
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) return isoValue;
    return dateTimeFormatter.format(date);
  }

  function formatPreferredDate(value) {
    if (!value) return "";
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return dateOnlyFormatter.format(date);
  }

  function formatPhone(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    const coreDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

    if (coreDigits.length !== 10) return phone || "";

    return `(${coreDigits.slice(0, 3)}) ${coreDigits.slice(3, 6)}-${coreDigits.slice(6)}`;
  }

  function getVehicleLabel(booking) {
    return [booking.year, booking.make, booking.model].filter(Boolean).join(" ");
  }

  function getConcernDisplay(booking) {
    const concern = String(booking.concern || "").trim();
    return concern || "No concern provided (routine service request).";
  }

  function getDaysUntilAutoDelete(booking) {
    const archivedDate = getArchivedDate(booking);
    if (!archivedDate) return null;

    const elapsed = Date.now() - archivedDate.getTime();
    const remaining = Math.max(0, ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000 - elapsed);
    return Math.ceil(remaining / (24 * 60 * 60 * 1000));
  }

  function getOldestPendingBooking(bookings) {
    return [...bookings]
      .filter((booking) => getCreatedDate(booking))
      .sort((left, right) => getCreatedDate(left) - getCreatedDate(right))[0] || null;
  }

  function getLatestAcceptedBooking(bookings) {
    return [...bookings]
      .filter((booking) => getCreatedDate(booking))
      .sort((left, right) => getCreatedDate(right) - getCreatedDate(left))[0] || null;
  }

  function getNextScheduledBooking(bookings) {
    const todayDateValue = getTodayDateValue();
    return [...bookings]
      .filter((booking) => {
        const bookingDate = getBookingDateValue(booking);
        return bookingDate && bookingDate >= todayDateValue;
      })
      .sort((left, right) => {
        const dateCompare = String(getBookingDateValue(left)).localeCompare(String(getBookingDateValue(right)));
        if (dateCompare !== 0) return dateCompare;
        return String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
      })[0] || null;
  }

  function formatCompactDate(value) {
    const date = getDateFromValue(value);
    return date ? compactDateFormatter.format(date) : "Not set";
  }

  function getCounts() {
    const pending = state.bookings.filter((booking) => isPending(booking) && !isArchived(booking));
    const accepted = state.bookings.filter((booking) => getResolvedStatus(booking) === "accepted" && !isArchived(booking));
    const rejected = state.bookings.filter((booking) => getResolvedStatus(booking) === "rejected" && !isArchived(booking));
    const archived = state.bookings.filter(isArchived);

    return {
      pending,
      accepted,
      rejected,
      archived,
      activeCount: pending.length + accepted.length + rejected.length,
    };
  }

  function getVisibleBookingsForView() {
    const counts = getCounts();

    if (state.currentView === VIEWS.rejected) {
      return counts.rejected;
    }

    if (state.currentView === VIEWS.archived) {
      if (state.archivedFilter === ARCHIVED_FILTERS.completed) {
        return counts.archived.filter((booking) => getResolvedStatus(booking) === "accepted");
      }

      if (state.archivedFilter === ARCHIVED_FILTERS.rejected) {
        return counts.archived.filter((booking) => getResolvedStatus(booking) === "rejected");
      }

      return counts.archived;
    }

    return [...counts.pending, ...counts.accepted];
  }

  function normalizeSearchText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function bookingMatchesDeskSearch(booking) {
    const query = normalizeSearchText(state.deskSearchQuery);
    if (!query) return true;

    const haystack = [
      booking.name,
      booking.phone,
      booking.email,
      booking.make,
      booking.model,
      booking.year,
      booking.serviceType,
      booking.concern,
      booking.preferredDate,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  }

  function bookingMatchesDeskFilter(booking) {
    if (state.deskFilter === DESK_FILTERS.today) {
      return getBookingDateValue(booking) === getTodayDateValue();
    }

    if (state.deskFilter === DESK_FILTERS.urgent) {
      return isUrgent(booking);
    }

    return true;
  }

  function getDeskFilteredBookings(bookings) {
    return bookings.filter((booking) => bookingMatchesDeskSearch(booking) && bookingMatchesDeskFilter(booking));
  }

  function hasDeskFiltersApplied() {
    return Boolean(normalizeSearchText(state.deskSearchQuery)) || state.deskFilter !== DESK_FILTERS.all;
  }

  function deskSelectedBooking() {
    const booking = selectedBooking();
    if (!booking) return null;
    return getDeskFilteredBookings(getVisibleBookingsForView()).some((entry) => entry.id === booking.id) ? booking : null;
  }

  function openRescheduleDialog(bookingId) {
    const booking = state.bookings.find((entry) => entry.id === bookingId);
    if (!booking || isArchived(booking)) return;

    const preferredDate = getBookingDateValue(booking) || getNextBookableDateValue();
    state.rescheduleDraft = {
      bookingId: booking.id,
      preferredDate,
      timeWindow: booking.timeWindow || TIME_WINDOW_OPTIONS[3],
    };
    state.rescheduleCalendarMonth = getMonthStartValue(getDateFromValue(preferredDate) || new Date());
    state.showRescheduleForm = true;
  }

  function reconcileSelection() {
    const visibleBookings = getVisibleBookingsForView();
    const bookingIsStillVisible = visibleBookings.some((booking) => booking.id === state.selectedBookingId);

    if (bookingIsStillVisible) return;

    state.selectedBookingId = visibleBookings[0]?.id || "";
    setHash(state.currentView, state.selectedBookingId);
  }

  function selectView(view) {
    if (!Object.values(VIEWS).includes(view)) return;
    state.currentView = view;
    reconcileSelection();
    setHash(view, state.selectedBookingId);
    render();
  }

  function selectBooking(bookingId) {
    state.selectedBookingId = bookingId;
    const booking = selectedBooking();
    const bookingDate = getBookingDateValue(booking);
    if (bookingDate) {
      state.selectedCalendarDate = bookingDate;
      state.calendarMonth = getMonthStartValue(getDateFromValue(bookingDate));
    }
    setHash(state.currentView, bookingId);
    render();
  }

  function selectedBooking() {
    return state.bookings.find((booking) => booking.id === state.selectedBookingId) || null;
  }

  function getStatusMeta(booking) {
    return STATUS_META[getResolvedStatus(booking)];
  }

  function render() {
    const activeElement = document.activeElement;
    const shouldRestoreDeskSearch =
      activeElement instanceof HTMLInputElement && activeElement.matches("[data-desk-search]");
    const deskSearchSelectionStart = shouldRestoreDeskSearch ? activeElement.selectionStart : null;
    const deskSearchSelectionEnd = shouldRestoreDeskSearch ? activeElement.selectionEnd : null;

    const counts = getCounts();
    const booking = deskSelectedBooking();

    app.innerHTML = `
      ${renderTopGrid(counts)}
      ${state.manualSuccessMessage ? `<section class="success-banner">${escapeHtml(state.manualSuccessMessage)}</section>` : ""}
      ${state.errorMessage ? renderErrorBanner(state.errorMessage) : ""}
      ${renderModeSwitcher()}
      ${state.detailMode === DETAIL_MODES.calendar ? renderCalendarWorkspace() : renderDeskWorkspace(counts, booking)}
      ${state.showManualForm ? renderManualEntryDialog() : ""}
      ${state.showRescheduleForm ? renderRescheduleDialog() : ""}
    `;

    if (shouldRestoreDeskSearch) {
      const deskSearchInput = app.querySelector("[data-desk-search]");
      if (deskSearchInput instanceof HTMLInputElement) {
        deskSearchInput.focus({ preventScroll: true });
        if (deskSearchSelectionStart != null && deskSearchSelectionEnd != null) {
          deskSearchInput.setSelectionRange(deskSearchSelectionStart, deskSearchSelectionEnd);
        }
      }
    }
  }

  function renderTopGrid(counts) {
    const connectionTone = state.isLoading ? "amber" : state.errorMessage ? "red" : "green";
    const connectionLabel = state.isLoading ? "Loading" : state.errorMessage ? "Needs attention" : "Connected";
    const lastUpdated = state.lastLoadedAt
      ? `Updated ${timeOnlyFormatter.format(state.lastLoadedAt)}`
      : "No successful sync yet";
    const oldestPending = getOldestPendingBooking(counts.pending);
    const latestAccepted = getLatestAcceptedBooking(counts.accepted);
    const nextScheduled = getNextScheduledBooking([...counts.pending, ...counts.accepted]);
    const todaysBookingCount = [...counts.pending, ...counts.accepted].filter(
      (booking) => getBookingDateValue(booking) === getTodayDateValue()
    ).length;

    return `
      <section class="top-grid">
        <article class="panel top-summary-panel">
          <div class="panel-heading">
            <div>
              <h2>Booking inbox</h2>
              <p>Track pending requests, accepted work, and older archived records in one place.</p>
            </div>
            <div>
              <div class="dashboard-kpi">${counts.activeCount}</div>
              <div class="count-label">active</div>
            </div>
          </div>

          <div class="stat-pills summary-pills">
            <span class="pill pill-${connectionTone}">${state.isLoading ? '<span class="loading-dot"></span>' : ""}${connectionLabel}</span>
            <span class="pill pill-blue summary-pill-wide">${counts.pending.length} pending</span>
            <span class="pill pill-green summary-pill-wide">${counts.accepted.length} accepted</span>
            ${state.bookings.some(isUrgent) ? '<span class="pill pill-red">Urgent bookings</span>' : ""}
          </div>

          <div class="summary-insights">
            <article class="summary-insight">
              <span class="summary-insight-label">Today</span>
              <strong>${todaysBookingCount}</strong>
              <p>${todaysBookingCount === 1 ? "booking on today’s board" : "bookings on today’s board"}</p>
            </article>

            <article class="summary-insight">
              <span class="summary-insight-label">Oldest pending</span>
              <strong>${escapeHtml(oldestPending?.name || "None waiting")}</strong>
              <p>${escapeHtml(oldestPending ? formatCompactDate(oldestPending.preferredDate) : "No pending requests.")}</p>
            </article>

            <article class="summary-insight">
              <span class="summary-insight-label">Last accepted</span>
              <strong>${escapeHtml(latestAccepted?.name || "Nothing accepted")}</strong>
              <p>${escapeHtml(latestAccepted ? latestAccepted.serviceType || "Accepted booking" : "Accept a booking to see it here.")}</p>
            </article>

            <article class="summary-insight">
              <span class="summary-insight-label">Next scheduled</span>
              <strong>${escapeHtml(nextScheduled ? formatCompactDate(nextScheduled.preferredDate) : "Open schedule")}</strong>
              <p>${escapeHtml(nextScheduled ? nextScheduled.name || "Upcoming booking" : "No upcoming bookings yet.")}</p>
            </article>
          </div>

          <p class="muted-text">${lastUpdated}</p>
        </article>

        <article class="panel top-connection-panel">
          <div class="panel-heading">
            <div>
              <h2>API connection</h2>
              <p>Defaults to localhost. Change it when you test against a phone or another machine.</p>
            </div>
          </div>

          <form class="connection-form" data-form="connection">
            <div>
              <label class="field-label" for="apiBaseUrl">Backend URL</label>
              <input
                class="text-input"
                id="apiBaseUrl"
                name="apiBaseUrl"
                type="text"
                value="${escapeHtml(state.apiBaseUrl)}"
                placeholder="http://localhost:4310"
                autocomplete="off"
              />
            </div>

            <div class="connection-actions">
              <button class="primary-button" type="submit">${state.isLoading ? "Loading..." : "Save and reload"}</button>
              <button class="muted-button" type="button" data-action="use-localhost">Use localhost:4310</button>
            </div>

            <p class="connection-note muted-text">
              Run <span class="text-strong">npm start</span> in <span class="text-strong">ChatGPT/Web_Admin_App</span>,
              then open that server URL.
            </p>
          </form>
        </article>
      </section>
    `;
  }

  function renderManualEntryDialog() {
    const draft = normalizeManualDraft(state.manualDraft);

    return `
      <section class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="manual-booking-title">
        <article class="panel modal-dialog">
          <div class="panel-heading">
            <div>
              <h2 id="manual-booking-title">Add booking</h2>
              <p>Add a phone call, walk-in, or existing customer directly into accepted bookings.</p>
            </div>
            <div class="modal-actions">
              <span class="pill pill-green">Saves as accepted</span>
              <button class="ghost-button modal-close" type="button" data-action="close-manual">Close</button>
            </div>
          </div>

          <form class="manual-form" data-form="manual-booking">
            <div class="manual-form-grid">
              <label>
                <span class="field-label">Source</span>
                <select class="text-input" name="source">
                  ${renderSelectOptions(MANUAL_SOURCE_OPTIONS, draft.source)}
                </select>
              </label>

              <label>
                <span class="field-label">Preferred contact</span>
                <select class="text-input" name="contactMethod" required>
                  ${renderSelectOptions(CONTACT_METHOD_OPTIONS, draft.contactMethod)}
                </select>
              </label>

              <label>
                <span class="field-label">Full name</span>
                <input class="text-input" type="text" name="name" value="${escapeHtml(draft.name)}" required />
              </label>

              <label>
                <span class="field-label">Phone number</span>
                <input class="text-input" type="tel" name="phone" value="${escapeHtml(draft.phone)}" required />
              </label>

              <label>
                <span class="field-label">Email</span>
                <input
                  class="text-input"
                  type="email"
                  name="email"
                  value="${escapeHtml(draft.email)}"
                  placeholder="Optional"
                />
              </label>

              <label>
                <span class="field-label">Preferred date</span>
                <input class="text-input" type="date" name="preferredDate" value="${escapeHtml(draft.preferredDate)}" required />
              </label>

              <label>
                <span class="field-label">Vehicle year</span>
                <input class="text-input" type="number" name="year" min="1980" max="2035" value="${escapeHtml(draft.year)}" required />
              </label>

              <label>
                <span class="field-label">Vehicle make</span>
                <input class="text-input" type="text" name="make" value="${escapeHtml(draft.make)}" required />
              </label>

              <label>
                <span class="field-label">Vehicle model</span>
                <input class="text-input" type="text" name="model" value="${escapeHtml(draft.model)}" required />
              </label>

              <label class="manual-form-span-two">
                <span class="field-label">Time window</span>
                <select class="text-input" name="timeWindow" required>
                  ${renderSelectOptions(TIME_WINDOW_OPTIONS, draft.timeWindow)}
                </select>
              </label>

              <label class="manual-form-span-two">
                <span class="field-label">Service requested</span>
                <select class="text-input" name="serviceType" required>
                  ${renderSelectOptions(SERVICE_OPTIONS, draft.serviceType, "Select service")}
                </select>
              </label>

              <label>
                <span class="field-label">Visit type</span>
                <select class="text-input" name="visitType">
                  ${renderSelectOptions(VISIT_TYPE_OPTIONS, draft.visitType)}
                </select>
              </label>

              <label>
                <span class="field-label">Urgency</span>
                <select class="text-input" name="urgency">
                  ${renderSelectOptions(URGENCY_OPTIONS, draft.urgency)}
                </select>
              </label>

              <label class="manual-form-span-two">
                <span class="field-label">Concern / notes</span>
                <textarea class="text-input text-area-input" name="concern" rows="4" placeholder="Optional service notes or phone-call details.">${escapeHtml(draft.concern)}</textarea>
              </label>
            </div>

            <div class="manual-form-actions">
              <button class="primary-button" type="submit" ${state.isCreatingManual ? "disabled" : ""}>
                ${state.isCreatingManual ? "Adding..." : "Add to accepted"}
              </button>
              <p class="support-copy">Manual entries bypass the pending inbox and appear in accepted bookings immediately.</p>
            </div>
          </form>
        </article>
      </section>
    `;
  }

  function renderSelectOptions(options, selectedValue, placeholder = "") {
    const optionMarkup = options
      .map((option) => {
        const selected = option === selectedValue ? "selected" : "";
        return `<option value="${escapeHtml(option)}" ${selected}>${escapeHtml(option)}</option>`;
      })
      .join("");

    if (!placeholder) {
      return optionMarkup;
    }

    const placeholderSelected = selectedValue ? "" : "selected";
    return `<option value="" ${placeholderSelected}>${escapeHtml(placeholder)}</option>${optionMarkup}`;
  }

  function renderErrorBanner(message) {
    return `
      <section class="error-banner" role="alert">
        <strong>Action blocked</strong>
        <span>${escapeHtml(message)}</span>
      </section>
    `;
  }

  function renderViewTabs(counts) {
    return `
      <nav class="nav-segmented" aria-label="Booking views">
        ${renderViewButton(VIEWS.inbox, "Inbox", counts.pending.length + counts.accepted.length)}
        ${renderViewButton(VIEWS.rejected, "Rejected", counts.rejected.length)}
        ${renderViewButton(VIEWS.archived, "Archived", counts.archived.length)}
      </nav>
    `;
  }

  function renderViewButton(view, label, count) {
    const activeClass = state.currentView === view ? "is-active" : "";
    return `
      <button class="segmented-button ${activeClass}" type="button" data-view="${view}">
        ${escapeHtml(label)} <span aria-hidden="true">(${count})</span>
      </button>
    `;
  }

  function renderModeSwitcher() {
    return `
      <nav class="workspace-mode-switcher" aria-label="Workspace mode">
        ${renderDetailModeButton(DETAIL_MODES.desk, "Booking desk")}
        ${renderDetailModeButton(DETAIL_MODES.calendar, "Calendar")}
      </nav>
    `;
  }

  function renderDetailModeButton(mode, label) {
    const activeClass = state.detailMode === mode ? "is-active" : "";
    return `
      <button class="segmented-button workspace-mode-button ${activeClass}" type="button" data-detail-mode="${mode}">
        ${escapeHtml(label)}
      </button>
    `;
  }

  function renderDeskWorkspace(counts, booking) {
    return `
      ${renderViewTabs(counts)}
      ${renderDeskControls()}
      <section class="workspace-grid">
        <div class="section-stack">
          ${renderCurrentView(counts)}
        </div>
        <aside class="detail-panel">
          ${renderDetailPanel(booking)}
        </aside>
      </section>
    `;
  }

  function renderCalendarWorkspace() {
    return `
      <section class="calendar-workspace">
        ${renderCalendarPanel()}
      </section>
    `;
  }

  function renderDeskControls() {
    return `
      <section class="panel desk-controls-panel">
        <div class="desk-controls-grid">
          <label class="desk-search-field" for="deskSearchQuery">
            <span class="field-label">Search bookings</span>
            <input
              class="text-input"
              id="deskSearchQuery"
              type="text"
              data-desk-search="true"
              value="${escapeHtml(state.deskSearchQuery)}"
              placeholder="Search name, phone, vehicle, or service"
              autocomplete="off"
            />
          </label>

          <div class="desk-filter-group" role="tablist" aria-label="Desk filters">
            ${renderDeskFilterButton(DESK_FILTERS.all, "All")}
            ${renderDeskFilterButton(DESK_FILTERS.today, "Today")}
            ${renderDeskFilterButton(DESK_FILTERS.urgent, "Urgent")}
          </div>
        </div>
      </section>
    `;
  }

  function renderDeskFilterButton(filter, label) {
    const activeClass = state.deskFilter === filter ? "is-active" : "";
    return `
      <button class="segmented-button ${activeClass}" type="button" data-desk-filter="${filter}">
        ${escapeHtml(label)}
      </button>
    `;
  }

  function renderCurrentView(counts) {
    if (state.currentView === VIEWS.rejected) {
      return renderRejectedView(counts.rejected);
    }

    if (state.currentView === VIEWS.archived) {
      return renderArchivedView(counts.archived);
    }

    return renderInboxView(counts);
  }

  function renderInboxView(counts) {
    const empty = !state.isLoading && state.bookings.length === 0;
    const pendingBookings = getDeskFilteredBookings(counts.pending);
    const acceptedBookings = getDeskFilteredBookings(counts.accepted);
    const hasResults = pendingBookings.length || acceptedBookings.length;

    return `
      ${state.isLoading && state.bookings.length === 0 ? renderEmptyState("Loading bookings", "Pulling the latest requests from the booking API.") : ""}
      ${empty ? renderEmptyState("No bookings yet", "Once requests arrive, pending and accepted work will show up here.") : ""}
      ${!empty ? `
        ${!hasResults && hasDeskFiltersApplied() ? renderEmptyState("No matches", "Try a different search or clear the current desk filter.") : ""}
        ${renderBookingSection("pending", "Pending", "Needs a decision", pendingBookings, "No pending bookings right now.", true)}
        ${renderBookingSection("accepted", "Accepted", "Approved and still active", acceptedBookings, "No accepted bookings yet.", true)}
        <article class="panel">
          <div class="section-heading">
            <div>
              <h3>Folders</h3>
              <p>Keep the main workflow clean while still retaining older decisions.</p>
            </div>
          </div>

          <div class="folder-grid">
            ${renderFolderCard("Rejected", "Hidden away from the main workflow.", counts.rejected.length, VIEWS.rejected)}
            ${renderFolderCard("Archived", "Auto-deletes after 30 days.", counts.archived.length, VIEWS.archived)}
          </div>
        </article>
      ` : ""}
    `;
  }

  function renderRejectedView(rejectedBookings) {
    const filteredRejectedBookings = getDeskFilteredBookings(rejectedBookings);
    return `
      <article class="panel notice-card">
        <p>Rejected bookings stay out of the way here until you archive them or bring them back into the active workflow.</p>
      </article>
      ${renderBookingSection("rejected", "Rejected", "Previously declined requests", filteredRejectedBookings, hasDeskFiltersApplied() ? "No rejected bookings match the current search." : "No rejected bookings.")}
    `;
  }

  function renderArchivedView(archivedBookings) {
    const filteredBookings = getDeskFilteredBookings(getVisibleBookingsForView());

    return `
      <article class="panel">
        <div class="section-heading">
          <div>
            <h3>Archived bookings</h3>
            <p>Archived bookings delete themselves after 30 days unless you restore or remove them first.</p>
          </div>
        </div>

        <div class="archived-filters" role="tablist" aria-label="Archived filter">
          ${renderArchivedFilterButton(ARCHIVED_FILTERS.all, "All")}
          ${renderArchivedFilterButton(ARCHIVED_FILTERS.completed, "Completed")}
          ${renderArchivedFilterButton(ARCHIVED_FILTERS.rejected, "Rejected")}
        </div>
      </article>

      ${archivedBookings.length === 0
        ? renderEmptyState("No archived bookings", "Archive accepted or rejected bookings to move them out of the active workflow.")
        : renderBookingSection(
            "archived-list",
            "Archive list",
            "Filtered records",
            filteredBookings,
            hasDeskFiltersApplied() ? "No archived bookings match the current search." : "No archived bookings for this filter."
          )}
    `;
  }

  function renderArchivedFilterButton(filter, label) {
    const activeClass = state.archivedFilter === filter ? "is-active" : "";
    return `
      <button class="segmented-button ${activeClass}" type="button" data-filter="${filter}">
        ${escapeHtml(label)}
      </button>
    `;
  }

  function renderFolderCard(title, subtitle, count, view) {
    return `
      <button class="folder-card" type="button" data-view="${view}">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <span class="mini-count">${count}</span>
      </button>
    `;
  }

  function renderBookingSection(sectionKey, title, subtitle, bookings, emptyMessage, collapsible = false) {
    const isOpen = collapsible ? state.sectionOpen[sectionKey] !== false : true;
    const toggleButton = collapsible
      ? `
        <button
          class="section-toggle"
          type="button"
          data-section-toggle="${sectionKey}"
          aria-expanded="${isOpen ? "true" : "false"}"
        >
          <span class="section-toggle-copy">
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(subtitle)}</p>
          </span>
          <span class="section-toggle-meta">
            <span class="mini-count">${bookings.length}</span>
            <span class="section-chevron" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
          </span>
        </button>
      `
      : `
        <div class="section-heading">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <span class="mini-count">${bookings.length}</span>
        </div>
      `;

    return `
      <article class="panel">
        ${toggleButton}

        ${isOpen
          ? (bookings.length === 0
              ? renderEmptyState(title, emptyMessage)
              : `<div class="booking-list">${bookings.map((booking) => renderBookingCard(booking)).join("")}</div>`)
          : ""}
      </article>
    `;
  }

  function renderBookingCard(booking) {
    const statusMeta = getStatusMeta(booking);
    const selectedClass = state.selectedBookingId === booking.id ? "is-selected" : "";
    const subduedClass = isArchived(booking) || getResolvedStatus(booking) === "rejected" ? "is-subdued" : "";
    const urgentClass = isUrgent(booking) ? "is-urgent" : "";
    const note = archiveNote(booking);

    return `
      <article class="booking-card ${selectedClass} ${subduedClass} ${urgentClass}" data-booking-select="${booking.id}">
        <div class="booking-head">
          <div class="booking-meta">
            <h4>${escapeHtml(booking.name || "Unnamed booking")}</h4>
            <small>${escapeHtml(getVehicleLabel(booking) || "Vehicle details missing")}</small>
            <small>${escapeHtml(formatPhone(booking.phone))}</small>
          </div>

          <div class="badge-row">
            <span class="badge badge-${statusMeta.tone}">${statusMeta.label}</span>
            ${isArchived(booking) ? '<span class="badge badge-gray">Archived</span>' : ""}
          </div>
        </div>

        <div class="chip-row">
          <span class="chip">${escapeHtml(booking.serviceType || "Service request")}</span>
          ${isUrgent(booking) ? '<span class="badge badge-red">Urgent</span>' : ""}
        </div>

        <div class="booking-foot">
          <span>${escapeHtml(formatPreferredDate(booking.preferredDate))}</span>
          <span>${escapeHtml(booking.timeWindow || "")}</span>
        </div>

        <p class="booking-note">${escapeHtml(note || getConcernDisplay(booking))}</p>

        ${renderActionRow(booking)}
      </article>
    `;
  }

  function renderActionRow(booking) {
    const updating = state.updatingIds.has(booking.id);
    const buttons = [];

    if (isArchived(booking)) {
      buttons.push(renderActionButton("Bring back", "blue", booking.id, "restore", updating));
      buttons.push(renderActionButton("Delete permanently", "red", booking.id, "delete", updating));
    } else if (isPending(booking)) {
      buttons.push(renderActionButton("Reschedule", "blue", booking.id, "reschedule", updating));
      buttons.push(renderActionButton("Accept", "green", booking.id, "accept", updating));
      buttons.push(renderActionButton("Reject", "red", booking.id, "reject", updating));
    } else if (getResolvedStatus(booking) === "accepted") {
      buttons.push(renderActionButton("Reschedule", "blue", booking.id, "reschedule", updating));
      buttons.push(renderActionButton("Archive", "gray", booking.id, "archive", updating));
      buttons.push(renderActionButton("Mark rejected", "red", booking.id, "reject", updating));
    } else {
      buttons.push(renderActionButton("Reschedule", "blue", booking.id, "reschedule", updating));
      buttons.push(renderActionButton("Accept", "green", booking.id, "accept", updating));
      buttons.push(renderActionButton("Archive", "gray", booking.id, "archive", updating));
    }

    return `<div class="action-row ${buttons.length === 1 ? "single" : ""}">${buttons.join("")}</div>`;
  }

  function renderActionButton(label, tone, bookingId, action, updating) {
    return `
      <button
        class="action-button action-${tone}"
        type="button"
        data-action="${action}"
        data-booking-id="${bookingId}"
        ${updating ? "disabled" : ""}
      >
        ${updating ? "Working..." : escapeHtml(label)}
      </button>
    `;
  }

  function archiveNote(booking) {
    if (!isArchived(booking)) return "";

    const archivedText = booking.archivedAt ? `Archived ${formatDateTime(booking.archivedAt)}.` : "Archived.";
    const daysRemaining = getDaysUntilAutoDelete(booking);

    if (daysRemaining == null) return archivedText;
    return `${archivedText} Deletes in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`;
  }

  function renderCalendarPanel() {
    const visibleBookings = getVisibleCalendarBookings();
    const calendarDays = buildCalendarDays(state.calendarMonth);
    const selectedDate = sameMonth(state.selectedCalendarDate, state.calendarMonth)
      ? state.selectedCalendarDate
      : getBestCalendarDate(state.calendarMonth);
    const agendaBookings = getBookingsForCalendarDate(selectedDate);
    const monthDate = getDateFromValue(state.calendarMonth) || getDateFromValue(getTodayDateValue()) || new Date();
    const monthBookings = visibleBookings.filter((booking) => sameMonth(getBookingDateValue(booking), state.calendarMonth));
    const dayLabel = shortDateFormatter.format(getDateFromValue(selectedDate) || monthDate);
    return `
      <div class="panel calendar-panel">
        <div class="calendar-stack">
          <section class="calendar-header">
            <div>
              <p class="calendar-kicker">Schedule board</p>
              <h2>${escapeHtml(monthTitleFormatter.format(monthDate))}</h2>
              <p>${monthBookings.length} booking${monthBookings.length === 1 ? "" : "s"} scheduled in this month.</p>
            </div>

            <div class="calendar-toolbar">
              <button class="ghost-button calendar-nav-button" type="button" data-calendar-nav="prev">Prev</button>
              <button class="muted-button calendar-nav-button" type="button" data-calendar-nav="today">Today</button>
              <button class="ghost-button calendar-nav-button" type="button" data-calendar-nav="next">Next</button>
            </div>
          </section>

          <div class="calendar-summary">
            <span class="pill pill-blue">${visibleBookings.length} scheduled</span>
            <span class="pill pill-green">${monthBookings.filter((booking) => getResolvedStatus(booking) === "accepted").length} accepted</span>
            <span class="pill pill-red">${monthBookings.filter(isUrgent).length} urgent</span>
          </div>

          <section class="calendar-board">
            <div class="calendar-grid-shell">
              <div class="calendar-grid calendar-grid-labels" aria-hidden="true">
                ${calendarWeekdayLabels.map((label) => `<span class="calendar-weekday">${escapeHtml(label)}</span>`).join("")}
              </div>

              <div class="calendar-grid calendar-grid-days">
                ${calendarDays.map((day) => renderCalendarDay(day, selectedDate)).join("")}
              </div>
            </div>

            <aside class="calendar-drawer">
              <section class="calendar-agenda">
                <div class="calendar-agenda-head">
                  <div>
                    <h3>${escapeHtml(dayLabel)}</h3>
                    <p>${agendaBookings.length ? `${agendaBookings.length} booking${agendaBookings.length === 1 ? "" : "s"} on deck.` : "No bookings scheduled for this day."}</p>
                  </div>
                  <span class="mini-count">${agendaBookings.length}</span>
                </div>

                ${agendaBookings.length
                  ? `<div class="calendar-agenda-list">${agendaBookings
                      .sort((left, right) => String(left.timeWindow || "").localeCompare(String(right.timeWindow || "")))
                      .map(renderCalendarAgendaItem)
                      .join("")}</div>`
                  : renderEmptyState("Open day", "Pick another date or add a booking to start filling the calendar.")}
              </section>
            </aside>
          </section>
        </div>
      </div>
    `;
  }

  function renderCalendarDay(day, selectedDate) {
    const hasUrgentBooking = day.bookings.some(isUrgent);
    const classes = [
      "calendar-day",
      day.isCurrentMonth ? "is-current-month" : "is-outside-month",
      day.isToday ? "is-today" : "",
      day.dateValue === selectedDate ? "is-selected" : "",
      day.bookings.length ? "has-bookings" : "",
      hasUrgentBooking ? "is-urgent" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <button class="${classes}" type="button" data-calendar-date="${day.dateValue}">
        <span class="calendar-day-top">
          <span class="calendar-day-number">${day.dayNumber}</span>
          ${day.bookings.length ? `<span class="calendar-day-count ${hasUrgentBooking ? "is-urgent" : ""}">${day.bookings.length}</span>` : ""}
        </span>
        <span class="calendar-day-events">
          ${day.bookings
            .slice(0, 2)
            .map((booking) => {
              const status = getResolvedStatus(booking);
              return `<span class="calendar-day-pill is-${status} ${isUrgent(booking) ? "is-urgent" : ""}">${escapeHtml(booking.name || booking.serviceType || "Booking")}</span>`;
            })
            .join("")}
          ${day.bookings.length > 2 ? `<span class="calendar-day-more">+${day.bookings.length - 2} more</span>` : ""}
        </span>
      </button>
    `;
  }

  function renderCalendarAgendaItem(booking) {
    const statusMeta = getStatusMeta(booking);
    const status = getResolvedStatus(booking);
    return `
      <article class="calendar-agenda-item is-${status} ${isUrgent(booking) ? "is-urgent" : ""}">
        <button class="calendar-agenda-main" type="button" data-calendar-booking="${booking.id}">
          <div class="calendar-agenda-copy">
            <strong>${escapeHtml(booking.serviceType || "Booking")}</strong>
            <span>${escapeHtml(booking.name || "Unnamed booking")} · ${escapeHtml(getVehicleLabel(booking) || "Vehicle details missing")}</span>
            <span>${escapeHtml(booking.timeWindow || "Time flexible")}</span>
          </div>
        </button>
        <div class="calendar-agenda-side">
          <div class="calendar-agenda-badges">
            <span class="badge badge-${statusMeta.tone}">${statusMeta.label}</span>
            ${isUrgent(booking) ? '<span class="badge badge-red">Urgent</span>' : ""}
          </div>
          <button class="ghost-button calendar-reschedule-button" type="button" data-action="reschedule" data-booking-id="${booking.id}">
            Reschedule
          </button>
        </div>
      </article>
    `;
  }

  function renderRescheduleDialog() {
    const draft = state.rescheduleDraft;
    const booking = state.bookings.find((entry) => entry.id === draft.bookingId);
    const calendarDays = buildCalendarDays(state.rescheduleCalendarMonth);
    const selectedDate = draft.preferredDate;
    const monthDate = getDateFromValue(state.rescheduleCalendarMonth) || getDateFromValue(selectedDate) || new Date();

    return `
      <section class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reschedule-booking-title">
        <article class="panel modal-dialog modal-dialog-compact">
          <div class="panel-heading">
            <div>
              <h2 id="reschedule-booking-title">Quick reschedule</h2>
              <p>${escapeHtml(booking ? `${booking.name || "Booking"} · ${booking.serviceType || "Service"}` : "Adjust the booking date and time window.")}</p>
            </div>
            <div class="modal-actions">
              <button class="ghost-button modal-close" type="button" data-action="close-reschedule">Close</button>
            </div>
          </div>

          <form class="manual-form" data-form="reschedule-booking">
            <input type="hidden" name="bookingId" value="${escapeHtml(draft.bookingId)}" />
            <input type="hidden" name="preferredDate" value="${escapeHtml(draft.preferredDate)}" />

            <div class="manual-form-grid">
              <label class="manual-form-span-two">
                <span class="field-label">Preferred date</span>
                <div class="reschedule-date-display">${escapeHtml(formatPreferredDate(draft.preferredDate))}</div>
                <div class="reschedule-calendar">
                  <div class="reschedule-calendar-head">
                    <strong>${escapeHtml(monthTitleFormatter.format(monthDate))}</strong>
                    <div class="calendar-toolbar">
                      <button class="ghost-button calendar-nav-button" type="button" data-reschedule-calendar-nav="prev">Prev</button>
                      <button class="muted-button calendar-nav-button" type="button" data-reschedule-calendar-nav="today">Today</button>
                      <button class="ghost-button calendar-nav-button" type="button" data-reschedule-calendar-nav="next">Next</button>
                    </div>
                  </div>

                  <div class="calendar-grid calendar-grid-labels" aria-hidden="true">
                    ${calendarWeekdayLabels.map((label) => `<span class="calendar-weekday">${escapeHtml(label)}</span>`).join("")}
                  </div>

                  <div class="calendar-grid calendar-grid-days reschedule-calendar-grid">
                    ${calendarDays.map((day) => renderRescheduleCalendarDay(day, selectedDate)).join("")}
                  </div>
                </div>
              </label>

              <label class="manual-form-span-two">
                <span class="field-label">Time window</span>
                <select class="text-input" name="timeWindow" required>
                  ${renderSelectOptions(TIME_WINDOW_OPTIONS, draft.timeWindow)}
                </select>
              </label>
            </div>

            <div class="manual-form-actions">
              <button class="primary-button" type="submit" ${state.isSavingReschedule ? "disabled" : ""}>
                ${state.isSavingReschedule ? "Saving..." : "Save schedule"}
              </button>
            </div>
          </form>
        </article>
      </section>
    `;
  }

  function renderRescheduleCalendarDay(day, selectedDate) {
    const classes = [
      "reschedule-calendar-day",
      day.isCurrentMonth ? "is-current-month" : "is-outside-month",
      day.isToday ? "is-today" : "",
      day.dateValue === selectedDate ? "is-selected" : "",
      day.date.getDay() === 6 ? "is-unavailable" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <button
        class="${classes}"
        type="button"
        data-reschedule-date="${day.dateValue}"
        ${day.date.getDay() === 6 ? "disabled" : ""}
      >
        <span class="reschedule-calendar-day-number">${day.dayNumber}</span>
      </button>
    `;
  }

  function renderDetailPanel(booking) {
    if (!booking) {
      return `
        <div class="panel">
          <div class="empty-state">
            <h2 class="placeholder-title">Select a booking to view details.</h2>
            <p>Pick any request from the desk to review customer info, timing, and actions.</p>
          </div>
        </div>
      `;
    }

    const statusMeta = getStatusMeta(booking);
    const daysUntilAutoDelete = getDaysUntilAutoDelete(booking);

    return `
      <div class="panel">
        <div class="detail-stack">
          <section class="detail-header">
            <div>
              <h2>${escapeHtml(booking.serviceType || "Booking")}</h2>
              <p>${escapeHtml(getVehicleLabel(booking) || "Vehicle details missing")}</p>
            </div>

            <div class="badge-row">
              <span class="badge badge-${statusMeta.tone}">${statusMeta.label}</span>
              ${isArchived(booking) ? '<span class="badge badge-gray">Archived</span>' : ""}
            </div>
          </section>

          <section class="detail-section">
            <h4>Schedule</h4>
            <div class="meta-grid">
              <span class="meta-label">Preferred date</span>
              <span class="meta-value">${escapeHtml(formatPreferredDate(booking.preferredDate))}</span>
              <span class="meta-label">Time window</span>
              <span class="meta-value">${escapeHtml(booking.timeWindow || "")}</span>
              <span class="meta-label">Created</span>
              <span class="meta-value">${escapeHtml(formatDateTime(booking.createdAt))}</span>
              <span class="meta-label">Status</span>
              <span class="meta-value">${escapeHtml(statusMeta.label)}</span>
              ${booking.archivedAt ? `
                <span class="meta-label">Archived</span>
                <span class="meta-value">${escapeHtml(formatDateTime(booking.archivedAt))}</span>
              ` : ""}
              ${daysUntilAutoDelete != null ? `
                <span class="meta-label">Auto-delete</span>
                <span class="meta-value">In ${daysUntilAutoDelete} day${daysUntilAutoDelete === 1 ? "" : "s"}</span>
              ` : ""}
            </div>
          </section>

          <section class="detail-section">
            <h4>Customer</h4>
            <div class="meta-grid">
              <span class="meta-label">Name</span>
              <span class="meta-value">${escapeHtml(booking.name || "")}</span>
              <span class="meta-label">Phone</span>
              <span class="meta-value">${escapeHtml(formatPhone(booking.phone))}</span>
              ${booking.email ? `
                <span class="meta-label">Email</span>
                <span class="meta-value">${escapeHtml(booking.email)}</span>
              ` : ""}
              ${booking.contactMethod ? `
                <span class="meta-label">Contact</span>
                <span class="meta-value">${escapeHtml(booking.contactMethod)}</span>
              ` : ""}
              ${booking.source ? `
                <span class="meta-label">Source</span>
                <span class="meta-value">${escapeHtml(booking.source)}</span>
              ` : ""}
            </div>
          </section>

          <section class="detail-section">
            <h4>Vehicle and service</h4>
            <div class="meta-grid">
              <span class="meta-label">Vehicle</span>
              <span class="meta-value">${escapeHtml(getVehicleLabel(booking))}</span>
              <span class="meta-label">Service</span>
              <span class="meta-value">${escapeHtml(booking.serviceType || "")}</span>
              ${booking.urgency ? `
                <span class="meta-label">Urgency</span>
                <span class="meta-value">${escapeHtml(booking.urgency)}</span>
              ` : ""}
              ${booking.visitType ? `
                <span class="meta-label">Visit type</span>
                <span class="meta-value">${escapeHtml(booking.visitType)}</span>
              ` : ""}
            </div>
          </section>

          <section class="detail-section">
            <h4>Concern</h4>
            <p class="concern-copy">${escapeHtml(getConcernDisplay(booking))}</p>
          </section>

          <section class="detail-section">
            <h4>Actions</h4>
            ${renderActionRow(booking)}
          </section>
        </div>
      </div>
    `;
  }

  function renderEmptyState(title, message) {
    return `
      <div class="empty-state">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  async function handleClick(event) {
    const modalBackdrop = event.target.closest(".modal-backdrop");
    if (modalBackdrop && event.target === modalBackdrop) {
      const manualForm = modalBackdrop.querySelector('[data-form="manual-booking"]');
      const rescheduleForm = modalBackdrop.querySelector('[data-form="reschedule-booking"]');
      if (manualForm) {
        state.manualDraft = readManualDraft(manualForm);
        state.showManualForm = false;
      }
      if (rescheduleForm) {
        state.rescheduleDraft = readRescheduleDraft(rescheduleForm);
        state.showRescheduleForm = false;
      }
      render();
      return;
    }

    const sectionToggle = event.target.closest("[data-section-toggle]");
    if (sectionToggle) {
      event.preventDefault();
      const sectionKey = sectionToggle.dataset.sectionToggle;
      if (!sectionKey) return;
      state.sectionOpen[sectionKey] = !(state.sectionOpen[sectionKey] !== false);
      render();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      const bookingId = actionButton.dataset.bookingId || "";

      if (action === "refresh") {
        event.preventDefault();
        await loadBookings();
        return;
      }

      if (action === "open-manual") {
        event.preventDefault();
        state.showManualForm = true;
        state.manualSuccessMessage = "";
        render();
        return;
      }

      if (action === "close-manual") {
        event.preventDefault();
        state.manualDraft = readManualDraft(document.querySelector('[data-form="manual-booking"]'));
        state.showManualForm = false;
        render();
        return;
      }

      if (action === "close-reschedule") {
        event.preventDefault();
        state.rescheduleDraft = readRescheduleDraft(document.querySelector('[data-form="reschedule-booking"]'));
        state.showRescheduleForm = false;
        render();
        return;
      }

      if (action === "use-localhost") {
        event.preventDefault();
        state.apiBaseUrl = `http://localhost:${DEFAULT_API_PORT}`;
        window.localStorage.setItem(STORAGE_KEY, state.apiBaseUrl);
        await loadBookings();
        return;
      }

      if (!bookingId) return;
      event.preventDefault();

      if (action === "reschedule") {
        openRescheduleDialog(bookingId);
        render();
        return;
      }

      const baseUrl = normalizeBaseUrl(state.apiBaseUrl);

      if (action === "accept") {
        await mutateBooking(
          bookingId,
          `${baseUrl}/api/bookings/${bookingId}/status`,
          "PATCH",
          { status: "accepted" },
          "Could not update booking status."
        );
        return;
      }

      if (action === "reject") {
        await mutateBooking(
          bookingId,
          `${baseUrl}/api/bookings/${bookingId}/status`,
          "PATCH",
          { status: "rejected" },
          "Could not update booking status."
        );
        return;
      }

      if (action === "archive") {
        await mutateBooking(
          bookingId,
          `${baseUrl}/api/bookings/${bookingId}/archive`,
          "PATCH",
          { archived: true },
          "Could not archive booking."
        );
        return;
      }

      if (action === "restore") {
        await mutateBooking(
          bookingId,
          `${baseUrl}/api/bookings/${bookingId}/archive`,
          "PATCH",
          { archived: false },
          "Could not restore booking."
        );
        return;
      }

      if (action === "delete") {
        const confirmed = window.confirm("Delete this booking permanently?");
        if (!confirmed) return;

        await mutateBooking(
          bookingId,
          `${baseUrl}/api/bookings/${bookingId}`,
          "DELETE",
          null,
          "Could not delete booking."
        );
      }

      return;
    }

    const deskFilterButton = event.target.closest("[data-desk-filter]");
    if (deskFilterButton) {
      event.preventDefault();
      state.deskFilter = deskFilterButton.dataset.deskFilter || DESK_FILTERS.all;
      render();
      return;
    }

    const detailModeButton = event.target.closest("[data-detail-mode]");
    if (detailModeButton) {
      event.preventDefault();
      setDetailMode(detailModeButton.dataset.detailMode || DETAIL_MODES.desk);
      render();
      return;
    }

    const calendarNavButton = event.target.closest("[data-calendar-nav]");
    if (calendarNavButton) {
      event.preventDefault();
      const direction = calendarNavButton.dataset.calendarNav;
      if (direction === "prev") {
        shiftCalendarMonth(-1);
      } else if (direction === "next") {
        shiftCalendarMonth(1);
      } else {
        state.calendarMonth = getMonthStartValue(new Date());
        state.selectedCalendarDate = getBestCalendarDate(state.calendarMonth);
      }
      render();
      return;
    }

    const rescheduleCalendarNavButton = event.target.closest("[data-reschedule-calendar-nav]");
    if (rescheduleCalendarNavButton) {
      event.preventDefault();
      const direction = rescheduleCalendarNavButton.dataset.rescheduleCalendarNav;
      const monthDate = getDateFromValue(state.rescheduleCalendarMonth) || getDateFromValue(state.rescheduleDraft.preferredDate) || new Date();
      if (direction === "prev") {
        monthDate.setMonth(monthDate.getMonth() - 1);
      } else if (direction === "next") {
        monthDate.setMonth(monthDate.getMonth() + 1);
      } else {
        const today = getTodayDateValue();
        state.rescheduleDraft = {
          ...state.rescheduleDraft,
          preferredDate: today,
        };
        state.rescheduleCalendarMonth = getMonthStartValue(getDateFromValue(today) || new Date());
        render();
        return;
      }

      monthDate.setDate(1);
      state.rescheduleCalendarMonth = getMonthStartValue(monthDate);
      render();
      return;
    }

    const rescheduleDateButton = event.target.closest("[data-reschedule-date]");
    if (rescheduleDateButton) {
      event.preventDefault();
      const dateValue = rescheduleDateButton.dataset.rescheduleDate || "";
      if (!dateValue) return;
      state.rescheduleDraft = {
        ...state.rescheduleDraft,
        preferredDate: dateValue,
      };
      state.rescheduleCalendarMonth = getMonthStartValue(getDateFromValue(dateValue) || new Date());
      render();
      return;
    }

    const calendarBookingButton = event.target.closest("[data-calendar-booking]");
    if (calendarBookingButton) {
      event.preventDefault();
      setDetailMode(DETAIL_MODES.desk);
      selectBooking(calendarBookingButton.dataset.calendarBooking || "");
      return;
    }

    const calendarDayButton = event.target.closest("[data-calendar-date]");
    if (calendarDayButton) {
      event.preventDefault();
      const dateValue = calendarDayButton.dataset.calendarDate || "";
      if (!dateValue) return;
      state.selectedCalendarDate = dateValue;
      if (!sameMonth(dateValue, state.calendarMonth)) {
        state.calendarMonth = getMonthStartValue(getDateFromValue(dateValue));
      }
      render();
      return;
    }

    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      state.archivedFilter = filterButton.dataset.filter || ARCHIVED_FILTERS.all;
      reconcileSelection();
      render();
      return;
    }

    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      selectView(viewButton.dataset.view);
      return;
    }

    const bookingCard = event.target.closest("[data-booking-select]");
    if (bookingCard) {
      selectBooking(bookingCard.dataset.bookingSelect || "");
    }
  }

  function handleManualDraftChange(event) {
    const manualForm = event.target.closest('[data-form="manual-booking"]');
    if (!manualForm) return;
    state.manualDraft = readManualDraft(manualForm);
  }

  function handleDeskControlsChange(event) {
    const searchInput = event.target.closest("[data-desk-search]");
    if (searchInput) {
      state.deskSearchQuery = searchInput.value || "";
      render();
      return;
    }

    const rescheduleForm = event.target.closest('[data-form="reschedule-booking"]');
    if (rescheduleForm) {
      state.rescheduleDraft = readRescheduleDraft(rescheduleForm);
    }
  }

  async function handleSubmit(event) {
    const manualForm = event.target.closest('[data-form="manual-booking"]');
    if (manualForm) {
      event.preventDefault();

      const manualDraft = readManualDraft(manualForm);
      state.manualDraft = manualDraft;
      state.manualSuccessMessage = "";

      if (!manualForm.reportValidity()) {
        return;
      }

      state.isCreatingManual = true;
      state.errorMessage = "";
      render();

      try {
        const resolvedBaseUrl = await resolveWorkingBaseUrl(state.apiBaseUrl);
        state.apiBaseUrl = resolvedBaseUrl;
        window.localStorage.setItem(STORAGE_KEY, resolvedBaseUrl);

        const response = await fetch(`${resolvedBaseUrl}/api/bookings/manual`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(manualDraft),
        });
        const payload = await parseResponse(response, "Could not save manual booking.");
        const booking = payload.booking;

        if (booking) {
          upsertBooking(booking);
          state.currentView = VIEWS.inbox;
          state.selectedBookingId = booking.id;
        } else {
          await loadBookings();
        }

        state.manualDraft = createDefaultManualDraft();
        state.manualSuccessMessage = `${booking?.name || "Booking"} added to accepted.`;
        state.showManualForm = false;
        state.lastLoadedAt = new Date();
        reconcileSelection();
      } catch (error) {
        state.errorMessage = error?.message || "Could not save manual booking.";
      } finally {
        state.isCreatingManual = false;
        render();
      }
      return;
    }

    const rescheduleForm = event.target.closest('[data-form="reschedule-booking"]');
    if (rescheduleForm) {
      event.preventDefault();
      const nextDraft = readRescheduleDraft(rescheduleForm);
      state.rescheduleDraft = nextDraft;

      if (!rescheduleForm.reportValidity()) {
        return;
      }

      state.isSavingReschedule = true;
      state.errorMessage = "";
      render();

      try {
        const booking = state.bookings.find((entry) => entry.id === nextDraft.bookingId);
        if (!booking) {
          throw new Error("Booking not found.");
        }

        const resolvedBaseUrl = await resolveWorkingBaseUrl(state.apiBaseUrl);
        state.apiBaseUrl = resolvedBaseUrl;
        window.localStorage.setItem(STORAGE_KEY, resolvedBaseUrl);

        const response = await fetch(`${resolvedBaseUrl}/api/bookings/${encodeURIComponent(nextDraft.bookingId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: booking.name,
            phone: booking.phone,
            email: booking.email,
            contactMethod: booking.contactMethod,
            year: booking.year,
            make: booking.make,
            model: booking.model,
            preferredDate: nextDraft.preferredDate,
            timeWindow: nextDraft.timeWindow,
            serviceType: booking.serviceType,
            concern: booking.concern,
            visitType: booking.visitType,
            urgency: booking.urgency,
          }),
        });
        const payload = await parseResponse(response, "Could not reschedule booking.");

        if (payload.booking) {
          upsertBooking(payload.booking);
          state.selectedBookingId = payload.booking.id;
          const bookingDate = getBookingDateValue(payload.booking);
          if (bookingDate) {
            state.selectedCalendarDate = bookingDate;
            state.calendarMonth = getMonthStartValue(getDateFromValue(bookingDate));
          }
        }

        state.showRescheduleForm = false;
      } catch (error) {
        state.errorMessage = error?.message || "Could not reschedule booking.";
      } finally {
        state.isSavingReschedule = false;
        render();
      }
      return;
    }

    const connectionForm = event.target.closest('[data-form="connection"]');
    if (!connectionForm) return;

    event.preventDefault();
    const formData = new FormData(connectionForm);
    state.apiBaseUrl = normalizeBaseUrl(formData.get("apiBaseUrl"));
    window.localStorage.setItem(STORAGE_KEY, state.apiBaseUrl);
    await loadBookings();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();

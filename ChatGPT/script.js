const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const menuBtn = document.getElementById("menuBtn");
const menu = document.getElementById("menu");
const mobileQuickActions = document.querySelector(".mobile-quick-actions");

if (menuBtn && menu) {
  const setMenuOpen = (isOpen) => {
    menu.classList.toggle("open", isOpen);
    menuBtn.setAttribute("aria-expanded", String(isOpen));
    menuBtn.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
    document.body.classList.toggle("menu-open", isOpen && window.innerWidth <= 920);
    window.dispatchEvent(new Event("sl-auto:quick-actions-refresh"));
  };

  menuBtn.addEventListener("click", () => {
    setMenuOpen(!menu.classList.contains("open"));
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("open")) {
      setMenuOpen(false);
      menuBtn.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!menu.classList.contains("open")) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!menu.contains(target) && !menuBtn.contains(target)) {
      setMenuOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 920) {
      setMenuOpen(false);
    } else if (!menu.classList.contains("open")) {
      document.body.classList.remove("menu-open");
    }
  });
}

if (mobileQuickActions) {
  let lastScrollY = window.scrollY;
  let quickActionsVisible = window.scrollY < 32;

  const updateMobileQuickActions = () => {
    const isMobile = window.innerWidth <= 920;
    const currentScrollY = window.scrollY;
    const delta = currentScrollY - lastScrollY;
    const nearTop = currentScrollY < 32;

    if (!isMobile || document.body.classList.contains("menu-open")) {
      document.body.classList.remove("mobile-quick-actions-visible");
      lastScrollY = currentScrollY;
      return;
    }

    if (nearTop) {
      quickActionsVisible = true;
    } else if (delta <= -10) {
      quickActionsVisible = true;
    } else if (delta >= 10) {
      quickActionsVisible = false;
    }

    document.body.classList.toggle("mobile-quick-actions-visible", quickActionsVisible);
    lastScrollY = currentScrollY;
  };

  updateMobileQuickActions();
  window.addEventListener("scroll", updateMobileQuickActions, { passive: true });
  window.addEventListener("resize", updateMobileQuickActions);
  window.addEventListener("sl-auto:quick-actions-refresh", updateMobileQuickActions);
}

const hoursStatusEl = document.getElementById("hoursStatus");
const hoursRows = Array.from(document.querySelectorAll(".hours-row[data-day]"));

if (hoursStatusEl && hoursRows.length) {
  const weekdayToIndex = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const parseMinutes = (timeValue) => {
    const [hour, minute] = (timeValue || "").split(":").map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  };

  const getRowInfo = (row) => {
    const spans = row.querySelectorAll("span");
    const daySpan = spans[0];
    const timeSpan = spans[1];
    const dayLabel = daySpan && daySpan.textContent ? daySpan.textContent.trim() : "";
    const timeLabel = timeSpan && timeSpan.textContent ? timeSpan.textContent.trim() : "";
    const [openLabel = "", closeLabel = ""] = timeLabel.split(" - ").map((part) => part.trim());
    const isClosed = row.dataset.closed === "true";

    return {
      row,
      day: Number(row.dataset.day),
      dayLabel,
      timeLabel,
      openLabel,
      closeLabel,
      isClosed,
      openMinutes: isClosed ? null : parseMinutes(row.dataset.open),
      closeMinutes: isClosed ? null : parseMinutes(row.dataset.close),
    };
  };

  const schedule = new Map(hoursRows.map((row) => [Number(row.dataset.day), getRowInfo(row)]));

  const getCalgaryClock = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Edmonton",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());

    const values = {};
    parts.forEach((part) => {
      values[part.type] = part.value;
    });
    const dayIndex = weekdayToIndex[values.weekday];
    const hour = Number(values.hour);
    const minute = Number(values.minute);

    if (!Number.isFinite(dayIndex) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }

    return {
      dayIndex,
      minutesNow: hour * 60 + minute,
    };
  };

  const updateHoursStatus = () => {
    const clock = getCalgaryClock();
    if (!clock) {
      hoursStatusEl.textContent = "Call to confirm current shop hours.";
      delete hoursStatusEl.dataset.open;
      return;
    }

    hoursRows.forEach((row) => row.classList.remove("is-today"));

    const todayInfo = schedule.get(clock.dayIndex);
    if (todayInfo) {
      todayInfo.row.classList.add("is-today");
    }

    if (!todayInfo) {
      hoursStatusEl.textContent = "Call to confirm current shop hours.";
      delete hoursStatusEl.dataset.open;
      return;
    }

    const isOpenNow =
      !todayInfo.isClosed &&
      todayInfo.openMinutes != null &&
      todayInfo.closeMinutes != null &&
      clock.minutesNow >= todayInfo.openMinutes &&
      clock.minutesNow < todayInfo.closeMinutes;

    if (isOpenNow) {
      hoursStatusEl.dataset.open = "true";
      hoursStatusEl.textContent = todayInfo.closeLabel
        ? `Open now in Calgary. Closes at ${todayInfo.closeLabel}.`
        : "Open now in Calgary.";
      return;
    }

    let nextOpenMessage = "Closed now in Calgary. Call to confirm the next available time.";

    for (let offset = 0; offset <= 7; offset += 1) {
      const dayIndex = (clock.dayIndex + offset) % 7;
      const info = schedule.get(dayIndex);
      if (!info || info.isClosed || info.openMinutes == null) continue;

      const opensLaterToday = offset === 0 && clock.minutesNow < info.openMinutes;
      const opensOnFutureDay = offset > 0;
      if (!opensLaterToday && !opensOnFutureDay) continue;

      const whenLabel = offset === 0 ? "today" : info.dayLabel;
      nextOpenMessage = info.openLabel
        ? `Closed now in Calgary. Opens ${whenLabel} at ${info.openLabel}.`
        : `Closed now in Calgary. Opens ${whenLabel}.`;
      break;
    }

    hoursStatusEl.dataset.open = "false";
    hoursStatusEl.textContent = nextOpenMessage;
  };

  updateHoursStatus();
  window.setInterval(updateHoursStatus, 60000);
}

const bookingForm = document.getElementById("bookingForm");
const serviceTypeEl = document.getElementById("serviceType");
const preferredDateEl = document.getElementById("preferredDate");
const preferredDateTriggerEl = document.getElementById("preferredDateTrigger");
const preferredDateDisplayEl = document.getElementById("preferredDateDisplay");
const preferredDateCalendarEl = document.getElementById("preferredDateCalendar");
const preferredDateMonthLabelEl = document.getElementById("preferredDateMonthLabel");
const preferredDateCalendarGridEl = document.getElementById("preferredDateCalendarGrid");
const preferredDateErrorEl = document.getElementById("preferredDateError");
const bookingSuccessEl = document.getElementById("bookingSuccess");
const bookingSuccessTextEl = document.getElementById("bookingSuccessText");
const bookingSummaryEl = document.getElementById("bookingSummary");
const newBookingBtn = document.getElementById("newBookingBtn");
const servicePills = Array.from(document.querySelectorAll(".service-pill[data-service-choice]"));
const API_BASE_STORAGE_KEY = "sl-auto-api-base";
const API_SERVICE_NAME = "sl-auto-booking-api";
const LOCAL_API_PORTS = ["3000", "4310"];
const isLoopbackHost = (hostname) => hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
const isPrivateIpv4Host = (hostname) =>
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");
const loadStoredBookingApiBase = () => {
  try {
    const saved = window.localStorage.getItem(API_BASE_STORAGE_KEY);
    if (saved && saved.trim()) return normalizeBaseUrl(saved);
  } catch (error) {
    // Ignore storage errors.
  }

  return "";
};
const persistBookingApiBase = (baseUrl) => {
  try {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, normalizeBaseUrl(baseUrl));
  } catch (error) {
    // Ignore storage errors.
  }
};
const getBookingApiBase = () => {
  const storedBaseUrl = loadStoredBookingApiBase();
  if (storedBaseUrl) return storedBaseUrl;

  if (/^https?:$/i.test(window.location.protocol) && window.location.origin && window.location.origin !== "null") {
    return window.location.origin;
  }

  return "http://localhost:3000";
};
const isBookingApi = async (baseUrl) => {
  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/health`);
    if (!response.ok) return false;

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) return false;

    const payload = await response.json();
    return payload?.service === API_SERVICE_NAME;
  } catch (error) {
    return false;
  }
};
const getFallbackBookingApiBases = (baseUrl) => {
  const fallbacks = new Set();

  try {
    const parsedUrl = new URL(normalizeBaseUrl(baseUrl));
    fallbacks.add(parsedUrl.origin);

    if (isLoopbackHost(parsedUrl.hostname) || isPrivateIpv4Host(parsedUrl.hostname)) {
      LOCAL_API_PORTS.forEach((port) => {
        const candidate = new URL(parsedUrl.origin);
        candidate.port = port;
        fallbacks.add(candidate.origin);
      });
    }

    if (parsedUrl.hostname === "localhost") {
      LOCAL_API_PORTS.forEach((port) => {
        fallbacks.add(`http://127.0.0.1:${port}`);
      });
    }

    if (parsedUrl.hostname === "127.0.0.1") {
      LOCAL_API_PORTS.forEach((port) => {
        fallbacks.add(`http://localhost:${port}`);
      });
    }
  } catch (error) {
    LOCAL_API_PORTS.forEach((port) => {
      fallbacks.add(`http://localhost:${port}`);
      fallbacks.add(`http://127.0.0.1:${port}`);
    });
  }

  return Array.from(fallbacks).map(normalizeBaseUrl).filter(Boolean);
};
const resolveWorkingBookingApiBase = async (baseUrl) => {
  const requestedBaseUrl = normalizeBaseUrl(baseUrl) || getBookingApiBase();
  const attemptedBases = [];
  const seen = new Set();

  const tryCandidate = async (candidate) => {
    const normalizedCandidate = normalizeBaseUrl(candidate);
    if (!normalizedCandidate || seen.has(normalizedCandidate)) return null;
    seen.add(normalizedCandidate);
    attemptedBases.push(normalizedCandidate);
    return (await isBookingApi(normalizedCandidate)) ? normalizedCandidate : null;
  };

  const directMatch = await tryCandidate(requestedBaseUrl);
  if (directMatch) {
    return { baseUrl: directMatch, attemptedBases, matched: true };
  }

  const fallbackBaseUrls = getFallbackBookingApiBases(requestedBaseUrl);
  for (const candidate of fallbackBaseUrls) {
    const fallbackMatch = await tryCandidate(candidate);
    if (fallbackMatch) {
      return { baseUrl: fallbackMatch, attemptedBases, matched: true };
    }
  }

  return { baseUrl: requestedBaseUrl, attemptedBases, matched: false };
};
const looksLikePreviewServer = (bodyText) => {
  const normalized = String(bodyText || "").toLowerCase();
  return (
    normalized.includes("___vscode_livepreview_injected_script") ||
    normalized.includes("<title>file not found</title>") ||
    normalized.includes("the file <b>")
  );
};
const isLocalBookingEnvironment = (baseUrl) => {
  if (window.location.protocol === "file:") return true;

  const hostnames = new Set();
  if (window.location.hostname) {
    hostnames.add(window.location.hostname);
  }

  try {
    const parsedUrl = new URL(normalizeBaseUrl(baseUrl));
    if (parsedUrl.hostname) {
      hostnames.add(parsedUrl.hostname);
    }
  } catch (error) {
    // Ignore invalid URLs.
  }

  return Array.from(hostnames).some((hostname) => isLoopbackHost(hostname) || isPrivateIpv4Host(hostname));
};
const describeBookingConnectionError = async (baseUrl, error) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const fallbackMessage =
    "We could not send your booking request online right now. Please call the shop at (587) 228-3688.";
  const genericMessage = error?.message || fallbackMessage;

  if (!normalizedBaseUrl) {
    return fallbackMessage;
  }

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
        return fallbackMessage;
      }
    }

    return fallbackMessage;
  } catch (probeError) {
    return isLocalBookingEnvironment(normalizedBaseUrl) ? fallbackMessage : genericMessage;
  }
};

const CLOSED_BOOKING_WEEKDAY = 6;
const parseBookingDate = (value) => {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const formatDateInputValue = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};
const isClosedBookingDate = (value) => {
  const parsed = parseBookingDate(value);
  return Boolean(parsed && parsed.getDay() === CLOSED_BOOKING_WEEKDAY);
};
const isBeforeBookableDate = (value) => {
  const parsed = parseBookingDate(value);
  const minDate = getNextBookableDate(new Date());
  return Boolean(parsed && parsed < minDate);
};
const getNextBookableDate = (date) => {
  const nextDate = new Date(date);
  nextDate.setHours(12, 0, 0, 0);

  while (nextDate.getDay() === CLOSED_BOOKING_WEEKDAY) {
    nextDate.setDate(nextDate.getDate() + 1);
  }

  return nextDate;
};
const bookingDateButtonFormatter = new Intl.DateTimeFormat("en-CA", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const bookingDateMonthFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  year: "numeric",
});
const bookingCalendarState = {
  visibleMonth: getNextBookableDate(new Date()),
  isOpen: false,
};
const bookingCalendarAvailability = {
  countsByDate: new Map(),
  hasLoaded: false,
  isLoading: false,
  resolvedApiBase: "",
};
const BOOKING_CALENDAR_TRANSITION_MS = 180;
let preferredDateCalendarCloseTimer = null;
const createMonthAnchor = (date) => {
  const anchor = new Date(date);
  anchor.setHours(12, 0, 0, 0);
  anchor.setDate(1);
  return anchor;
};
const addMonths = (date, amount) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount, 1);
  next.setHours(12, 0, 0, 0);
  return next;
};
const isSameCalendarDay = (left, right) =>
  Boolean(left && right) &&
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();
const isBookingDateSelectable = (date) => {
  const minDate = getNextBookableDate(new Date());
  return date >= minDate && date.getDay() !== CLOSED_BOOKING_WEEKDAY;
};
const getBookingCountForDate = (value) => bookingCalendarAvailability.countsByDate.get(value) || 0;
const resetBookingCalendarAvailability = () => {
  bookingCalendarAvailability.countsByDate.clear();
  bookingCalendarAvailability.hasLoaded = false;
  bookingCalendarAvailability.isLoading = false;
};
const loadBookingCalendarAvailability = async () => {
  if (bookingCalendarAvailability.hasLoaded || bookingCalendarAvailability.isLoading) return;
  bookingCalendarAvailability.isLoading = true;

  try {
    const apiResolution = await resolveWorkingBookingApiBase(
      bookingCalendarAvailability.resolvedApiBase || getBookingApiBase()
    );
    if (!apiResolution.matched) return;

    bookingCalendarAvailability.resolvedApiBase = apiResolution.baseUrl;
    persistBookingApiBase(apiResolution.baseUrl);

    const response = await fetch(`${apiResolution.baseUrl}/api/booking-availability`);
    if (!response.ok) return;

    const payload = await response.json();
    const nextCounts = new Map();

    const availability = Array.isArray(payload?.availability) ? payload.availability : [];
    availability.forEach((entry) => {
      const dateValue = String(entry?.date || "").trim();
      const count = Number(entry?.count || 0);
      if (!dateValue || count <= 0) return;
      nextCounts.set(dateValue, count);
    });

    bookingCalendarAvailability.countsByDate = nextCounts;
    bookingCalendarAvailability.hasLoaded = true;

    if (bookingCalendarState.isOpen) {
      renderPreferredDateCalendar();
    }
  } catch (error) {
    // Keep the customer calendar functional even if the booking API is unavailable.
  } finally {
    bookingCalendarAvailability.isLoading = false;
  }
};
const setPreferredDateError = (message) => {
  if (!preferredDateErrorEl || !preferredDateTriggerEl) return;
  preferredDateErrorEl.hidden = !message;
  preferredDateErrorEl.textContent = message || "";
  preferredDateTriggerEl.setAttribute("aria-invalid", message ? "true" : "false");
};
const syncPreferredDateDisplay = () => {
  if (!preferredDateDisplayEl || !preferredDateTriggerEl || !preferredDateEl) return;
  const parsed = parseBookingDate(preferredDateEl.value);
  const hasValue = Boolean(parsed);

  preferredDateDisplayEl.textContent = hasValue
    ? bookingDateButtonFormatter.format(parsed)
    : "Select a date";
  preferredDateTriggerEl.classList.toggle("is-placeholder", !hasValue);
};
const closePreferredDateCalendar = () => {
  if (!preferredDateCalendarEl || !preferredDateTriggerEl) return;
  bookingCalendarState.isOpen = false;
  preferredDateTriggerEl.classList.remove("is-open");
  preferredDateTriggerEl.setAttribute("aria-expanded", "false");

  preferredDateCalendarEl.classList.remove("is-visible");
  if (preferredDateCalendarCloseTimer) {
    window.clearTimeout(preferredDateCalendarCloseTimer);
  }

  preferredDateCalendarCloseTimer = window.setTimeout(() => {
    if (!bookingCalendarState.isOpen) {
      preferredDateCalendarEl.hidden = true;
    }
    preferredDateCalendarCloseTimer = null;
  }, BOOKING_CALENDAR_TRANSITION_MS);
};
const renderPreferredDateCalendar = () => {
  if (!preferredDateCalendarGridEl || !preferredDateMonthLabelEl || !preferredDateCalendarEl) return;

  const selectedDate = parseBookingDate(preferredDateEl ? preferredDateEl.value : "");
  const today = getNextBookableDate(new Date());
  const visibleMonth = createMonthAnchor(bookingCalendarState.visibleMonth);
  const monthStartDay = visibleMonth.getDay();
  const gridStart = new Date(visibleMonth);
  gridStart.setDate(visibleMonth.getDate() - monthStartDay);

  preferredDateMonthLabelEl.textContent = bookingDateMonthFormatter.format(visibleMonth);
  preferredDateCalendarGridEl.textContent = "";

  for (let index = 0; index < 42; index += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    day.setHours(12, 0, 0, 0);

    const value = formatDateInputValue(day);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "booking-date-day";
    button.dataset.dateValue = value;

    const numberEl = document.createElement("span");
    numberEl.className = "booking-date-day-number";
    numberEl.textContent = String(day.getDate());
    button.appendChild(numberEl);

    if (day.getMonth() !== visibleMonth.getMonth()) {
      button.classList.add("is-outside");
    }

    if (isSameCalendarDay(day, today)) {
      button.classList.add("is-today");
    }

    if (selectedDate && isSameCalendarDay(day, selectedDate)) {
      button.classList.add("is-selected");
      button.setAttribute("aria-pressed", "true");
    }

    if (!isBookingDateSelectable(day)) {
      button.classList.add("is-disabled");
      button.disabled = true;
    }

    const metaEl = document.createElement("span");
    metaEl.className = "booking-date-day-meta";

    if (day.getDay() === CLOSED_BOOKING_WEEKDAY) {
      metaEl.textContent = "Closed";
      button.classList.add("has-meta");
    }

    if (metaEl.textContent) {
      button.appendChild(metaEl);
    }

    preferredDateCalendarGridEl.appendChild(button);
  }

  const monthButtons = preferredDateCalendarEl.querySelectorAll("[data-booking-calendar-nav]");
  const minMonth = createMonthAnchor(getNextBookableDate(new Date()));
  monthButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const nav = button.dataset.bookingCalendarNav || "";
    if (nav === "prev") {
      const previousMonth = addMonths(visibleMonth, -1);
      button.disabled = previousMonth < minMonth;
    }
  });
};
const openPreferredDateCalendar = () => {
  if (!preferredDateCalendarEl || !preferredDateTriggerEl) return;
  if (preferredDateCalendarCloseTimer) {
    window.clearTimeout(preferredDateCalendarCloseTimer);
    preferredDateCalendarCloseTimer = null;
  }
  bookingCalendarState.visibleMonth = createMonthAnchor(
    parseBookingDate(preferredDateEl ? preferredDateEl.value : "") || getNextBookableDate(new Date())
  );
  bookingCalendarState.isOpen = true;
  renderPreferredDateCalendar();
  preferredDateCalendarEl.hidden = false;
  preferredDateTriggerEl.classList.add("is-open");
  preferredDateTriggerEl.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(() => {
    if (bookingCalendarState.isOpen) {
      preferredDateCalendarEl.classList.add("is-visible");
    }
  });
};
const validatePreferredDateSelection = (report = false) => {
  const value = preferredDateEl ? preferredDateEl.value : "";

  if (!value) {
    const message = "Please choose a preferred date.";
    setPreferredDateError(message);
    if (report && preferredDateTriggerEl) preferredDateTriggerEl.focus();
    return false;
  }

  if (isBeforeBookableDate(value)) {
    const message = "Please choose today or a future booking date.";
    setPreferredDateError(message);
    if (report && preferredDateTriggerEl) preferredDateTriggerEl.focus();
    return false;
  }

  if (isClosedBookingDate(value)) {
    const message = "Saturday is closed. Please choose Sunday or a weekday.";
    setPreferredDateError(message);
    if (report && preferredDateTriggerEl) preferredDateTriggerEl.focus();
    return false;
  }

  setPreferredDateError("");
  return true;
};

if (preferredDateEl && preferredDateTriggerEl && preferredDateCalendarEl && preferredDateCalendarGridEl) {
  preferredDateEl.min = formatDateInputValue(getNextBookableDate(new Date()));
  syncPreferredDateDisplay();

  preferredDateTriggerEl.addEventListener("click", () => {
    if (bookingCalendarState.isOpen) {
      closePreferredDateCalendar();
      return;
    }

    openPreferredDateCalendar();
  });

  preferredDateCalendarEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const navButton = target.closest("[data-booking-calendar-nav]");
    if (navButton instanceof HTMLButtonElement) {
      const direction = navButton.dataset.bookingCalendarNav || "";
      if (direction === "prev") bookingCalendarState.visibleMonth = addMonths(bookingCalendarState.visibleMonth, -1);
      if (direction === "next") bookingCalendarState.visibleMonth = addMonths(bookingCalendarState.visibleMonth, 1);
      if (direction === "today") bookingCalendarState.visibleMonth = createMonthAnchor(getNextBookableDate(new Date()));
      renderPreferredDateCalendar();
      return;
    }

    const dayButton = target.closest(".booking-date-day");
    if (!(dayButton instanceof HTMLButtonElement) || dayButton.disabled || !preferredDateEl) return;

    preferredDateEl.value = dayButton.dataset.dateValue || "";
    syncPreferredDateDisplay();
    validatePreferredDateSelection(false);
    closePreferredDateCalendar();
  });

  document.addEventListener("click", (event) => {
    if (!bookingCalendarState.isOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!preferredDateCalendarEl.contains(target) && !preferredDateTriggerEl.contains(target)) {
      closePreferredDateCalendar();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && bookingCalendarState.isOpen) {
      closePreferredDateCalendar();
      preferredDateTriggerEl.focus();
    }
  });
}

const setActiveServicePill = (value) => {
  servicePills.forEach((pill) => {
    const isActive = pill.getAttribute("data-service-choice") === value;
    pill.classList.toggle("is-active", isActive);
    pill.setAttribute("aria-pressed", String(isActive));
  });
};

if (serviceTypeEl && servicePills.length) {
  servicePills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const value = pill.getAttribute("data-service-choice") || "";
      serviceTypeEl.value = value;
      setActiveServicePill(value);
      serviceTypeEl.focus();
    });
  });

  serviceTypeEl.addEventListener("change", () => {
    setActiveServicePill(serviceTypeEl.value);
  });

  const params = new URLSearchParams(window.location.search);
  const serviceParam = params.get("service");
  if (serviceParam) {
    serviceTypeEl.value = serviceParam;
    setActiveServicePill(serviceTypeEl.value);
  } else {
    setActiveServicePill(serviceTypeEl.value);
  }
}

if (bookingForm && bookingSuccessEl && bookingSummaryEl && bookingSuccessTextEl) {
  const bookingPhoneInput = bookingForm.querySelector('input[name="phone"]');
  const bookingSubmitBtn = bookingForm.querySelector('button[type="submit"]');

  const formatPhoneInputValue = (value) => {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits ? `(${digits}` : "";
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  if (bookingPhoneInput) {
    bookingPhoneInput.addEventListener("input", () => {
      bookingPhoneInput.value = formatPhoneInputValue(bookingPhoneInput.value);
    });

    bookingPhoneInput.value = formatPhoneInputValue(bookingPhoneInput.value);
  }

  const formatDateForDisplay = (value) => {
    if (!value) return "Not specified";
    const parsed = new Date(value + "T12:00:00");
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en-CA", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  };

  const createSummaryItem = (label, value, fullWidth) => {
    const item = document.createElement("div");
    item.className = "booking-summary-item";
    if (fullWidth) item.classList.add("full");

    const labelEl = document.createElement("span");
    labelEl.className = "label";
    labelEl.textContent = label;

    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value || "Not provided";

    item.appendChild(labelEl);
    item.appendChild(valueEl);
    return item;
  };

  const getSubmitLabel = (isSaving) => (isSaving ? "Submitting..." : "Submit booking request");

  const syncSubmitButton = (isSaving = false) => {
    if (!bookingSubmitBtn) return;
    bookingSubmitBtn.disabled = isSaving;
    bookingSubmitBtn.textContent = getSubmitLabel(isSaving);
  };

  const focusBookingForm = () => {
    const firstInput = bookingForm.querySelector('input:not([hidden]):not([type="hidden"]), select, textarea');
    if (firstInput && typeof firstInput.focus === "function") {
      firstInput.focus();
    }
  };

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!bookingForm.checkValidity()) {
      bookingForm.reportValidity();
      return;
    }

    if (!validatePreferredDateSelection(true)) {
      return;
    }

    const formData = new FormData(bookingForm);
    const details = {
      name: String(formData.get("name") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      contactMethod: String(formData.get("contactMethod") || "").trim(),
      year: String(formData.get("year") || "").trim(),
      make: String(formData.get("make") || "").trim(),
      model: String(formData.get("model") || "").trim(),
      preferredDate: String(formData.get("preferredDate") || "").trim(),
      timeWindow: String(formData.get("timeWindow") || "").trim(),
      serviceType: String(formData.get("serviceType") || "").trim(),
      concern: String(formData.get("concern") || "").trim(),
      visitType: String(formData.get("visitType") || "").trim(),
      urgency: String(formData.get("urgency") || "").trim(),
    };

    const apiPayload = {
      ...details,
      source: "website",
      website: String(formData.get("website") || "").trim(),
    };

    syncSubmitButton(true);

    let resolvedApiBase = getBookingApiBase();
    let attemptedApiBases = [resolvedApiBase];
    let responsePayload = null;

    try {
      const apiResolution = await resolveWorkingBookingApiBase(resolvedApiBase);
      resolvedApiBase = apiResolution.baseUrl;
      attemptedApiBases = apiResolution.attemptedBases.length ? apiResolution.attemptedBases : attemptedApiBases;

      const response = await fetch(`${resolvedApiBase}/api/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiPayload),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      if (!response.ok || !payload || !payload.ok) {
        const errorText =
          payload && Array.isArray(payload.details) && payload.details.length
            ? payload.details.join(" ")
            : (payload && payload.error) || "Could not save booking request to server.";
        throw new Error(errorText);
      }

      responsePayload = payload;
      persistBookingApiBase(resolvedApiBase);
      bookingCalendarAvailability.resolvedApiBase = resolvedApiBase;
      resetBookingCalendarAvailability();
    } catch (error) {
      const message = await describeBookingConnectionError(resolvedApiBase, error);
      window.alert(message);
      syncSubmitButton(false);
      return;
    }

    const vehicleLabel = [details.year, details.make, details.model].filter(Boolean).join(" ");
    const urgencyFlag = /urgent|drivability/i.test(details.urgency);

    bookingSuccessTextEl.textContent = urgencyFlag
      ? "Thanks. For urgent drivability concerns, call the shop now so the team can advise on next steps right away."
      : "Thanks. Your booking request is ready for follow-up. The shop can confirm a time by your preferred contact method.";

    bookingSummaryEl.textContent = "";
    [
      ["Customer", details.name],
      ["Phone", details.phone],
      ["Vehicle", vehicleLabel],
      ["Requested service", details.serviceType],
      ["Preferred date", formatDateForDisplay(details.preferredDate)],
      ["Time window", details.timeWindow],
      ["Contact method", details.contactMethod],
      ["Visit type", details.visitType],
    ].forEach(([label, value]) => {
      bookingSummaryEl.appendChild(createSummaryItem(label, value));
    });

    if (details.concern) {
      bookingSummaryEl.appendChild(createSummaryItem("Issue summary", details.concern, true));
    }

    if (details.email) {
      bookingSummaryEl.appendChild(createSummaryItem("Email", details.email));
    }

    bookingForm.hidden = true;
    bookingSuccessEl.hidden = false;
    bookingSuccessEl.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const stored = {
        id: responsePayload?.id || "",
        ...details,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem("sl-auto-booking-demo:lastRequest", JSON.stringify(stored));
    } catch (error) {
      // Non-blocking in private mode / restricted browsers.
    }

    syncSubmitButton(false);
  });

  if (newBookingBtn) {
    newBookingBtn.addEventListener("click", () => {
      bookingForm.reset();
      if (bookingPhoneInput) {
        bookingPhoneInput.value = formatPhoneInputValue("");
      }
      setActiveServicePill(serviceTypeEl ? serviceTypeEl.value : "");
      syncPreferredDateDisplay();
      setPreferredDateError("");
      closePreferredDateCalendar();
      resetBookingCalendarAvailability();
      bookingSuccessEl.hidden = true;
      bookingForm.hidden = false;
      syncSubmitButton(false);
      focusBookingForm();
    });
  }
}

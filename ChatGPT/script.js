const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const menuBtn = document.getElementById("menuBtn");
const menu = document.getElementById("menu");

if (menuBtn && menu) {
  const setMenuOpen = (isOpen) => {
    menu.classList.toggle("open", isOpen);
    menuBtn.setAttribute("aria-expanded", String(isOpen));
    menuBtn.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
    document.body.classList.toggle("menu-open", isOpen && window.innerWidth <= 920);
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
const bookingSuccessEl = document.getElementById("bookingSuccess");
const bookingSuccessTextEl = document.getElementById("bookingSuccessText");
const bookingSummaryEl = document.getElementById("bookingSummary");
const editBookingBtn = document.getElementById("editBookingBtn");
const servicePills = Array.from(document.querySelectorAll(".service-pill[data-service-choice]"));

if (preferredDateEl) {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  preferredDateEl.min = localDate.toISOString().slice(0, 10);
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
  const bookingSubmitBtn = bookingForm.querySelector('button[type="submit"]');
  const getBookingApiBase = () => {
    try {
      const saved = window.localStorage.getItem("sl-auto-api-base");
      if (saved && saved.trim()) return saved.trim().replace(/\/+$/, "");
    } catch (error) {
      // Ignore storage errors.
    }
    return "http://localhost:3000";
  };

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

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!bookingForm.checkValidity()) {
      bookingForm.reportValidity();
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

    if (bookingSubmitBtn) {
      bookingSubmitBtn.disabled = true;
      bookingSubmitBtn.textContent = "Submitting...";
    }

    try {
      const response = await fetch(getBookingApiBase() + "/api/bookings", {
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
    } catch (error) {
      const message = error && error.message ? error.message : "Could not connect to booking API.";
      window.alert(
        message +
          "\n\nMake sure the backend is running and reachable at " +
          getBookingApiBase() +
          "."
      );
      if (bookingSubmitBtn) {
        bookingSubmitBtn.disabled = false;
        bookingSubmitBtn.textContent = "Submit booking request";
      }
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
        ...details,
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem("sl-auto-booking-demo:lastRequest", JSON.stringify(stored));
    } catch (error) {
      // Non-blocking in private mode / restricted browsers.
    }

    if (bookingSubmitBtn) {
      bookingSubmitBtn.disabled = false;
      bookingSubmitBtn.textContent = "Submit booking request";
    }
  });

  if (editBookingBtn) {
    editBookingBtn.addEventListener("click", () => {
      bookingSuccessEl.hidden = true;
      bookingForm.hidden = false;
      const firstInput = bookingForm.querySelector("input, select, textarea");
      if (firstInput && typeof firstInput.focus === "function") {
        firstInput.focus();
      }
    });
  }
}

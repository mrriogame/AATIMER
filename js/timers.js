import { storage } from "./storage.js";

export const CATEGORY_NAMES = {
  battle: "⚔️ Сражения",
  battlefield: "🏰 Поля боя фракций",
  raid: "🐉 Рейды",
  mythic: "💀 Мифические противники",
  worldboss: "👹 Мировые боссы",
  other: "🎯 Прочие ивенты",
};

export const CATEGORY_COLORS = {
  battle: "#e74c3c",
  battlefield: "#3498db",
  raid: "#f1c40f",
  mythic: "#9b59b6",
  worldboss: "#e67e22",
  other: "#1abc9c",
};

const WEEKDAY_NAMES = { 1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб", 7: "Вс" };
const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const SPEED = 6;
const OFFSET_MS = 40 * 60 * 1000;
const CYCLE_MS = 4 * 60 * 60 * 1000;
const DAY_SECONDS = 24 * 60 * 60;

let notificationsEnabled = storage.getNotificationsEnabled();
let notifyMinutes = storage.getNotifyMinutes();
let subscribedEvents = storage.getSubscribed();
let collapsedCategories = storage.getCollapsed();
let notifiedEvents = new Set();
let audioCtx = null;
let eventsList = [];

function pad(n) {
  return String(n).padStart(2, "0");
}

export function formatDur(ms) {
  if (ms < 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d ? `${d}д ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function playAlarmSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.value = 0.3;
      osc.start(now + i * 0.25);
      osc.stop(now + i * 0.25 + 0.15);
    }
  } catch (e) {
    console.warn("Audio error:", e);
  }
}

export function getMskTimeParts() {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { h: get("hour"), m: get("minute"), s: get("second") };
}

function getMskDateParts() {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return { weekday: get("weekday"), day: get("day"), month: get("month") };
}

function getMskDayOfWeek() {
  const mskDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    weekday: "short",
  }).format(new Date());
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[mskDay] || 1;
}

function getJsDayOfWeek() {
  const mskDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    weekday: "short",
  }).format(new Date());
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[mskDay] || 0;
}

function getGameTime() {
  const now = new Date();
  const utcMidnightMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);
  const utcMsFromMidnight = now.getTime() - utcMidnightMs;
  const cyclePosMs = (utcMsFromMidnight + OFFSET_MS) % CYCLE_MS;
  const gameMs = cyclePosMs * SPEED;
  const gameSeconds = Math.floor(gameMs / 1000) % DAY_SECONDS;
  return {
    h: Math.floor(gameSeconds / 3600),
    m: Math.floor((gameSeconds % 3600) / 60),
    s: gameSeconds % 60,
  };
}

export function updateClocks() {
  const msk = getMskTimeParts();
  document.getElementById("realTime").textContent = `${pad(msk.h)}:${pad(msk.m)}:${pad(msk.s)}`;
  const mskDate = getMskDateParts();
  document.getElementById("currentDay").textContent = `${mskDate.weekday}, ${mskDate.day}.${mskDate.month}`;

  const game = getGameTime();
  document.getElementById("gameTime").textContent = `${pad(game.h)}:${pad(game.m)}:${pad(game.s)}`;
  const gh = game.h;
  document.getElementById("gamePhase").textContent =
    gh >= 6 && gh < 12 ? "🌅 Утро" : gh >= 12 && gh < 18 ? "☀️ День" : gh >= 18 && gh < 22 ? "🌆 Вечер" : "🌙 Ночь";
}

function findBestSlot(schedule) {
  const msk = getMskTimeParts();
  const currentDayIso = getMskDayOfWeek();
  const currentMinutes = msk.h * 60 + msk.m;
  const currentSeconds = msk.s;
  let bestSlot = null;

  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    let checkDayIso = currentDayIso + dayOffset;
    if (checkDayIso > 7) checkDayIso -= 7;

    for (const slot of schedule) {
      const allowedDays = slot.days || [1, 2, 3, 4, 5, 6, 7];
      if (!allowedDays.includes(checkDayIso)) continue;

      const [sh, sm] = slot.start.split(":").map(Number);
      const [eh, em] = slot.end.split(":").map(Number);
      const slotStartMin = sh * 60 + sm;
      const slotEndMin = eh * 60 + em;

      let isActive = false;
      let remainingMs = 0;

      if (dayOffset === 0) {
        if (currentMinutes >= slotStartMin && currentMinutes < slotEndMin) {
          isActive = true;
          remainingMs = ((slotEndMin - currentMinutes) * 60 - currentSeconds) * 1000;
        } else if (currentMinutes < slotStartMin) {
          remainingMs = ((slotStartMin - currentMinutes) * 60 - currentSeconds) * 1000;
        } else {
          continue;
        }
      } else {
        const minutesToMidnight = 24 * 60 - currentMinutes;
        remainingMs =
          ((minutesToMidnight + (dayOffset - 1) * 24 * 60 + slotStartMin) * 60 - currentSeconds) * 1000;
      }

      if (!bestSlot || remainingMs < bestSlot.remainingMs) {
        bestSlot = { slot, dayOffset, remainingMs, isActive };
      }
      if (isActive) break;
    }
    if (bestSlot?.isActive) break;
  }
  return bestSlot;
}

/** Absolute Date for a schedule start in Europe/Moscow (dayOffset from today MSK). */
export function getMskOccurrenceDate(dayOffset, startHHMM) {
  const [sh, sm] = startHHMM.split(":").map(Number);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const y = Number(get("year"));
  const mo = Number(get("month"));
  const d = Number(get("day"));
  // Construct as UTC instant that equals MSK wall time: MSK = UTC+3 (no DST)
  const utcMs = Date.UTC(y, mo - 1, d + dayOffset, sh - 3, sm, 0);
  return new Date(utcMs);
}

/**
 * Upcoming occurrences for an event schedule (reuses timer day/slot rules).
 * Returns up to `limit` items with ISO eventTime and labels.
 */
export function getUpcomingOccurrences(schedule, limit = 6) {
  const msk = getMskTimeParts();
  const currentDayIso = getMskDayOfWeek();
  const currentMinutes = msk.h * 60 + msk.m;
  const items = [];

  for (let dayOffset = 0; dayOffset < 14 && items.length < limit; dayOffset++) {
    let checkDayIso = currentDayIso + dayOffset;
    while (checkDayIso > 7) checkDayIso -= 7;

    const daySlots = [];
    for (const slot of schedule || []) {
      const allowedDays = slot.days || [1, 2, 3, 4, 5, 6, 7];
      if (!allowedDays.includes(checkDayIso)) continue;
      const [sh, sm] = slot.start.split(":").map(Number);
      const startMin = sh * 60 + sm;
      if (dayOffset === 0 && startMin < currentMinutes) continue;
      daySlots.push(slot);
    }
    daySlots.sort((a, b) => {
      const [ah, am] = a.start.split(":").map(Number);
      const [bh, bm] = b.start.split(":").map(Number);
      return ah * 60 + am - (bh * 60 + bm);
    });

    for (const slot of daySlots) {
      if (items.length >= limit) break;
      const when = getMskOccurrenceDate(dayOffset, slot.start);
      let dayLabel = "Сегодня";
      if (dayOffset === 1) dayLabel = "Завтра";
      else if (dayOffset > 1) {
        let futureDay = getJsDayOfWeek() + dayOffset;
        while (futureDay > 6) futureDay -= 7;
        dayLabel = WEEKDAY_SHORT[futureDay];
      }
      items.push({
        start: slot.start,
        end: slot.end,
        dayOffset,
        dayLabel,
        eventTime: when.toISOString(),
        label: `${dayLabel} ${slot.start}`,
        remainingMs: when.getTime() - Date.now(),
      });
    }
  }
  return items;
}

export function describeEventTime(iso) {
  if (!iso) return { whenLabel: "", remainingLabel: "", remainingMs: null, past: false };
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) {
    return { whenLabel: "", remainingLabel: "", remainingMs: null, past: false };
  }
  const remainingMs = when.getTime() - Date.now();
  const past = remainingMs <= 0;

  const mskParts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(when);
  const g = (t) => mskParts.find((p) => p.type === t)?.value || "";
  const timeStr = `${g("hour")}:${g("minute")}`;

  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const eventDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);

  let whenLabel;
  const [ty, tm, td] = todayParts.split("-").map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const [ey, em, ed] = eventDay.split("-").map(Number);
  const eventUtc = Date.UTC(ey, em - 1, ed);
  const dayDiff = Math.round((eventUtc - todayUtc) / 86400000);
  if (dayDiff === 0) whenLabel = `Сегодня в ${timeStr}`;
  else if (dayDiff === 1) whenLabel = `Завтра в ${timeStr}`;
  else whenLabel = `${g("weekday")} ${g("day")}.${g("month")} в ${timeStr}`;

  const remainingLabel = past ? "Уже началось / прошло" : `Через ${formatDur(remainingMs)}`;
  return { whenLabel, remainingLabel, remainingMs, past };
}

export function getBestSlotForSchedule(schedule) {
  return findBestSlot(schedule);
}

function checkNotification(id, name, mins) {
  if (!notificationsEnabled || !subscribedEvents[String(id)]) return;
  if (mins > notifyMinutes || mins <= 0) return;
  const k = `${id}-${Math.floor(Date.now() / 60000)}-${Math.floor(mins)}`;
  if (notifiedEvents.has(k)) return;
  notifiedEvents.add(k);

  playAlarmSound();

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(`⏰ ${name}`, {
      body: `Начало через ${Math.ceil(mins)} мин!`,
      tag: `ev-${id}-${Math.floor(Date.now() / 60000)}`,
      requireInteraction: true,
    });
  }

  setTimeout(() => notifiedEvents.delete(k), 3600000);
}

export function updateEventTimers() {
  const currentEvents = [];

  document.querySelectorAll(".event-row").forEach((row) => {
    const schedule = parseScheduleAttr(row.dataset.schedule);
    const eventName = row.dataset.eventName;
    const bestSlot = findBestSlot(schedule);

    row.classList.remove("event-active", "event-soon");
    const nextTimeEl = row.querySelector(".event-next-time");
    const remainingEl = row.querySelector(".event-remaining");

    if (bestSlot) {
      if (bestSlot.isActive) {
        row.classList.add("event-active");
        nextTimeEl.textContent = "🟢 Идёт";
        remainingEl.textContent = formatDur(bestSlot.remainingMs);
        currentEvents.push({ name: eventName, remaining: bestSlot.remainingMs });
      } else {
        const mins = bestSlot.remainingMs / 60000;
        if (mins <= 30) row.classList.add("event-soon");
        checkNotification(row.dataset.eventId, eventName, mins);

        let dayLabel = "";
        if (bestSlot.dayOffset === 0) dayLabel = "Сегодня";
        else if (bestSlot.dayOffset === 1) dayLabel = "Завтра";
        else {
          let futureDay = getJsDayOfWeek() + bestSlot.dayOffset;
          if (futureDay > 6) futureDay -= 7;
          dayLabel = WEEKDAY_SHORT[futureDay];
        }

        nextTimeEl.textContent = `${dayLabel} ${bestSlot.slot.start}`;
        remainingEl.textContent = formatDur(bestSlot.remainingMs);
      }
    } else {
      nextTimeEl.textContent = "--";
      remainingEl.textContent = "--:--:--";
    }
  });

  const cb = document.getElementById("currentEvents");
  const cl = document.getElementById("currentEventsList");
  if (currentEvents.length) {
    cb.hidden = false;
    cl.innerHTML = currentEvents
      .map(
        (e) =>
          `<div class="events-current-item"><span>${escHtml(e.name)}</span><span>${formatDur(e.remaining)}</span></div>`
      )
      .join("");
  } else {
    cb.hidden = true;
  }
}

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

export function encodeScheduleAttr(schedule) {
  return encodeURIComponent(JSON.stringify(schedule || []));
}

export function parseScheduleAttr(raw) {
  if (!raw) return [];
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
}

function scheduleLabel(schedule) {
  return schedule
    .map((slot) => {
      let days = "";
      if (slot.days && slot.days.length < 7) {
        days = ` <span class="event-slot-days">(${slot.days.map((d) => WEEKDAY_NAMES[d] || "").join(",")})</span>`;
      }
      return `<div class="event-slot"><span class="event-slot-time">${escHtml(slot.start)}-${escHtml(slot.end)}</span>${days}</div>`;
    })
    .join("");
}

export function renderEvents(events) {
  eventsList = events;
  const root = document.getElementById("eventsRoot");
  const order = Object.keys(CATEGORY_NAMES);
  const parts = [];

  for (const cat of order) {
    const catEvents = events.filter((e) => e.category === cat);
    if (!catEvents.length) continue;
    const collapsed = !!collapsedCategories[cat];
    parts.push(`
      <div class="events-category" data-category="${cat}">
        <div class="events-category-header" data-toggle-cat="${cat}" style="background:${CATEGORY_COLORS[cat]};">
          <span class="events-category-title">${CATEGORY_NAMES[cat]}</span>
          <span class="events-category-count">${catEvents.length}</span>
          <span class="events-category-toggle${collapsed ? " collapsed" : ""}" id="toggle-${cat}">▼</span>
        </div>
        <div class="events-category-body${collapsed ? " collapsed" : ""}" id="body-${cat}">
          <table class="events-table">
            <thead>
              <tr>
                <th>Событие</th>
                <th>Расписание</th>
                <th>Ближайшее</th>
                <th style="width:40px;text-align:center;">🔔</th>
              </tr>
            </thead>
            <tbody>
              ${catEvents
                .map((event) => {
                  const schedule = event.schedule || [];
                  const hasInfo = !!(event.description || event.rewards);
                  return `
                  <tr class="event-row"
                      data-event-id="${event.id}"
                      data-event-name="${escHtml(event.name)}"
                      data-schedule="${encodeScheduleAttr(schedule)}"
                      data-description="${escHtml(event.description || "")}"
                      data-rewards="${escHtml(event.rewards || "")}">
                    <td>
                      <div class="event-name">
                        <span class="event-icon" style="background:${escHtml(event.color)}">${event.icon || "⚔️"}</span>
                        <div class="event-name-wrap">
                          <span class="event-title">${escHtml(event.name)}</span>
                          ${hasInfo ? `<button type="button" class="event-info-btn" data-info-btn title="Подробнее">ℹ️</button>` : ""}
                          <button type="button" class="event-task-btn" data-add-task title="Добавить в задачи">➕</button>
                        </div>
                      </div>
                    </td>
                    <td class="event-schedule-cell">${scheduleLabel(schedule)}</td>
                    <td>
                      <div class="event-countdown">
                        <div class="event-next-time">--</div>
                        <div class="event-remaining">--:--:--</div>
                      </div>
                    </td>
                    <td style="text-align:center;">
                      <button type="button" class="event-alarm-btn" data-event-id="${event.id}" title="Включить/выключить будильник">🔕</button>
                    </td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`);
  }

  root.innerHTML = parts.join("") || `<div class="events-loading">Нет активных событий</div>`;
  fillPlannerCheckboxes();
  updateAlarmButtons();
  updateEventTimers();
}

function fillPlannerCheckboxes() {
  const c = document.getElementById("plannerCheckboxes");
  c.innerHTML = Array.from(document.querySelectorAll(".event-row"))
    .map(
      (r) => `
      <label class="events-planner-checkbox">
        <input type="checkbox" value="${r.dataset.eventId}" data-name="${escHtml(r.dataset.eventName)}" data-schedule="${r.dataset.schedule || ""}">
        ${escHtml(r.dataset.eventName)}
      </label>`
    )
    .join("");
}

export function buildRoute() {
  const msk = getMskTimeParts();
  const currentMinutes = msk.h * 60 + msk.m;
  const currentDayIso = getMskDayOfWeek();

  const selected = Array.from(document.querySelectorAll("#plannerCheckboxes input:checked")).map((cb) => ({
    name: cb.dataset.name,
    schedule: parseScheduleAttr(cb.dataset.schedule),
  }));

  if (!selected.length) {
    alert("Выберите события");
    return;
  }

  const slots = [];
  [0, 1].forEach((dayOffset) => {
    let checkDayIso = currentDayIso + dayOffset;
    if (checkDayIso > 7) checkDayIso -= 7;
    const dayName = dayOffset ? "Завтра" : "Сегодня";

    selected.forEach((e) =>
      e.schedule.forEach((s) => {
        const allowedDays = s.days || [1, 2, 3, 4, 5, 6, 7];
        if (!allowedDays.includes(checkDayIso)) return;

        const [sh, sm] = s.start.split(":").map(Number);
        const [eh, em] = s.end.split(":").map(Number);
        const sM = sh * 60 + sm;
        const eM = eh * 60 + em;

        let status = "upcoming";
        if (dayOffset === 0) {
          if (currentMinutes >= sM && currentMinutes < eM) status = "active";
          else if (currentMinutes >= eM) status = "missed";
        }

        slots.push({ name: e.name, day: dayName, start: s.start, end: s.end, status, sort: dayOffset * 10000 + sM });
      })
    );
  });

  slots.sort((a, b) => a.sort - b.sort);
  const seen = new Set();
  const unique = slots.filter((s) => {
    const k = s.name + s.day + s.start;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  document.getElementById("routeList").innerHTML = unique
    .map(
      (s, i) => `
    <div class="events-route-item ${s.status}">
      <div class="events-route-num">${i + 1}</div>
      <div class="events-route-info">
        <div class="events-route-name">${escHtml(s.name)}</div>
        <div class="events-route-time">${s.day} ${s.start}-${s.end}</div>
      </div>
      <div class="events-route-status ${s.status}">
        ${s.status === "active" ? "▶ Сейчас" : s.status === "missed" ? "✗ Пропущено" : "⏳ Ожидание"}
      </div>
    </div>`
    )
    .join("");

  document.getElementById("plannerRoute").hidden = false;
}

export function buildTimeline() {
  const msk = getMskTimeParts();
  const currentMinutes = msk.h * 60 + msk.m;
  const currentDayIso = getMskDayOfWeek();
  const allSlots = [];

  document.querySelectorAll(".event-row").forEach((row) => {
    const schedule = parseScheduleAttr(row.dataset.schedule);
    const eventName = row.dataset.eventName;

    [0, 1].forEach((dayOffset) => {
      let checkDayIso = currentDayIso + dayOffset;
      if (checkDayIso > 7) checkDayIso -= 7;
      const dayName = dayOffset ? "Завтра" : "Сегодня";

      schedule.forEach((slot) => {
        const allowedDays = slot.days || [1, 2, 3, 4, 5, 6, 7];
        if (!allowedDays.includes(checkDayIso)) return;

        const [sh, sm] = slot.start.split(":").map(Number);
        const sM = sh * 60 + sm;
        let status = "waiting";
        if (dayOffset === 0) {
          const [eh, em] = slot.end.split(":").map(Number);
          const eM = eh * 60 + em;
          if (currentMinutes >= sM && currentMinutes < eM) status = "active";
          else if (currentMinutes < sM && sM - currentMinutes <= 30) status = "soon";
        }

        allSlots.push({
          name: eventName,
          day: dayName,
          start: slot.start,
          end: slot.end,
          status,
          sort: dayOffset * 10000 + sM,
        });
      });
    });
  });

  allSlots.sort((a, b) => a.sort - b.sort);
  const seen = new Set();
  const unique = allSlots.filter((s) => {
    const k = s.name + s.day + s.start;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  document.getElementById("timelineContent").innerHTML = unique
    .map(
      (s) => `
    <div class="events-timeline-item ${s.status}">
      <div class="events-timeline-time">${s.day} ${s.start}</div>
      <div class="events-timeline-name">${escHtml(s.name)}</div>
      <div class="events-timeline-status ${s.status}">
        ${s.status === "active" ? "Идёт" : s.status === "soon" ? "Скоро" : `${s.start}-${s.end}`}
      </div>
    </div>`
    )
    .join("");
}

export function updateAlarmButtons() {
  subscribedEvents = storage.getSubscribed();
  document.querySelectorAll(".event-alarm-btn").forEach((btn) => {
    const id = btn.dataset.eventId;
    const isActive = !!subscribedEvents[String(id)];
    btn.textContent = isActive ? "🔔" : "🔕";
    btn.classList.toggle("active", isActive);
  });
}

export function updateNotifyButton() {
  const b = document.getElementById("notifyBtn");
  const subscribedCount = Object.keys(storage.getSubscribed()).length;
  if (notificationsEnabled) {
    b.textContent = subscribedCount > 0 ? `🔔 Вкл (${subscribedCount})` : "🔔 Вкл";
  } else {
    b.textContent = "🔕 Выкл";
  }
  b.classList.toggle("active", notificationsEnabled);
}

export function toggleEventAlarm(eventId) {
  const nowOn = storage.toggleSubscription(eventId);
  subscribedEvents = storage.getSubscribed();
  if (nowOn && !notificationsEnabled) {
    toggleNotifications();
  }
  updateAlarmButtons();
  updateNotifyButton();
}

export function toggleNotifications() {
  if (!("Notification" in window)) {
    alert("Браузер не поддерживает уведомления");
    return;
  }
  if (!notificationsEnabled) {
    Notification.requestPermission().then((p) => {
      if (p === "granted") {
        notificationsEnabled = true;
        storage.setNotificationsEnabled(true);
        updateNotifyButton();
      } else {
        alert("Разрешите уведомления в настройках браузера");
      }
    });
  } else {
    notificationsEnabled = false;
    storage.setNotificationsEnabled(false);
    updateNotifyButton();
  }
}

export function toggleCategory(cat) {
  const b = document.getElementById("body-" + cat);
  const t = document.getElementById("toggle-" + cat);
  if (!b) return;
  b.classList.toggle("collapsed");
  t?.classList.toggle("collapsed");
  collapsedCategories[cat] = b.classList.contains("collapsed");
  storage.setCollapsed(collapsedCategories);
}

export function showEventInfo(row) {
  const name = row.dataset.eventName || "";
  const desc = row.dataset.description || "";
  const rewards = row.dataset.rewards || "";

  document.getElementById("eventInfoPopup")?.remove();

  let bodyHtml = "";
  if (desc) {
    bodyHtml += `<div class="event-info-section">
      <div class="event-info-label">📍 Описание</div>
      <div class="event-info-text">${escHtml(desc)}</div>
    </div>`;
  }
  if (rewards) {
    bodyHtml += `<div class="event-info-section">
      <div class="event-info-label">🎁 Награда</div>
      <div class="event-info-text">${escHtml(rewards)}</div>
    </div>`;
  }

  const overlay = document.createElement("div");
  overlay.id = "eventInfoPopup";
  overlay.className = "event-info-popup-overlay";
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
  overlay.innerHTML = `
    <div class="event-info-popup">
      <div class="event-info-popup-header">
        <h3>${escHtml(name)}</h3>
        <button type="button" class="event-info-popup-close" aria-label="Закрыть">✕</button>
      </div>
      <div class="event-info-popup-body">${bodyHtml}</div>
    </div>`;
  overlay.querySelector(".event-info-popup-close").onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

export function initNotifyControls() {
  const select = document.getElementById("notifyMinutes");
  select.value = String(notifyMinutes);
  select.addEventListener("change", (e) => {
    notifyMinutes = +e.target.value;
    storage.setNotifyMinutes(notifyMinutes);
  });
  updateNotifyButton();
  updateAlarmButtons();
}

/**
 * Re-read timer prefs from the active LocalStorage scope (guest or user).
 * Call after auth/storage scope changes so one account never shows another's alarms.
 */
export function reloadLocalPrefsFromStorage() {
  notificationsEnabled = storage.getNotificationsEnabled();
  notifyMinutes = storage.getNotifyMinutes();
  subscribedEvents = storage.getSubscribed();
  collapsedCategories = storage.getCollapsed();
  notifiedEvents = new Set();

  const select = document.getElementById("notifyMinutes");
  if (select) select.value = String(notifyMinutes);

  if (eventsList.length) {
    renderEvents(eventsList);
  } else {
    updateNotifyButton();
    updateAlarmButtons();
  }
}

export function getEventsList() {
  return eventsList;
}

export function setEventsList(events) {
  eventsList = Array.isArray(events) ? events : [];
}

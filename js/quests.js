/**
 * Dailies / weeklies (quests) — not linked to the event timer.
 *
 * Reset rules (MSK / Europe/Moscow):
 * - daily: available again 24 hours after completion (rolling cooldown)
 * - weekly: resets every Sunday at 00:00 MSK
 *
 * Catalogs live in data/dailies.json and data/weeklies.json (filled later).
 * Tasks store kind + questId; completion uses completedAt for reset math.
 */

export const QUEST_KIND = {
  DAILY: "daily",
  WEEKLY: "weekly",
};

const MSK = "Europe/Moscow";

/** Empty until user provides lists — shape documented for future fill. */
export const EMPTY_DAILIES = { quests: [] };
export const EMPTY_WEEKLIES = { quests: [] };

/**
 * Expected quest catalog item:
 * { id: string, title: string, description?: string, icon?: string }
 */

export async function loadDailiesCatalog() {
  try {
    const res = await fetch("./data/dailies.json", { cache: "no-cache" });
    if (!res.ok) return EMPTY_DAILIES.quests;
    const data = await res.json();
    return Array.isArray(data.quests) ? data.quests : [];
  } catch {
    return EMPTY_DAILIES.quests;
  }
}

export async function loadWeekliesCatalog() {
  try {
    const res = await fetch("./data/weeklies.json", { cache: "no-cache" });
    if (!res.ok) return EMPTY_WEEKLIES.quests;
    const data = await res.json();
    return Array.isArray(data.quests) ? data.quests : [];
  } catch {
    return EMPTY_WEEKLIES.quests;
  }
}

function mskParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MSK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return {
    y: Number(g("year")),
    m: Number(g("month")),
    d: Number(g("day")),
    weekday: g("weekday"), // Sun, Mon, ...
    h: Number(g("hour")),
    min: Number(g("minute")),
    s: Number(g("second")),
  };
}

/** Instant of Sunday 00:00 MSK for the week containing `date` (week starts Sunday). */
export function getWeekStartSundayMsk(date = new Date()) {
  const p = mskParts(date);
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday] ?? 0;
  // MSK = UTC+3
  const dayUtc = Date.UTC(p.y, p.m - 1, p.d - weekdayIndex, 0 - 3, 0, 0);
  return new Date(dayUtc);
}

export function getNextWeeklyResetMsk(date = new Date()) {
  const start = getWeekStartSundayMsk(date);
  if (date.getTime() < start.getTime()) return start;
  // next Sunday
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * Is a daily quest available again?
 * Rolling 24h from completedAt. If never completed — available.
 */
export function isDailyAvailable(task, now = new Date()) {
  if (!task?.completed || !task.completedAt) return true;
  const done = new Date(task.completedAt).getTime();
  if (Number.isNaN(done)) return true;
  return now.getTime() - done >= 24 * 60 * 60 * 1000;
}

/**
 * Is a weekly quest available in the current MSK week (Sun 00:00 → next Sun)?
 * Available if not completed, or completed before current week start.
 */
export function isWeeklyAvailable(task, now = new Date()) {
  if (!task?.completed || !task.completedAt) return true;
  const done = new Date(task.completedAt).getTime();
  if (Number.isNaN(done)) return true;
  const weekStart = getWeekStartSundayMsk(now).getTime();
  return done < weekStart;
}

export function describeQuestAvailability(task, now = new Date()) {
  if (!task) return "";
  if (task.kind === QUEST_KIND.DAILY) {
    if (isDailyAvailable(task, now)) return task.completed ? "Можно снова (прошло 24 ч)" : "";
    const done = new Date(task.completedAt).getTime();
    const left = 24 * 60 * 60 * 1000 - (now.getTime() - done);
    const h = Math.max(0, Math.floor(left / 3600000));
    const m = Math.max(0, Math.floor((left % 3600000) / 60000));
    return `Снова через ${h} ч ${m} мин`;
  }
  if (task.kind === QUEST_KIND.WEEKLY) {
    if (isWeeklyAvailable(task, now)) return task.completed ? "Доступен на этой неделе" : "";
    const next = getNextWeeklyResetMsk(now);
    return `Сброс: вс 00:00 МСК`;
  }
  return "";
}

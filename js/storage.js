/**
 * Local settings store.
 * Keys match the old PHP site so existing browser prefs carry over.
 * Extra settings can be added later without changing call sites much.
 */
const KEYS = {
  notify: "eventsNotify",
  notifyMinutes: "eventsNotifyMinutes",
  subscribed: "eventsSubscribed",
  collapsed: "eventsCollapsed",
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  getNotificationsEnabled() {
    return localStorage.getItem(KEYS.notify) === "true";
  },
  setNotificationsEnabled(on) {
    localStorage.setItem(KEYS.notify, on ? "true" : "false");
  },

  getNotifyMinutes() {
    const n = parseInt(localStorage.getItem(KEYS.notifyMinutes) || "5", 10);
    return Number.isFinite(n) ? n : 5;
  },
  setNotifyMinutes(minutes) {
    localStorage.setItem(KEYS.notifyMinutes, String(minutes));
  },

  getSubscribed() {
    const data = readJson(KEYS.subscribed, {});
    return data && typeof data === "object" ? data : {};
  },
  setSubscribed(map) {
    writeJson(KEYS.subscribed, map);
  },
  toggleSubscription(eventId) {
    const map = this.getSubscribed();
    const key = String(eventId);
    if (map[key]) delete map[key];
    else map[key] = true;
    this.setSubscribed(map);
    return !!map[key];
  },
  isSubscribed(eventId) {
    return !!this.getSubscribed()[String(eventId)];
  },

  getCollapsed() {
    const data = readJson(KEYS.collapsed, {});
    return data && typeof data === "object" ? data : {};
  },
  setCollapsed(map) {
    writeJson(KEYS.collapsed, map);
  },
};

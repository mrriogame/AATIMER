/**
 * Local settings + task tracker store.
 *
 * Guest (no auth): legacy LocalStorage keys (PHP-compatible timer prefs).
 * Authenticated: keys scoped by auth user id so accounts never share data
 * in the same browser. Sync is NOT implemented here — only key isolation.
 *
 * Guest keys:
 *   eventsNotify, eventsNotifyMinutes, eventsSubscribed, eventsCollapsed
 *   aatimer_task_lists, aatimer_tasks
 *
 * Auth keys (same value shapes):
 *   aatimer:u:{userId}:eventsNotify
 *   aatimer:u:{userId}:eventsNotifyMinutes
 *   aatimer:u:{userId}:eventsSubscribed
 *   aatimer:u:{userId}:eventsCollapsed
 *   aatimer:u:{userId}:task_lists
 *   aatimer:u:{userId}:tasks
 */
const GUEST_KEYS = {
  notify: "eventsNotify",
  notifyMinutes: "eventsNotifyMinutes",
  subscribed: "eventsSubscribed",
  collapsed: "eventsCollapsed",
  taskLists: "aatimer_task_lists",
  tasks: "aatimer_tasks",
};

/** @type {string|null} */
let activeUserId = null;

/** @type {Set<(userId: string|null) => void>} */
const scopeListeners = new Set();

function storageKey(logical) {
  if (!activeUserId) return GUEST_KEYS[logical];
  const suffix = {
    notify: "eventsNotify",
    notifyMinutes: "eventsNotifyMinutes",
    subscribed: "eventsSubscribed",
    collapsed: "eventsCollapsed",
    taskLists: "task_lists",
    tasks: "tasks",
  }[logical];
  return `aatimer:u:${activeUserId}:${suffix}`;
}

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

function nowIso() {
  return new Date().toISOString();
}

export function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Bind LocalStorage reads/writes to an auth user, or null for guest.
 * Does not copy/migrate data between scopes (merge is a future sync step).
 */
export function setActiveUserId(userId) {
  const next = userId ? String(userId) : null;
  if (next === activeUserId) return;
  activeUserId = next;
  scopeListeners.forEach((fn) => {
    try {
      fn(activeUserId);
    } catch (e) {
      console.warn("[AATIMER] storage scope listener error", e);
    }
  });
}

export function getActiveUserId() {
  return activeUserId;
}

export function isGuestStorage() {
  return activeUserId == null;
}

/** Subscribe to guest ↔ account (or account A ↔ B) scope switches. */
export function onStorageScopeChange(fn) {
  scopeListeners.add(fn);
  return () => scopeListeners.delete(fn);
}

/**
 * Local default list for the current scope (guest or per-user bucket).
 * Cloud canonical default is created by signup trigger (is_default=true).
 * Local `isDefault` marks auto-created lists for a future merge remap.
 */
function ensureDefaultList(lists) {
  const active = lists.filter((l) => !l.deletedAt);
  if (active.length) return lists;
  const id = createId();
  const t = nowIso();
  lists.push({
    id,
    title: "Мои задачи",
    sortOrder: 0,
    isDefault: true,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  });
  writeJson(storageKey("taskLists"), lists);
  return lists;
}

export const storage = {
  setActiveUserId,
  getActiveUserId,
  isGuestStorage,
  onStorageScopeChange,

  getNotificationsEnabled() {
    return localStorage.getItem(storageKey("notify")) === "true";
  },
  setNotificationsEnabled(on) {
    localStorage.setItem(storageKey("notify"), on ? "true" : "false");
  },

  getNotifyMinutes() {
    const n = parseInt(localStorage.getItem(storageKey("notifyMinutes")) || "5", 10);
    return Number.isFinite(n) ? n : 5;
  },
  setNotifyMinutes(minutes) {
    localStorage.setItem(storageKey("notifyMinutes"), String(minutes));
  },

  getSubscribed() {
    const data = readJson(storageKey("subscribed"), {});
    return data && typeof data === "object" ? data : {};
  },
  setSubscribed(map) {
    writeJson(storageKey("subscribed"), map);
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
    const data = readJson(storageKey("collapsed"), {});
    return data && typeof data === "object" ? data : {};
  },
  setCollapsed(map) {
    writeJson(storageKey("collapsed"), map);
  },

  /* ===== Task lists ===== */

  getAllTaskLists() {
    const lists = readJson(storageKey("taskLists"), []);
    return Array.isArray(lists) ? ensureDefaultList(lists) : ensureDefaultList([]);
  },

  getTaskLists() {
    return this.getAllTaskLists()
      .filter((l) => !l.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  },

  saveTaskLists(lists) {
    writeJson(storageKey("taskLists"), lists);
  },

  createTaskList(title) {
    const lists = this.getAllTaskLists();
    const t = nowIso();
    const active = lists.filter((l) => !l.deletedAt);
    const list = {
      id: createId(),
      title: (title || "Новый список").trim() || "Новый список",
      sortOrder: active.length ? Math.max(...active.map((l) => l.sortOrder)) + 1 : 0,
      isDefault: false,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    };
    lists.push(list);
    this.saveTaskLists(lists);
    return list;
  },

  renameTaskList(id, title) {
    const lists = this.getAllTaskLists();
    const list = lists.find((l) => l.id === id && !l.deletedAt);
    if (!list) return null;
    list.title = (title || "").trim() || list.title;
    list.updatedAt = nowIso();
    this.saveTaskLists(lists);
    return list;
  },

  deleteTaskList(id) {
    const lists = this.getAllTaskLists();
    const list = lists.find((l) => l.id === id);
    if (!list) return false;
    const t = nowIso();
    list.deletedAt = t;
    list.updatedAt = t;
    this.saveTaskLists(lists);

    const tasks = this.getAllTasks();
    let changed = false;
    for (const task of tasks) {
      if (task.listId === id && !task.deletedAt) {
        task.deletedAt = t;
        task.updatedAt = t;
        changed = true;
      }
    }
    if (changed) this.saveTasks(tasks);

    if (!this.getTaskLists().length) {
      ensureDefaultList(this.getAllTaskLists());
    }
    return true;
  },

  /* ===== Tasks ===== */

  getAllTasks() {
    const tasks = readJson(storageKey("tasks"), []);
    return Array.isArray(tasks) ? tasks : [];
  },

  getTasks() {
    return this.getAllTasks().filter((t) => !t.deletedAt);
  },

  getTasksByList(listId) {
    return this.getTasks()
      .filter((t) => t.listId === listId)
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.eventTime && b.eventTime) return a.eventTime.localeCompare(b.eventTime);
        if (a.eventTime) return -1;
        if (b.eventTime) return 1;
        return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
      });
  },

  saveTasks(tasks) {
    writeJson(storageKey("tasks"), tasks);
  },

  createTask({
    listId,
    title,
    kind = null,
    eventId = null,
    eventName = null,
    eventTime = null,
    questId = null,
  }) {
    const tasks = this.getAllTasks();
    const t = nowIso();
    const siblings = tasks.filter((x) => x.listId === listId && !x.deletedAt);
    let resolvedKind = kind;
    if (!resolvedKind) {
      if (eventId != null) resolvedKind = "event";
      else if (questId != null) resolvedKind = "daily";
      else resolvedKind = "plain";
    }
    const task = {
      id: createId(),
      listId,
      title: (title || "").trim() || "Без названия",
      kind: resolvedKind,
      completed: false,
      completedAt: null,
      sortOrder: siblings.length ? Math.max(...siblings.map((x) => x.sortOrder)) + 1 : 0,
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
      eventId: eventId != null ? String(eventId) : null,
      eventName: eventName || null,
      eventTime: eventTime || null,
      questId: questId != null ? String(questId) : null,
    };
    tasks.push(task);
    this.saveTasks(tasks);
    return task;
  },

  updateTask(id, patch) {
    const tasks = this.getAllTasks();
    const task = tasks.find((t) => t.id === id && !t.deletedAt);
    if (!task) return null;
    const allowed = [
      "title",
      "listId",
      "kind",
      "eventId",
      "eventName",
      "eventTime",
      "questId",
      "sortOrder",
    ];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        task[key] = patch[key];
      }
    }
    task.updatedAt = nowIso();
    this.saveTasks(tasks);
    return task;
  },

  toggleTaskCompleted(id) {
    const tasks = this.getAllTasks();
    const task = tasks.find((t) => t.id === id && !t.deletedAt);
    if (!task) return null;
    task.completed = !task.completed;
    task.completedAt = task.completed ? nowIso() : null;
    task.updatedAt = nowIso();
    this.saveTasks(tasks);
    return task;
  },

  deleteTask(id) {
    const tasks = this.getAllTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) return false;
    const t = nowIso();
    task.deletedAt = t;
    task.updatedAt = t;
    this.saveTasks(tasks);
    return true;
  },
};

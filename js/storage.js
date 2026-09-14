/**
 * Local settings + task tracker store.
 * Timer keys stay compatible with the old PHP site.
 * Task keys are namespaced for future Supabase sync (UUID ids, timestamps).
 */
const KEYS = {
  notify: "eventsNotify",
  notifyMinutes: "eventsNotifyMinutes",
  subscribed: "eventsSubscribed",
  collapsed: "eventsCollapsed",
  taskLists: "aatimer_task_lists",
  tasks: "aatimer_tasks",
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

function nowIso() {
  return new Date().toISOString();
}

export function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureDefaultList(lists) {
  const active = lists.filter((l) => !l.deletedAt);
  if (active.length) return lists;
  const id = createId();
  const t = nowIso();
  lists.push({
    id,
    title: "Мои задачи",
    sortOrder: 0,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  });
  writeJson(KEYS.taskLists, lists);
  return lists;
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

  /* ===== Task lists ===== */

  getAllTaskLists() {
    const lists = readJson(KEYS.taskLists, []);
    return Array.isArray(lists) ? ensureDefaultList(lists) : ensureDefaultList([]);
  },

  getTaskLists() {
    return this.getAllTaskLists()
      .filter((l) => !l.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  },

  saveTaskLists(lists) {
    writeJson(KEYS.taskLists, lists);
  },

  createTaskList(title) {
    const lists = this.getAllTaskLists();
    const t = nowIso();
    const active = lists.filter((l) => !l.deletedAt);
    const list = {
      id: createId(),
      title: (title || "Новый список").trim() || "Новый список",
      sortOrder: active.length ? Math.max(...active.map((l) => l.sortOrder)) + 1 : 0,
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
    const tasks = readJson(KEYS.tasks, []);
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
    writeJson(KEYS.tasks, tasks);
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

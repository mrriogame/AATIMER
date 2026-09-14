import { storage } from "./storage.js";
import {
  updateClocks,
  describeEventTime,
  getUpcomingOccurrences,
  setEventsList,
} from "./timers.js";
import { bindAddEventTaskModal, openAddEventTaskModal } from "./add-task-modal.js";
import {
  loadDailiesCatalog,
  loadWeekliesCatalog,
  QUEST_KIND,
  describeQuestAvailability,
} from "./quests.js";

const EVENTS_URL = "./data/events.json";
let catalog = [];
let dailiesCatalog = [];
let weekliesCatalog = [];

/** When set, pick/add flows skip list selection and use this list. */
let lockedListId = null;

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

async function loadCatalog() {
  try {
    const res = await fetch(EVENTS_URL, { cache: "no-cache" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
}

function toast(msg) {
  const el = document.getElementById("tasksToast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

function defaultListId() {
  return storage.getTaskLists()[0]?.id || null;
}

function resolveTargetListId() {
  return lockedListId || defaultListId();
}

function render() {
  const root = document.getElementById("tasksRoot");
  const lists = storage.getTaskLists();

  if (!lists.length) {
    root.innerHTML = `<div class="events-loading">Нет списков. Создайте первый.</div>`;
    return;
  }

  root.innerHTML = lists
    .map((list) => {
      const tasks = storage.getTasksByList(list.id);
      const openCount = tasks.filter((t) => !t.completed).length;
      return `
      <section class="task-list-card" data-list-id="${list.id}">
        <header class="task-list-header">
          <div class="task-list-title-wrap">
            <h2 class="task-list-title">${escHtml(list.title)}</h2>
            <span class="task-list-count">${openCount}/${tasks.length}</span>
          </div>
          <div class="task-list-actions">
            <button type="button" class="task-icon-btn" data-add-to-list title="Добавить">➕</button>
            <button type="button" class="task-icon-btn" data-rename-list title="Переименовать">✏️</button>
            <button type="button" class="task-icon-btn task-icon-btn--danger" data-delete-list title="Удалить список">🗑️</button>
          </div>
        </header>
        <ul class="task-items">
          ${
            tasks.length
              ? tasks.map((task) => renderTask(task)).join("")
              : `<li class="task-empty">Пока пусто — нажмите ➕ и выберите событие, дейлик или виклик</li>`
          }
        </ul>
      </section>`;
    })
    .join("");

  refreshMeta();
}

function kindBadge(task) {
  const kind = task.kind || (task.eventId ? "event" : "plain");
  if (kind === "event") return `<span class="task-event-badge">Событие</span>`;
  if (kind === "daily") return `<span class="task-event-badge task-badge--daily">Дейлик</span>`;
  if (kind === "weekly") return `<span class="task-event-badge task-badge--weekly">Виклик</span>`;
  return "";
}

function renderTask(task) {
  const kind = task.kind || (task.eventId ? "event" : "plain");
  const isEvent = kind === "event" && !!task.eventId;
  const isQuest = kind === "daily" || kind === "weekly";

  let meta = "";
  if (isEvent) {
    meta = `<div class="task-event-meta" data-event-time="${escHtml(task.eventTime || "")}">
         <div class="task-event-when">—</div>
         <div class="task-event-remain">—</div>
       </div>`;
  } else if (isQuest) {
    meta = `<div class="task-quest-meta" data-quest-kind="${escHtml(kind)}" data-task-id="${task.id}">
         <div class="task-quest-avail">—</div>
       </div>`;
  }

  return `
    <li class="task-item${task.completed ? " is-done" : ""} is-${kind}" data-task-id="${task.id}">
      <button type="button" class="task-check" data-toggle-done aria-label="Выполнено">
        ${task.completed ? "☑" : "☐"}
      </button>
      <div class="task-body">
        <div class="task-title-row">
          <span class="task-title">${escHtml(task.title)}</span>
          ${kindBadge(task)}
        </div>
        ${meta}
      </div>
      <div class="task-item-actions">
        <button type="button" class="task-icon-btn" data-edit-task title="Изменить">✏️</button>
        <button type="button" class="task-icon-btn task-icon-btn--danger" data-delete-task title="Удалить">🗑️</button>
      </div>
    </li>`;
}

function refreshMeta() {
  document.querySelectorAll(".task-event-meta").forEach((el) => {
    const info = describeEventTime(el.dataset.eventTime);
    const whenEl = el.querySelector(".task-event-when");
    const remainEl = el.querySelector(".task-event-remain");
    if (whenEl) whenEl.textContent = info.whenLabel || "Время не задано";
    if (remainEl) {
      remainEl.textContent = info.remainingLabel || "";
      remainEl.classList.toggle("is-past", !!info.past);
    }
  });

  document.querySelectorAll(".task-quest-meta").forEach((el) => {
    const task = storage.getTasks().find((t) => t.id === el.dataset.taskId);
    const availEl = el.querySelector(".task-quest-avail");
    if (!availEl || !task) return;
    const text = describeQuestAvailability(task);
    availEl.textContent =
      text ||
      (task.kind === QUEST_KIND.DAILY
        ? "Раз в 24 часа"
        : task.kind === QUEST_KIND.WEEKLY
          ? "Сброс: вс 00:00 МСК"
          : "");
  });
}

function promptText(message, initial = "") {
  const value = window.prompt(message, initial);
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function createListFlow() {
  const title = promptText("Название списка", "Фарм");
  if (!title) return;
  storage.createTaskList(title);
  render();
  toast("Список создан");
}

function openChoiceModal(listId) {
  lockedListId = listId;
  document.getElementById("addChoiceModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeChoiceModal() {
  document.getElementById("addChoiceModal").hidden = true;
  document.body.style.overflow = "";
}

function openPickEventModal(listId = null) {
  lockedListId = listId;
  const modal = document.getElementById("pickEventModal");
  const box = document.getElementById("pickEventList");
  box.innerHTML = catalog
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((ev) => {
      const next = getUpcomingOccurrences(ev.schedule || [], 1)[0];
      return `
        <button type="button" class="pick-event-item" data-pick-event="${ev.id}">
          <span class="pick-event-icon" style="background:${escHtml(ev.color)}">${ev.icon || "⚔️"}</span>
          <span class="pick-event-info">
            <span class="pick-event-name">${escHtml(ev.name)}</span>
            <span class="pick-event-next">${next ? escHtml(next.label) : "Нет слотов"}</span>
          </span>
        </button>`;
    })
    .join("");
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closePickEventModal() {
  document.getElementById("pickEventModal").hidden = true;
  document.body.style.overflow = "";
}

function openPickQuestModal(kind, listId = null) {
  lockedListId = listId;
  const isDaily = kind === QUEST_KIND.DAILY;
  const items = isDaily ? dailiesCatalog : weekliesCatalog;
  const modal = document.getElementById("pickQuestModal");
  document.getElementById("pickQuestTitle").textContent = isDaily ? "Дейлики" : "Виклики";
  const stub = document.getElementById("pickQuestStub");
  const box = document.getElementById("pickQuestList");

  if (!items.length) {
    stub.hidden = false;
    stub.textContent = isDaily
      ? "Список дейликов пока пуст. Скоро сюда добавим ежедневные квесты (сброс раз в 24 ч). Каталог: data/dailies.json"
      : "Список викликов пока пуст. Скоро сюда добавим еженедельные квесты (сброс в вс 00:00 МСК). Каталог: data/weeklies.json";
    box.innerHTML = "";
  } else {
    stub.hidden = true;
    box.innerHTML = items
      .map(
        (q) => `
      <button type="button" class="pick-event-item" data-pick-quest="${escHtml(q.id)}" data-quest-kind="${kind}">
        <span class="pick-event-icon">${q.icon || (isDaily ? "☀️" : "📅")}</span>
        <span class="pick-event-info">
          <span class="pick-event-name">${escHtml(q.title)}</span>
          <span class="pick-event-next">${escHtml(q.description || "")}</span>
        </span>
      </button>`
      )
      .join("");
  }

  modal.dataset.questKind = kind;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closePickQuestModal() {
  document.getElementById("pickQuestModal").hidden = true;
  document.body.style.overflow = "";
}

function bindPage() {
  document.getElementById("createListBtn")?.addEventListener("click", createListFlow);
  document.getElementById("createListBtnNav")?.addEventListener("click", createListFlow);

  document.getElementById("addEventFromTrackerBtn")?.addEventListener("click", () => {
    lockedListId = null;
    openPickEventModal(null);
  });

  document.getElementById("addDailyBtn")?.addEventListener("click", () => {
    lockedListId = null;
    openPickQuestModal(QUEST_KIND.DAILY, null);
  });

  document.getElementById("addWeeklyBtn")?.addEventListener("click", () => {
    lockedListId = null;
    openPickQuestModal(QUEST_KIND.WEEKLY, null);
  });

  document.getElementById("addChoiceCloseBtn")?.addEventListener("click", () => {
    closeChoiceModal();
    lockedListId = null;
  });
  document.getElementById("addChoiceModal")?.addEventListener("click", (e) => {
    if (e.target.id === "addChoiceModal") {
      closeChoiceModal();
      lockedListId = null;
    }
  });
  document.getElementById("addChoiceModal")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-choice]");
    if (!btn) return;
    const listId = lockedListId;
    closeChoiceModal();
    if (btn.dataset.choice === "event") openPickEventModal(listId);
    else if (btn.dataset.choice === "daily") openPickQuestModal(QUEST_KIND.DAILY, listId);
    else if (btn.dataset.choice === "weekly") openPickQuestModal(QUEST_KIND.WEEKLY, listId);
  });

  document.getElementById("tasksRoot").addEventListener("click", (e) => {
    const listCard = e.target.closest(".task-list-card");
    const listId = listCard?.dataset.listId;

    if (e.target.closest("[data-add-to-list]") && listId) {
      openChoiceModal(listId);
      return;
    }

    if (e.target.closest("[data-rename-list]") && listId) {
      const list = storage.getTaskLists().find((l) => l.id === listId);
      const title = promptText("Новое название списка", list?.title || "");
      if (!title) return;
      storage.renameTaskList(listId, title);
      render();
      return;
    }

    if (e.target.closest("[data-delete-list]") && listId) {
      if (!confirm("Удалить список и все его задачи?")) return;
      storage.deleteTaskList(listId);
      render();
      toast("Список удалён");
      return;
    }

    const taskItem = e.target.closest(".task-item");
    const taskId = taskItem?.dataset.taskId;
    if (!taskId) return;

    if (e.target.closest("[data-toggle-done]")) {
      storage.toggleTaskCompleted(taskId);
      render();
      return;
    }

    if (e.target.closest("[data-edit-task]")) {
      const task = storage.getTasks().find((t) => t.id === taskId);
      if (!task) return;
      const title = promptText("Название задачи", task.title);
      if (!title) return;
      storage.updateTask(taskId, { title });
      render();
      return;
    }

    if (e.target.closest("[data-delete-task]")) {
      if (!confirm("Удалить задачу?")) return;
      storage.deleteTask(taskId);
      render();
    }
  });

  bindAddEventTaskModal(() => {
    lockedListId = null;
    render();
    toast("Событие добавлено в задачи");
  });

  bindPickEventModal();
  bindPickQuestModal();
}

function bindPickEventModal() {
  const modal = document.getElementById("pickEventModal");
  document.getElementById("pickEventCloseBtn")?.addEventListener("click", () => {
    closePickEventModal();
    lockedListId = null;
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      closePickEventModal();
      lockedListId = null;
    }
  });
  document.getElementById("pickEventList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick-event]");
    if (!btn) return;
    const ev = catalog.find((x) => String(x.id) === String(btn.dataset.pickEvent));
    if (!ev) return;
    const listId = lockedListId;
    closePickEventModal();
    openAddEventTaskModal(ev, { listId });
  });
}

function bindPickQuestModal() {
  const modal = document.getElementById("pickQuestModal");
  document.getElementById("pickQuestCloseBtn")?.addEventListener("click", () => {
    closePickQuestModal();
    lockedListId = null;
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      closePickQuestModal();
      lockedListId = null;
    }
  });
  document.getElementById("pickQuestList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick-quest]");
    if (!btn) return;
    const kind = btn.dataset.questKind;
    const questId = btn.dataset.pickQuest;
    const items = kind === QUEST_KIND.DAILY ? dailiesCatalog : weekliesCatalog;
    const quest = items.find((q) => String(q.id) === String(questId));
    if (!quest) return;

    let listId = lockedListId || defaultListId();
    if (!listId) {
      alert("Сначала создайте список");
      return;
    }
    // If opened from toolbar without locked list — ask which list
    if (!lockedListId) {
      const lists = storage.getTaskLists();
      if (lists.length > 1) {
        const names = lists.map((l, i) => `${i + 1}. ${l.title}`).join("\n");
        const pick = promptText(`Номер списка:\n${names}`, "1");
        const idx = parseInt(pick || "1", 10) - 1;
        if (!lists[idx]) {
          alert("Неверный список");
          return;
        }
        listId = lists[idx].id;
      }
    }

    storage.createTask({
      listId,
      title: quest.title,
      kind,
      questId: quest.id,
    });
    closePickQuestModal();
    lockedListId = null;
    render();
    toast(kind === QUEST_KIND.DAILY ? "Дейлик добавлен" : "Виклик добавлен");
  });
}

function registerPwaLite() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

async function main() {
  registerPwaLite();
  catalog = await loadCatalog();
  setEventsList(catalog);
  window.__aatimerEvents = catalog;
  dailiesCatalog = await loadDailiesCatalog();
  weekliesCatalog = await loadWeekliesCatalog();

  bindPage();
  render();

  updateClocks();
  setInterval(updateClocks, 250);
  setInterval(refreshMeta, 1000);
}

main();

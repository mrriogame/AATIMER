import { storage } from "./storage.js";
import { getUpcomingOccurrences, getEventsList } from "./timers.js";

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

/**
 * @param {object} eventLike
 * @param {{ listId?: string|null }} [opts] — if listId set, list picker is locked/hidden
 */
export function openAddEventTaskModal(eventLike, opts = {}) {
  const modal = document.getElementById("addTaskModal");
  if (!modal) return;

  const eventId = String(eventLike.id ?? eventLike.eventId);
  const eventName = eventLike.name || eventLike.eventName || "Событие";
  let schedule = eventLike.schedule;
  if (!schedule) {
    const fromCatalog =
      getEventsList().find((e) => String(e.id) === eventId) ||
      (window.__aatimerEvents || []).find((e) => String(e.id) === eventId);
    schedule = fromCatalog?.schedule || [];
  }

  const lists = storage.getTaskLists();
  const listSelect = document.getElementById("addTaskListSelect");
  const listField = document.getElementById("addTaskListField");
  const lockedListId = opts.listId || null;

  listSelect.innerHTML = lists
    .map((l) => `<option value="${l.id}">${escHtml(l.title)}</option>`)
    .join("");

  if (lockedListId) {
    listSelect.value = lockedListId;
    if (listField) listField.hidden = true;
    modal.dataset.lockedListId = lockedListId;
  } else {
    if (listField) listField.hidden = false;
    delete modal.dataset.lockedListId;
  }

  const occurrences = getUpcomingOccurrences(schedule, 8);
  const timeSelect = document.getElementById("addTaskTimeSelect");
  if (!occurrences.length) {
    timeSelect.innerHTML = `<option value="">Нет ближайших слотов</option>`;
    timeSelect.disabled = true;
  } else {
    timeSelect.disabled = false;
    timeSelect.innerHTML = occurrences
      .map(
        (o) =>
          `<option value="${escHtml(o.eventTime)}" data-label="${escHtml(o.label)}">${escHtml(o.label)} (${o.start}–${o.end})</option>`
      )
      .join("");
  }

  document.getElementById("addTaskEventName").textContent = eventName;
  modal.dataset.eventId = eventId;
  modal.dataset.eventName = eventName;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

export function closeAddEventTaskModal() {
  const modal = document.getElementById("addTaskModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = "";
}

export function bindAddEventTaskModal(onCreated) {
  const modal = document.getElementById("addTaskModal");
  if (!modal || modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";

  document.getElementById("addTaskCloseBtn")?.addEventListener("click", closeAddEventTaskModal);
  document.getElementById("addTaskCancelBtn")?.addEventListener("click", closeAddEventTaskModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeAddEventTaskModal();
  });

  document.getElementById("addTaskConfirmBtn")?.addEventListener("click", () => {
    const listId = modal.dataset.lockedListId || document.getElementById("addTaskListSelect").value;
    const eventTime = document.getElementById("addTaskTimeSelect").value;
    const eventId = modal.dataset.eventId;
    const eventName = modal.dataset.eventName;
    if (!listId) {
      alert("Создайте список задач");
      return;
    }
    if (!eventTime) {
      alert("Нет доступного времени события");
      return;
    }
    const task = storage.createTask({
      listId,
      title: eventName,
      kind: "event",
      eventId,
      eventName,
      eventTime,
    });
    closeAddEventTaskModal();
    onCreated?.(task);
  });
}

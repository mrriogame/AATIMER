import {
  renderEvents,
  updateClocks,
  updateEventTimers,
  toggleEventAlarm,
  toggleNotifications,
  toggleCategory,
  showEventInfo,
  buildRoute,
  buildTimeline,
  initNotifyControls,
  updateNotifyButton,
  parseScheduleAttr,
} from "./timers.js";
import { bindAddEventTaskModal, openAddEventTaskModal } from "./add-task-modal.js";
import { registerServiceWorker } from "./sw-register.js";

const EVENTS_URL = "./data/events.json";

async function loadEvents() {
  const res = await fetch(EVENTS_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.events || [];
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

function openPlanner() {
  document.getElementById("plannerModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closePlanner() {
  document.getElementById("plannerModal").hidden = true;
  document.body.style.overflow = "";
}

function toggleTimeline() {
  const drawer = document.getElementById("timelineDrawer");
  if (drawer.hidden) {
    drawer.hidden = false;
    buildTimeline();
  } else {
    drawer.hidden = true;
  }
}

function bindUi() {
  document.getElementById("notifyBtn").addEventListener("click", toggleNotifications);
  document.getElementById("bottomNotifyBtn")?.addEventListener("click", toggleNotifications);
  document.getElementById("openPlannerBtn").addEventListener("click", openPlanner);
  document.getElementById("closePlannerBtn").addEventListener("click", closePlanner);
  document.getElementById("buildRouteBtn").addEventListener("click", buildRoute);
  document.getElementById("toggleTimelineBtn").addEventListener("click", toggleTimeline);
  document.getElementById("closeTimelineBtn").addEventListener("click", toggleTimeline);

  document.getElementById("plannerModal").addEventListener("click", (e) => {
    if (e.target.id === "plannerModal") closePlanner();
  });

  document.getElementById("eventsRoot").addEventListener("click", (e) => {
    const catBtn = e.target.closest("[data-toggle-cat]");
    if (catBtn) {
      toggleCategory(catBtn.dataset.toggleCat);
      return;
    }
    const alarmBtn = e.target.closest(".event-alarm-btn");
    if (alarmBtn) {
      toggleEventAlarm(alarmBtn.dataset.eventId);
      return;
    }
    const infoBtn = e.target.closest("[data-info-btn]");
    if (infoBtn) {
      showEventInfo(infoBtn.closest(".event-row"));
      return;
    }
    const addTaskBtn = e.target.closest("[data-add-task]");
    if (addTaskBtn) {
      const row = addTaskBtn.closest(".event-row");
      if (!row) return;
      openAddEventTaskModal({
        id: row.dataset.eventId,
        name: row.dataset.eventName,
        schedule: parseScheduleAttr(row.dataset.schedule),
      });
    }
  });

  bindAddEventTaskModal(() => {
    toast("Добавлено в трекер задач");
  });
}

function isStandaloneApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIosDevice() {
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

function openIosInstallHelp() {
  document.getElementById("iosInstallModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeIosInstallHelp() {
  document.getElementById("iosInstallModal").hidden = true;
  document.body.style.overflow = "";
}

function registerPwa() {
  registerServiceWorker();

  const installBtn = document.getElementById("installBtn");
  const iosModal = document.getElementById("iosInstallModal");
  let deferredPrompt = null;
  let installMode = null; // "android" | "ios"

  if (isStandaloneApp()) {
    installBtn.hidden = true;
    return;
  }

  // iOS/Safari: нет beforeinstallprompt — показываем кнопку с инструкцией
  if (isIosDevice()) {
    installMode = "ios";
    installBtn.hidden = false;
    installBtn.textContent = "На Домой";
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installMode = "android";
    installBtn.textContent = "Установить";
    installBtn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  installBtn.addEventListener("click", async () => {
    if (installMode === "ios" || (!deferredPrompt && isIosDevice())) {
      openIosInstallHelp();
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  document.getElementById("iosInstallClose").addEventListener("click", closeIosInstallHelp);
  document.getElementById("iosInstallOk").addEventListener("click", closeIosInstallHelp);
  iosModal.addEventListener("click", (e) => {
    if (e.target === iosModal) closeIosInstallHelp();
  });
}

async function main() {
  bindUi();
  initNotifyControls();
  registerPwa();

  updateClocks();
  setInterval(updateClocks, 250);
  setInterval(updateEventTimers, 1000);

  try {
    const events = await loadEvents();
    renderEvents(events);
    updateNotifyButton();
  } catch (err) {
    console.error(err);
    document.getElementById("eventsRoot").innerHTML =
      `<div class="events-loading events-loading--error">Не удалось загрузить расписание. Проверьте data/events.json</div>`;
  }
}

main();

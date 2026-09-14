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
} from "./timers.js";

const EVENTS_URL = "./data/events.json";

async function loadEvents() {
  const res = await fetch(EVENTS_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.events || [];
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
  document.getElementById("bottomNotifyBtn").addEventListener("click", toggleNotifications);
  document.getElementById("openPlannerBtn").addEventListener("click", openPlanner);
  document.getElementById("bottomPlannerBtn").addEventListener("click", openPlanner);
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
    }
  });
}

function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("SW register failed:", err);
    });
  });

  let deferredPrompt = null;
  const installBtn = document.getElementById("installBtn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
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

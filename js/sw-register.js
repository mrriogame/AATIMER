/**
 * Register Service Worker safely for GitHub Pages.
 * - updateViaCache: 'none' → always revalidate sw.js (avoids stuck cached SW on GH Pages)
 * - on controllerchange after an update → one reload so HTML+JS+JSON match
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // True if this page was already controlled before registration (returning user).
  let hadControllerAtStart = !!navigator.serviceWorker.controller;
  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // First-ever SW install: don't reload (page already has fresh network assets).
    // Update replacing old SW: reload once for a consistent file set.
    if (!hadControllerAtStart || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((reg) => {
        const ping = () => {
          try {
            reg.update();
          } catch {
            /* ignore */
          }
        };
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") ping();
        });
        window.addEventListener("focus", ping);

        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      })
      .catch((err) => {
        console.warn("SW register failed:", err);
      });
  });
}

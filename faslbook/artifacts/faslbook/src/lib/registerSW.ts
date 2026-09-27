// Service worker registration — production only.
//
// The service worker aggressively caches JS/CSS/images (cache-first, permanent
// asset cache) so it must never run during development, or edits made in this
// session would keep appearing stale on refresh. sw.js already calls
// self.skipWaiting() on install and self.clients.claim() on activate, so the
// only thing we need on the page side is: register once, and reload exactly
// once when a new worker takes control.
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  if (!import.meta.env.PROD) {
    // Dev/preview: make sure no previously-installed SW (e.g. from a prior
    // production build opened in the same browser) keeps serving stale,
    // cached pages while we're actively developing.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
    if (typeof caches !== "undefined") {
      caches.keys().then((keys) => {
        keys.forEach((k) => {
          if (k.startsWith("faslbook-")) caches.delete(k);
        });
      });
    }
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Check for a new SW version on load and whenever the tab regains focus.
        reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });

        // The worker itself calls skipWaiting()/clients.claim() automatically,
        // so we just need to reload once when a new worker takes control.
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });
      })
      .catch((err) => console.log("SW registration failed:", err));
  });
}

// FaslBook Service Worker v7 — Offline-first with permanent asset cache
// KEY DESIGN:
//  - faslbook-assets: permanent, never deleted, accumulates all JS/CSS/images
//  - faslbook-shell:  just index.html + icons — cleared on new deploy to stay fresh
//  - Firebase URLs:   always pass through (Firebase has its own IndexedDB offline layer)
//  - Navigation:      serve cached index.html so React handles all routing
//  - Updates:         the page actively checks for a new SW (see index.html) and
//                      reloads once the new one takes control, so users never get
//                      stuck viewing a stale build.

const SHELL_CACHE  = "faslbook-shell-v7";
const ASSET_CACHE  = "faslbook-assets";        // No version — never wiped

const FIREBASE_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebase.googleapis.com",
  "storage.googleapis.com",
  "firebaseio.com",
  "fcm.googleapis.com",
];

// ── Install: cache the app shell ──────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Cache shell assets — ignore failures (may be offline at install time)
      await Promise.allSettled([
        fetch("/index.html").then((r) => r.ok && cache.put("/index.html", r)).catch(() => {}),
        fetch("/").then((r)          => r.ok && cache.put("/",            r)).catch(() => {}),
        fetch("/manifest.json").then((r) => r.ok && cache.put("/manifest.json", r)).catch(() => {}),
        fetch("/logo.png").then((r)  => r.ok && cache.put("/logo.png",    r)).catch(() => {}),
        fetch("/icon-192.png").then((r) => r.ok && cache.put("/icon-192.png", r)).catch(() => {}),
        fetch("/icon-512.png").then((r) => r.ok && cache.put("/icon-512.png", r)).catch(() => {}),
        fetch("/splash.png").then((r)=> r.ok && cache.put("/splash.png",  r)).catch(() => {}),
      ]);
    })()
  );
  self.skipWaiting();
});

// ── Activate: only delete OLD shell caches, keep assets ───────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) =>
            k.startsWith("faslbook-shell-") && k !== SHELL_CACHE      // old shells only
          )
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Helpers ───────────────────────────────────────────────────
function isFirebase(url) {
  return FIREBASE_HOSTS.some((h) => url.includes(h));
}

function isAsset(url) {
  // Vite output lives in /assets/ with hashed filenames
  return (
    url.includes("/assets/") ||
    /\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/.test(url)
  );
}

async function cacheResponse(cacheName, request, response) {
  if (!response || !response.ok || response.status !== 200 || response.type === "opaque") return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch {}
}

// ── Fetch ──────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  // Let Firebase handle itself (it uses IndexedDB for offline)
  if (request.method !== "GET") return;
  if (isFirebase(url)) return;

  // ── JS/CSS/image assets — cache-first, then network ──
  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const assetCache = await caches.open(ASSET_CACHE);
        const cached = await assetCache.match(request);
        if (cached) {
          // Background revalidate so cache stays fresh
          fetch(request).then((fresh) => cacheResponse(ASSET_CACHE, request, fresh)).catch(() => {});
          return cached;
        }
        // Not cached — fetch and store
        try {
          const fresh = await fetch(request);
          await cacheResponse(ASSET_CACHE, request, fresh);
          return fresh;
        } catch {
          return new Response("", { status: 404 });
        }
      })()
    );
    return;
  }

  // ── Navigation (HTML pages) — network-first, always fall back to index.html ──
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request, { credentials: "same-origin" });
          if (fresh.ok) {
            await cacheResponse(SHELL_CACHE, request, fresh);
          }
          return fresh;
        } catch {
          // Offline — serve cached index.html so React + Wouter handle routing
          const shellCache = await caches.open(SHELL_CACHE);
          const indexCached = await shellCache.match("/index.html");
          if (indexCached) return indexCached;

          const rootCached = await shellCache.match("/");
          if (rootCached) return rootCached;

          // Nothing cached at all — user never opened while online
          return new Response(
            `<!DOCTYPE html><html lang="en"><head>
            <meta charset="UTF-8"/>
            <meta name="viewport" content="width=device-width,initial-scale=1"/>
            <title>FaslBook</title>
            <style>
              body{font-family:-apple-system,sans-serif;display:flex;flex-direction:column;
                   align-items:center;justify-content:center;min-height:100vh;
                   background:#1B5E20;color:#fff;text-align:center;gap:16px;padding:24px}
              h2{font-size:20px;font-weight:800}p{font-size:13px;opacity:.75;max-width:260px;line-height:1.5}
              button{margin-top:8px;padding:14px 28px;background:#fff;color:#1B5E20;
                     border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer}
            </style></head><body>
            <h2>Open FaslBook Online First</h2>
            <p>Visit FaslBook once while connected to the internet. After that, it works fully offline.</p>
            <button onclick="location.reload()">Try Again</button>
            </body></html>`,
            { status: 200, headers: { "Content-Type": "text/html" } }
          );
        }
      })()
    );
    return;
  }

  // ── All other GETs — network-first with cache fallback ──
  event.respondWith(
    fetch(request)
      .then((res) => {
        cacheResponse(ASSET_CACHE, request, res);
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || new Response("", { status: 404 })))
  );
});

// ── Message handler ──────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "CACHE_SHELL") {
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        ["/", "/index.html", "/manifest.json", "/logo.png", "/icon-192.png", "/icon-512.png", "/splash.png"]
          .map((u) => fetch(u).then((r) => r.ok && cache.put(u, r)).catch(() => {}))
      );
      event.source?.postMessage("SHELL_CACHED");
    })();
  }
});

// ── Push notifications ────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "FaslBook", {
      body: data.body || "", icon: "/icon-192.png",
      badge: "/icon-192.png", data: data.data || {}, vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (clients.openWindow) return clients.openWindow("/overview");
    })
  );
});

const CACHE = "masterplan-v59";
const SHELL = ["./", "./index.html", "./app.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // index.html, app.js, sw.js: najpierw sieć (nowa wersja od razu), offline → pamięć
  if (e.request.mode === "navigate" || (url.origin === location.origin && /(\/|index\.html|app\.js|sw\.js)$/.test(url.pathname))) {
    e.respondWith(fetch(e.request, { cache: "no-store" }).then(res => { if (res && res.status === 200) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(cache =>
    cache.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => { if (res && res.status === 200) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
      return cached || net;
    })
  ));
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { try { d = { body: e.data.text() }; } catch (e2) {} }
  const title = d.title || "Druga Głowa 🧠";
  const body = d.body || "Raport dnia czeka — otwórz i zobacz, na czym się dziś skupić.";
  e.waitUntil(self.registration.showNotification(title, {
    body, icon: "./icon-192.png", badge: "./icon-192.png", tag: "mp-briefing",
    renotify: true, vibrate: [80, 40, 80], data: { url: "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { try { c.postMessage({ type: "open-briefing" }); } catch (er) {} return c.focus(); } }
    if (self.clients.openWindow) return self.clients.openWindow("./");
  })());
});

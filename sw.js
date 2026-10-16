/* LIFE PULSE PRO — service worker.
   Кеш має власний префікс "lifepulse-", щоб не зачіпати кеші інших програм
   на тому самому домені (наприклад, фінансової програми на github.io). */
const PREFIX = "lifepulse-";
const CACHE_NAME = PREFIX + "v1.1.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./lp-icon-192.png",
  "./lp-icon-512.png",
  "./lp-icon-maskable-512.png",
  "./lp-apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Кожен файл окремо: відсутня іконка не зламає встановлення.
    await Promise.all(APP_SHELL.map(url =>
      cache.add(new Request(url, { cache: "reload" })).catch(() => null)
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Видаляємо лише СТАРІ кеші цієї програми, чужі не чіпаємо.
    await Promise.all(
      keys.filter(k => k.startsWith(PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      r => { clearTimeout(t); resolve(r); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Відкриття сторінки: спочатку мережа (завжди свіжа версія), без мережі — кеш.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const res = await fetchWithTimeout(req, 4000);
        if (res && res.ok) cache.put("./index.html", res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return (await cache.match("./index.html", { ignoreSearch: true }))
          || (await cache.match("./", { ignoreSearch: true }))
          || Response.error();
      }
    })());
    return;
  }

  // Інші файли: віддаємо з кешу одразу, а в фоні оновлюємо.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) || Response.error();
  })());
});

/*
 * ACLS 急救事件紀錄器 — Service Worker
 *
 * 策略：cache-first（離線秒開）＋ 背景檢查新版 ＋ 提示後手動更新。
 * 更新版本時，請把 CACHE_VERSION 加一（例如 acls-2.9.0 -> acls-2.9.1），
 * 這樣瀏覽器才會安裝新快取、清掉舊的；新版會等使用者按「立即更新」才套用。
 */
const CACHE_VERSION = "acls-3.1.20";
const CACHE_NAME = `acls-recorder-${CACHE_VERSION}`;

// 這支 App 是自給自足的單檔（CSS/JS 全部 inline），把外殼與圖示預先快取即可離線啟動。
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

// 安裝：預先快取。刻意「不」skipWaiting —— 新版要等使用者按「立即更新」才接手。
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// 啟用：清掉舊版快取，並接管現有頁面。
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("acls-recorder-") && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// 收到頁面「立即更新」指令 -> 讓等待中的新版接手。
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 跨網域（例如 Google 表單）直接放行，不攔截。
  if (url.origin !== self.location.origin) return;

  // 導覽請求（打開頁面）-> 一律先給快取的 index.html，離線也能冷啟動。
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html", { ignoreSearch: true })
        .then((cached) => cached || fetch(req))
    );
    return;
  }

  // 其他同源資源（圖示、manifest）-> cache-first，抓到新的就順手更新快取。
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

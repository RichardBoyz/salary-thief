// 最小 service worker。目的:讓 app 可安裝 + 單機頁面離線可開。
//
// 策略分兩種,各自正確:
//   * 導覽請求(index.html):network-first —— 避免部署後拿到舊殼指向舊資源。
//   * 其他 GET(Vite 內容雜湊過的 assets,檔名即不可變):cache-first,省流量。
// 不快取 supabase 的請求(那是即時資料,而且離線本來就該失敗回退本地)。
const CACHE = "salary-thief-v1";

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 放行 supabase 等外部請求
  if (url.pathname.startsWith("/gcis/")) return; // 公司搜尋是即時資料,快取歸 worker.js 管

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/"))),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        }),
    ),
  );
});

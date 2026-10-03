/* Glow service worker
 * 2回目以降の表示を速くするため、ファイル名にハッシュが付いた静的ファイル（JS/CSS/フォント/アイコン）だけをキャッシュする。
 * ページ・API・動画はキャッシュしない（年齢確認と公開状態を常にサーバーで判定するため）。 */
const CACHE = "glow-static-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (!(url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) c.put(e.request, res.clone());
    return res;
  }));
});

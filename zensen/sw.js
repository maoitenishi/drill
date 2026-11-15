/* ZENSEN 前線 — Service Worker
 *
 * 記録は localStorage にあるので、ここではアプリの殻だけを持つ。
 * 外から取るのは書体だけ。届いたものは保管して、二度目からは圏外でも立ち上がる。
 * 中身を変えたら VERSION を上げる。古い殻は activate で捨てられる。 */
const VERSION = 'zensen-1';

const SHELL = [
  './',
  './index.html',
  './engine.js',
  './brain.js',
  './worker.js',
  './ui.js',
  './app.js',
  './puzzles.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];
const VENDOR = [
  'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Old+Mincho:wght@700;900&display=swap',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // 1 つ落ちても全体を失敗させない
      .then((c) => Promise.all(
        SHELL.map((u) => c.add(u).catch(() => null)).concat(
          VENDOR.map((u) => fetch(u, { mode: 'no-cors' }).then((r) => c.put(u, r)).catch(() => null))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // 同じ場所に置かれた別アプリの殻には触らない
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf('zensen-') === 0 && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;

  // 自分の配下：まずネットワーク（新しい版をすぐ届ける）。圏外ならキャッシュ。
  if (sameOrigin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
    );
    return;
  }
  // 書体：キャッシュ優先
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    }))
  );
});

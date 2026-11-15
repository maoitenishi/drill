/* 仮説ドリル — Service Worker
 *
 * 記録は localStorage / db 側にあるので、ここではアプリの殻だけを持つ。
 * React・Recharts・Tailwind は index.html に同梱済みなので、外部から取るのは
 * 書体だけ。それも届いたものは保管して、二度目からは通信なしで立ち上がる。
 *
 * VERSION は build.js が中身のハッシュに差し替える。内容が変われば
 * 別のキャッシュになり、古い殻は activate で捨てられる。 */
const VERSION = 'drill-8dc021aa65';

/* 自分の配下。相対で書いてあるので、どこに置かれても動く。 */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

/* 書体だけは外から来る。届かなくてもインストールは失敗させない。 */
const VENDOR = [
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Old+Mincho:wght@600&display=swap',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // 1 つ落ちても全体を失敗させない
      .then((c) => Promise.all(
        SHELL.map((u) => c.add(u).catch(() => null)).concat(
          VENDOR.map((u) => fetch(u, { mode: 'no-cors' })
            .then((r) => c.put(u, r))
            .catch(() => null))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 画面遷移：まずネットワーク。圏外ならキャッシュから殻を出す。
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // それ以外：キャッシュ優先。自分の配下だけ裏で更新しておく。
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit && !sameOrigin) return hit;   // 書体は変わらないので取り直さない
      const net = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

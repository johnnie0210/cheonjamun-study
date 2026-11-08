/* 천자문 공부 — 서비스 워커
 * 전략
 *  - 앱 파일(index/app/styles/data 등): network-first → 최신 내용 우선, 오프라인이면 캐시
 *  - 아이콘 등 정적 자원: cache-first
 * => 엑셀을 고쳐 data.js 를 다시 올려도 설치된 앱이 자동으로 최신 내용을 받습니다.
 */
const CACHE = 'cheonjamun-study-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 외부 요청은 그대로

  const isApp = req.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(url.pathname);
  const isIcon = url.pathname.includes('/icons/');

  if (isApp && !isIcon) {
    // network-first
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // 그 외(아이콘 등): cache-first
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});

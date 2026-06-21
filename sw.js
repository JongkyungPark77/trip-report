// 서비스워커 - 앱 파일을 캐시해 두어 오프라인에서도 실행되게 함
const CACHE = "trip-report-v5";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.json",
  "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  // 캐시에 있으면 캐시에서, 없으면 네트워크에서
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

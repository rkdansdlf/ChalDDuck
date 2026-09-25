// 설치 가능(installable) 조건을 채우기 위한 최소 서비스워커 — 오프라인 캐싱은 하지 않는다.
// fetch 리스너가 있어야 브라우저가 PWA 설치 배너를 띄운다(Chrome 설치 기준).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

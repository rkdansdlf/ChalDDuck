// 설치 가능(installable) 조건을 채우기 위한 최소 서비스워커 — 오프라인 캐싱은 하지 않는다.
// fetch 리스너가 있어야 브라우저가 PWA 설치 배너를 띄운다(Chrome 설치 기준).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// ── 푸시 알림 ──────────────────────────────────────────────
//
// 앱을 닫아 둔 사이에 오는 일을 **여기가 받아 그린다.** 앱 안 알림함은 앱을 열어야 보이지만,
// 이 통로는 열지 않아도 닿는다.
//
// 발신 서버(`server/notify/push.ts`)가 정한 모양만 따른다 — 본문이 없으면 제목조차 지어내지
// 않고 조용히 닫는다. 알림을 못 읽은 사용자도 있으므로 몸통·발신 시각·태그를 함께 둔다
// (알림 센터에서 "알림"만 보이면 무엇이 온 건지 알 수 없다).
self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    // 본문을 못 읽으면(형식이 다르다) 없던 일로 둔다 — 깨진 알림을 띄우지 않는다.
    event.waitUntil(Promise.resolve());
    return;
  }
  if (!data || typeof data.title !== "string" || !data.title) return;

  // 앱 안 주소만 따른다 — 서버도 걸러 두지만 여기서도 한 번 더 막는다.
  const href = typeof data.href === "string" && data.href.startsWith("/") && !data.href.startsWith("//")
    ? data.href
    : null;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: typeof data.body === "string" ? data.body : "",
      // 아이콘 없으면 브라우저 기본 도미가 뜬다(알림이 앱 것이 아니라 아무 앱 것이 아니다).
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      // 눌러서 그 화면으로 간다 → 같은 알림이 쌓이지 않게 알림을 먼저 치운다.
      renotify: false,
      data: { href },
      timestamp: Date.now(),
    }),
  );
});

// 알림을 눌렀을 때: 이미 열린 그 앱 창을 앞으로 가져온다. 없으면 앱을 연다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || null;
  const target = typeof href === "string" && href.startsWith("/") ? href : "/home";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.registration.scope)) {
          if ("focus" in client) return client.focus().then((c) => c.navigate?.(target) ?? c);
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

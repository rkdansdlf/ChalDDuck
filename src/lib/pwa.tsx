"use client";

import { useEffect } from "react";

/**
 * 서비스워커 등록만 한다 — 오프라인 캐싱 전략은 없다.
 * Chrome 은 fetch 리스너가 있는 서비스워커가 없으면 "홈 화면에 설치" 배너를 띄우지 않는다.
 *
 * 푸시도 이 서비스워커로 온다(`public/sw.js` 의 push·notificationclick) — 등록이 없으면
 * 구독을 받을 수 없다. 알림함의 "알림 받기"는 등록이 끝난 뒤에(`ready`) 동작한다.
 */
export function PwaBridge() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

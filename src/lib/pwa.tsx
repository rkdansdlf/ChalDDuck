"use client";

import { useEffect } from "react";

/**
 * 서비스워커 등록만 한다 — 오프라인 캐싱 전략은 없다.
 * Chrome 은 fetch 리스너가 있는 서비스워커가 없으면 "홈 화면에 설치" 배너를 띄우지 않는다.
 */
export function PwaBridge() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

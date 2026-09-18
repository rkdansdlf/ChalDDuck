"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * 검토 모드.
 *
 * 핸드오프 프로토타입은 "기획안에 규칙이 없는 지점"을 화면 안 점선 박스(`Undecided`)로
 * 표시하고, 전역 플래그로 켜고 끌 수 있게 했다. 그 장치를 그대로 옮긴다 —
 * **사용자 화면에는 절대 나타나지 않고**, 개발·리뷰 중에만 켠다.
 *
 * 켜는 법: URL 에 `?review=1` 을 붙이거나, 브라우저 콘솔에서 `__CD_REVIEW__()`.
 *
 * 값은 React 밖(sessionStorage)에 있으므로 `useSyncExternalStore` 로 읽는다.
 * 서버 스냅샷은 항상 `false` 라 하이드레이션이 어긋나지 않는다.
 */
const STORAGE_KEY = "cd.reviewMode";
const EVENT = "cd:review-toggle";

function read(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // 사생활 보호 모드 등에서 저장소 접근이 막힐 수 있다
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function setReviewMode(on: boolean) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // 저장이 막혀도 이벤트는 보낸다 — 최소한 이번 렌더에서는 반영된다
  }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleReviewMode() {
  setReviewMode(!read());
}

export function useReviewMode(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** 루트 레이아웃에서 한 번 렌더해 `?review=1` 과 콘솔 토글을 붙인다. */
export function ReviewModeBridge() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("review")) setReviewMode(params.get("review") !== "0");

    const w = window as unknown as { __CD_REVIEW__?: () => void };
    w.__CD_REVIEW__ = toggleReviewMode;
    return () => {
      delete w.__CD_REVIEW__;
    };
  }, []);

  return null;
}

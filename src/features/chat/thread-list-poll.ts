"use client";

import { useSyncExternalStore } from "react";
import { pollSidebarThreads, type SidebarThreads } from "@/server/actions/chat";

/**
 * 사이드바 목록(팀 미리보기·DM 목록) 폴링.
 *
 * `ChatThreadList` 는 레이아웃 기둥과 32 화면 본문, 두 곳에 동시에 떠 있을 수 있다
 * (좁은 화면에서도 기둥은 `hidden` 으로 감출 뿐 여전히 마운트돼 있다 — CSS 로만
 * 폭을 나누기 때문이다). 각자 폴링하면 같은 걸 두 번 묻게 되므로, 여기서
 * 구독자 수를 세어 **하나만** 타이머를 돌리고 결과를 모두에게 나눠 준다.
 */
const POLL_MS = 4000;

let state: SidebarThreads | null = null;
const listeners = new Set<() => void>();
let subscriberCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

function notify() {
  for (const listener of listeners) listener();
}

async function tick() {
  if (inFlight || document.visibilityState !== "visible") return;
  inFlight = true;
  try {
    state = await pollSidebarThreads();
    notify();
  } catch {
    // 다음 tick 에 다시 시도 — 화면은 마지막으로 받은 값을 그대로 보여 준다.
  } finally {
    inFlight = false;
  }
}

function onVisible() {
  if (document.visibilityState === "visible") void tick();
}

function start() {
  if (timer) return;
  void tick();
  timer = setInterval(tick, POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  document.removeEventListener("visibilitychange", onVisible);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  subscriberCount += 1;
  if (subscriberCount === 1) start();

  return () => {
    listeners.delete(onChange);
    subscriberCount -= 1;
    if (subscriberCount === 0) stop();
  };
}

/** 첫 폴링이 끝나기 전까지, 또는 요청이 실패하는 동안은 서버 렌더 값을 그대로 쓴다. */
export function useSidebarThreadPoll(initial: SidebarThreads): SidebarThreads {
  const polled = useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );

  return polled ?? initial;
}

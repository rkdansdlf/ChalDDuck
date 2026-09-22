"use client";

import { useEffect, useRef } from "react";

/**
 * 주기적으로 서버에 물어보는 장치.
 *
 * 찰떡에는 "상대가 방금 한 일"이 화면에 저절로 나타나야 하는 자리가 몇 군데 있다 —
 * 단톡방의 새 말, 알림함의 새 알림, 팀장 승인 대기. 지금까지는 내가 무언가를 눌러
 * `router.refresh()` 가 돌기 전까지 상대의 말이 오지 않았다.
 *
 * **왜 폴링인가.** 서버가 미는 방식(SSE·Supabase Realtime)을 먼저 봤지만 둘 다
 * 채팅 작업이 아니라 그 앞의 큰 작업이 된다.
 * - Realtime 은 브라우저에 Supabase 키를 내보내야 하는데, 지금 표에는 RLS 가 없어서
 *   그 키 하나로 남의 팀 DM 까지 읽힌다. RLS 를 켜려 해도 이 앱은 Supabase Auth 를
 *   쓰지 않아 정책이 판단할 사용자가 없다.
 * - SSE 는 메시지를 쓴 인스턴스가 **다른 인스턴스**가 들고 있는 스트림에 알릴 길이
 *   있어야 한다. LISTEN/NOTIFY 는 스트림마다 전용 커넥션을 잡아, 한 번 터졌던
 *   커넥션 한도를 정면으로 건드린다.
 *
 * 그래서 지연 몇 초를 받아들이고 **부르는 쪽을 한 곳에 모아 둔다** — 나중에 미는
 * 방식으로 갈아끼울 때 고칠 곳이 이 파일과 부르는 자리 몇 개다.
 *
 * 지키는 것:
 * - **안 보이는 탭에서는 부르지 않는다.** 주머니 속 휴대폰이 3초마다 서버를 부르면
 *   배터리와 요금만 쓴다. 다시 보이는 순간 한 번 곧바로 부른다 — 돌아왔을 때 화면이
 *   낡아 있으면 안 되니까.
 * - **앞의 요청이 아직 안 끝났으면 건너뛴다.** 느린 응답이 쌓이면 요청이 겹쳐서 는다.
 */
export function usePoll(tick: () => void | Promise<void>, intervalMs: number, enabled = true) {
  // 부르는 쪽이 `useCallback` 으로 감싸지 않아도 되게 최신 함수를 담아 둔다 —
  // 함수가 바뀔 때마다 타이머를 다시 걸면 주기가 영영 채워지지 않는다.
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  });

  useEffect(() => {
    if (!enabled) return;

    let running = false;
    const run = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        await latest.current();
      } finally {
        running = false;
      }
    };

    const timer = window.setInterval(run, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}

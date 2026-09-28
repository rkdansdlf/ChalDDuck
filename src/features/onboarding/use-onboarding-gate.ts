"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useOnboarding } from "@/features/onboarding/onboarding-state";

/**
 * 초대 코드 없이 들어온 온보딩 화면을 되돌린다.
 *
 * 온보딩은 `/join` 에서 초대 코드를 받고 시작한다. 그런데 코드 없이 02~06 화면에 직접
 * 들어올 수 있다(새로고침, 즐겨찾기, 링크 공유, 저장소 접근이 막힌 기기). 예전에는
 * 05 화면만 스스로 되돌렸고 나머지는 통과시켰다. 그러면 이름·MBTI·역할을 끝까지 고른
 * 뒤 마지막 버튼을 눌러야 서버가 "초대 코드를 찾을 수 없습니다" 로 거절했는데,
 * 운영 빌드는 그 문구를 지워서 **전 화면을 완주했는데 아무 일도 일어나지 않는** 상태가
 * 됐다.
 *
 * 05 화면도 같은 함수를 쓴다 — 규칙이 두 곳에 있으면 한쪽만 고쳐진다.
 *
 * **`hydrated` 가 있어야 되돌린다.** 이 함수가 처음 그려질 때(하이드레이션 렌더)는 스토어가
 * `sessionStorage` 를 **아직 읽지 않았다** — `useSyncExternalStore` 는 첫 렌더에서 서버
 * 스냅샷(`teamCode: null`)을 돌려준다. 거기서 곧바로 "코드가 없다" 고 결론을 내리면,
 * 마운트 이펙트에서 스토어가 값을 복원하기 **전에** `/join` 으로 튕겨나간다. 실제로 그랬다 —
 * `/onboarding/mbti` 를 새로고침하면 고른 MBTI 그대로 `/join` 으로 튕겨나갔다. 스토어가
 * 복원을 마쳤는지(`hydrated`)를 보고 나서야 판단한다.
 *
 * `ready` 가 false 인 동안은 `false` 를 돌려준다. 서버 렌더는 항상 `false` 다(초대 코드는
 * `sessionStorage` 에 있으므로 서버가 알 수 없다) — 그래야 첫 화면이 깜빡이지 않는다.
 */
export function useOnboardingGate(ready: boolean): boolean {
  const router = useRouter();
  const { teamCode, hydrated } = useOnboarding();

  useEffect(() => {
    if (hydrated && ready && !teamCode) router.replace("/join");
  }, [hydrated, ready, teamCode, router]);

  return ready && Boolean(teamCode);
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppBar, Body, Failure } from "@/components/ui";

/**
 * 탭 화면 하나가 실패했을 때.
 *
 * 탭 셸(`(tabs)/layout.tsx`) **안쪽**에 그려지므로 탭바와 세로 막대는 그대로 남는다 —
 * 한 화면이 실패했다고 다른 탭까지 못 가게 되면, 고칠 수 있는 일도 고칠 수 없다.
 * 셸 자체가 실패한 경우는 위쪽 `app/error.tsx` 가 받는다.
 */
export default function TabsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // 운영에서 브라우저에 보이는 것은 `Minified React error #441` 뿐이다 — 서버가
    // RSC 페이로드로 넘긴 에러를 클라이언트가 되살린 것이고, 메시지와 스택이 지워져
    // 있다. 서버 로그와 이어지는 끈은 `digest` 하나뿐이므로 반드시 함께 찍는다.
    console.error(`[화면 오류] digest=${error.digest ?? "없음"}`, error);
  }, [error]);

  return (
    <>
      <AppBar title="불러오지 못했습니다" />
      <Body>
        <Failure
          title="이 화면을 불러오지 못했습니다"
          onRetry={retry}
          onHome={() => router.push("/home")}
          digest={error.digest}
        >
          서버가 이 화면을 그리지 못했습니다. 다시 시도해 보세요. 계속 같으면 아래 오류
          번호를 알려 주세요. 다른 탭은 그대로 쓸 수 있습니다.
        </Failure>
      </Body>
    </>
  );
}

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
    console.error(error);
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
          잠시 연결이 끊겼을 수 있습니다. 다시 시도해 보세요. 다른 탭은 그대로 쓸 수 있습니다.
        </Failure>
      </Body>
    </>
  );
}

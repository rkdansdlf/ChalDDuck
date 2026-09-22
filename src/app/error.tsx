"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppBar, AppFrame, Body, Failure, TopInset } from "@/components/ui";

/**
 * 탭 밖(온보딩·입장)에서 렌더가 실패했을 때. 탭 셸 자체가 실패한 경우도 여기로 온다 —
 * `(tabs)/layout.tsx` 가 던지면 그 위의 경계는 이것뿐이다.
 *
 * 이 파일이 없으면 Next 의 기본 오류 화면이 나온다. 그 화면에는 나갈 길이 없어서,
 * 잠깐의 연결 끊김이 "앱이 죽었다"로 보인다 — 실제로 `db.ts` 가 두 번 다시 시도한 뒤의
 * 실패는 대부분 잠시 뒤에 그냥 된다.
 *
 * 오류 경계는 **클라이언트 컴포넌트여야 한다.**
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // 운영에서는 문구가 지워진 채 오므로 `digest` 가 서버 로그와 잇는 유일한 끈이다.
    console.error(error);
  }, [error]);

  return (
    <AppFrame label="오류">
      <TopInset />
      <AppBar title="찰떡" />
      <Body>
        <Failure
          title="화면을 여는 데 실패했습니다"
          onRetry={retry}
          onHome={() => router.push("/")}
          digest={error.digest}
        >
          잠시 연결이 끊겼을 수 있습니다. 다시 시도해 보고, 계속 같으면 조금 뒤에 다시 열어 주세요.
          오래 앱을 열지 않았다면 다시 입장해야 할 수도 있습니다.
        </Failure>
      </Body>
    </AppFrame>
  );
}

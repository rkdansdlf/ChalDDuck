"use client";

import { useRouter } from "next/navigation";
import { AppBar, Body, Failure } from "@/components/ui";

/**
 * 탭 화면 하나가 404 일 때.
 *
 * `notFound()` 은 **루트** 경계로 올라간다. `(tabs)/layout.tsx` 도 그 위라서 탭바와
 * 세로 막대가 적용되지 않는다 — 팀원 확인 화면의 오래된 알림 링크(`?kind=`), 이미 정리된
 * 정정 요청 주소 같은 것을 열면 사용자는 앱 밖으로 던져지고 "처음으로" 버튼 하나만
 * 남는다. 고칠 수 있는 일로 갈 수 없는 셈이다.
 *
 * 한 화면이 404 인 것은 그 화면만의 일이므로, 다른 탭은 그대로 두어야 한다
 * (`(tabs)/error.tsx` 와 같은 취지).
 */
export default function TabsNotFound() {
  const router = useRouter();

  return (
    <>
      <AppBar title="없는 주소" />
      <Body>
        <Failure
          title="이 화면은 더 이상 없어요"
          onHome={() => router.push("/home")}
        >
          주소가 바뀌었거나 이미 정리된 내용입니다. 팀 탭이나 홈으로 가서 다시 찾아보세요.
        </Failure>
      </Body>
    </>
  );
}

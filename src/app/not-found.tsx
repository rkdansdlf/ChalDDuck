"use client";

import { useRouter } from "next/navigation";
import { AppBar, AppFrame, Body, Failure, TopInset } from "@/components/ui";

/**
 * 없는 주소.
 *
 * 초대 링크를 손으로 고쳐 들어오거나, 지워진 팀의 주소가 카톡에 남아 있다가 눌리는
 * 경우다. 기본 404 대신 들어오는 길(`/`)을 알려 준다.
 */
export default function NotFound() {
  const router = useRouter();

  return (
    <AppFrame label="없는 주소">
      <TopInset />
      <AppBar title="찰떡" />
      <Body>
        <Failure title="없는 주소입니다" onHome={() => router.push("/")}>
          주소가 바뀌었거나 지워진 화면입니다. 초대 링크를 다시 받아 들어와 주세요.
        </Failure>
      </Body>
    </AppFrame>
  );
}

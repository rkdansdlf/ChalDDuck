"use client";

import { Note } from "@/components/ui";

/**
 * AI 도구 화면 6개가 공유하는 두 가지 알림.
 *
 * 둘 다 **감추지 않기 위한** 것이다 — 샘플을 AI 결과인 척 보여 주거나, 호출이 실패한
 * 자리에 이전 결과를 그대로 두면 사용자는 무엇을 믿어야 할지 알 수 없다.
 */

/** 키가 없어 미리 적어 둔 결과가 나오는 중일 때. */
export function SampleNote({ className }: { className?: string }) {
  return (
    <Note tone="warn" icon="flask-conical" title="아직 AI가 연결되지 않았습니다" className={className}>
      지금은 어떤 글을 넣어도 <b>미리 적어 둔 샘플 결과</b>가 나옵니다. 화면 흐름을 보기 위한 것이며,
      결과의 품질을 판단할 수 있는 상태가 아닙니다.
    </Note>
  );
}

/** 호출이 실패했을 때. 아래 보이는 결과가 최신이 아니라는 것까지 말한다. */
export function AiErrorNote({ message, className }: { message: string; className?: string }) {
  return (
    <Note tone="warn" icon="circle-alert" title="AI 응답을 받지 못했습니다" className={className}>
      {message} 아래 결과는 <b>이전 것</b>이라 방금 넣은 글이 반영돼 있지 않습니다.
    </Note>
  );
}

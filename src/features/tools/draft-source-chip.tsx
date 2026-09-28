"use client";

import { Chip } from "@/components/ui/chip";
import type { AiAnswerSource } from "@/lib/types";

/**
 * AI 결과 옆에 **누가 만들었는지**를 밝히는 배지.
 *
 * 예전에는 키가 없을 때 미리 넣어 둔 예시도 "AI 초안" 배지 아래에 있었다. 키가 설정돼 있으면
 * 그것조차 "AI 초안"처럼 보여, 사람이 직접 고친 글과 구분할 수 없었다. 배지는 화면마다
 * 조금씩 다른 규칙(`aiReady` 를 다시 보거나, 아예 안 보이거나)을 쓰고 있었고, 그 기억에
 * 실패한 곳에서 거짓말이 나왔다.
 *
 * 이제 값이 서버에서 출처를 **같이** 보내므로(`AiResult.source`) 여기서는 글자만 고른다.
 */
export function DraftSourceChip({
  source,
  working,
  aiLabel = "AI 초안",
}: {
  /** 아직 아무것도 만든 적이 없으면 `null`. 배지를 붙이지 않는다. */
  source: AiAnswerSource | null;
  working?: boolean;
  aiLabel?: string;
}) {
  if (source === "ai") {
    return (
      <Chip tone="y" icon="sparkles" iconClassName={working ? "animate-wiggle" : undefined}>
        {aiLabel}
      </Chip>
    );
  }
  if (source === "sample") {
    // 키가 없을 때 눌러도 예시가 나온다. 그 사실을 결과 옆에 둔다 — 화면 맨 위 안내 한 줄로
    // 알리지 않으면, 사용자는 "내 글이 이런 값으로 바뀌었구나"로 읽는다.
    return (
      <Chip tone="warn" icon="flask-conical">
        예시
      </Chip>
    );
  }
  return null;
}

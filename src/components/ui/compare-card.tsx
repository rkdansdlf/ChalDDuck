import type { ReactNode } from "react";

import type { AiAnswerSource } from "@/lib/types";
import { Chip } from "./chip";
import { Panel } from "./panel";

/**
 * AI 도구 공통 — 원문/결과 비교 카드.
 *
 * 모바일에서는 위아래로 쌓이고 PC 폭에서는 좌우로 나란히 놓인다.
 * 결과 칸의 배지는 **`resultSource` 가 알려준 대로만** 붙는다. 예전엔 "AI 초안" 을 조건 없이
 * 새겼는데, 서버가 예시를 돌려주는 도구에서는 사람이 쓴 글과 예시가 구분되지 않았다.
 *
 * 화면 15·20·26·27 이 공유한다. (아직 구현 전 — 컴포넌트만 먼저 옮겨 둔다)
 */
export function CompareCard({
  inputLabel = "원문",
  input,
  editableInput,
  resultLabel = "AI 초안",
  result,
  /**
   * 이 결과가 **누가 만들었는지.**
   *
   * 예전에는 이 자리에 `AI 초안` 배지가 조건 없이 박혀 있었다. `resultLabel` 이 "AI 초안" 이라
   *서버가 예시를 돌려줘도, 키가 없어도, 사람이 넣은 값이어도 똑같이 "AI 초안" 이라고 적혔다.
   * 그래서 쓰던 화면들이 자기 배지를 카드 바깥에 따로 만들거나(쿠션), 아예 만들지 않았다
   * (문장 변환·발표 지원) — **어느 쪽이든 사용자는 출처를 알 수 없었다.**
   *
   * 만들지 않으면 배지 자리에 아무것도 없다. 더는 아무 값에도 "AI 초안" 이라고 쓰지 않는다.
   */
  resultSource,
}: {
  inputLabel?: string;
  input: ReactNode;
  /**
   * `input` 이 입력창처럼 스스로 면을 갖는 경우 true.
   *
   * 원문을 고칠 수 있는 화면에서 읽기 전용 원문 칸을 따로 두면 같은 글이 두 번 보인다.
   * 그럴 때는 입력창 자체를 왼쪽 칸으로 넣고, 카드가 면을 덧씌우지 않게 한다.
   */
  editableInput?: boolean;
  resultLabel?: string;
  result: ReactNode;
  /** `null` 이면 배지를 붙이지 않는다. */
  resultSource?: AiAnswerSource | null;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-3.5">
      <div className="min-w-0 flex-[1_1_240px]">
        <div className="t-cap-strong mb-1.5 font-bold text-txt-muted">{inputLabel}</div>
        {editableInput ? (
          input
        ) : (
          <Panel s="fill" pad={14} r={16}>
            <div className="text-pretty-keep text-[14.5px] leading-[1.6] text-txt-strong">{input}</div>
          </Panel>
        )}
      </div>
      <div className="min-w-0 flex-[1_1_240px]">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="t-cap-strong font-bold text-txt-muted">{resultLabel}</span>
          {resultSource === "ai" ? (
            <Chip tone="y" icon="sparkles">
              AI 초안
            </Chip>
          ) : resultSource === "sample" ? (
            <Chip tone="warn" icon="flask-conical">
              예시
            </Chip>
          ) : null}
        </div>
        <Panel s="coral" pad={14} r={16}>
          <div className="text-pretty-keep text-[15px] leading-[1.65] text-[#8A3B29]">{result}</div>
        </Panel>
      </div>
    </div>
  );
}

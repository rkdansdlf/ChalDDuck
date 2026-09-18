import type { ReactNode } from "react";
import { Chip } from "./chip";
import { Panel } from "./panel";

/**
 * AI 도구 공통 — 원문/결과 비교 카드.
 *
 * 모바일에서는 위아래로 쌓이고 PC 폭에서는 좌우로 나란히 놓인다.
 * 결과 칸에는 **"AI 초안" 배지가 항상 붙는다** — 사람이 쓴 글과 구분되지 않으면 안 된다.
 *
 * 화면 15·20·26·27 이 공유한다. (아직 구현 전 — 컴포넌트만 먼저 옮겨 둔다)
 */
export function CompareCard({
  inputLabel = "원문",
  input,
  resultLabel = "AI 초안",
  result,
}: {
  inputLabel?: string;
  input: ReactNode;
  resultLabel?: string;
  result: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-3.5">
      <div className="min-w-0 flex-[1_1_240px]">
        <div className="t-cap-strong mb-1.5 font-bold text-txt-muted">{inputLabel}</div>
        <Panel s="fill" pad={14} r={16}>
          <div className="text-pretty-keep text-[14.5px] leading-[1.6] text-txt-strong">{input}</div>
        </Panel>
      </div>
      <div className="min-w-0 flex-[1_1_240px]">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="t-cap-strong font-bold text-txt-muted">{resultLabel}</span>
          <Chip tone="y" icon="sparkles">
            AI 초안
          </Chip>
        </div>
        <Panel s="coral" pad={14} r={16}>
          <div className="text-pretty-keep text-[15px] leading-[1.65] text-[#8A3B29]">{result}</div>
        </Panel>
      </div>
    </div>
  );
}

"use client";

import { Btn } from "@/components/ui";
import type { DraftHistoryEntry } from "./use-ai-draft";

/**
 * 결과 아래에 놓는 **다시 만들기 · 이전 결과**.
 *
 * 쿠션 번역기와 문장 변환이 같이 쓴다. 두 화면이 따로 만들면 문구와 한도 안내가 어긋난다.
 *
 * - **다시 만들기는 한도를 1회 쓴다.** 그 사실을 버튼 곁에 적는다 — 누르고서야 알게 하지 않는다.
 * - **이전 결과로 되돌리는 것은 한도를 쓰지 않는다.** 이미 받은 글을 다시 올릴 뿐이다.
 * - 이전 결과는 **이 화면이 열려 있는 동안만** 있다(서버·브라우저에 저장하지 않는다).
 */
export function DraftActions({
  canRedo,
  onRedo,
  history,
  onRestore,
  left,
  limited,
  className,
}: {
  canRedo: boolean;
  onRedo: () => void;
  history: DraftHistoryEntry[];
  onRestore: (index: number) => void;
  /** 오늘 남은 내 몫. `limited` 가 아니면 보여 주지 않는다. */
  left: number;
  /** 한도를 읽었는가(`perDay > 0`). 못 읽었으면 몫을 말하지 않는다. */
  limited: boolean;
  className?: string;
}) {
  const noQuota = limited && left === 0;
  if (!canRedo && history.length === 0) return null;

  return (
    <div className={className}>
      {canRedo ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Btn size="sm" v="outline" icon="rotate-ccw" disabled={noQuota} onClick={onRedo}>
            마음에 안 들면 다시 만들기
          </Btn>
          <span className="t-cap text-txt-muted">
            {noQuota ? "오늘 몫을 다 썼습니다" : "한도 1회를 씁니다"}
          </span>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div>
          <div className="t-cap-strong mb-1 font-bold text-txt-muted">
            이전 결과 · 되돌려도 한도는 쓰지 않습니다
          </div>
          <ul className="flex flex-col gap-1.5">
            {history.map((entry, index) => (
              <li key={`${index}-${entry.result.slice(0, 24)}`}>
                <button
                  type="button"
                  onClick={() => onRestore(index)}
                  aria-label={`이전 결과로 되돌리기: ${entry.result.slice(0, 40)}`}
                  className="keep-all w-full cursor-pointer rounded-control border border-line bg-card px-3 py-2 text-left text-[13px] leading-[1.5] text-txt-muted"
                >
                  <span className="line-clamp-2">{entry.result}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

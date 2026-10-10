"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, Icon, Panel } from "@/components/ui";
import type { BalanceResult } from "@/data/api";
import { BALANCE_QUESTIONS, type BalanceChoice } from "@/lib/saju/balance";
import { ELEMENT_KO } from "@/lib/saju/engine";
import { ELEMENT_WORD } from "@/lib/saju/copy";
import { voteBalance } from "@/server/actions/saju-balance";

/**
 * 사주 밸런스 게임 — 두 선택지 중 하나를 고르고, 고른 뒤에 팀의 선택을 본다.
 *
 * **고르기 전에는 결과가 내려오지 않는다**(`getBalanceResults`). 남의 표를 먼저 보고 고르면 놀이가 눈치가 된다.
 * 사람 수만 보이고 누가 무엇을 골랐는지는 알 수 없다. 다시 누르면 바뀐다. 선택지의 오행 키워드는 고른
 * 뒤에 보이는 재미 표시일 뿐이고, 고른 것으로 그 사람을 말하지 않는다.
 */
export function BalancePanel({ results }: { results: BalanceResult[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(results.map((r) => [r.questionId, r]));

  const vote = async (questionId: string, choice: BalanceChoice) => {
    setPending(questionId);
    setError(null);
    try {
      const res = await voteBalance(questionId, choice);
      if (res !== "ok") setError("투표하지 못했어요. 다시 로그인한 뒤 시도해 주세요.");
      else router.refresh();
    } catch {
      setError("투표하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mb-4 flex flex-col gap-3">
      {error ? (
        <p role="alert" className="t-cap-strong m-0 text-err">
          {error}
        </p>
      ) : null}
      {BALANCE_QUESTIONS.map((q) => {
        const r = byId.get(q.id);
        const mine = r?.mine ?? null;
        const counts = r?.counts ?? null;
        return (
          <Panel key={q.id} s="card" pad={14}>
            <div className="t-cap-strong mb-2 text-txt-muted">{q.prompt}</div>
            <div className="flex flex-col gap-2">
              {(["a", "b"] as const).map((c) => {
                const opt = q[c];
                const on = mine === c;
                return (
                  <Btn
                    key={c}
                    full
                    v={on ? "soft" : "outline"}
                    disabled={pending === q.id}
                    onClick={() => void vote(q.id, c)}
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-left">
                      <span className="min-w-0">{opt.label}</span>
                      {counts ? (
                        <span className="t-cap-strong flex flex-none items-center gap-1">
                          {on ? <Icon name="check" size={14} /> : null}
                          {counts[c]}명
                        </span>
                      ) : null}
                    </span>
                  </Btn>
                );
              })}
            </div>
            {mine && counts ? (
              <p className="t-cap m-0 mt-2 text-txt-muted">
                내 선택의 키워드 · {ELEMENT_KO[q[mine].element]} {ELEMENT_WORD[q[mine].element].keyword}
              </p>
            ) : null}
          </Panel>
        );
      })}
    </div>
  );
}

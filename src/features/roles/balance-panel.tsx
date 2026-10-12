"use client";

import { Btn, Chip, Icon, Panel, SecTitle } from "@/components/ui";
import type { Role, RoleKey } from "@/lib/types";
import type { BalanceReason, BalanceSuggestion } from "./balance-model";
import { ROLE_KIND_LABEL } from "./roster-model";

/** 추천 이유의 화면 문구. 색이 아니라 글자로 말한다. */
const REASON_TEXT: Record<BalanceReason, string> = {
  want: "희망 역할",
  want2: "두 번째 희망",
  "no-wish": "희망한 사람은 아니에요",
  "first-core": "첫 핵심 업무",
  "light-load": "지금 부담이 가벼워요",
};

/**
 * 07 의 **균형 추천.**
 *
 * 아직 정해지지 않은 역할 전부를 한꺼번에 보고, 핵심 업무가 모두에게 돌아가고 시간이 몰리지 않게 짠
 * 안을 보여 준다. **올려도 확정되지 않는다** — 받는 사람이 받기를 눌러야 확정되고, 안 받으면 다음
 * 추천에서 빠진다. 그래서 "안" 이라고 부르고 "배정" 이라고 부르지 않는다(`docs/product-language.md`).
 *
 * 두 번째 희망 역할은 내 희망 시트(`ChoicesSheet`)에서 적는다.
 */
export function BalancePanel({
  roles,
  suggestions,
  myId,
  my,
  busy,
  onPropose,
  onEditChoices,
}: {
  roles: Role[];
  suggestions: BalanceSuggestion[];
  myId: string | null;
  /** 내 희망·피할 역할 — 요약만 보이고, 고치는 곳은 `ChoicesSheet` 다. */
  my: { want: RoleKey | null; want2: RoleKey | null; veto: RoleKey | null } | null;
  busy: { propose: boolean };
  onPropose: () => void;
  onEditChoices: () => void;
}) {
  const nameOf = (key: RoleKey | null) => (key === null ? undefined : roles.find((r) => r.key === key));

  return (
    <section className="mt-7" aria-label="균형 추천">
      <SecTitle note="올려도 확정되지 않아요 — 받는 사람이 받아야 확정돼요">균형 추천</SecTitle>

      {suggestions.length === 0 ? (
        <Panel s="card" pad={14} r={18}>
          <p className="m-0 flex items-center gap-2 text-[13.5px] text-txt-muted">
            <Icon name="check" size={14} />
            새로 추천할 역할이 없어요 — 정해졌거나 받기를 기다리는 중이에요.
          </p>
        </Panel>
      ) : (
        <>
          <Panel s="card" pad={0} r={18}>
            <ul className="m-0 list-none divide-y divide-line/60 p-0">
              {suggestions.map((s) => {
                const role = nameOf(s.role);
                return (
                  <li key={s.role} className="px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="t-card-title text-txt-strong">
                        {role?.name ?? "역할"}
                        {role ? (
                          <span className="t-micro-strong ml-1.5 text-txt-muted">
                            {ROLE_KIND_LABEL[role.kind]}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-1 text-[14px] font-semibold text-txt-strong">
                        <Icon name="arrow-right" size={13} />
                        {s.memberId === myId ? `${s.name} 나` : s.name}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.reasons.map((r) => (
                        <Chip key={r} tone={r === "no-wish" ? "n" : "y"}>
                          {REASON_TEXT[r]}
                        </Chip>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <div className="mt-3">
            <Btn full v="outline" icon="send" disabled={busy.propose} onClick={onPropose}>
              이 안을 팀에 올리기
            </Btn>
          </div>
        </>
      )}

      {my ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[14px] bg-fill px-3.5 py-2.5">
          <div className="min-w-0 text-[12.5px] leading-snug text-txt-muted">
            <div className="text-[13px] font-bold text-txt-strong">내 희망 역할</div>
            <div className="truncate">
              {nameOf(my.want)?.name ?? "아직 없어요"}
              {my.want2 ? ` · 두 번째 ${nameOf(my.want2)?.name ?? ""}` : ""}
              {my.veto ? ` · 피할래 ${nameOf(my.veto)?.name ?? ""}` : ""}
            </div>
          </div>
          <Btn size="sm" v="outline" onClick={onEditChoices}>
            바꾸기
          </Btn>
        </div>
      ) : null}
    </section>
  );
}

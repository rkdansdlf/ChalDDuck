"use client";

import { useMemo, useState } from "react";
import { Avatar, Btn, Icon, Panel, Rows } from "@/components/ui";
import type { TeamSajuMember } from "@/data/api";
import { DAY_MASTER_COPY, PAIRING_NEED_OTHERS, PAIR_TITLE } from "@/lib/saju/copy";
import { dailyPartner, todayPairing } from "@/lib/saju/play";

/**
 * 오늘의 궁합 — 나와 한 사람이 **오늘** 같이 일하기에 어떤 흐름인가.
 *
 * 오늘 날짜의 일진이 두 사람에게 각각 어떻게 닿는지(홈의 "오늘의 팀플 흐름"과 같은 이름)를 합쳐 네 갈래 중
 * 하나를 고른다. 점수나 등급이 아니라 같이 해 볼 행동이다. "오늘의 짝 뽑기"는 날짜와 내 번호로 정해져서
 * 같은 날에는 몇 번을 눌러도 같은 사람이 나온다.
 */
export function PairingPanel({
  members,
  me,
  today,
}: {
  members: TeamSajuMember[];
  me: TeamSajuMember;
  today: string;
}) {
  const others = useMemo(() => members.filter((m) => !m.isMe), [members]);
  const [pickedId, setPickedId] = useState<string | null>(null);

  if (others.length === 0) {
    return (
      <Panel s="cream" pad={16} className="mb-4">
        <p className="text-pretty-keep m-0 text-[14.5px] leading-[1.6] text-txt">{PAIRING_NEED_OTHERS}</p>
      </Panel>
    );
  }

  const picked = others.find((m) => m.id === pickedId) ?? null;
  const pairing = picked ? todayPairing({ today, myStem: me.stem, otherStem: picked.stem }) : null;

  return (
    <div className="mb-4">
      <Btn
        full
        v="soft"
        icon="dices"
        className="mb-2.5"
        onClick={() => setPickedId(dailyPartner(others, me.id, today)?.id ?? null)}
      >
        오늘의 짝 뽑기
      </Btn>

      <Rows className="mb-2.5">
        {others.map((m) => {
          const on = m.id === pickedId;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => setPickedId(m.id)}
              className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2 text-left hover:bg-fill"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={m.name} mbti={m.mbti} size={32} />
                <span className="text-[15px] font-semibold text-txt-strong">{m.name}</span>
              </span>
              {on ? (
                <span className="t-cap-strong flex items-center gap-1 text-txt-strong">
                  <Icon name="check" size={15} />
                  선택
                </span>
              ) : null}
            </button>
          );
        })}
      </Rows>

      {picked && pairing ? (
        <Panel s="card" pad={16}>
          <div className="t-cap-strong text-txt-muted">
            나 × {picked.name} · {DAY_MASTER_COPY[me.stem].name} ↔ {DAY_MASTER_COPY[picked.stem].name}
          </div>
          <div className="mt-1 text-[17px] font-extrabold text-txt-strong">{pairing.copy.title}</div>
          <div className="t-cap mt-1 text-txt-muted">
            {PAIR_TITLE[pairing.pairKey]} · 나의 오늘 “{pairing.mine}” · {picked.name}의 오늘 “{pairing.theirs}”
          </div>
          <p className="text-pretty-keep m-0 mt-2 text-[14.5px] leading-[1.6] text-txt">{pairing.copy.line}</p>
          <p className="text-pretty-keep m-0 mt-1 text-[14.5px] leading-[1.6] text-txt">{pairing.copy.tip}</p>
        </Panel>
      ) : null}
    </div>
  );
}

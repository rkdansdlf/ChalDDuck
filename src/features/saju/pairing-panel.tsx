"use client";

import { useMemo, useState } from "react";
import { Avatar, Btn, Icon, Panel, Rows } from "@/components/ui";
import type { TeamSajuMember } from "@/data/api";
import { DAY_MASTER_COPY, PAIRING_SOLO_NOTE, PAIR_TITLE } from "@/lib/saju/copy";
import { dailyPartner, todayPairing } from "@/lib/saju/play";
import { buildTodayFlow } from "@/lib/saju/today";

/**
 * 오늘의 궁합 — 나와 한 사람이 **오늘** 같이 일하기에 어떤 흐름인가.
 *
 * 오늘 날짜의 일진이 두 사람에게 각각 어떻게 닿는지(홈의 "오늘의 팀플 흐름"과 같은 이름)를 합쳐 네 갈래 중
 * 하나를 고른다. 점수나 등급이 아니라 같이 해 볼 행동이다. "오늘의 짝 뽑기"는 날짜와 내 번호로 정해져서
 * 같은 날에는 몇 번을 눌러도 같은 사람이 나온다.
 *
 * 나 말고 등록한 팀원이 없으면(혼자일 때) 홈의 "오늘의 팀플 흐름"과 같은 **나의 오늘**을 보여 준다 —
 * 짝이 없어도 이 놀이가 빈 안내문으로 끝나지 않게 한다. 팀 상태(회의·마감)는 여기서 읽지 않으므로 미션은 없다.
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
    const flow = buildTodayFlow({ today, myStem: me.stem, team: [], meetingToday: false, dueSoon: false });
    return (
      <Panel s="card" pad={16} className="mb-4">
        {flow ? (
          <>
            <div className="t-cap-strong text-txt-muted">
              나의 오늘 · {DAY_MASTER_COPY[me.stem].name} · 오늘 일진 {flow.pillarKo}
            </div>
            <div className="mt-1 t-title text-txt-strong">{flow.title}</div>
            <p className="text-pretty-keep m-0 mt-2 t-card text-txt">{flow.line}</p>
            <p className="text-pretty-keep m-0 mt-1 t-card text-txt">{flow.tip}</p>
          </>
        ) : null}
        <p className="t-cap text-pretty-keep m-0 mt-3 text-txt-muted">{PAIRING_SOLO_NOTE}</p>
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
                <span className="t-body-strong text-txt-strong">{m.name}</span>
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
          <div className="mt-1 t-title text-txt-strong">{pairing.copy.title}</div>
          <div className="t-cap mt-1 text-txt-muted">
            {PAIR_TITLE[pairing.pairKey]} · 나의 오늘 “{pairing.mine}” · {picked.name}의 오늘 “{pairing.theirs}”
          </div>
          <p className="text-pretty-keep m-0 mt-2 t-card text-txt">{pairing.copy.line}</p>
          <p className="text-pretty-keep m-0 mt-1 t-card text-txt">{pairing.copy.tip}</p>
        </Panel>
      ) : null}
    </div>
  );
}

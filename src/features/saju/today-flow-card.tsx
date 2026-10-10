"use client";

import { useMemo } from "react";
import { Icon, Panel } from "@/components/ui";
import type { TeamSaju } from "@/data/api";
import { TODAY_NEED_MINE, TODAY_NOTICE } from "@/lib/saju/copy";
import { buildTodayFlow } from "@/lib/saju/today";

/**
 * 홈의 "오늘의 팀플 흐름" 카드.
 *
 * 계산은 `lib/saju/today.ts` 에 있고 이 컴포넌트는 그린다. `today` 는 서버가 정해 내려준 값이다 —
 * 화면이 자기 시계로 "오늘"을 다시 재면 서버가 그린 것과 달라진다(하이드레이션 불일치).
 *
 * 오늘 회의·마감 임박 여부는 **`briefing.ts` 가 센 결과**를 받는다. 여기서 다시 세지 않는다 —
 * 브리핑 카드는 "오늘 회의"라고 하는데 이 카드는 아니라고 하면 한 화면이 두 말을 하게 된다.
 *
 * 내가 등록하지 않았으면 한 줄 안내만 둔다(내 일간이 없으면 관계를 구할 수 없다).
 */
export function TodayFlowCard({
  saju,
  today,
  meetingToday,
  dueSoon,
  onOpen,
}: {
  saju: TeamSaju | null;
  today: string;
  meetingToday: boolean;
  dueSoon: boolean;
  onOpen: (href: string) => void;
}) {
  const me = saju?.members.find((m) => m.isMe) ?? null;

  const flow = useMemo(
    () =>
      me && saju
        ? buildTodayFlow({ today, myStem: me.stem, team: saju.members, meetingToday, dueSoon })
        : null,
    [me, saju, today, meetingToday, dueSoon],
  );

  // 조회가 실패했거나(`null`) 로그인 정보가 없으면 카드를 그리지 않는다 — 홈을 깨지 않는다.
  if (!saju) return null;

  if (!flow) {
    return (
      <Panel s="fill" pad={14} r={18} className="mb-[18px]" onClick={() => onOpen("/team/access")}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <Icon name="sparkles" size={17} className="flex-none text-txt-muted" />
            <span className="t-body keep-all text-txt">{TODAY_NEED_MINE}</span>
          </span>
          <Icon name="chevron-right" size={16} className="flex-none text-txt-muted" />
        </div>
      </Panel>
    );
  }

  return (
    <Panel s="card" pad={14} r={18} className="mb-[18px]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <Icon name="sparkles" size={15} className="text-yellow-700" />
          <span className="t-cap-strong keep-all font-bold text-txt-strong">오늘의 팀플 흐름</span>
        </span>
        <span className="t-cap text-txt-muted">재미 해석</span>
      </div>

      <div className="t-cap text-txt-muted">
        오늘은 {flow.pillarKo}일 {flow.pillarHanja}
      </div>
      <div className="mt-0.5 text-[16px] font-extrabold text-txt-strong">{flow.title}</div>
      <p className="text-pretty-keep m-0 mt-1 text-[14.5px] leading-[1.6] text-txt">{flow.line}</p>
      <p className="text-pretty-keep m-0 mt-1 text-[14.5px] leading-[1.6] text-txt">{flow.tip}</p>

      {flow.missions.length > 0 ? (
        <div className="mt-3 rounded-xl bg-fill px-3 py-2.5">
          <div className="t-cap-strong text-txt-muted">오늘의 팀 미션</div>
          <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
            {flow.missions.map((m) => (
              <li key={m} className="text-pretty-keep text-[14px] leading-[1.55] text-txt">
                {m}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onOpen("/team/saju")}
        className="t-cap-strong mt-2.5 flex cursor-pointer items-center gap-0.5 border-none bg-transparent p-0 text-link"
      >
        팀 사주 보기
        <Icon name="chevron-right" size={14} />
      </button>

      <p className="t-cap text-pretty-keep m-0 mt-2 text-txt-muted">{TODAY_NOTICE}</p>

      {/* 정책: 오늘의 일진은 한국 달력 날짜(자정)에 바뀐다. 생년월일을 계산할 때의 밤 11시 기점과는
          다르다 — 홈은 날짜 단위로 한 줄을 보여 주는 자리라 시각까지 재지 않는다. */}
    </Panel>
  );
}

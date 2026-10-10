"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar, Avatar, Body, Btn, Icon, Note, Panel, Rows, SecTitle, Sheet } from "@/components/ui";
import type { TeamSaju, TeamSajuMember } from "@/data/api";
import { cn } from "@/lib/cn";
import { chemistryOf } from "@/lib/saju/chemistry";
import {
  CHEMISTRY_NOTICE,
  DAY_MASTER_COPY,
  MEETING_TIP,
  PAIR_TITLE,
  RELATION_COPY,
  SAJU_NOTICE,
  TEAM_NEED_MINE,
  TEAM_SAJU_NOTICE,
} from "@/lib/saju/copy";
import { ELEMENTS, ELEMENT_KO, elementOfStem } from "@/lib/saju/engine";
import { summarizeTeam } from "@/lib/saju/team";
import { ElementBar } from "./element-bar";

/**
 * 우리 팀 사주 — 등록한 팀원의 오행을 더한 분포, 그리고 팀원과의 1:1 케미.
 *
 * ## 07 역할 조율에 데이터를 올리지 않는다
 *
 * 팀 탭의 메뉴 행으로만 들어온다. 사주가 역할 화면 안에 있으면 "배정에 영향을 주었다"고 읽힌다
 * (MBTI 를 같은 이유로 계정 화면에 둔 것과 같다). 이 화면에는 누구에게 무슨 역할이 어울린다는
 * 말이 없고, 제안은 **회의 진행 방식**에 한정한다.
 *
 * ## 서로 보여 주는 만큼만 본다
 *
 * 내가 등록하지 않았으면 서버가 남의 값을 내려보내지 않는다(`getTeamSaju`). 등록하지 않은 팀원은
 * 이름을 밝히지 않고 사람 수로만 센다 — 누가 안 했는지가 압박이 되지 않도록.
 */
export function TeamSajuScreen({ data }: { data: TeamSaju }) {
  const router = useRouter();
  const [pick, setPick] = useState<TeamSajuMember | null>(null);

  const me = data.members.find((m) => m.isMe) ?? null;
  const summary = summarizeTeam(data.members);
  const unregistered = data.activeCount - data.registeredCount;

  return (
    <>
      <AppBar title="우리 팀 사주" sub="재미로 보는 팀 케미" onBack={() => router.push("/team")} />

      <Body dense>
        <Note tone="y" icon="sparkles" className="mb-4">
          {SAJU_NOTICE}
        </Note>

        {!data.meRegistered ? (
          <Panel s="cream" pad={18} className="mb-4">
            <p className="text-pretty-keep m-0 mb-3 text-[14.5px] leading-[1.6] text-txt">{TEAM_NEED_MINE}</p>
            <p className="t-cap mb-3 text-txt-muted">지금 {data.registeredCount}명이 등록했어요.</p>
            <Btn full onClick={() => router.push("/team/access")}>
              내 사주 등록하기
            </Btn>
          </Panel>
        ) : data.members.length < 2 ? (
          <Panel s="cream" pad={18} className="mb-4">
            <p className="text-pretty-keep m-0 text-[14.5px] leading-[1.6] text-txt">
              아직 나만 등록했어요. 한 명 더 등록하면 팀 분포와 1:1 케미를 볼 수 있어요.
            </p>
          </Panel>
        ) : (
          <>
            <SecTitle note={`${summary.members}명의 연·월·일 ${summary.characters}글자를 오행별로 센 값입니다`}>
              팀 오행 분포
            </SecTitle>
            <Panel s="card" pad={16} className="mb-1.5 flex flex-col gap-2.5">
              {ELEMENTS.map((e) => (
                <ElementBar
                  key={e}
                  element={e}
                  count={summary.counts[e]}
                  percent={summary.percent[e]}
                  top={summary.dominant.includes(e)}
                />
              ))}
            </Panel>
            <p className="t-cap text-pretty-keep mb-4 text-txt-muted">{TEAM_SAJU_NOTICE}</p>

            {summary.lowest.length > 0 ? (
              <>
                <SecTitle note="가장 적게 센 오행의 키워드를 회의에서 일부러 챙겨 보는 제안이에요">
                  오늘 회의에서 해 볼 것
                </SecTitle>
                <Rows className="mb-4">
                  {summary.lowest.slice(0, 2).map((e) => (
                    <div key={e} className="px-4 py-3">
                      <div className="t-cap-strong text-txt-muted">가장 적게 센 오행 · {ELEMENT_KO[e]}</div>
                      <p className="text-pretty-keep m-0 mt-0.5 text-[14.5px] leading-[1.6] text-txt">
                        {MEETING_TIP[e]}
                      </p>
                    </div>
                  ))}
                </Rows>
              </>
            ) : null}

            <SecTitle note="팀원을 누르면 1:1 케미를 볼 수 있어요">팀원 {data.members.length}명</SecTitle>
            <Rows className="mb-2">
              {data.members.map((m) => {
                const master = DAY_MASTER_COPY[m.stem];
                const inner = (
                  <>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={m.name} mbti={m.mbti} size={36} />
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-txt-strong">
                          {m.name}
                          {m.isMe ? <span className="t-cap ml-1.5 text-txt-muted">나</span> : null}
                        </div>
                        <div className="t-cap keep-all truncate text-txt-muted">
                          {master.name} · {master.image}
                        </div>
                      </div>
                    </div>
                    {m.isMe ? null : <Icon name="chevron-right" size={16} className="text-txt-muted" />}
                  </>
                );
                return m.isMe ? (
                  <div key={m.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2.5">
                    {inner}
                  </div>
                ) : (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPick(m)}
                    className={cn(
                      "flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-fill",
                    )}
                  >
                    {inner}
                  </button>
                );
              })}
            </Rows>
            {unregistered > 0 ? (
              <p className="t-cap mb-4 text-txt-muted">아직 등록하지 않은 팀원이 {unregistered}명 있어요.</p>
            ) : null}

            {/* 정책 확정: 팀 오행 집계는 출생 시각 입력 여부와 무관하게 등록한 팀원의 연·월·일(6글자)만
                균등한 비중으로 합산한다(시주 제외). 미등록 팀원은 참여 강요 방지를 위해 실명을 노출하지 않고
                인원수만 표기한다. */}
          </>
        )}
      </Body>

      {pick && me ? <ChemistrySheet me={me} other={pick} onClose={() => setPick(null)} /> : null}
    </>
  );
}

/** 나 × 한 사람의 1:1 케미. 상대의 일간만 쓴다 — 생년월일은 이 화면에 오지 않는다. */
function ChemistrySheet({
  me,
  other,
  onClose,
}: {
  me: TeamSajuMember;
  other: TeamSajuMember;
  onClose: () => void;
}) {
  const router = useRouter();
  const chem = chemistryOf(me.stem, other.stem);
  const copy = RELATION_COPY[chem.relation];
  const mine = DAY_MASTER_COPY[me.stem];
  const theirs = DAY_MASTER_COPY[other.stem];

  return (
    <Sheet
      open
      title={`나 × ${other.name}`}
      onClose={onClose}
      footer={
        <Btn full v="outline" icon="messages-square" onClick={() => router.push("/tools/cushion")}>
          쿠션 번역기로 말 다듬기
        </Btn>
      }
    >
      <p className="text-pretty-keep m-0 mb-3.5 text-[13.5px] leading-[1.6] text-txt-muted">{CHEMISTRY_NOTICE}</p>

      <Panel s="cream" pad={16} className="mb-3.5">
        <div className="t-cap-strong text-txt-muted">
          {mine.name} ↔ {theirs.name}
        </div>
        <div className="mt-1 text-[17px] font-extrabold text-txt-strong">{PAIR_TITLE[chem.pairKey]}</div>
        <div className="t-cap mt-1 text-txt-muted">
          {ELEMENT_KO[elementOfStem(me.stem)]} · {ELEMENT_KO[elementOfStem(other.stem)]} ·{" "}
          {copy.label} · 음양이 {chem.samePolarity ? "같아요" : "달라요"}
        </div>
        <p className="text-pretty-keep m-0 mt-2 text-[14.5px] leading-[1.6] text-txt">{copy.line}</p>
      </Panel>

      <div className="mb-3.5 flex flex-col gap-3">
        <Block title="같이 일할 때" text={copy.together} />
        <Block title="조심해 볼 순간" text={copy.watch} />
        <Block title="이렇게 말해 보세요" text={copy.say} />
      </div>
    </Sheet>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="t-cap-strong text-txt-muted">{title}</div>
      <p className="text-pretty-keep m-0 mt-0.5 text-[14.5px] leading-[1.6] text-txt">{text}</p>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Dock,
  Note,
  Toast,
  Undecided,
} from "@/components/ui";
import type { ContribRecord, ContribReportBase, Team, TeamCheckRecord } from "@/lib/types";
import { useMyContrib, useTeamCheck } from "./records-state";
import { StepRail } from "./step-rail";

/**
 * 18 기여도 · 1장 PDF.
 *
 * **종합 점수도 순위도 없다.** 확인된 기록의 건수만 적고, 미확인·의견 차이는 감추지 않고
 * 따로 표시한다 — 문서가 팀원 간 우열을 나타내는 순간 기록을 남길 이유가 사라진다.
 *
 * 흰 배경·단정한 구분선으로 문서처럼 보이게 한다. 앱 화면이 아니라 제출물의 미리 보기다.
 */
export function ContribReportScreen({
  team,
  base,
  myRecords: myFromServer,
  teamRecords: teamFromServer,
  meName,
  issuedOn,
}: {
  team: Team;
  base: ContribReportBase[];
  myRecords: ContribRecord[];
  teamRecords: TeamCheckRecord[];
  meName: string;
  /** 서버에서 만든 발행일. 화면에서 만들면 서버 렌더와 어긋난다. */
  issuedOn: string;
}) {
  const router = useRouter();
  const myRecords = useMyContrib(myFromServer);
  const teamRecords = useTeamCheck(teamFromServer);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * 리포트 줄을 실제 기록에서 센다.
   *
   * 내 줄은 16 화면과 같은 목록에서 세므로, 기록을 하나 추가하면 여기 건수도 함께 바뀐다.
   * 의견 차이는 17 화면과 같은 목록에서 세므로, 정정에 응답하면 여기서도 사라진다.
   */
  const rows = base.map((member) => {
    const mine = member.who === meName;
    return {
      ...member,
      confirmed: mine ? myRecords.filter((r) => r.state === "ok").length : member.confirmed,
      pending: mine ? myRecords.filter((r) => r.state === "pending").length : 0,
      disputed: teamRecords.filter((r) => r.who === member.who && r.state === "disputed").length,
    };
  });

  return (
    <>
      <AppBar
        title="리포트 미리 보기"
        sub="4 / 4단계"
        onBack={() => router.push("/team/contrib/members")}
        action="share-2"
        actionLabel="공유"
        onAction={() => setToast("공유는 아직 준비 중입니다")}
      />

      <Body dense>
        <StepRail at={3} />

        {/* 제출물 미리 보기 — 앱 색이 아니라 문서 색을 쓴다.
            넓은 화면에서는 A4 비율(1:1.414)을 최소 높이로 잡아 인쇄했을 때의 모습에 가깝게 보여 준다.
            내용이 더 길면 늘어난다 — 비율을 지키려고 내용을 자르지는 않는다. */}
        <div className="mb-3.5 rounded-control border border-line bg-white px-4 py-[18px] lg:mx-auto lg:min-h-[792px] lg:w-[560px] lg:px-8 lg:py-10">
          <div className="mb-3 border-b-[1.5px] border-ink-900 pb-3">
            <div className="keep-all font-extrabold text-[17px] leading-[1.3] tracking-[-.025em] text-ink-900">
              팀 기여 기록
            </div>
            <div className="mt-[3px] font-medium text-[13px] leading-[1.45] text-txt-muted">
              {team.name} · {team.course} · {issuedOn}
            </div>
          </div>

          {rows.map((row) => (
            <div key={row.memberId} className="mb-[11px] border-b border-line pb-[11px]">
              <div className="flex items-baseline gap-[7px]">
                <span className="font-bold text-[14px] leading-[1.4] text-ink-900">{row.who}</span>
                <span className="font-medium text-[13px] leading-[1.4] text-txt-muted">
                  합의한 역할 · {row.role}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-[5px]">
                <Chip tone="ok" icon="check">
                  확인된 기록 {row.confirmed}건
                </Chip>
                {row.pending > 0 ? (
                  <Chip tone="warn" icon="circle-dashed">
                    미확인 {row.pending}건
                  </Chip>
                ) : null}
                {row.disputed > 0 ? (
                  <Chip tone="err" icon="circle-alert">
                    의견 차이 {row.disputed}건
                  </Chip>
                ) : null}
              </div>
            </div>
          ))}

          <div className="text-pretty-keep text-[13px] leading-[1.6] text-txt-muted">
            이 문서는 확인된 기록만 담습니다. 종합 점수와 순위는 포함하지 않으며, 팀원 간 우열을 나타내지
            않습니다. MBTI, 사주, 채팅량, 친목 활동은 반영하지 않았습니다.
          </div>
        </div>

        <Note tone="info" icon="wand-sparkles" title="AI는 확인된 기록만 요약합니다" className="mb-3">
          미확인·의견 차이 항목은 요약 문장에 넣지 않고 <b>따로 표시</b>합니다. 수치는 정해진 규칙으로만
          셉니다.
        </Note>

        <Undecided>
          교수 제출용과 팀 내부용을 나눌지, 미확인 항목을 제출본에 넣을지가 정해지지 않았습니다. 제출 전{" "}
          <b>팀원 전원 동의</b>를 받을지도 확인이 필요합니다.
        </Undecided>
      </Body>

      <Dock>
        <Btn
          full
          size="lg"
          icon="file-down"
          // TODO(서버): 실제 PDF 생성과 전원 동의 요청은 서버가 한다.
          onClick={() => setToast(`팀원 ${team.memberCount}명에게 제출 동의를 요청했습니다`)}
        >
          PDF 만들기
        </Btn>
      </Dock>

      <Toast msg={toast} />
    </>
  );
}

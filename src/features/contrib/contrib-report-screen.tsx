"use client";

import { useRouter } from "next/navigation";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Dock,
  Note,
  Undecided,
} from "@/components/ui";
import type { ContribReportRow, Team } from "@/lib/types";
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
  rows,
  issuedOn,
}: {
  team: Team;
  /** 서버가 16·17 과 같은 표에서 센 줄. 화면은 세지 않는다. */
  rows: ContribReportRow[];
  /** 서버에서 만든 발행일. 화면에서 만들면 서버 렌더와 어긋난다. */
  issuedOn: string;
}) {
  const router = useRouter();

  return (
    <>
      <AppBar
        title="리포트 미리 보기"
        sub="4 / 4단계"
        onBack={() => router.push("/team/contrib/members")}
      />

      <Body dense>
        <StepRail at={3} />

        {/* 제출물 미리 보기 — 앱 색이 아니라 문서 색을 쓴다.
            넓은 화면에서는 A4 비율(1:1.414)을 최소 높이로 잡아 인쇄했을 때의 모습에 가깝게 보여 준다.
            내용이 더 길면 늘어난다 — 비율을 지키려고 내용을 자르지는 않는다. */}
        <div
          data-print-doc
          className="mb-3.5 rounded-control border border-line bg-white px-4 py-[18px] lg:mx-auto lg:min-h-[792px] lg:w-[560px] lg:px-8 lg:py-10"
        >
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
          <b>팀원 전원 동의</b>를 받을지도 확인이 필요합니다 — 정해지기 전이라 동의 요청은 만들지 않았고,
          “PDF로 저장”은 지금 보이는 문서를 그대로 저장만 합니다. 팀 밖(교수)에게 보낼 공개 링크도 같은
          이유로 두지 않았습니다.
        </Undecided>
      </Body>

      <Dock>
        {/* 브라우저 인쇄의 "PDF로 저장"을 쓴다 — 무엇이 종이에 남는지는 globals.css 의
            인쇄 규칙(data-print-doc)이 정한다. 저장된 PDF 가 곧 공유 수단이다. */}
        <Btn
          full
          size="lg"
          icon="file-down"
          onClick={() => printAs(`팀 기여 기록 - ${team.name} - ${issuedOn}`)}
        >
          PDF로 저장
        </Btn>
      </Dock>
    </>
  );
}

/**
 * 문서 제목을 잠깐 바꿔 인쇄한다.
 *
 * 브라우저는 PDF 파일 이름을 `document.title` 로 제안한다 — 그대로 두면 모든 팀의 리포트가
 * "찰떡.pdf" 로 저장된다. 인쇄 창이 닫히면 되돌린다.
 */
function printAs(title: string) {
  const previous = document.title;
  document.title = title;
  window.addEventListener("afterprint", () => (document.title = previous), { once: true });
  window.print();
}

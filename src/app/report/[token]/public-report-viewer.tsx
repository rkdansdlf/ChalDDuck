"use client";

import { Btn, Icon } from "@/components/ui";
import type { PublicReportData } from "@/lib/types";

export function PublicReportViewer({ report }: { report: PublicReportData }) {
  const isProfessor = report.scope === "professor";

  const handlePrint = () => {
    const previous = document.title;
    document.title = `기여기록_리포트_${report.teamName}_${report.issuedOn}`;
    window.addEventListener("afterprint", () => (document.title = previous), { once: true });
    window.print();
  };

  return (
    <div className="min-h-screen bg-zinc-100 py-6 px-4 sm:px-6 lg:px-8 print:min-h-0 print:bg-white print:p-0">
      {/* 상단 액션 바 (인쇄 제외) */}
      <div className="mx-auto mb-6 flex max-w-[640px] items-center justify-between rounded-xl bg-white p-4 shadow-sm border border-zinc-200 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[16px] text-zinc-900">
              {report.teamName} 기여 기록 리포트
            </span>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              검증 완료
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            {report.course} · 참여 인원 {report.memberCount}명
          </p>
        </div>
        <Btn v="primary" size="sm" icon="file-down" onClick={handlePrint}>
          PDF 인쇄 / 다운로드
        </Btn>
      </div>

      {/* 리포트 문서 (인쇄 영역) */}
      <div
        data-print-doc
        className="mx-auto max-w-[640px] rounded-xl border border-zinc-200 bg-white p-8 shadow-sm lg:p-12 print:max-w-none print:border-none print:p-0 print:shadow-none"
      >
        {/* 헤더 */}
        <div className="border-b-2 border-zinc-900 pb-5">
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-block rounded bg-zinc-100 px-2 py-0.5 text-[11.5px] font-bold text-zinc-600">
                {isProfessor ? "팀 프로젝트 기여 기록 증빙서" : "팀 내부 기여 기록 점검표"}
              </span>
              <h1 className="mt-2 font-extrabold text-[22px] tracking-tight text-zinc-900">
                {report.teamName}
              </h1>
              <p className="mt-1 text-[13.5px] font-medium text-zinc-600">
                교과목: {report.course}
              </p>
            </div>
            <div className="text-right text-[12px] text-zinc-500">
              <div>발행일: {report.issuedOn}</div>
              <div>참여 팀원: {report.memberCount}명</div>
              <div className="mt-1 font-bold text-emerald-800">
                상호 합의율: {report.consensusRate}%
              </div>
            </div>
          </div>
        </div>

        {/* 요약 현황 박스 */}
        <div className="my-5 grid grid-cols-2 gap-3 rounded-lg bg-zinc-50 p-3.5 text-center sm:grid-cols-3">
          <div className="p-1">
            <div className="text-[11.5px] text-zinc-500 font-medium">총 확인 기여 실적</div>
            <div className="mt-0.5 text-[18px] font-extrabold text-emerald-700">
              {report.totalConfirmed}건
            </div>
          </div>
          <div className="p-1">
            <div className="text-[11.5px] text-zinc-500 font-medium">상호 확인율</div>
            <div className="mt-0.5 text-[18px] font-extrabold text-zinc-800">
              {report.consensusRate}%
            </div>
          </div>
          <div className="p-1 col-span-2 sm:col-span-1">
            <div className="text-[11.5px] text-zinc-500 font-medium">검증 방식</div>
            <div className="mt-0.5 text-[13px] font-bold text-zinc-700">
              전원 상호 교차 검증
            </div>
          </div>
        </div>

        {/* 팀원별 기여 내역 */}
        <div className="divide-y divide-zinc-200">
          {report.rows.map((row) => (
            <div key={row.memberId} className="py-4">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[15.5px] text-zinc-900">{row.who}</span>
                  {row.left && (
                    <span className="rounded bg-zinc-100 px-1 text-[11px] text-zinc-400">퇴장</span>
                  )}
                  <span className="text-[13px] text-zinc-500 font-medium">
                    역할: {row.role}
                  </span>
                </div>
                <span className="text-[13px] font-semibold text-emerald-700">
                  확인된 실적 {row.confirmed}건
                </span>
              </div>

              {/* 활동 지표 */}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
                {row.participations > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-zinc-700">
                    <Icon name="users-round" size={12} />
                    팀장 회의 참여 {row.participations}회
                  </span>
                )}
                {!isProfessor && row.pending > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                    미확인 {row.pending}건
                  </span>
                )}
                {!isProfessor && row.disputed > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-rose-700">
                    의견 차이 {row.disputed}건
                  </span>
                )}
              </div>

              {/* 주요 성과 하이라이트 */}
              {row.highlights && row.highlights.length > 0 && (
                <div className="mt-2.5 rounded bg-zinc-50 px-3 py-2 text-[12px] text-zinc-700">
                  <div className="font-semibold text-zinc-500 text-[11px] mb-1">교차 확인된 주요 성과</div>
                  <ul className="list-inside list-disc space-y-0.5 text-zinc-700">
                    {row.highlights.map((h, i) => (
                      <li key={i} className="truncate">{h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 공적 증빙 서약 */}
        <div className="mt-8 border-t border-zinc-300 pt-5 text-[12px] leading-relaxed text-zinc-600">
          <p className="font-semibold text-zinc-800">
            ※ 본 보고서는 팀원 상호 검증 및 교차 확인을 거친 사실 기록만을 바탕으로 공정하게 집계되었습니다.
          </p>
          <p className="mt-1 text-zinc-500">
            개인적인 평점, 친목 활동, 채팅 빈도 등 주관적 지표는 배제되었으며, 상호 합의된 역할 배정과 산출물 제출 이력에 기반합니다.
          </p>
          <div className="mt-4 flex justify-between text-[11px] text-zinc-400">
            <span>찰떡(ChalDduck) 기여 기록 공정 인증</span>
            <span>확인자: {report.teamName} 팀원 일동</span>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Btn, Icon } from "@/components/ui";

export function ReportNotice({
  status,
}: {
  status: "expired" | "revoked";
}) {
  const isExpired = status === "expired";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-[420px] rounded-2xl border border-line bg-card p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <Icon name={isExpired ? "calendar-x" : "ban"} size={28} />
        </div>

        <h1 className="font-extrabold text-[19px] tracking-tight text-txt-strong">
          {isExpired ? "공유 링크가 만료되었습니다" : "폐기된 공유 링크입니다"}
        </h1>

        <p className="mt-2.5 text-[14px] leading-relaxed text-txt-muted">
          {isExpired
            ? "기여 기록 리포트 공유 링크는 보안 및 최신 데이터 보호를 위해 발급 후 14일 동안만 유효합니다."
            : "팀 프로젝트 관리자에 의해 해당 공유 링크가 비활성화(폐기)되었습니다."}
        </p>

        <div className="mt-4 rounded-xl bg-fill p-3 text-left text-[12.5px] leading-relaxed text-txt">
          <div className="font-bold text-txt-strong mb-0.5">안내</div>
          최신 기여 현황 및 성적 증빙 자료가 필요하신 경우, 팀 프로젝트 팀장에게 새로운 공유 링크 발급을 요청해 주세요.
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Btn
            full
            v="primary"
            onClick={() => window.location.reload()}
            icon="rotate-ccw"
          >
            다시 시도
          </Btn>
        </div>

        <div className="mt-6 border-t border-line pt-4 text-[11px] text-txt-faint">
          찰떡(ChalDduck) 팀 프로젝트 공정 기여 기록 검증 시스템
        </div>
      </div>
    </div>
  );
}

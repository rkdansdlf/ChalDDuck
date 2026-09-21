"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Chip,
  Icon,
  Note,
  StatusBadge,
  Toast,
} from "@/components/ui";
import { SecTitle } from "@/components/ui";
import type { DriveLimits, SubmissionBox, Team } from "@/lib/types";

/**
 * 12 드라이브 — 역할별 제출함.
 *
 * 칸이 역할대로 나뉘어 있어 "누가 무엇을 내야 하는지"가 파일 목록만 봐도 드러난다.
 *
 * 마감이 지나도 제출함을 **잠그지 않는다** — 늦게라도 내는 편이 안 내는 것보다 낫다.
 * 대신 마감을 지난 파일에 "마감 후 제출" 라벨이 붙는다.
 */
export function DriveScreen({
  team,
  boxes,
  limits,
}: {
  team: Team;
  boxes: SubmissionBox[];
  limits: DriveLimits;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  return (
    <>
      <AppBar
        title="드라이브"
        sub={team.name}
        action="upload"
        actionLabel="파일 올리기"
        // TODO(업로드): 서버가 붙어야 실제 업로드를 붙일 수 있다.
        onAction={() => flash("파일 올리기는 아직 준비 중입니다")}
      />

      <Body dense>
        <SecTitle note="맡은 역할대로 칸이 나뉘어 있습니다">역할별 제출함</SecTitle>

        {/* 제출함은 서로 독립된 카드라 넓은 화면에서 두 줄로 세워도 읽는 순서가 깨지지 않는다 */}
        <div className="mb-[18px] grid gap-[9px] lg:grid-cols-2">
          {boxes.map((box) => {
            const empty = box.fileCount === 0;
            return (
              <button
                key={box.id}
                type="button"
                onClick={() => router.push(`/drive/${box.id}`)}
                className="box-border flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-[18px] border border-line bg-card px-[15px] py-3.5 text-left"
              >
                <span
                  className={`grid size-10 flex-none place-items-center rounded-[13px] ${
                    empty ? "bg-fill text-txt-faint" : "bg-yellow-200 text-yellow-700"
                  }`}
                >
                  <Icon name={empty ? "folder" : "folder-open"} size={19} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="t-sec keep-all block text-txt-strong">{box.name}</span>
                  <span className="mt-1.5 flex flex-wrap gap-[5px]">
                    <Chip icon="user-round">{box.owner ?? "담당자 미정"}</Chip>
                    {empty ? (
                      <StatusBadge status="none">아직 없음</StatusBadge>
                    ) : (
                      <Chip tone="ok" icon="file">
                        {box.fileCount}개
                      </Chip>
                    )}
                    <Chip tone="warn" icon="calendar-clock">
                      {box.due} 마감
                    </Chip>
                    {box.hasLate ? <StatusBadge status="late" /> : null}
                  </span>
                </span>

                <span className="flex-none text-txt-muted">
                  <Icon name="chevron-right" size={17} />
                </span>
              </button>
            );
          })}
        </div>

        <Note tone="info" icon="history" title="올린 파일은 지워지지 않습니다">
          같은 이름으로 다시 올리면 새 버전이 쌓입니다. 이전 버전은 언제든 다시 내려받을 수 있어,
          덮어쓰기로 작업이 사라지지 않습니다.
        </Note>

        <Note tone="info" icon="database" title="드라이브 이용 제한" className="mt-2.5">
          팀당 저장 용량{" "}
          <b>
            {limits.usedGB}GB / {limits.capGB}GB
          </b>{" "}
          사용 중. 허용 파일 형식은 {limits.types.join("·")}입니다. 마감 후에도 제출함은 잠그지 않고,
          마감을 지난 파일에는 &ldquo;마감 후 제출&rdquo; 라벨이 자동으로 붙습니다.
        </Note>
      </Body>

      <Toast msg={toast} />
    </>
  );
}

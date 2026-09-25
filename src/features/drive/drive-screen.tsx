"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Chip,
  Icon,
  Note,
  Rows,
  SecTitle,
  Sheet,
  StatusBadge,
  Toast,
} from "@/components/ui";
import type { DriveLimits, SubmissionBox, Team } from "@/lib/types";
import { UploadButton, uploadSummary } from "./upload-button";
import type { UploadDone } from "./use-uploads";

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
  const [picking, setPicking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * 시트에서 올리기가 끝났을 때.
   *
   * 전부 됐으면 시트를 닫고 **그 제출함으로 들어가 방금 올린 파일을 강조**한다 — 예전에는
   * 시트가 열린 채 남아 뒤에서 목록이 바뀌어도 보이지 않았다. 실패가 남았으면 시트를
   * 그대로 두어 이유와 "다시 시도"가 보이게 한다.
   */
  const afterUpload = (boxId: string) => (done: UploadDone[], failedCount: number) => {
    if (failedCount > 0) {
      const msg = uploadSummary(done);
      if (msg) {
        setToast(msg);
        window.setTimeout(() => setToast(null), 3000);
      }
      return;
    }
    if (done.length === 0) return;
    setPicking(false);
    const ids = done.map((d) => d.fileId).join(",");
    router.push(`/drive/${boxId}?uploaded=${encodeURIComponent(ids)}`);
  };

  return (
    <>
      <AppBar
        title="드라이브"
        sub={team.name}
        action="upload"
        actionLabel="파일 올리기"
        // 파일은 제출함에 들어가므로 먼저 어느 칸인지 고른다. 업로드 자체는 제출함 화면과
        // 같은 `UploadButton` 이다 — 예전에는 여기만 "준비 중"이라고 떴다.
        onAction={() => setPicking(true)}
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

      <Sheet open={picking} title="어느 제출함에 올릴까요" onClose={() => setPicking(false)}>
        {boxes.length === 0 ? (
          <Note tone="warn" icon="folder" title="아직 제출함이 없습니다">
            역할이 정해지면 역할별 제출함이 생깁니다.
          </Note>
        ) : (
          <Rows>
            {boxes.map((box) => (
              <div key={box.id} className="flex flex-wrap items-center gap-x-3 px-[15px] py-3">
                <span className="min-w-0 flex-1">
                  <span className="t-sec keep-all block text-txt-strong">{box.name}</span>
                  <span className="t-note mt-0.5 block text-txt-muted">
                    {box.owner ?? "담당자 미정"} · {box.due} 마감
                  </span>
                </span>
                <UploadButton boxId={box.id} label="여기에 올리기" onFinished={afterUpload(box.id)} />
              </div>
            ))}
          </Rows>
        )}
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}

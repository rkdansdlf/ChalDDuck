"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Icon,
  Toast,
} from "@/components/ui";
import type { DriveLimits, SubmissionBox, SubmittedFile, Team } from "@/lib/types";
import { UploadButton, uploadSummary } from "./upload-button";
import type { UploadDone } from "./use-uploads";

function getDDay(dueAt: string | null, due: string) {
  if (!dueAt) return due === "미정" ? "마감 미정" : `${due} 마감`;
  const diff = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const dDay = diff > 0 ? `D-${diff}` : diff === 0 ? "D-Day" : `D+${Math.abs(diff)}`;
  const dateStr = due.split(" ")[0] || "";
  return `${dDay} · ${dateStr} 마감`;
}

function getDDayShort(dueAt: string | null, due: string) {
  if (!dueAt) return due === "미정" ? "" : due.split(" ")[0];
  const diff = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? `D-${diff}` : diff === 0 ? "D-Day" : `D+${Math.abs(diff)}`;
}

/**
 * 12 드라이브 — 역할별/내 제출함 (개선안 Page 11).
 *
 * 상단에 내 제출함과 파일 올리기 CTA를 강조하고,
 * 하단에 팀원들의 제출함과 팀 용량 게이지를 배치한다.
 */
export function DriveScreen({
  team,
  boxes,
  limits,
  myBoxId,
  myLatestFile,
}: {
  team: Team;
  boxes: SubmissionBox[];
  limits: DriveLimits;
  myBoxId?: string | null;
  myLatestFile?: SubmittedFile | null;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const markUploading = (boxId: string, busy: boolean) => {
    setUploading((prev) => (prev[boxId] === busy ? prev : { ...prev, [boxId]: busy }));
  };

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
    const ids = done.map((d) => d.fileId).join(",");
    router.push(`/drive/${boxId}?uploaded=${encodeURIComponent(ids)}`);
  };

  const myBox = (myBoxId ? boxes.find((b) => b.id === myBoxId) : null) ?? boxes[0] ?? null;
  const teamBoxes = boxes.filter((b) => b.id !== myBox?.id);

  return (
    <>
      <AppBar title="드라이브" sub={team.name} />

      <Body dense>
        {/* 내 제출함 섹션 */}
        <div className="t-sec mb-2.5 font-bold text-txt-strong">내 제출함</div>
        {myBox ? (
          <div className="mb-5 rounded-[20px] border border-yellow-200/90 bg-yellow-50/70 p-4 shadow-2xs">
            {/* 헤더: 역할 이름 & 마감 디데이 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-[10px] bg-yellow-200/90 text-yellow-800">
                  <Icon name="folder-open" size={17} />
                </span>
                <span className="font-extrabold text-[17px] text-ink-900">{myBox.name}</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card/90 px-2.5 py-1 text-[12px] font-bold text-txt">
                <Icon name="clock" size={12} className="text-txt-muted" />
                <span>{getDDay(myBox.dueAt, myBox.due)}</span>
              </span>
            </div>

            {/* 최신 업로드 파일 */}
            {myLatestFile ? (
              <button
                type="button"
                disabled={Boolean(uploading[myBox.id])}
                onClick={() => router.push(`/drive/${myBox.id}/${myLatestFile.id}`)}
                className="my-3.5 flex w-full cursor-pointer flex-col rounded-[14px] border border-line bg-card p-3 text-left transition-all hover:border-txt-strong/30 disabled:pointer-events-none disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon name="file-text" size={16} className="flex-none text-txt-strong" />
                    <span className="truncate font-bold text-[14.5px] text-txt-strong">
                      {myLatestFile.name}
                    </span>
                  </div>
                  <span className="flex flex-none items-center gap-1 text-[12px] font-bold text-txt-muted">
                    <Icon name="history" size={12} />
                    {myLatestFile.latestLabel ?? "v1"}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-txt-muted">
                  {myLatestFile.latestWhen ?? "최근"} · 버전 {myLatestFile.versionCount}개
                </div>
              </button>
            ) : (
              <div className="my-3.5 rounded-[14px] border border-dashed border-line bg-card/50 p-4 text-center">
                <p className="t-note m-0 text-txt-muted">아직 올린 파일이 없습니다</p>
              </div>
            )}

            {/* 파일 올리기 대형 CTA 버튼 */}
            <UploadButton
              boxId={myBox.id}
              label="파일 올리기"
              variant="primary-lg"
              onFinished={afterUpload(myBox.id)}
              onBusyChange={(b) => markUploading(myBox.id, b)}
            />

            <p className="mt-2.5 mb-0 text-center text-[11.5px] leading-[1.4] text-txt-muted">
              문서·PPT·PDF·이미지 · 한 파일 50MB까지 | 같은 이름으로 올리면 새 버전으로 쌓여요
            </p>
          </div>
        ) : (
          <div className="mb-5 rounded-[18px] border border-line bg-card p-6 text-center">
            <p className="t-note m-0 text-txt-muted">아직 지정된 내 제출함이 없습니다.</p>
          </div>
        )}

        {/* 팀 제출함 섹션 */}
        <div className="t-sec mb-2.5 font-bold text-txt-strong">팀 제출함</div>
        <div className="mb-6 divide-y divide-line/60 rounded-[18px] border border-line bg-card overflow-hidden">
          {teamBoxes.length === 0 ? (
            <div className="p-4 text-center text-[13px] text-txt-muted">
              다른 팀원의 제출함이 없습니다.
            </div>
          ) : (
            teamBoxes.map((box) => (
              <button
                key={box.id}
                type="button"
                onClick={() => router.push(`/drive/${box.id}`)}
                className="flex min-h-14 w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors hover:bg-fill"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[15px] text-txt-strong">{box.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-txt-muted">
                    <span className="grid size-5.5 place-items-center rounded-full bg-yellow-100 text-[10.5px] font-bold text-yellow-800">
                      {box.owner ? box.owner.charAt(0) : "?"}
                    </span>
                    <span className="font-medium text-txt-strong">
                      {box.owner ?? "담당자 미정"}
                    </span>
                    <span>·</span>
                    <span>{box.fileCount > 0 ? `파일 ${box.fileCount}개` : "아직 없음"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[13px] font-semibold text-txt-muted">
                  <span>{getDDayShort(box.dueAt, box.due)}</span>
                  <Icon name="chevron-right" size={16} />
                </div>
              </button>
            ))
          )}
        </div>

        {/* 팀 용량 섹션 */}
        <div className="rounded-[18px] border border-line bg-card p-4">
          <div className="mb-2 flex items-center justify-between text-[13.5px]">
            <span className="font-bold text-txt-strong">팀 용량</span>
            <span className="font-medium text-txt-muted">
              {limits.usedGB} / {limits.capGB}GB
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-fill overflow-hidden">
            <div
              className="h-full rounded-full bg-txt-strong transition-all"
              style={{
                width: `${Math.min(100, Math.round((limits.usedGB / (limits.capGB || 2)) * 100))}%`,
              }}
            />
          </div>
        </div>
      </Body>

      <Toast msg={toast} />
    </>
  );
}

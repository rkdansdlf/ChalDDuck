"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Icon,
  Panel,
  Rows,
  Sheet,
  StatusBadge,
  Toast,
  Undecided,
} from "@/components/ui";
import type { FileVersion, SubmissionBox, SubmittedFile } from "@/lib/types";
import { restoreFileVersion } from "@/server/actions/drive";
import { downloadVersion } from "./file-display";
import { canOpenInApp } from "./file-rules";
import { nextVersionLabel } from "./version-label";

/**
 * 22 파일 열람·복원.
 *
 * 앱 안에서 열리는 건 이미지와 PDF 다. PDF 는 뷰어를 만들지 않고 **브라우저 내장 뷰어**에
 * 맡긴다(2026-09-25 결정). 휴대폰 사파리는 iframe 안의 PDF 를 첫 장만 보여 주기도 해서
 * "새 탭에서 열기"를 늘 함께 둔다. PPT·DOCX 는 "미지원 형식 · 다운로드" 안내만 한다 —
 * **열리는 척하는 빈 화면보다 못 연다고 말하는 편이 낫다.**
 *
 * 옛 버전도 내려받을 수 있다. 복원하지 않고 내용만 확인하고 싶을 때가 더 많다.
 *
 * 복원은 **덮어쓰기가 아니라 새 버전 추가**다. 되돌려도 그 사이 작업이 사라지지 않는다.
 */
export function FileViewScreen({
  box,
  file,
  versions,
  versionId,
  previewUrl,
}: {
  box: SubmissionBox;
  file: SubmittedFile;
  versions: FileVersion[];
  versionId: string;
  /**
   * 이 버전을 화면에 그릴 수 있는 주소. 서버가 만들어 넘긴다 — 비공개 버킷이라
   * 서명된 주소를 그때그때 만들어야 하고, 그 일은 서버에서만 할 수 있다.
   */
  previewUrl: string | null;
}) {
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [restoredAs, setRestoredAs] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const current = versions.find((v) => v.id === versionId) ?? versions[0] ?? null;

  if (!current) {
    return (
      <>
        <AppBar title="파일 없음" sub={box.name} onBack={() => router.push(`/drive/${box.id}/${file.id}`)} />
        <Body dense>
          <Panel s="fill" pad={16}>
            <p className="t-note keep-all m-0 text-center text-txt-muted">
              이 제출함에는 아직 올라온 파일이 없습니다.
            </p>
          </Panel>
        </Body>
      </>
    );
  }

  const isLatest = versions[0]?.id === current.id;
  const canPreview = previewUrl !== null;
  // 열 수 있는 형식인데 주소가 없으면 형식 탓이 아니라 파일이 없는 것이다(시드 데이터·저장소 미연결).
  const noFile = !canPreview && canOpenInApp(current.kind);
  const nextLabel = nextVersionLabel(versions);

  const restore = async () => {
    // 이름은 서버가 붙인다 — 두 사람이 동시에 복원해도 같은 이름이 두 번 생기지 않아야 한다.
    setRestoring(true);
    try {
      const label = await restoreFileVersion(file.id, current.id);
      setConfirming(false);
      setRestoredAs(label);
      router.refresh();
    } catch {
      setConfirming(false);
      flash("복원하지 못했습니다. 잠시 후 다시 시도해 주세요");
    } finally {
      setRestoring(false);
    }
  };

  const download = async () => {
    if (!(await downloadVersion(current.id))) flash("이 버전에는 내려받을 파일이 없습니다");
  };

  const openInNewTab = () => {
    if (previewUrl) window.open(previewUrl, "_blank", "noopener");
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  return (
    <>
      <AppBar
        title={`${current.label} 미리보기`}
        sub={box.name}
        onBack={() => router.push(`/drive/${box.id}/${file.id}`)}
      />

      <Body dense>
        {restoredAs ? (
          <Panel s="yellow" pad={20} className="mb-4 text-center">
            <div
              className="mb-2.5 inline-flex size-[52px] items-center justify-center rounded-full text-yellow-700"
              style={{ background: "rgba(255,255,255,.75)" }}
            >
              <Icon name="check" size={24} />
            </div>
            <div className="keep-all font-extrabold text-[17px] leading-[1.35] text-ink-900">
              {current.label}의 내용을 {restoredAs}로 추가했습니다
            </div>
            <div className="keep-all mt-1.5 font-medium text-[13.5px] leading-[1.5] text-yellow-700">
              기존 버전은 지워지지 않았습니다
            </div>
            <Btn full size="lg" className="mt-3.5" onClick={() => router.push(`/drive/${box.id}/${file.id}`)}>
              버전 목록으로
            </Btn>
          </Panel>
        ) : (
          <>
            {canPreview && current.kind === "pdf" ? (
              <div className="mb-4 overflow-hidden rounded-[18px] border border-line bg-fill">
                <iframe
                  src={previewUrl}
                  title={`${file.name} ${current.label}`}
                  className="block h-[50vh] min-h-[320px] w-full border-none lg:h-[68vh]"
                />
              </div>
            ) : canPreview ? (
              <div className="mb-4 overflow-hidden rounded-[18px] border border-line bg-fill">
                <Image
                  src={previewUrl}
                  alt={current.note}
                  width={390}
                  height={260}
                  className="block max-h-[260px] w-full object-contain"
                />
              </div>
            ) : (
              <div
                className="mb-4 flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[18px] border border-line"
                style={{
                  background:
                    "repeating-linear-gradient(135deg,var(--fill) 0 10px,var(--card) 10px 20px)",
                }}
              >
                <span className="text-txt-faint">
                  <Icon name="file-x" size={30} />
                </span>
                <span className="font-bold text-[13px] leading-[1.4] text-ink-600">
                  {noFile ? "열 수 있는 파일이 없습니다" : `미지원 형식(.${current.kind})`}
                </span>
                <span className="keep-all px-6 text-center font-medium text-[12px] leading-[1.5] text-txt-faint">
                  {noFile
                    ? "이 버전에는 저장된 파일이 없어 미리 볼 수 없습니다"
                    : "앱에서 열 수 없는 형식입니다 · 내려받아서 열어 주세요"}
                </span>
              </div>
            )}

            <Rows className="mb-4">
              <div className="px-[15px] py-[13px]">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-lg px-[9px] py-1 font-mono font-bold text-[14px] leading-none ${
                      isLatest ? "bg-ink-700 text-on-action" : "bg-fill text-txt-muted"
                    }`}
                  >
                    {current.label}
                  </span>
                  {isLatest ? <StatusBadge status="done">현재 최신 버전</StatusBadge> : null}
                  {current.isLate ? <StatusBadge status="late" /> : null}
                  {canPreview ? (
                    <Chip tone="ok" icon="eye">
                      {current.kind === "pdf" ? "PDF" : "이미지"} · 앱에서 열람
                    </Chip>
                  ) : noFile ? (
                    <Chip icon="file-x">파일 없음</Chip>
                  ) : (
                    <Chip icon="file-x">미지원 형식</Chip>
                  )}
                </div>
                <div className="keep-all font-medium text-[14.5px] leading-[1.5] text-txt-strong">
                  {current.note}
                </div>
                <div className="mt-1 font-medium text-[13px] leading-[1.45] text-txt-muted">
                  {current.author} · {current.when} · {current.size}
                </div>
              </div>
            </Rows>

            {/* 채운 버튼은 복원 하나뿐이다. 내려받기·새 탭은 옛 버전에서도 보조 동작으로 둔다. */}
            {!isLatest ? (
              <Btn full size="lg" icon="rotate-ccw" onClick={() => setConfirming(true)}>
                이 버전으로 복원하기
              </Btn>
            ) : null}
            <div className={`flex gap-2 ${isLatest ? "" : "mt-2"}`}>
              <Btn full size={isLatest ? "lg" : "md"} v="outline" icon="download" onClick={download}>
                {isLatest ? "다운로드" : "이 버전 내려받기"}
              </Btn>
              {canPreview ? (
                <Btn full size={isLatest ? "lg" : "md"} v="outline" icon="external-link" onClick={openInNewTab}>
                  새 탭에서 열기
                </Btn>
              ) : null}
            </div>

            <Undecided>
              복원 권한이 올린 사람에게만 있는지가 기획안에 없어 누구나 할 수 있게 열어뒀습니다.
            </Undecided>
          </>
        )}
      </Body>

      <Sheet open={confirming} title="이 버전으로 복원할까요" onClose={() => setConfirming(false)}>
        <p className="text-pretty-keep m-0 mb-4 text-[14.5px] leading-[1.6] text-txt">
          {current.label}의 내용을 <b>새 버전({nextLabel})</b>으로 맨 위에 추가합니다. 지금 최신 버전을
          포함해 기존 버전은 지워지지 않습니다.
        </p>
        <div className="flex gap-2">
          <Btn full v="outline" disabled={restoring} onClick={() => setConfirming(false)}>
            취소
          </Btn>
          <Btn full disabled={restoring} onClick={restore}>
            {restoring ? "복원하는 중" : "복원하기"}
          </Btn>
        </div>
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Icon,
  IconButton,
  Note,
  Panel,
  Rows,
  SecTitle,
  StatusBadge,
  Toast,
} from "@/components/ui";
import type { FileVersion, SubmissionBox, SubmittedFile } from "@/lib/types";
import { downloadVersion } from "./file-display";
import { UploadButton } from "./upload-button";

/**
 * 13 파일 버전 기록.
 *
 * 누가 언제 무엇을 바꿨는지가 남는다. 이 기록은 **기여도 리포트의 근거**로도 쓰이므로
 * 표시되는 이름·시각은 꾸미지 않고 올라온 그대로 보여 준다.
 *
 * 최신 버전은 플래그가 아니라 **목록의 첫 항목**으로 정한다.
 */
export function VersionsScreen({
  box,
  file,
  versions,
}: {
  box: SubmissionBox;
  file: SubmittedFile;
  versions: FileVersion[];
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);

  const latest = versions[0] ?? null;

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  const download = async (version: FileVersion) => {
    if (!(await downloadVersion(version.id))) flash("이 버전에는 내려받을 파일이 없습니다");
  };

  return (
    <>
      <AppBar
        title={file.name}
        sub={box.name}
        onBack={() => router.push(`/drive/${box.id}`)}
        action="download"
        actionLabel="최신 버전 내려받기"
        onAction={() => (latest ? download(latest) : flash("내려받을 파일이 없습니다"))}
      />

      <Body dense>
        {latest ? (
          <Panel s="yellow" pad={14} r={16} className="mb-4">
            <div className="flex items-center gap-[11px]">
              <span
                className="grid size-[38px] flex-none place-items-center rounded-xl text-yellow-700"
                style={{ background: "rgba(255,255,255,.75)" }}
              >
                <Icon name="file-check-2" size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[15px] leading-[1.35] text-ink-900">
                  최신 버전은 {latest.label}
                </span>
                <span className="mt-0.5 block font-medium text-[13px] leading-[1.4] text-yellow-700">
                  {latest.author} · {latest.when}
                </span>
              </span>
            </div>
          </Panel>
        ) : null}

        <SecTitle note="누가 언제 무엇을 바꿨는지 남습니다">버전 {versions.length}개</SecTitle>

        {versions.length > 0 ? (
          <Rows>
            {versions.map((version, index) => {
              const isLatest = index === 0;
              return (
                <div key={version.id} className="flex min-h-[56px] items-start gap-3 px-[15px] py-[13px]">
                  <span
                    className={`mt-0.5 grid h-[26px] min-w-[38px] flex-none place-items-center rounded-lg px-1.5 font-mono font-bold text-[13px] leading-none ${
                      isLatest ? "bg-ink-700 text-on-action" : "bg-fill text-txt-muted"
                    }`}
                  >
                    {version.label}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="text-pretty-keep block font-medium text-[14.5px] leading-[1.5] text-txt-strong">
                      {version.note}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-[5px]">
                      <span className="font-medium text-[13px] leading-[1.45] text-txt-muted">
                        {version.author} · {version.when} · {version.size}
                      </span>
                      {isLatest ? <StatusBadge status="done">최신 버전</StatusBadge> : null}
                      {version.isLate ? <StatusBadge status="late" /> : null}
                    </span>
                  </span>

                  <IconButton
                    icon="eye"
                    label={`${version.label} 열기`}
                    onClick={() => router.push(`/drive/${box.id}/${file.id}/${version.id}`)}
                  />
                  <IconButton icon="download" label={`${version.label} 내려받기`} onClick={() => download(version)} />
                </div>
              );
            })}
          </Rows>
        ) : (
          <Panel s="fill" pad={16}>
            <p className="t-note keep-all m-0 text-center text-txt-muted">
              아직 올라온 버전이 없습니다. 올리면 여기에 기록이 쌓입니다.
            </p>
          </Panel>
        )}

        <div className="mt-3.5">
          {/* 이름이 달라도 이 파일의 새 버전으로 쌓인다 — 버튼이 그렇게 약속하므로. */}
          <UploadButton boxId={box.id} fileId={file.id} label="이 파일의 새 버전 올리기" dropzone askNote />
        </div>

        <Note tone="info" icon="clipboard-list" className="mt-3.5">
          이 기록은 <b>기여도 리포트의 근거</b>로도 쓰입니다. 본인 확인을 거친 항목만 리포트에 올라갑니다.
        </Note>


      </Body>

      <Toast msg={toast} />
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Icon,
  Note,
  Panel,
  Rows,
  SecTitle,
  StatusBadge,
  Toast,
} from "@/components/ui";
import type { FileVersion, SubmissionBox, SubmittedFile } from "@/lib/types";
import { getDownloadUrl } from "@/server/actions/drive";
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

  /**
   * 내려받기.
   *
   * 버킷이 비공개라 주소를 미리 들고 있을 수 없다 — 누를 때마다 서버에서 짧게 사는
   * 서명된 주소를 받아 연다.
   */
  const download = async (version: FileVersion) => {
    const url = await getDownloadUrl(version.id);
    if (!url) {
      flash("이 버전에는 내려받을 파일이 없습니다");
      return;
    }
    window.location.href = url;
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
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => router.push(`/drive/${box.id}/${file.id}/${version.id}`)}
                    aria-label={`${version.label} 열기`}
                    className="grid size-11 flex-none cursor-pointer place-items-center rounded-xl border-none bg-transparent text-txt-muted"
                  >
                    <Icon name="eye" size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => download(version)}
                    aria-label={`${version.label} 내려받기`}
                    className="grid size-11 flex-none cursor-pointer place-items-center rounded-xl border-none bg-transparent text-txt-muted"
                  >
                    <Icon name="download" size={17} />
                  </button>
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
          <UploadButton boxId={box.id} label="이 파일의 새 버전 올리기" />
        </div>

        <Note tone="info" icon="clipboard-list" className="mt-3.5">
          이 기록은 <b>기여도 리포트의 근거</b>로도 쓰입니다. 본인 확인을 거친 항목만 리포트에 올라갑니다.
        </Note>


      </Body>

      <Toast msg={toast} />
    </>
  );
}

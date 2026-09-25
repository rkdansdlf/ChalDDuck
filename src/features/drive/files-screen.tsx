"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar, Body, Chip, Icon, IconButton, Note, Panel, Rows, SecTitle, StatusBadge, Toast } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SubmissionBox, SubmittedFile } from "@/lib/types";
import { KIND_ICON, downloadVersion } from "./file-display";
import { UploadButton, uploadSummary } from "./upload-button";

/**
 * 제출함 안의 파일 목록.
 *
 * 핸드오프 33개 화면에 없던 화면이다. 프로토타입은 제출함에 파일이 **하나뿐**이라고
 * 보고 제출함을 열면 곧장 버전 기록으로 들어갔는데, 실제로 올릴 수 있게 되면 한 제출함에
 * 발표자료와 대본이 같이 들어간다. 그때 버전 기록으로 바로 보내면 어느 파일의 역사인지
 * 알 수 없다.
 *
 * 새 화면이라 어휘를 지어내지 않고 드라이브·버전 기록이 쓰던 `Rows`·`StatusBadge` 를
 * 그대로 쓴다.
 *
 * 방금 올린 파일은 줄 배경과 "방금 올림" 라벨로 표시한다 — 올리고 나서 목록 어디에
 * 들어갔는지 눈으로 찾지 않아도 되게. 드라이브 첫 화면에서 올리고 넘어온 경우에는
 * 주소의 `?uploaded=` 로 받는다.
 */
export function FilesScreen({
  box,
  files,
  justUploaded = [],
}: {
  box: SubmissionBox;
  files: SubmittedFile[];
  /** 방금 올린 파일 id. */
  justUploaded?: string[];
}) {
  const router = useRouter();
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set(justUploaded));
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string | null) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const download = async (versionId: string) => {
    if (!(await downloadVersion(versionId))) flash("이 버전에는 내려받을 파일이 없습니다");
  };

  return (
    <>
      <AppBar title={box.name} sub={`${box.owner ?? "담당자 미정"} · ${box.due} 마감`} onBack={() => router.push("/drive")} />

      <Body dense>
        <SecTitle note="이름을 누르면 버전 기록, 오른쪽에서 바로 열기·내려받기">파일 {files.length}개</SecTitle>

        {files.length > 0 ? (
          <Rows className="mb-3.5">
            {files.map((file) => (
              // 줄 전체를 버튼 하나로 두면 안에 "열기"·"내려받기"를 넣을 수 없다(버튼 안의 버튼).
              // 그래서 이름 쪽은 버전 기록으로 가는 버튼, 오른쪽은 따로 누르는 버튼 둘이다.
              <div
                key={file.id}
                className={cn("flex min-h-[56px] items-center gap-1 pr-1.5", fresh.has(file.id) ? "bg-yellow-50" : "")}
              >
                <button
                  type="button"
                  onClick={() => router.push(`/drive/${box.id}/${file.id}`)}
                  aria-label={`${file.name} 버전 기록`}
                  className="box-border flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-none bg-transparent py-[13px] pl-[15px] text-left"
                >
                  <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-fill text-txt-muted">
                    <Icon name={KIND_ICON[file.kind]} size={18} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="text-pretty-keep block font-semibold text-[14.5px] leading-[1.4] text-txt-strong">
                      {file.name}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-[5px]">
                      {fresh.has(file.id) ? <StatusBadge status="done">방금 올림</StatusBadge> : null}
                      {file.latestLabel ? (
                        <>
                          <Chip icon="history">
                            {file.latestLabel} · 버전 {file.versionCount}개
                          </Chip>
                          <Chip icon="user-round">{file.latestBy}</Chip>
                          <Chip icon="calendar-clock">{file.latestWhen}</Chip>
                        </>
                      ) : (
                        <Chip tone="warn" icon="circle-dashed">
                          아직 올라온 버전이 없습니다
                        </Chip>
                      )}
                      {file.hasLate ? <StatusBadge status="late">마감 후 제출</StatusBadge> : null}
                    </span>
                  </span>
                </button>

                {file.latestVersionId ? (
                  <>
                    <IconButton
                      icon="eye"
                      label={`${file.name} 최신 버전 바로 열기`}
                      onClick={() => router.push(`/drive/${box.id}/${file.id}/${file.latestVersionId}`)}
                    />
                    <IconButton
                      icon="download"
                      label={`${file.name} 최신 버전 내려받기`}
                      onClick={() => download(file.latestVersionId!)}
                    />
                  </>
                ) : null}
              </div>
            ))}
          </Rows>
        ) : (
          <Panel s="fill" pad={16} className="mb-3.5">
            <p className="t-note keep-all m-0 text-center text-txt-muted">
              아직 올라온 파일이 없습니다. 아래에서 올리면 여기에 쌓입니다.
            </p>
          </Panel>
        )}

        {/* 새 파일을 올린다. 같은 이름이면 새 파일이 아니라 그 파일의 새 버전이 된다. */}
        <UploadButton
          boxId={box.id}
          label="새 파일 올리기"
          dropzone
          onFinished={(done) => {
            if (done.length === 0) return;
            setFresh(new Set(done.map((d) => d.fileId)));
            flash(uploadSummary(done));
          }}
        />

        <Note tone="info" icon="rotate-ccw" className="mt-3.5">
          같은 이름으로 다시 올리면 <b>덮어쓰지 않고 새 버전이 쌓입니다.</b> 이전 버전은 언제든
          다시 내려받을 수 있습니다.
        </Note>
      </Body>

      <Toast msg={toast} />
    </>
  );
}

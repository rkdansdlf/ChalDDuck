"use client";

import { useRouter } from "next/navigation";
import { AppBar, Body, Chip, Icon, Note, Panel, Rows, SecTitle, StatusBadge } from "@/components/ui";
import type { SubmissionBox, SubmittedFile } from "@/lib/types";
import { UploadButton } from "./upload-button";

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
 */
export function FilesScreen({
  box,
  files,
}: {
  box: SubmissionBox;
  files: SubmittedFile[];
}) {
  const router = useRouter();

  return (
    <>
      <AppBar title={box.name} sub={`${box.owner} · ${box.due} 마감`} onBack={() => router.push("/drive")} />

      <Body dense>
        <SecTitle note="파일을 누르면 버전 기록이 열립니다">파일 {files.length}개</SecTitle>

        {files.length > 0 ? (
          <Rows className="mb-3.5">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => router.push(`/drive/${box.id}/${file.id}`)}
                className="box-border flex min-h-[56px] w-full cursor-pointer items-center gap-3 border-none bg-transparent px-[15px] py-[13px] text-left"
              >
                <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-fill text-txt-muted">
                  <Icon name={file.kind === "image" ? "file-check-2" : "file-x"} size={18} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-pretty-keep block font-semibold text-[14.5px] leading-[1.4] text-txt-strong">
                    {file.name}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-[5px]">
                    {file.latestLabel ? (
                      <>
                        <Chip icon="file-check-2">
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

                <span className="flex-none text-txt-muted">
                  <Icon name="chevron-right" size={17} />
                </span>
              </button>
            ))}
          </Rows>
        ) : (
          <Panel s="fill" pad={16} className="mb-3.5">
            <p className="t-note keep-all m-0 text-center text-txt-muted">
              아직 올라온 파일이 없습니다. {box.owner}님이 올리면 여기에 쌓입니다.
            </p>
          </Panel>
        )}

        {/* 새 파일을 올린다. 같은 이름이면 새 파일이 아니라 그 파일의 새 버전이 된다. */}
        <UploadButton boxId={box.id} label="새 파일 올리기" />

        <Note tone="info" icon="rotate-ccw" className="mt-3.5">
          같은 이름으로 다시 올리면 <b>덮어쓰지 않고 새 버전이 쌓입니다.</b> 이전 버전은 언제든
          다시 내려받을 수 있습니다.
        </Note>
      </Body>
    </>
  );
}

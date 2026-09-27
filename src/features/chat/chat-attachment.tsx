"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChatAttachment as Attachment, SharedDriveFile } from "@/lib/types";
import { getChatAttachmentUrl } from "@/server/actions/chat";

/**
 * 말풍선 안의 첨부.
 *
 * 저장소가 비공개라 주소를 메시지에 실어 두지 않는다 — 이미지는 말풍선이 그려질 때,
 * 파일은 누를 때 서버가 짧게 사는 서명 주소를 새로 만든다. 아직 보내는 중인 말풍선
 * (`sent` 가 false)은 서버에 없으니 이름과 크기만 보여 준다.
 */
export function ChatAttachment({
  messageId,
  attachment,
  sent,
  mine,
  onSaveToDrive,
}: {
  messageId: string;
  attachment: Attachment;
  sent: boolean;
  mine: boolean;
  /** 이 첨부를 드라이브에 올리는 동작. 단톡방에서만 받는다(DM 은 첨부를 두지 않는다). */
  onSaveToDrive?: () => void;
}) {
  return (
    <>
      {attachment.image && sent ? (
        <ChatImage messageId={messageId} attachment={attachment} />
      ) : (
        <ChatFile messageId={messageId} attachment={attachment} sent={sent} mine={mine} />
      )}
      <DriveRow attachment={attachment} sent={sent} onSaveToDrive={onSaveToDrive} />
    </>
  );
}

/**
 * 첨부 아래 한 줄 — 드라이브와 이어진 자리.
 *
 * 이미 올린 첨부에는 버튼 대신 **길**을 보여 준다. 같은 바이트를 두 번 올리면 팀 용량에
 * 두 번 세어지므로 다시 만들지 않는다. 누르면 그 버전이 있는 드라이브로 간다.
 */
function DriveRow({
  attachment,
  sent,
  onSaveToDrive,
}: {
  attachment: Attachment;
  sent: boolean;
  onSaveToDrive?: () => void;
}) {
  // 보내는 중인 말풍선에는 아직 서버에 저장이 없다 — 올릴 수도, 이미 올렸다고 할 수도 없다.
  if (!sent) return null;

  if (attachment.savedHref) {
    return (
      <a
        href={attachment.savedHref}
        className="t-cap mt-1 inline-flex items-center gap-1 rounded-lg bg-fill px-2 py-1 font-semibold text-txt-muted no-underline"
      >
        <Icon name="folder-open" size={12} />
        드라이브에 있음
      </a>
    );
  }

  if (!onSaveToDrive) return null;

  return (
    <button
      type="button"
      onClick={onSaveToDrive}
      className="t-cap mt-1 inline-flex cursor-pointer items-center gap-1 rounded-lg bg-fill px-2 py-1 font-semibold text-txt-muted"
    >
      <Icon name="upload" size={12} />
      드라이브에 올리기
    </button>
  );
}

/**
 * 드라이브에서 공유한 파일 카드(14).
 *
 * 첨부와 **확연히 다른 카드**로 그린다 — 공유는 "이 파일을 올렸다"가 아니라 "이 파일을
 * 가리킨다"이기 때문이다. 누르면 드라이브의 그 버전으로 가고, 거기서 실제 파일을 연다.
 * 여기서 미리보기로 그리지 않는다: 공유 카드는 40개짜리 대화 한 장마다 그려지는데,
 * 이미지마다 저장소에 서명 주소를 새로 받으면 대화 한 번 열 때 요청이 수십 개 나간다.
 */
export function SharedDriveCard({ file }: { file: SharedDriveFile }) {
  return (
    <a
      href={file.href}
      className="box-border flex min-h-[52px] w-full max-w-[280px] items-center gap-2.5 rounded-2xl border border-line bg-card px-3 py-2.5 no-underline"
    >
      <span className="grid size-9 flex-none place-items-center rounded-xl bg-fill text-txt-muted">
        <Icon name={file.kind === "image" ? "file-image" : "file-text"} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-label block truncate text-txt-strong">{file.name}</span>
        <span className="t-cap block text-txt-muted">
          {file.label} · {file.size} · 드라이브에서 열기
        </span>
      </span>
      <Icon name="external-link" size={14} className="flex-none text-txt-faint" />
    </a>
  );
}

function ChatImage({ messageId, attachment }: { messageId: string; attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getChatAttachmentUrl(messageId)
      .then((signed) => {
        if (!alive) return;
        if (signed) setUrl(signed);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [messageId]);

  if (failed) return <ChatFile messageId={messageId} attachment={attachment} sent mine={false} />;

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      aria-label={`${attachment.name} 크게 보기`}
      className="block overflow-hidden rounded-2xl border border-line bg-fill"
    >
      {url ? (
        // 서명 주소는 저장소 도메인이라 next/image 최적화를 거치지 않는다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={attachment.name} className="block max-h-[280px] w-auto max-w-full object-contain" />
      ) : (
        <span className="grid h-[140px] w-[200px] max-w-full place-items-center text-txt-faint">
          <Icon name="file-image" size={22} />
        </span>
      )}
    </a>
  );
}

function ChatFile({
  messageId,
  attachment,
  sent,
  mine,
}: {
  messageId: string;
  attachment: Attachment;
  sent: boolean;
  mine: boolean;
}) {
  const [failed, setFailed] = useState(false);

  // 새 창은 누른 순간에 먼저 연다 — 서버 응답 뒤에 열면 브라우저가 팝업으로 막는다.
  const open = async () => {
    if (!sent) return;
    const tab = window.open("", "_blank");
    const url = await getChatAttachmentUrl(messageId).catch(() => null);
    if (url && tab) {
      tab.location.href = url;
      setFailed(false);
    } else {
      tab?.close();
      setFailed(true);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={!sent}
      className={cn(
        "box-border flex min-h-[52px] w-full max-w-[280px] items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left",
        mine ? "border border-transparent bg-yellow-300" : "border border-line bg-card",
        sent ? "cursor-pointer" : "cursor-default",
      )}
    >
      <span className="grid size-9 flex-none place-items-center rounded-xl bg-fill text-txt-muted">
        <Icon name={attachment.image ? "file-image" : "file-text"} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-label block truncate text-txt-strong">{attachment.name}</span>
        <span className="t-cap block text-txt-muted">
          {failed ? "열지 못했습니다 — 다시 눌러 주세요" : sent ? `${attachment.size} · 눌러서 열기` : attachment.size}
        </span>
      </span>
    </button>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppBar, Body, Btn, Icon, Note, Sheet, Toast, Undecided } from "@/components/ui";
import type { ChatMessage, Member, SubmissionBox, Team } from "@/lib/types";
import { useAction } from "@/lib/use-action";
import { TEAM_THREAD_ID } from "@/lib/types";
import { ACCEPT } from "@/features/drive/file-rules";
import { useMe } from "@/features/onboarding/use-me";
import { handOffToCushion } from "@/features/tools/cushion-handoff";
import { setNavBadges } from "@/components/nav-badges-store";
import { saveChatAttachmentToDrive } from "@/server/actions/drive";
import { pollNavBadges } from "@/server/actions/nav";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { useChatThread, useLoadOlderOnScroll, useStickToBottom } from "./use-chat-thread";

/** 첨부를 드라이브에 올릴 때 실패한 이유를 사람 말로. */
const SAVE_FAIL: Record<string, string> = {
  "over-quota": "팀 저장 용량(2GB)이 부족합니다. 드라이브에서 공간을 확인해 주세요",
  "kind-mismatch": "같은 제출함에 같은 이름의 파일이 다른 형식으로 이미 있습니다",
  "too-big": "한 파일은 50MB까지만 올릴 수 있습니다",
  "empty": "저장소에 들어온 파일이 비어 있습니다",
  "missing": "이 첨부는 이제 없거나 내 팀 것이 아닙니다",
  "not-configured": "파일 저장소가 연결되어 있지 않습니다",
  "bad-type": "드라이브에 올릴 수 없는 형식입니다",
};

/**
 * 19 팀플 단톡방.
 *
 * 팀 전체가 보는 대화방 하나. 쿠션 번역기로 다듬어 보낸 말에는 **표시가 남는다** —
 * 다듬었다는 사실을 숨기면 받는 사람이 원문을 오해할 수 있다.
 */
export function TeamChatScreen({
  team,
  messages: fromServer,
  initialCursor,
  me: fromRoster,
  boxes,
}: {
  team: Team;
  messages: ChatMessage[];
  initialCursor: string | null;
  me: Member | undefined;
  /** 드라이브 제출함 목록 — 첨부를 올릴 곳을 고르는 데 쓴다(14). */
  boxes: SubmissionBox[];
}) {
  const router = useRouter();
  const me = useMe(fromRoster);
  const { messages, send, sendFile, retry, hasMore, isLoadingMore, loadOlder } = useChatThread(
    TEAM_THREAD_ID,
    fromServer,
    initialCursor,
    me,
  );
  const { toast, flash, run } = useAction();

  const [picking, setPicking] = useState<ChatMessage | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useLoadOlderOnScroll(scrollRef, topRef, hasMore, loadOlder);

  // 새 말이 오면 맨 아래로 — 과거 메시지를 앞에 붙였을 때나 위로 올려 읽는 중일
  // 때는 움직이지 않는다.
  const { stick } = useStickToBottom(scrollRef, bottomRef, messages.at(-1)?.id);

  /** 고른 제출함에 이 첨부를 올린다. 같은 첨부는 두 번 올리지 않는다(서버가 막는다). */
  const saveTo = async (box: SubmissionBox) => {
    if (!picking) return;
    const target = picking;
    setPicking(null);

    // `run` 은 예외 문구를 버리고 `fail` 만 보여 준다(운영 빌드는 서버 오류 문구도 지운다).
    // 그래서 **거절은 예외가 아니라 정상 응답**으로 돌려주고 사람이 읽을 말을 직접 띄운다.
    // 진짜 실패(서버가 죽었을 때)만 `fail` 로 간다 — 그때는 원인을 알 수 없으니 일반 말이 맞다.
    let versionCreated = false;
    const survived = await run(
      `save-${target.id}`,
      async () => {
        const result = await saveChatAttachmentToDrive(target.id, box.id);
        if (result.status === "already-saved") return flash("이미 드라이브에 있습니다");
        if (result.status !== "ok") return flash(SAVE_FAIL[result.status] ?? "드라이브에 올리지 못했습니다");
        versionCreated = true;
        return flash(`${box.name} · ${result.label}으로 올렸습니다`);
      },
      "드라이브에 올리지 못했습니다. 잠시 후 다시 시도해 주세요",
    );

    // 드라이브에 버전이 하나 늘었다. **내가 올렸어도** 드라이브 배지가 오를 수 있다 — 팀원이
    // 단톡방에 올린 파일을 내가 올린 것이면 그 버전의 주인이 나 자신이 아니기 때문이다.
    // 다음 폴링까지 30초를 기다리지 않게 지금 다시 센다.
    if (survived && versionCreated) pollNavBadges().then(setNavBadges).catch(() => {});
  };

  return (
    <>
      <AppBar
        title={team.name}
        sub={`${team.memberCount}명 · 단체 채팅방 1개`}
        onBack={() => router.push("/chat")}
        hideBackOnWide
        action="users-round"
        actionLabel="참여자 보기"
        onAction={() => router.push("/team")}
      />

      <Note tone="info" icon="wand-sparkles" className="mx-4 mt-3">
        쿠션 번역기로 다듬은 말은 <b>표시가 남습니다</b>. 원문을 숨기지 않습니다.
      </Note>

      <Body ref={scrollRef} dense className="flex flex-col gap-3">
        <div ref={topRef} />
        {isLoadingMore ? (
          <div className="pb-1 text-center font-medium text-[12px] leading-none text-txt-faint">
            이전 대화 불러오는 중…
          </div>
        ) : null}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            showAuthor
            onRetry={retry}
            onSaveToDrive={setPicking}
          />
        ))}

        <Undecided>
          채널을 여러 개 두는지, 메시지 삭제가 되는지는 기획안에 없어 팀 전체가 보는 단일 채팅방으로만
          구성했습니다. 첨부는 드라이브와 같은 규칙(문서·이미지·PPT·PDF, 50MB)이고 1:1 대화에는 두지
          않았습니다. 드라이브 파일을 여기 공유하고(14) 첨부를 다시 드라이브로 올리는 것은 되지만,
          <b>단톡방에 붙인 파일 자체를 팀 드라이브 용량(2GB)에 셀지는</b> 아직 정하지 않았습니다 —
          그래서 지금은 올린 파일만 용량에 들어갑니다.
        </Undecided>

        <div ref={bottomRef} />
      </Body>

      <Composer
        placeholder="메시지 입력"
        // 올려 보던 중에 보냈더라도 내가 방금 쓴 말은 보여야 한다.
        onSend={(text) => {
          stick();
          send(text);
        }}
        // 드라이브와 같은 형식·용량(문서·이미지·PPT·PDF, 50MB)만 받는다.
        onAttach={() => picker.current?.click()}
        // 입력 중이던 글을 들고 넘어간다. 비어 있으면 쿠션 번역기는 예시 문장으로 열린다.
        onCushion={(draft) => {
          handOffToCushion(draft);
          router.push("/tools/cushion");
        }}
      />

      <input
        ref={picker}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          stick();
          void sendFile(file).then((refused) => refused && flash(refused));
        }}
      />

      {/* 올릴 제출함을 고른다. 어느 칸인지 모르면 올릴 수 없으므로, 이름·마감·파일 수를
          같이 보여 주고 하나만 고르게 한다. */}
      <Sheet
        open={picking !== null}
        title="어느 제출함에 올릴까요"
        onClose={() => setPicking(null)}
        footer={
          <Btn full v="outline" onClick={() => setPicking(null)}>
            취소
          </Btn>
        }
      >
        <p className="t-note keep-all m-0 mb-3 text-txt-muted">
          <b className="text-txt-strong">{picking?.attachment?.name}</b> 을(를) 올립니다. 파일은 다시
          올리지 않고 지금 단톡방에 있는 것을 그대로 기록합니다.
        </p>
        {boxes.length === 0 ? (
          <p className="t-note m-0 text-txt-muted">아직 제출함이 없습니다.</p>
        ) : (
          <ul className="m-0 list-none border border-line p-0">
            {boxes.map((box, i) => (
              <li key={box.id} className={i > 0 ? "border-t border-line" : ""}>
                {/* 고르는 즉시 시트가 닫히고 결과는 토스트로 말한다 — 확인 단계는 한 번이면 된다.
                    중복 제출은 시트가 이미 닫혔는데도 `run` 의 키가 막는다. */}
                <button
                  type="button"
                  onClick={() => saveTo(box)}
                  className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-3 py-3 text-left"
                >
                  <span className="grid size-9 flex-none place-items-center rounded-xl bg-fill text-txt-muted">
                    <Icon name="folder" size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-label block truncate text-txt-strong">{box.name}</span>
                    <span className="t-cap block text-txt-muted">
                      {box.owner ? `${box.owner} · ` : ""}마감 {box.due} · 파일 {box.fileCount}개
                    </span>
                  </span>
                  <Icon name="chevron-right" size={15} className="flex-none text-txt-faint" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}

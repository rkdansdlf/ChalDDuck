"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppBar, Body, Btn, Icon, Note, Sheet, Toast, Undecided } from "@/components/ui";
import type { ChatMessage, CushionTone, Member, SubmissionBox, Team } from "@/lib/types";
import type { ReadCushionSetting } from "@/lib/read-cushion";
import { useAction } from "@/lib/use-action";
import { TEAM_THREAD_ID } from "@/lib/types";
import { ACCEPT } from "@/features/drive/file-rules";
import { useMe } from "@/features/onboarding/use-me";
import { handOffToCushion } from "@/features/tools/cushion-handoff";
import { setNavBadges } from "@/components/nav-badges-store";
import { saveChatAttachmentToDrive } from "@/server/actions/drive";
import { setReadCushionTone } from "@/server/actions/chat";
import { pollNavBadges } from "@/server/actions/nav";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { ReadCushionBar } from "./read-cushion-bar";
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
  tones,
  cushion: cushionFromServer,
}: {
  team: Team;
  messages: ChatMessage[];
  initialCursor: string | null;
  me: Member | undefined;
  /** 드라이브 제출함 목록 — 첨부를 올릴 곳을 고르는 데 쓴다(14). */
  boxes: SubmissionBox[];
  /**
   * 말투 3종(15 쿠션 번역기와 같은 어휘).
   *
   * **서버에서 받는다** — 카탈로그를 화면이 직접 import 하면 카탈로그 전체(퀴즈·컨텐츠)가
   * 채팅 화면 번들에 따라 들어온다. 15 화면이 이렇게 받고 있으니 같은 규칙을 따른다.
   */
  tones: CushionTone[];
  /** 이 브라우저가 이 방의 말을 읽는 말투. 고른 것이 없으면 첫 말투로 읽는다. */
  cushion: ReadCushionSetting;
}) {
  const router = useRouter();
  const me = useMe(fromRoster);
  /**
   * 되돌릴 파일을 잃어버린 실패 말풍선을 받는 곳.
   *
   * hook 에는 **ref** 를 넘긴다. 콜백을 직접 넘기면 그 콜백이 `discard` 를 쓰는데
   * `discard` 는 같은 호출에서 나온다 — 자기 자신을 역참조하게 되고, 파일 고르기 input
   * 도 아직 만들어지지 않은 시점의 값이 된다.
   */
  const lostFileRef = useRef<(message: ChatMessage) => void>(() => {});
  const [cushion, setCushion] = useState<ReadCushionSetting>(cushionFromServer);
  const { messages, send, sendFile, retry, discard, fileLostText, hasMore, isLoadingMore, loadOlder, purifyWorking, purifyNotice, retryPurify } =
    useChatThread(
    TEAM_THREAD_ID,
    fromServer,
    initialCursor,
      me,
      cushion,
      lostFileRef,
    );
  const { toast, flash, run } = useAction();

  const [picking, setPicking] = useState<ChatMessage | null>(null);

  /**
   * "다시 보내기" — **거절 사유를 알림으로 남긴다.**
   *
   * 첨부는 용량 초과·형식·파일 없음으로 거절될 수 있다. 그 문장을 버리면 아무 반응도 없는
   * 버튼을 몇 번이나 눌러야 한다. 처음 보낼 때(`sendFile`)는 사유를 띄우는데 재시도만
   * 조용했으므로, "처음엔 됐는데 다시 보내기가 안 된다"로 보인다.
   * `MessageBubble` 의 memo 가 이 함수 한 개만 보기 때문에 `useCallback` 으로 고정한다.
   */
  const onRetry = useCallback(
    async (message: ChatMessage) => {
      const refused = await retry(message);
      if (refused) flash(refused);
    },
    [retry, flash],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useLoadOlderOnScroll(scrollRef, topRef, hasMore, loadOlder);

  // 새 말이 오면 맨 아래로 — 과거 메시지를 앞에 붙였을 때나 위로 올려 읽는 중일
  // 때는 움직이지 않는다.
  const { stick } = useStickToBottom(scrollRef, bottomRef, messages.at(-1)?.id);

  // 그 자리에서 파일 고르기를 연다. 말풍선을 지우면 사용자는 "내가 보낸 게 아니다"고
  // 여길 수 있으므로 **남겨 두고** 길만 다시 열어 준다.
  useEffect(() => {
    lostFileRef.current = (lost) => {
      discard(lost);
      flash(fileLostText);
      picker.current?.click();
    };
  }, [discard, flash, fileLostText]);

  /**
   * 읽는 말투를 바꾼다.
   *
   * **기다리지 않는다.** 순화본은 화면에 이미 있으므로 먼저 칩을 바꾸고 저장은 나중에
   * 한다. 저장이 실패하면 서버가 준 문구를 그대로 토스트로 말한다(화면이 지어내지 않는다).
   */
  const changeCushionTone = async (key: string) => {
    setCushion({ tone: key });
    await run(
      `cushion-tone-${key}`,
      async () => {
        const result = await setReadCushionTone(TEAM_THREAD_ID, key);
        if (!result.ok) {
          setCushion(cushionFromServer);
          return flash(result.message);
        }
        setCushion(result.setting);
        // 저장된 순화본은 예전 말투로 된 것이다 — **다시 다듬어 읽어야** 칩이 약속한
        // 말투가 된다. 지우지 않고 한 번 더 시킨다(같은 말의 순화본은 늘 하나).
        retryPurify();
      },
      "말투를 바꾸지 못했습니다. 잠시 후 다시 눌러 주세요",
    );
  };

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

      <ReadCushionBar
        setting={cushion}
        tones={tones}
        working={purifyWorking}
        notice={purifyNotice}
        onTone={(key) => void changeCushionTone(key)}
        onRetry={retryPurify}
      />

      <Note tone="info" icon="wand-sparkles" className="mx-4 mt-2.5">
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
            onRetry={onRetry}
            onDiscard={discard}
            onSaveToDrive={setPicking}
          />
        ))}

        <Undecided>
          읽기 순화(받는 사람이 순화된 표현으로 읽는 기능)를 어디까지 둘지는 기획안에 없습니다.
          지금은 <b>원문이 그대로 저장되고, 읽는 사람에게만 순화문이 보여 주며, 원문으로
          언제든 돌아갈 수 있게</b> 두었습니다. 순화가 꺼져 있거나 실패하면 원문이 보인다.
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

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppBar, Body, Btn, Icon, Sheet, Toast } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChatMessage, CushionLevel, CushionTone, Member, SubmissionBox, Team } from "@/lib/types";
import type { ReadCushionSetting } from "@/lib/read-cushion";
import { useAction } from "@/lib/use-action";
import { TEAM_THREAD_ID } from "@/lib/types";
import { ACCEPT } from "@/features/drive/file-rules";
import {
  clearComposerDraft,
  handOffToCushion,
  noComposerDraft,
  peekComposerDraft,
  subscribeComposerDraft,
} from "@/features/tools/cushion-handoff";
import { useMe } from "@/features/onboarding/use-me";
import { setNavBadges } from "@/components/nav-badges-store";
import { saveChatAttachmentToDrive } from "@/server/actions/drive";
import { setReadCushion } from "@/server/actions/chat";
import { pollNavBadges } from "@/server/actions/nav";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { ReadCushionSheet } from "./read-cushion-bar";
import { useCushionUsageToday } from "@/features/tools/use-ai-usage";
import { useChatThread, useLoadOlderOnScroll, useStickToBottom } from "./use-chat-thread";

/**
 * 19 팀플 단톡방.
 *
 * ## 기획에 없는데 정한 것
 *
 * 화면 아래에 예전에는 `Undecided` 상자가 있었다. 그 안에는 **결정과 미결이 같이** 들어 있었고,
 * 정해진 일까지 "정해지지 않았다" 는 말처럼 읽혔다. 정한 것만 여기에 모았다 — 모두 임의 값이
 * 아니라, 반대편도 정할 수 없으므로 **가장 덜 침해적인 쪽**을 고른 것이다.
 *
 * - **원문은 그대로 저장한다.** 읽기 도움은 보기에만 건다. `Message.text` 는 손대지 않는다.
 * - **읽는 사람에게만 읽기 도움문이 보인다.** 같은 방에서도 남에게는 원문으로 보인다.
 * - **언제든 원문으로 돌아갈 수 있다.** 읽기 도움이 끄졌거나 실패했으면 원문이 보인다.
 * - **팀 전체가 보는 단톡방 하나뿐이다.** 채널을 나누지 않는다.
 * - **첨부 규칙은 드라이브와 같다**(문서·이미지·PPT·PDF, 한 파일 50MB). 1:1 대화에는 붙이지
 *   않는다 — 한쪽을 정해야 하는 사안이기 때문이다.
 * - **드라이브 파일을 여기서 공유할 수 있다**(14), 반대로 붙인 파일을 드라이브로 올릴 수도 있다.
 *
 * 정하지 않고 남긴 것은 세 개뿐이다 — 채널을 여러 개 둘지, 메시지 삭제가 될지, 이 방에 붙인
 * 파일이 드라이브 용량(2GB)에 들어갈지. 화면 아래 상자가 그것을 밝힌다.
 */
/** 첨부를 드라이브에 올릴 때 실패한 이유를 사람 말로. */
const SAVE_FAIL: Record<string, string> = {
  "over-quota": "팀 저장 용량(2GB)이 부족합니다. 드라이브에서 공간을 확인해 주세요",
  "kind-mismatch": "같은 제출함에 같은 이름의 파일이 다른 형식으로 이미 있습니다",
  "too-big": "한 파일은 50MB까지만 올릴 수 있습니다",
  "empty": "저장소에 들어온 파일이 비어 있습니다",
  "missing": "이 첨부는 이제 없거나 내 팀 것이 아닙니다",
  "not-configured": "서버의 파일 저장소가 준비되지 않았습니다",
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
  levels,
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
  /** 읽기 강도 3단계 — 끄는 것은 스위치다. */
  levels: CushionLevel[];
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
  /**
   * 오늘 남은 **읽기 도움** 몫 — 도구 몫과 별개다(`server/ai/limit.ts` 의 `quotaPicks`).
   *
   * 읽기 도움이 켜진 방에서만 읽는다 — 꺼진 방은 AI 를 부르지 않으므로 조회할 이유가 없고,
   * 그럼에도 부르면 필요 없는 왕복이 늘어난다.
   */
  const cushionUsage = useCushionUsageToday(cushion.enabled);

  const { messages, setCushions, send, sendFile, retry, discard, fileLostText, hasMore, isLoadingMore, loadOlder, purifyWorking, purifyNotice, retryPurify } =
    useChatThread(TEAM_THREAD_ID, fromServer, initialCursor, me, cushion, lostFileRef);
  const { toast, flash, run } = useAction();

  const [picking, setPicking] = useState<ChatMessage | null>(null);
  const [cushionSheetOpen, setCushionSheetOpen] = useState(false);

  /**
   * "다시 보내기" — **거절 사유를 알림으로 남긴다.**
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

  const composerDraft = useSyncExternalStore(subscribeComposerDraft, peekComposerDraft, noComposerDraft);

  // 쿠션 번역기에서 "단톡방 입력창에 담기"로 복귀했을 때 토스트 알림을 띄우고 스토어를 비운다.
  useEffect(() => {
    if (composerDraft) {
      flash("쿠션어로 다듬은 말을 입력창에 담았습니다 ✨");
      clearComposerDraft();
    }
  }, [composerDraft, flash]);

  // 쿠션 번역기에서 "단톡방으로 바로 전송" 후 복귀했을 때 알림을 띄운다.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("from") === "cushion-sent") {
        flash("쿠션어로 다듬은 메시지를 단톡방에 보냈습니다 ✨");
        stick();
        const url = new URL(window.location.href);
        url.searchParams.delete("from");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    }
  }, [flash, stick]);

    /**
   * 읽기 도움 설정을 바꾼다 — 끄기·강도·말투.
   *
   * **기다리지 않는다.** 다듬은 말은 화면에 이미 있으므로 먼저 칩을 바꾸고 저장은 나중에 한다.
   * 저장이 거절되면 서버가 준 문구를 그대로 토스트로 말하고 이전 값으로 되돌린다.
   *
   * **기준이 바뀌면 그 방의 다듬은 말은 사라진다** — 서버가 지운다. "보통" 으로 골랐는데
   * "강하게" 로 만든 말이 남아 있으면 아무도 그 차이를 알 수 없다.
   */
  const changeCushion = async (next: { enabled?: boolean; mode?: string; tone?: string }) => {
    setCushion({ ...cushion, ...next } as ReadCushionSetting);
    const key = `cushion-${JSON.stringify(next)}`;
    await run(
      key,
      async () => {
        const result = await setReadCushion(TEAM_THREAD_ID, next);
        if (!result.ok) {
          setCushion(cushionFromServer);
          return flash(result.message);
        }
        setCushion(result.setting);
        // 끄면 다시 부를 일이 없다. 켜거나 기준을 바꾸면 새 조건으로 다시 만든다.
        if (next.enabled === false) {
          setCushions({});
          return;
        }
        retryPurify();
      },
      "설정을 바꾸지 못했습니다. 잠시 후 다시 눌러 주세요",
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
        sub={`${team.memberCount}명`}
        onBack={() => router.push("/chat")}
        hideBackOnWide
        right={
          <>
            <button
              type="button"
              onClick={() => setCushionSheetOpen(true)}
              aria-label="읽기 도움 설정"
              title={cushion.enabled ? "읽기 도움 켜짐" : "읽기 도움 설정"}
              className={cn(
                "relative grid size-10 flex-none cursor-pointer place-items-center rounded-xl border-none select-none transition-all duration-150 active:scale-95",
                cushion.enabled
                  ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                  : "bg-transparent text-txt-muted hover:bg-fill hover:text-txt",
              )}
            >
              <Icon
                name="wand-sparkles"
                size={19}
                className={purifyWorking ? "animate-wiggle" : undefined}
              />
              {cushion.enabled ? (
                <span className="absolute top-2 right-2 size-2 rounded-full bg-yellow-500 ring-2 ring-page" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => router.push("/team")}
              aria-label="참여자 보기"
              className="grid size-10 flex-none cursor-pointer place-items-center rounded-xl border-none bg-transparent text-txt select-none transition-all duration-150 hover:bg-fill active:scale-90"
            >
              <Icon name="users-round" size={19} />
            </button>
          </>
        }
      />

      {purifyNotice ? (
        <div className="mx-4 mt-2 flex items-center justify-between rounded-xl bg-err-bg px-3 py-1.5 text-[12px] text-err">
          <span>{purifyNotice}</span>
          <button
            type="button"
            onClick={retryPurify}
            className="cursor-pointer font-bold underline"
          >
            다시 시도
          </button>
        </div>
      ) : null}

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

        <div ref={bottomRef} />
      </Body>

      <Composer
        placeholder="메시지 입력"
        initialText={composerDraft ?? ""}
        // 올려 보던 중에 보냈더라도 내가 방금 쓴 말은 보여야 한다.
        onSend={(text) => {
          stick();
          send(text);
        }}
        // 드라이브와 같은 형식·용량(문서·이미지·PPT·PDF, 50MB)만 받는다.
        onAttach={() => picker.current?.click()}
        // 입력 중이던 글을 들고 넘어간다. 출처를 'chat'으로 넘겨 단톡방 복귀가 가능하게 한다.
        onCushion={(draft) => {
          handOffToCushion(draft, { source: "chat", returnTo: "/chat/team" });
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

      <ReadCushionSheet
        open={cushionSheetOpen}
        onClose={() => setCushionSheetOpen(false)}
        setting={cushion}
        tones={tones}
        levels={levels}
        usage={cushionUsage}
        notice={purifyNotice}
        onEnabled={(next) => void changeCushion({ enabled: next })}
        onLevel={(key) => void changeCushion({ mode: key })}
        onTone={(key) => void changeCushion({ tone: key })}
        onRetry={retryPurify}
      />

      <Toast msg={toast} />
    </>
  );
}

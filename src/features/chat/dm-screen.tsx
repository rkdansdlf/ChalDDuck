"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppBar, Body, Note } from "@/components/ui";
import type { ChatMessage, CushionTone, DmThread, Member } from "@/lib/types";
import type { ReadCushionSetting } from "@/lib/read-cushion";
import { useAction } from "@/lib/use-action";
import { useMe } from "@/features/onboarding/use-me";
import { markThreadRead, setReadCushionTone } from "@/server/actions/chat";
import { getMbtiMeta, getMbtiSynergy } from "@/lib/mbti";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { ReadCushionBar } from "./read-cushion-bar";
import { useChatThread, useLoadOlderOnScroll, useStickToBottom } from "./use-chat-thread";

/**
 * 31 1:1 DM 대화.
 *
 * 단톡방(19)과 **같은 말풍선 규격**을 쓴다. 상대가 한 명뿐이라 이름만 붙이지 않는다.
 *
 * 읽기 순화도 **방마다 따로**다 — 1:1 대화는 아무도 못 봤다고 하긴 어려운 자리라, 켜고
 * 끄는 사람이 단톡방에서의 선택과 같은지 알 수 없다. 그래서 상태를 방 단위로 읽고 쓴다.
 */
export function DmScreen({
  thread,
  messages: fromServer,
  initialCursor,
  me: fromRoster,
  tones,
  cushion: cushionFromServer,
}: {
  thread: DmThread;
  messages: ChatMessage[];
  initialCursor: string | null;
  me: Member | undefined;
  /** 말투 3종 — 단톡방과 같은 값을 서버에서 받는다(번들에 카탈로그를 넣지 않기 위해). */
  tones: CushionTone[];
  /** 이 브라우저가 이 대화의 말을 읽는 말투. 고른 것이 없으면 첫 말투로 읽는다. */
  cushion: ReadCushionSetting;
}) {
  const router = useRouter();
  const me = useMe(fromRoster);
  const [showTip, setShowTip] = useState(false);
  const otherMeta = getMbtiMeta(thread.mbti);
  const synergy = getMbtiSynergy(me.mbti, thread.mbti);
  const { flash, run } = useAction();
  const [cushion, setCushion] = useState<ReadCushionSetting>(cushionFromServer);

  const { messages, send, retry, discard, hasMore, isLoadingMore, loadOlder, purifyWorking, purifyNotice, retryPurify } =
    useChatThread(thread.id, fromServer, initialCursor, me, cushion);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useLoadOlderOnScroll(scrollRef, topRef, hasMore, loadOlder);

  // 열었으면 읽은 것이다 — 목록과 탭 배지의 안 읽음 수가 함께 내려간다.
  useEffect(() => {
    markThreadRead(thread.id);
  }, [thread.id]);

  /**
   * "다시 보내기" — **거절 사유를 알림으로 남긴다.**
   *
   * 첨부는 용량·형식·파일 없음으로 거절될 수 있다. 그 문장을 버리면 사용자는 아무 반응도
   * 없는 버튼을 몇 번이나 눌러야 한다 — "다시 보내기"가 고장 난 것처럼 보인다. `MessageBubble`
   * 의 memo 가 이 함수 한 개만 보기 때문에 `useCallback` 으로 고정한다(안 하면 말풍선 전부가
   * 매번 다시 그려진다 — `message-bubble.tsx` 주석 참고).
   */
  const onRetry = useCallback(
    async (message: ChatMessage) => {
      const refused = await retry(message);
      if (refused) flash(refused);
    },
    [retry, flash],
  );

  /** 읽는 말투를 바꾼다. 먼저 바꾸고, 거절되면 되돌린다(단톡방과 같은 순서). */
  const changeCushionTone = async (key: string) => {
    setCushion({ tone: key });
    await run(
      `cushion-tone-${key}`,
      async () => {
        const result = await setReadCushionTone(thread.id, key);
        if (!result.ok) {
          setCushion(cushionFromServer);
          return flash(result.message);
        }
        setCushion(result.setting);
        // 저장된 순화본은 예전 말투로 된 것이다 — 고른 말투로 **다시 다듬어 읽어야**
        // 칩이 약속한 말투가 된다.
        retryPurify();
      },
      "말투를 바꾸지 못했습니다. 잠시 후 다시 눌러 주세요",
    );
  };

  // 새 말이 오면 맨 아래로 — 과거 메시지를 앞에 붙였을 때나 위로 올려 읽는 중일
  // 때는 움직이지 않는다.
  const { stick } = useStickToBottom(scrollRef, bottomRef, messages.at(-1)?.id);

  return (
    <>
      <AppBar
        title={thread.name}
        sub={otherMeta ? `${otherMeta.type} · ${otherMeta.characterName}` : (thread.mbti ?? "MBTI 미입력")}
        onBack={() => router.push("/chat/dm")}
        hideBackOnWide
      />

      {otherMeta ? (
        <div className="mx-4 mt-2.5 rounded-xl border border-yellow-200/80 bg-linear-to-r from-yellow-50 to-amber-50/50 p-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-[12px] text-yellow-900">
              <span className="font-mono text-yellow-800">{otherMeta.type}</span>
              <span>{otherMeta.characterName}</span>
              <span className="text-yellow-600 font-normal">· {synergy.title}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowTip(!showTip)}
              className="text-[11.5px] font-bold text-yellow-800 hover:underline cursor-pointer"
            >
              {showTip ? "접기" : "소통 팁"}
            </button>
          </div>
          {showTip ? (
            <div className="mt-1.5 pt-1.5 border-t border-yellow-200/60 text-[12px] leading-[1.45] text-txt">
              <p className="m-0 text-pretty-keep">💡 {otherMeta.communicationTip.good}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <ReadCushionBar
        setting={cushion}
        tones={tones}
        working={purifyWorking}
        notice={purifyNotice}
        onTone={(key) => void changeCushionTone(key)}
        onRetry={retryPurify}
      />

      <Note tone="info" icon="lock" className="mx-4 mt-2.5">
        이 대화는 <b>{thread.name}님과 나만</b> 봅니다. 팀 전체 단톡방과는 분리되어 있습니다.
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
            showAuthor={false}
            onRetry={onRetry}
            onDiscard={discard}
          />
        ))}

        <div ref={bottomRef} />
      </Body>

      <Composer
        placeholder={`${thread.name}님에게 메시지`}
        // 올려 보던 중에 보냈더라도 내가 방금 쓴 말은 보여야 한다.
        onSend={(text) => {
          stick();
          send(text);
        }}
      />
    </>
  );
}

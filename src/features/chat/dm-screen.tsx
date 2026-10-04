"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppBar, Body, Icon, Sheet } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChatMessage, CushionLevel, CushionTone, DmThread, Member } from "@/lib/types";
import type { ReadCushionSetting } from "@/lib/read-cushion";
import { useAction } from "@/lib/use-action";
import { useMe } from "@/features/onboarding/use-me";
import { markThreadRead, setReadCushion } from "@/server/actions/chat";
import { getMbtiMeta } from "@/lib/mbti";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { ReadCushionSheet } from "./read-cushion-bar";
import { useCushionUsageToday } from "@/features/tools/use-ai-usage";
import { useChatThread, useLoadOlderOnScroll, useStickToBottom } from "./use-chat-thread";

/**
 * 31 1:1 DM 대화.
 *
 * 단톡방(19)과 **같은 말풍선 규격**을 쓴다. 상대가 한 명뿐이라 이름만 붙이지 않는다.
 *
 * 읽기 도움도 **방마다 따로**다 — 1:1 대화는 아무도 못 봤다고 하긴 어려운 자리라, 켜고
 * 끄는 사람이 단톡방에서의 선택과 같은지 알 수 없다. 그래서 상태를 방 단위로 읽고 쓴다.
 */
export function DmScreen({
  thread,
  messages: fromServer,
  initialCursor,
  me: fromRoster,
  tones,
  levels,
  cushion: cushionFromServer,
}: {
  thread: DmThread;
  messages: ChatMessage[];
  initialCursor: string | null;
  me: Member | undefined;
  /** 말투 3종 — 단톡방과 같은 값을 서버에서 받는다(번들에 카탈로그를 넣지 않기 위해). */
  tones: CushionTone[];
  /** 읽기 강도 3단계 — 끄는 것은 스위치다. */
  levels: CushionLevel[];
  /** 이 브라우저가 이 대화의 말을 읽는 말투. 고른 것이 없으면 첫 말투로 읽는다. */
  cushion: ReadCushionSetting;
}) {
  const router = useRouter();
  const me = useMe(fromRoster);
  const [cushionSheetOpen, setCushionSheetOpen] = useState(false);
  const [tipSheetOpen, setTipSheetOpen] = useState(false);
  const otherMeta = getMbtiMeta(thread.mbti);
  const { flash, run } = useAction();
  const [cushion, setCushion] = useState<ReadCushionSetting>(cushionFromServer);
  /**
   * 오늘 남은 **읽기 도움** 몫 — 도구 몫과 별개다(`server/ai/limit.ts` 의 `quotaPicks`).
   *
   * 읽기 도움이 켜진 방에서만 읽는다 — 꺼진 방은 AI 를 부르지 않으므로 조회할 이유가 없고,
   * 그럼에도 부르면 필요 없는 왕복이 늘어난다.
   */
  const cushionUsage = useCushionUsageToday(cushion.enabled);


  const { messages, setCushions, send, retry, discard, hasMore, isLoadingMore, loadOlder, purifyWorking, purifyNotice, retryPurify } =
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

  /**
   * 읽기 도움 설정을 바꾼다 — 끄기·강도·말투.
   *
   * **기다리지 않는다.** 다듬은 말은 화면에 이미 있으므로 먼저 칩을 바꾸고 저장은 나중에 한다.
   * 거절되면 서버가 준 문구를 그대로 토스트로 말하고 이전 값으로 되돌린다(단톡방과 같은 순서).
   *
   * **기준이 바뀌면 그 대화의 다듬은 말은 사라진다** — 서버가 지운다. "보통" 으로 골랐는데
   * "강하게" 로 만든 말이 남아 있으면 아무도 그 차이를 알 수 없다.
   */
  const changeCushion = async (next: { enabled?: boolean; mode?: string; tone?: string }) => {
    setCushion({ ...cushion, ...next } as ReadCushionSetting);
    const key = `cushion-${JSON.stringify(next)}`;
    await run(
      key,
      async () => {
        const result = await setReadCushion(thread.id, next);
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

  // 새 말이 오면 맨 아래로 — 과거 메시지를 앞에 붙였을 때나 위로 올려 읽는 중일
  // 때는 움직이지 않는다.
  const { stick } = useStickToBottom(scrollRef, bottomRef, messages.at(-1)?.id);

  return (
    <>
      <AppBar
        title={thread.name}
        sub={otherMeta ? `${otherMeta.type} · ${otherMeta.characterName}` : (thread.mbti ?? undefined)}
        onBack={() => router.push("/chat/dm")}
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
            {otherMeta ? (
              <button
                type="button"
                onClick={() => setTipSheetOpen(true)}
                aria-label="소통 팁 보기"
                title={`${thread.name}님과의 소통 팁`}
                className="grid size-10 flex-none cursor-pointer place-items-center rounded-xl border-none bg-transparent text-txt select-none transition-all duration-150 hover:bg-fill active:scale-90"
              >
                <Icon name="sparkles" size={19} className="text-yellow-700" />
              </button>
            ) : null}
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

      {otherMeta ? (
        <Sheet
          open={tipSheetOpen}
          title={`${thread.name}님과의 소통 팁`}
          onClose={() => setTipSheetOpen(false)}
        >
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-2 rounded-2xl bg-yellow-100 p-3.5">
              <span className="font-mono font-bold text-[16px] text-yellow-900">{otherMeta.type}</span>
              <span className="font-bold text-[15px] text-ink-900">{otherMeta.characterName}</span>
            </div>
            <div className="rounded-xl border border-line bg-card p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 font-bold text-[13.5px] text-txt-strong">
                <Icon name="wand-sparkles" size={15} className="text-yellow-600" />
                <span>이렇게 대화하면 좋아요</span>
              </div>
              <p className="m-0 text-[13px] leading-relaxed text-txt">{otherMeta.communicationTip.good}</p>
            </div>
            <div className="rounded-xl border border-line bg-card p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 font-bold text-[13.5px] text-err">
                <Icon name="ban" size={15} />
                <span>이런 표현은 피하는 게 좋아요</span>
              </div>
              <p className="m-0 text-[13px] leading-relaxed text-txt">{otherMeta.communicationTip.caution}</p>
            </div>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

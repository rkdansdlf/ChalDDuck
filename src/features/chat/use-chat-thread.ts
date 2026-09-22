"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { loadOlderMessages, sendChatMessage } from "@/server/actions/chat";
import type { ChatMessage } from "@/lib/types";
import type { MbtiType } from "@/lib/mbti";
import { addPendingMessage, markPendingFailed, resolvePendingMessage, useThreadMessages } from "./messages-state";

/**
 * 한 대화방의 메시지와 보내기·다시 보내기·과거 불러오기.
 *
 * 단톡방(19)과 DM(31)이 전송 처리를 똑같이 하도록 한 곳에 모은다.
 *
 * 서버 응답을 기다리지 않고 먼저 화면에 얹는다(낙관적 갱신) — 응답이 오면 실제
 * id·시각으로 바꾸고, 실패하면 그 말풍선에 "다시 보내기"를 붙인다. `router.refresh()`로
 * 화면 전체를 다시 받아 오지 않아도 되므로 보낸 즉시 보인다.
 *
 * `fromServer` 는 최신 메시지 한 장(`MESSAGE_PAGE_SIZE`개)뿐이다. 위로 스크롤해 부른
 * 과거 메시지는 `older` 에 쌓아 그 앞에 붙인다 — 대화가 길어져도 처음에 받는 양은 고정된다.
 */
export function useChatThread(
  threadId: string,
  fromServer: ChatMessage[],
  initialCursor: string | null,
  me: { name: string; mbti: MbtiType | null },
) {
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 다른 방으로 옮기면 이전 방의 과거 기록을 들고 있을 이유가 없다.
  // 렌더 중에 비교해 바로 반영한다 — effect 로 하면 옛 방의 내용이 한 프레임 비친다.
  const [threadForOlder, setThreadForOlder] = useState(threadId);
  if (threadId !== threadForOlder) {
    setThreadForOlder(threadId);
    setOlder([]);
    setCursor(initialCursor);
  }

  const recent = useThreadMessages(threadId, fromServer);
  const messages = older.length > 0 ? [...older, ...recent] : recent;

  const loadOlder = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await loadOlderMessages(threadId, cursor);
      setOlder((prev) => [...page.messages, ...prev]);
      setCursor(page.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [threadId, cursor, isLoadingMore]);

  const send = useCallback(
    async (text: string) => {
      const tempId = addPendingMessage(threadId, {
        author: me.name,
        mbti: me.mbti,
        isMine: true,
        text,
      });

      try {
        const result = await sendChatMessage(threadId, text);
        if (result.ok) {
          resolvePendingMessage(threadId, tempId, result.message);
        } else {
          markPendingFailed(threadId, tempId);
        }
      } catch {
        markPendingFailed(threadId, tempId);
      }
    },
    [threadId, me.name, me.mbti],
  );

  const retry = useCallback(
    async (message: ChatMessage) => {
      try {
        const result = await sendChatMessage(threadId, message.text);
        if (result.ok) {
          resolvePendingMessage(threadId, message.id, result.message);
        }
        // 여전히 실패 — 말풍선은 그대로 두고 다시 누를 수 있게 한다
      } catch {
        // 여전히 실패 — 말풍선은 그대로 두고 다시 누를 수 있게 한다
      }
    },
    [threadId],
  );

  return { messages, send, retry, hasMore: cursor !== null, isLoadingMore, loadOlder };
}

/**
 * 스크롤이 목록 맨 위(`sentinelRef`)에 닿으면 `loadOlder` 를 부른다.
 *
 * 불러온 만큼 스크롤을 올려 준다 — 그냥 앞에 붙이면 새 내용이 끼어든 만큼
 * 화면이 아래로 밀려서, 읽던 위치가 흔들린 것처럼 보인다.
 */
export function useLoadOlderOnScroll(
  rootRef: RefObject<HTMLDivElement | null>,
  sentinelRef: RefObject<HTMLDivElement | null>,
  hasMore: boolean,
  loadOlder: () => Promise<void>,
) {
  useEffect(() => {
    const root = rootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        const previousHeight = root.scrollHeight;
        void loadOlder().then(() => {
          root.scrollTop += root.scrollHeight - previousHeight;
        });
      },
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rootRef, sentinelRef, hasMore, loadOlder]);
}

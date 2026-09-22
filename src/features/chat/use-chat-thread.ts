"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { loadOlderMessages, pollNewMessages, sendChatMessage } from "@/server/actions/chat";
import type { ChatMessage } from "@/lib/types";
import type { MbtiType } from "@/lib/mbti";
import { usePoll } from "@/lib/use-poll";
import { addPendingMessage, markPendingFailed, resolvePendingMessage, useThreadMessages } from "./messages-state";

/**
 * 새 말을 확인하는 주기.
 *
 * 대화는 주고받는 리듬이 있어서 몇 초만 늦어도 "안 읽나?" 싶어진다. 3초면 상대가
 * 치는 동안 이미 와 있다. 안 보이는 탭에서는 아예 부르지 않는다(`usePoll`).
 */
const NEW_MESSAGE_POLL_MS = 3000;

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
  /** 방을 연 뒤에 들어온 말. 서버가 처음 준 목록 뒤에 이어 붙는다. */
  const [fresh, setFresh] = useState<ChatMessage[]>([]);

  // 다른 방으로 옮기면 이전 방의 기록을 들고 있을 이유가 없다.
  // 렌더 중에 비교해 바로 반영한다 — effect 로 하면 옛 방의 내용이 한 프레임 비친다.
  const [threadForOlder, setThreadForOlder] = useState(threadId);
  if (threadId !== threadForOlder) {
    setThreadForOlder(threadId);
    setOlder([]);
    setCursor(initialCursor);
    setFresh([]);
  }

  // 화면이 다시 그려지며 `fromServer` 가 새로워지면, 폴링으로 받아 뒀던 것과 겹칠 수 있다.
  const serverIds = new Set(fromServer.map((m) => m.id));
  const onlyNew = fresh.filter((m) => !serverIds.has(m.id));

  const recent = useThreadMessages(threadId, onlyNew.length > 0 ? [...fromServer, ...onlyNew] : fromServer);
  const messages = older.length > 0 ? [...older, ...recent] : recent;

  // 서버가 알고 있는 마지막 말. 여기서부터 뒤를 물어본다 — 보내는 중인 내 말풍선은
  // 아직 서버에 없으므로 기준이 될 수 없다.
  const lastKnownId = onlyNew.at(-1)?.id ?? fromServer.at(-1)?.id ?? null;

  usePoll(async () => {
    const incoming = await pollNewMessages(threadId, lastKnownId);
    if (incoming.length === 0) return;
    setFresh((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  }, NEW_MESSAGE_POLL_MS);

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

/** 이만큼 아래에 있으면 "맨 아래를 보고 있다"로 친다. 한 줄 정도의 여유. */
const STICK_SLACK_PX = 80;

/**
 * 새 말이 오면 맨 아래로 — **단, 맨 아래를 보고 있었을 때만.**
 *
 * 예전에는 마지막 메시지가 바뀔 때마다 무조건 아래로 내렸다. 내가 보낸 말만 늘어나던
 * 때는 그게 맞았지만, 이제 상대의 말이 몇 초마다 저절로 도착한다 — 위로 올려 예전
 * 대화를 읽는 중에 누가 말하면 읽던 자리에서 끌려 내려간다.
 *
 * `stick()` 은 "지금은 아래로 내려도 된다"고 알리는 문이다. 내가 말을 보낼 때 쓴다 —
 * 올려 보던 중에 보냈더라도 내가 방금 쓴 말은 보여야 한다.
 */
export function useStickToBottom(
  rootRef: RefObject<HTMLDivElement | null>,
  bottomRef: RefObject<HTMLDivElement | null>,
  lastMessageId: string | undefined,
): { stick: () => void } {
  // 맨 아래에 있었는지는 **새 말이 들어오기 전**의 값이어야 한다. 들어온 뒤에 재면
  // 이미 늘어난 높이 때문에 항상 "아래가 아니다"가 된다.
  const atBottom = useRef(true);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onScroll = () => {
      atBottom.current = root.scrollHeight - root.scrollTop - root.clientHeight < STICK_SLACK_PX;
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [rootRef]);

  useEffect(() => {
    if (!atBottom.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [bottomRef, lastMessageId]);

  return {
    stick: () => {
      atBottom.current = true;
    },
  };
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

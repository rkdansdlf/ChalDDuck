"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { humanSize } from "@/features/drive/file-rules";
import { putToStorage, REJECTION_TEXT } from "@/features/drive/use-uploads";
import {
  loadOlderMessages,
  pollNewMessages,
  prepareChatAttachment,
  sendChatMessage,
  softenThreadMessages,
} from "@/server/actions/chat";
import {
  canPurify,
  nextPurifyBatch,
  type ReadCushionSetting,
} from "@/lib/read-cushion";
import type { ChatMessage } from "@/lib/types";
import type { MbtiType } from "@/lib/mbti";
import { usePoll } from "@/lib/use-poll";
import {
  addPendingMessage,
  forgetPendingFile,
  getPendingFile,
  markPendingFailed,
  removePendingMessage,
  resolvePendingMessage,
  setPendingFile,
  useThreadMessages,
} from "./messages-state";

/**
 * 새 말을 확인하는 주기.
 *
 * 대화는 주고받는 리듬이 있어서 몇 초만 늦어도 "안 읽나?" 싶어진다. 3초면 상대가
 * 치는 동안 이미 와 있다. 안 보이는 탭에서는 아예 부르지 않는다(`usePoll`).
 */
const NEW_MESSAGE_POLL_MS = 3000;

/**
 * 낙관적 말풍선의 `clientId`.
 *
 * 임시 id(`pending-3`)에서 값을 얻는다 — 실패했다 다시 눌러도 **같은 값**이 나오므로 서버가
 * 중복을 알아볼 수 있다. 서버가 이미 저장했는데 응답만 늦게 온 경우, 이 값이 같아서
 * 이미 있는 말을 돌려준다.
 */
function clientIdOf(tempId: string): string {
  return `msg-${tempId}`;
}

/**
 * 되돌릴 파일이 없을 때 보여 줄 말.
 *
 * 파일 `File` 객체는 메모리에만 있으므로 새로고침하면 사라진다. 그래도 말풍선은 남는다 —
 * 지우면 사용자는 "내가 보낸 게 아니라" 고 생각하니까. 대신 다시 고르라고 말하고,
 * `onLostFile` 이 호출되면 그 자리에서 파일 고르기를 연다.
 */
const FILE_LOST_TEXT = "파일을 다시 골라 주세요. 브라우저를 새로 고치면 되돌릴 수 없습니다.";

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
  /**
   * 이 브라우저가 이 방의 말을 **어떤 말투로 읽는지**(19 · 31). 서버가 준 값이고,
   * 고른 결과도 이 인자로 다시 내려온다. **순화는 언제나 켜져 있다** — 여기서 끄는 길은 없다.
   */
  cushion: ReadCushionSetting,
  /**
   * 되돌릴 파일을 잃어버린 실패 말풍선을 받았을 때. 그 자리에서 파일 고르기를 열도록
   * 화면이 이걸 쓴다. 안 주면 말로만 알린다.
   *
   * **ref 로 받는다.** 콜백을 그대로 받으면 그 콜백이 `discard` 를 쓰고, `discard` 는 이
   * 호출에서 나온다 — 자기 자신을 역참조하게 된다. 부모는 `useRef` 로 한 번 갱신해 둔다.
   */
  onLostFile?: { current: (message: ChatMessage) => void },
) {
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  /** 방을 연 뒤에 들어온 말. 서버가 처음 준 목록 뒤에 이어 붙인다. */
  const [fresh, setFresh] = useState<ChatMessage[]>([]);

  /**
   * 이 화면이 **지금까지** 받은 순화문(`메시지 id → 순화문`).
   *
   * 서버가 처음 준 목록에는 이미 저장된 순화문이 실려 오지만, 이 대화 중에 도착한 말은
   * 폴링으로 온 뒤에 순화를 시켜야 하니 따로 들고 있다. 다음 폴링이 같은 말을 또
   * 가져와도 이 값이 남는다 — 화면에만 있던 순화문은 다음 갱신에서 사라져, 읽던 사람이
   * "아까 그 말은 순화본이었는데 지금은 원문이네" 를 만나게 된다.
   */
  const [purified, setPurified] = useState<Record<string, string>>({});
  const [purifyWorking, setPurifyWorking] = useState(false);
  /** 순화가 왜 멈췄는지 사람이 읽을 문장. 실패하면 원문으로 읽는다. */
  const [purifyNotice, setPurifyNotice] = useState<string | null>(null);
  /**
   * 이미 순화를 시켜 봤거나, **더는 시키지 않기로 한** 말의 id.
   *
   * 실패한 뒤에도 계속 부르면 한도가 매 3초마다 깎인다(한도 없음 메시지가 오는 액션이다).
   * 그래서 실패하면 그 자리에서 멈추고, 사용자가 "다시 시도"를 누를 때까지 기다린다.
   */
  const purifyTried = useRef(new Set<string>());
  const purifyStopped = useRef(false);
  const purifyInFlight = useRef(false);
  /** "다시 시도" 를 눌렀을 때 효과를 다시 돌리게 하는 신호. */
  const [purifyRetry, setPurifyRetry] = useState(0);

  // 다른 방으로 옮기면 이전 방의 기록을 들고 있을 이유가 없다.
  // 렌더 중에 비교해 바로 반영한다 — effect 로 하면 옛 방의 내용이 한 프레임 비친다.
  const [threadForOlder, setThreadForOlder] = useState(threadId);
  if (threadId !== threadForOlder) {
    setThreadForOlder(threadId);
    setOlder([]);
    setCursor(initialCursor);
    setFresh([]);
    setPurifyNotice(null);
  }

  useEffect(() => {
    purifyTried.current = new Set();
    purifyStopped.current = false;
  }, [threadId]);
  // 순화문은 방마다 다르다. 렌더 중 비교 — effect 로 하면 옛 방의 순화문이 한 프레임 남는다.
  const [purifiedForThread, setPurifiedForThread] = useState(threadId);
  if (threadId !== purifiedForThread) {
    setPurifiedForThread(threadId);
    setPurified({});
  }

  // 화면이 다시 그려지며 `fromServer` 가 새로워지면, 폴링으로 받아 뒀던 것과 겹칠 수 있다.
  const serverIds = new Set(fromServer.map((m) => m.id));
  const onlyNew = fresh.filter((m) => !serverIds.has(m.id));

  const recent = useThreadMessages(threadId, onlyNew.length > 0 ? [...fromServer, ...onlyNew] : fromServer);

  /**
   * 이 화면이 그릴 말들. 서버가 준 순화본과 방금 받은 순화문을 합친다.
   *
   * 순화본이 없는 말은 `null` 로 둔다 — `lib/read-cushion.ts` 의 규칙이 "없으면 원문"을
   * 정하고, 여기서 빈 문자열을 넣으면 그 말이 "순화됨" 표시 없이 빈 글로 그려진다.
   *
   * 합치는 것을 `useMemo` 안에서 한다 — 밖에서 만든 배열은 매 렌더마다 새로 만들어져
   * **아래 순화 효과가 매번 다시 돈다.** 순화 효과는 "아직 없는 묶음이 있을 때만" 부르는
   * 것이라 부수는 같지만, 그 판단을 매 렌더마다 다시 하는 것은 피해야 한다.
   */
  const messages = useMemo(
    () =>
      (older.length > 0 ? [...older, ...recent] : recent).map((message) =>
        message.purifiedText !== null || !purified[message.id]
          ? message
          : { ...message, purifiedText: purified[message.id] },
      ),
    [older, recent, purified],
  );

  /**
   * 순화가 필요한 말을 **한 묶음**씩 시킨다.
   *
   * 언제 부르는가: 아직 순화본이 없고, 내가 쓴 말이 아니고, 아직 시도하지 않은 말.
   * 화면이 이 조건을 여기서 다시 확인하지 않아도 되는 이유는 규칙이
   * `lib/read-cushion.ts` 한 곳에 있기 때문이다.
   *
   * 한 번에 `PURIFY_BATCH_LIMIT` 개만 — 대화방을 처음 열면 지난 말이 수십 개이고, 그
   * 전부를 한 번에 부르면 한도가 다 Gone 된다(묶음 하나가 한도 1회다).
   */
  useEffect(() => {
    if (purifyStopped.current || purifyInFlight.current) return;

    const wanted = messages
      .filter((message) => canPurify(message) && message.purifiedText === null)
      .filter((message) => !purifyTried.current.has(message.id))
      .map((message) => message.id);
    const batch = nextPurifyBatch(messages, wanted);
    if (batch.ids.length === 0) return;

    for (const id of batch.ids) purifyTried.current.add(id);
    purifyInFlight.current = true;
    setPurifyWorking(true);
    setPurifyNotice(null);

    let alive = true;
    softenThreadMessages(threadId, batch.ids)
      .then((result) => {
        if (!alive) return;
        if (result.ok) {
          setPurified((prev) => ({ ...prev, ...result.purified }));
          return;
        }
        // 한도·연결 문제다. **여기서 멈춘다** — 같은 실패를 3초마다 반복하면 사람이
        // 한도를 다 쓰고 원인도 모른다. 원문은 이미 화면에 있다.
        purifyStopped.current = true;
        setPurifyNotice(result.message);
      })
      .catch(() => {
        if (!alive) return;
        purifyStopped.current = true;
        setPurifyNotice("순화하지 못했습니다 — 원문으로 읽습니다.");
      })
      .finally(() => {
        if (!alive) return;
        purifyInFlight.current = false;
        setPurifyWorking(false);
      });

    return () => {
      alive = false;
    };
  }, [purifyRetry, messages, threadId]);

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
      // **다시 눌러도 같은 값으로 보낸다.** 서버가 이미 저장했는데 응답이 늦게 온 경우,
      // 이 값이 같으면 서버가 이미 있는 말을 돌려준다 — 같은 말이 두 개 생기지 않는다.
      const clientId = clientIdOf(tempId);

      try {
        const result = await sendChatMessage(threadId, text, { clientId });
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

  /**
   * 파일 보내기(단톡방만). 저장소에 직접 올린 뒤 그 경로로 말을 남긴다.
   *
   * 올리는 동안에도 말풍선을 먼저 얹는다 — 큰 파일은 몇 초 걸린다. 실패하면 그 말풍선에
   * "다시 보내기"가 붙고, 다시 보낼 때는 **남은 단계만** 한다(이미 올렸으면 다시 올리지 않는다).
   *
   * @returns 다시 해도 소용없는 거절(형식·크기)이면 사람에게 보일 문장. 그때는 말풍선을 남기지 않는다.
   */
  const deliverFile = useCallback(
    async (tempId: string): Promise<string | null> => {
      const job = getPendingFile(tempId);
      // 되돌릴 파일이 없다. 방을 나갔다 오면 예전엔 `useRef` 가 새 것이 되어 여기서
      // 빈 글 전송이 되고 아무 반응도 없었다. 모듈 큐로 옮겼지만, 새로고침으로 파일
      // 객체가 사라졌다면 여기로 온다 — 그때는 화면에 "다시 골라 주세요"를 말하게 한다.
      if (!job) return FILE_LOST_TEXT;
      if (!job.path) {
        const ticket = await prepareChatAttachment({ name: job.file.name, size: job.file.size, type: job.file.type });
        if (ticket.status !== "ok") return REJECTION_TEXT[ticket.status];
        await putToStorage(ticket.signedUrl, job.file, ticket.contentType, () => {});
        job.path = ticket.path;
      }
      const result = await sendChatMessage(threadId, "", { attachment: { path: job.path, name: job.file.name } });
      if (result.ok) {
        forgetPendingFile(tempId);
        resolvePendingMessage(threadId, tempId, result.message);
        return null;
      }
      // 저장소에서 사라진 파일은 같은 경로로 다시 보내도 안 된다 — 같은 실패를 무한히 반복한다.
      // 경로를 버려서 다시 고를 수 있게 한다.
      if (result.rejected === "missing") {
        forgetPendingFile(tempId);
        return FILE_LOST_TEXT;
      }
      if (result.rejected) return REJECTION_TEXT[result.rejected];
      throw new Error("send failed");
    },
    [threadId],
  );

  const sendFile = useCallback(
    async (file: File): Promise<string | null> => {
      const tempId = addPendingMessage(threadId, {
        author: me.name,
        mbti: me.mbti,
        isMine: true,
        text: "",
        // 낙관적 말풍선 — 아직 서버에 없으므로 드라이브에 올렸는지는 알 수 없다(null).
        attachment: { name: file.name, size: humanSize(file.size), image: file.type.startsWith("image/"), savedHref: null },
      });
      setPendingFile(tempId, { file, path: null, threadId });
      try {
        const refused = await deliverFile(tempId);
        if (refused) {
          // 거절은 처음 한 번에만 말풍선을 거둔다. 되돌릴 수 없는 경우(파일이 사라짐)는
          // 말풍선을 **남겨 두고** 고르라는 말을 한다 — 사라진 말을 조용히 지우면
          // 사용자는 내가 보낸 게 아니라고 믿게 된다.
          if (refused !== FILE_LOST_TEXT) removePendingMessage(threadId, tempId);
        }
        return refused;
      } catch {
        markPendingFailed(threadId, tempId);
        return null;
      }
    },
    [threadId, me.name, me.mbti, deliverFile],
  );

  /**
   * 실패한 말을 다시 보낸다.
   *
   * @returns 다시 해도 소용없는 거절이면 사람에게 보일 문장. **거절을 말하지 않으면 사용자는
   *   아무 일도 일어나지 않는 버튼을 계속 누르게 된다** — 첨부가 용량 초과로 거절되면 버튼을
   *   몇 번을 눌러도 아무 말도 없고 말풍선도 그대로라, "다시 보내기"가 동작하지 않는 것처럼
   *   보인다. 처음 보낼 때(`sendFile`)는 이 문장을 돌려줘서 화면이 알림으로 띄운다.
   */
  const retry = useCallback(
    async (message: ChatMessage): Promise<string | null> => {
      // **첨부가 붙은 말인데 되돌릴 파일이 없다**면 글 전송으로 넘기면 안 된다. 글은 비어
      // 있으므로 서버가 조용히 거절하고, 사용자는 아무 일도 일어나지 않는 버튼을 본다.
      if (message.attachment && !getPendingFile(message.id)) {
        onLostFile?.current(message);
        return null;
      }
      try {
        if (getPendingFile(message.id)) {
          // 여기서 **거절 문장을 그대로 돌려준다.** 버리면 첨부는 조용히 실패한다.
          return await deliverFile(message.id);
        }
        // 실패했던 전송과 **같은** `clientId` 로 다시 보낸다 — 서버에 이미 있으면
        // 그 말을 돌려주고, 없으면 새로 저장한다.
        const result = await sendChatMessage(threadId, message.text, {
          clientId: clientIdOf(message.id),
        });
        if (result.ok) {
          resolvePendingMessage(threadId, message.id, result.message);
        }
        // 여전히 실패 — 말풍선은 그대로 두고 다시 누를 수 있게 한다
      } catch {
        // 여전히 실패 — 말풍선은 그대로 두고 다시 누를 수 있게 한다
      }
      return null;
    },
    [threadId, deliverFile, onLostFile],
  );

  /** 실패한 말풍선을 버린다. 지우는 방법이 없으면 아무리 실패해도 그 말이 계속 남는다. */
  const discard = useCallback((message: ChatMessage) => {
    forgetPendingFile(message.id);
    removePendingMessage(threadId, message.id);
  }, [threadId]);

  /**
   * 멈춘 순화를 다시 시킨다. 한도가 찼다가 채워졌거나 AI 연결이 복구된 뒤의 길이다.
   *
   * 시도한 말도 다시 시도할 수 있게 비운다 — 그게 아니면 "다시 시도" 를 눌러도 아무 일도
   * 일어나지 않는다(아까 실패한 말은 이미 목록에서 빠졌으므로).
   */
  const retryPurify = useCallback(() => {
    purifyTried.current = new Set();
    purifyStopped.current = false;
    setPurifyNotice(null);
    setPurifyRetry((n) => n + 1);
  }, []);

  return {
    messages,
    send,
    sendFile,
    retry,
    discard,
    purifyWorking,
    purifyNotice,
    retryPurify,
    fileLostText: FILE_LOST_TEXT,
    hasMore: cursor !== null,
    isLoadingMore,
    loadOlder,
  };
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

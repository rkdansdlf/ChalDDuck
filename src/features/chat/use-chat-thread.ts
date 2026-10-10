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
import { canPurify, cushionOff, type ReadCushionSetting } from "@/lib/read-cushion";
import type { ChatMessage, ChatPurified } from "@/lib/types";
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
 * 한 번 화면에 머물 때 읽기 도움을 **몇 묶음**까지 연속으로 부르는가.
 *
 * 묶음 하나가 AI 한도 1회다. 대화가 40개 쌓여 있으면 4회분이 필요하고, 그걸 한 번에 다 쓰면
 * 대화방을 연 한 사람이 팀 한도의 큰 몫을 사용한다. 그래서 몇 묶음만 싣고 나머지는 나중에
 * 이어받는다.
 */
const DRAIN_ROUNDS = 3;

/** 묶음 사이 한 박자. 결과를 화면에 붙이고 연속 호출로 한도를 훑지 않게. */
const DRAIN_PAUSE_MS = 250;

/**
 * 묶음 예산을 다 썼는데 아직 손볼 말이 남았을 때, **언제** 다시 부르는가.
 *
 * **여기가 그 상한이다.** 남은 것이 있다는 이유만으로 곧바로 다시 부르면 이 예산은 아무런
 * 역할도 하지 못한다 — 끝까지 부르는 것이 되므로. 3초는 새 말 폴링(`NEW_MESSAGE_POLL_MS`)과
 * 같은 주기라, 읽기 도움이 붙는 속도가 "방을 연 뒤 몇 초 동안인가" 로 읽힌다.
 */
const DRAIN_RETRY_MS = NEW_MESSAGE_POLL_MS;

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
   * 고른 결과도 이 인자로 다시 내려온다. **읽기 도움은 언제나 켜져 있다** — 여기서 끄는 길은 없다.
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
   * 이 대화 중에 **아직 서버 결과를 받지 못한** 말들의 읽기 도움 상태(`id → 상태`).
   *
   * 서버가 처음 준 목록에는 저장된 상태가 실려 오지만, 이 대화 중에 도착한 말은 폴링으로
   * 온 뒤에 읽기 도움에 시켜야 하니 따로 들고 있다. 다음 폴링이 같은 말을 또 가져와도 이 값이
   * 남는다 — 화면에만 있던 상태는 다음 갱신에서 사라져, 읽던 사람이 "아까 그 말은 가림이었는데
   * 지금은 원문이네" 를 만나게 된다.
   *
   * **재요청 판단은 브라우저가 하지 않는다.** 예전의 "시도함" 목록이 여기에 있었다가
   * 새로고침에서 리셋돼, 거절된 말을 끝없이 다시 불렀다. 실패 캐시는 DB(`MessagePurification`)에
   * 있고, 서버가 `status` 와 `retryAfter` 로 판단한다.
   */
  const [cushions, setCushions] = useState<Record<string, ChatPurified>>({});
  const [purifyWorking, setPurifyWorking] = useState(false);
  /** 읽기 도움이 왜 멈췄는지 사람이 읽을 문장. 실패하면 원문(또는 규칙 가림)으로 읽는다. */
  const [purifyNotice, setPurifyNotice] = useState<string | null>(null);
  /** 진행 중인가 — 두 번 겹쳐 부르면 같은 말을 두 번 만든다. */
  const drainingRef = useRef(false);
  /**
   * 읽기 도움을 다시 돌리게 하는 신호. **"다시 시도" 와 "묶음 수가 잘렸다" 가 같은 값을 쓴다.**
   *
   * 예전에는 용도가 달라 신호가 둘이었다(`purifyRetry` · 폴링). 그런데 화면이 읽기 도움을 언제
   * 다시 부를지는 결국 "아직 다듬은 말이 없는 말이 있는가" 하나뿐이라, 둘로 나누면 **한쪽을
   * 잊을 수 있다** — 방금 실제로 그랬다. 시그널 하나에 출발점 둘을 묶는다.
   */
  const [drain, setDrain] = useState(0);

  /**
   * 이 대화방을 열었을 때 이미 있던 과거 메시지와 상단 스크롤로 불러온 과거 메시지의 ID 집합.
   *
   * 최초 렌더링 시점에 이미 존재하던 메시지는 애니메이션 없이 즉시 그려야 하며,
   * 세션 도중에 실제로 새로 추가된 메시지만(내가 보낸 말, 폴링으로 도착한 말) 짧은 180ms 트랜지션을 준다.
   */
  const [historyIds, setHistoryIds] = useState<Set<string>>(() => new Set(fromServer.map((m) => m.id)));

  // 다른 방으로 옮기면 이전 방의 기록을 들고 있을 이유가 없다.
  // 렌더 중에 비교해 바로 반영한다 — effect 로 하면 옛 방의 내용이 한 프레임 비친다.
  const [threadForOlder, setThreadForOlder] = useState(threadId);
  if (threadId !== threadForOlder) {
    setThreadForOlder(threadId);
    setOlder([]);
    setCursor(initialCursor);
    setFresh([]);
    setPurifyNotice(null);
    setHistoryIds(new Set(fromServer.map((m) => m.id)));
  }

  // 읽기 도움 상태는 방마다 다르다. 렌더 중 비교 — effect 로 하면 옛 방의 것이 한 프레임 남는다.
  const [cushionsForThread, setCushionsForThread] = useState(threadId);
  if (threadId !== cushionsForThread) {
    setCushionsForThread(threadId);
    setCushions({});
  }

  // 화면이 다시 그려지며 `fromServer` 가 새로워지면, 폴링으로 받아 뒀던 것과 겹칠 수 있다.
  const serverIds = new Set(fromServer.map((m) => m.id));
  const onlyNew = fresh.filter((m) => !serverIds.has(m.id));

  const recent = useThreadMessages(threadId, onlyNew.length > 0 ? [...fromServer, ...onlyNew] : fromServer);

  /**
   * 이 화면이 그릴 말들.
   *
   * **다듬은 말은 말에 붙이지 않고 `purified` 표로 따로 전달한다.** 말(`ChatMessage`)은 사람이
   * 한 글·낙관적 말풍선·서버 응답이 전부 같은 모양이어야 하고, 다듬은 말은 그중 "상대의 말"에만
   * 있다는 사실이 붙지 않는 정보다. 말에 붙이려 하면 세 갈래를 다 따로 맞춰야 했다.
   *
   * 합치는 것을 `useMemo` 안에서 한다 — 밖에서 만든 배열은 매 렌더마다 새로 만들어져
   * **아래 읽기 도움 효과가 매번 다시 돈다.** 읽기 도움 효과는 "아직 없는 묶음이 있을 때만" 부르는
   * 것이라 부수는 같지만, 그 판단을 매 렌더마다 다시 하는 것은 피해야 한다.
   */
  const messages = useMemo(
    () =>
      (older.length > 0 ? [...older, ...recent] : recent).map((message) => {
        const enriched =
          message.purified !== null || !cushions[message.id]
            ? message
            : { ...message, purified: cushions[message.id] };
        return {
          ...enriched,
          isNew: !historyIds.has(message.id),
        };
      }),
    [older, recent, cushions, historyIds],
  );

  /**
   * 읽기 도움을 진행시킨다. **무엇을 다듬을지는 서버가 정한다** — 화면은 이 방을 보라고만 한다.
   *
   * ## 두 가지 시간
   *
   * **묶음 안에서는 기다리지 않는다.** 예전에는 3초 폴링이 AI 를 부르는 유일한 트리거였고,
   * 그래서 읽기 도움이 붙는 속도가 **3초 주기에 묶였다** — AI 가 20초나 걸리는 동안 대화는 이미
   * 지나가 버렸다. 서버가 "아직 남은 게 있다"고 알려 주면 같은 묶음 안에서는 곧바로 다음 묶음으로
   * 넘어간다. 기다리는 기준이 AI 속도다.
   *
   * **묶음 사이에는 3초다.** 이게 한도를 지키는 지점이다(`DRAIN_RETRY_MS`). 남은 것이 있다는
   * 이유만으로 곧바로 다시 걸면 `DRAIN_ROUNDS` 는 상한이 아니라 잠깐의 쉼이 되고, 40개가 쌓인 방은
   * 몇 초 되지 않아 끝까지 부른다. 한 사람이 대화방을 여는 것만으로 그 팀의 하루 한도가 사라지는
   * 일이므로, 남은 일은 새 말 폴링과 같은 리듬으로 이어받는다.
   */
  // 읽기 도움이 켜져 있는가 — **값**으로 만들어 놓는다(아래 효과의 주석 참고).
  const cushionOn = !cushionOff(cushion);

  useEffect(() => {
    // **꺼져 있으면 후보를 만들지 않는다.** 서버도 부르지 않지만, 화면이 부르는 것까지
    // 막아야 "조용히 안 쓰는 것" 이지 "조용히 쓰는 것" 이 아니다.
    //
    // **`cushion` 이 아니라 `cushionOn` 을 의존한다.** 이 효과에서 가장 무서운 실패는
    // **조건이 놓치는 것**이다 — 예전에는 `cushion` 이 의존 배열에 없어서, 이미 열려 있는
    // 방에서 읽기 도움을 켜도 **새 말이 도착할 때까지 아무 일도 일어나지 않았다.** 반대로
    // `cushion` 을 그대로 넣으면 부모가 매 렌더 새 객체를 줄 때 효과가 매번 다시 돌아
    // AI 를 계속 부른다. 조건이 그대로 **값**이면 두 실패가 모두 사라진다.
    if (!cushionOn || drainingRef.current) return;
    // 아직 손볼 것이 없는지 **화면이 아는 것만** 보고 부른다. 모르는 새 말은 서버가 찾는다.
    const maybe = messages.some((message) => canPurify(message) && message.purified === null);
    if (!maybe) return;

    drainingRef.current = true;
    let alive = true;
    /**
     * **묶음 수에 잘려서** 더 싣을 것이 남았나.
     *
     * 신호를 한 번 더 줄지 이 값이 정한다. 실패한 경우에는 **어떤 경우에도 다시 부르지
     * 않는다** — 효과는 `drain` 이 오를 때마다 다시 돌고, "아직 다듬은 말이 없는 말"이 남아
     * 있는 한 조건은 계속 참이다. 실패한 채로 신호만 올리면 서버를 빈틈없이 다시 부르는
     * 순환이 된다. 한도가 찬 채로 남는 게 그쪽이 낫다 — "다시 시도" 를 누를 때까지 멈춘다.
     */
    let truncated = false;

    /**
     * 예산이 바닥났는데 말이 남았을 때 — **3초 뒤에 한 번만** 다시 부른다.
     *
     * 여기가 "한 번에 다 쓰지 않는다" 의 전부다. 남았다는 이유만으로 곧바로 다시 걸면
     * `DRAIN_ROUNDS` 가 상한이 아니라 **한 묶음 사이의 잠깐 쉼**이 되어 버린다 — 40개가 쌓인
     * 방은 묶음 수와 상관없이 3초 기다리지 않고 끝까지 부른다. 한 사람이 대화방을 여는 것만으로
     * 그 팀의 하루 한도가 사라지는 일이 되므로, 남은 일은 새 말 폴링과 같은 리듬으로 이어받는다.
     *
     * 예약은 하나뿐이다. 방을 떠나면 정리에서 취소하고, 살아 있는 동안 두 번 걸리지 않는다.
     */
    let retryTimer: number | null = null;
    const scheduleDrain = () => {
      if (retryTimer !== null) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        if (alive) setDrain((n) => n + 1);
      }, DRAIN_RETRY_MS);
    };

    const run = async () => {
      for (let round = 0; round < DRAIN_ROUNDS; round++) {
        const result = await softenThreadMessages(threadId);
        if (!alive) return;
        if (!result.ok) {
          setPurifyNotice(result.message);
          return;
        }
        setCushions((prev) => ({ ...prev, ...result.cushions }));
        // 남은 게 없으면 여기서 끝. 다음에 새 말이 오면 그때 다시 시작한다.
        if (result.remaining === 0) return;
        // 묶음 사이에 한 박자 둔다 — 결과를 화면에 붙이고, 연속 호출으로 한도를 훑지 않게.
        await new Promise((resolve) => window.setTimeout(resolve, DRAIN_PAUSE_MS));
        // 마지막 묶음까지 싣고도 남았으면 —— 이 실행의 예산은 끝났다. 이어받기는 예약한다.
        if (round === DRAIN_ROUNDS - 1) truncated = true;
      }
    };

    Promise.resolve()
      .then(() => {
        if (alive) setPurifyWorking(true);
        return run();
      })
      .catch(() => {
        if (alive) setPurifyNotice("다듬지 못했습니다 — 원문으로 읽습니다.");
      })
      .finally(() => {
        if (!alive) return;
        drainingRef.current = false;
        setPurifyWorking(false);
        // 더 싣을 것이 남았을 때만(묶음 수에 잘렸을 때만) **3초 뒤에** 신호를 준다.
        // 실패했다면 주지 않는다 — 효과의 조건("다듬은 말이 없는 말이 있다")이 여전히 참이라,
        // 부르면 실패하고 또 부르고가 된다. 다음 폴링은 멈춘 읽기 도움으로 대신해주지 않지만
        // 새 말이 도착해 `messages` 가 바뀌면 자연히 다시 시도한다.
        if (truncated) scheduleDrain();
      });

    return () => {
      alive = false;
      // 방을 떠난 뒤 예약된 재시도가 남으면 안 된다 — 화면이 없는 곳에서 AI 를 다시 부른다.
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };
  }, [drain, messages, threadId, cushionOn]);


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
      setHistoryIds((prev) => {
        const next = new Set(prev);
        for (const m of page.messages) next.add(m.id);
        return next;
      });
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
          setHistoryIds((prev) => new Set(prev).add(result.message.id));
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
        setHistoryIds((prev) => new Set(prev).add(result.message.id));
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
          setHistoryIds((prev) => new Set(prev).add(result.message.id));
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
   * 멈춘 읽기 도움을 다시 시킨다. 한도가 찼다가 채워졌거나 AI 연결이 복구된 뒤의 길이다.
   *
   * 시도한 말도 다시 시도할 수 있게 비운다 — 그게 아니면 "다시 시도" 를 눌러도 아무 일도
   * 일어나지 않는다(아까 실패한 말은 이미 목록에서 빠졌으므로).
   */
  const retryPurify = useCallback(() => {
    setPurifyNotice(null);
    setDrain((n) => n + 1);
  }, []);

  return {
    /**
     * 그릴 말들. **다듬은 말이 이미 말에 붙어 있다** — 위 `useMemo` 가 `cushions` 를 합친 결과를
     * 그대로 내보내므로, 화면이 읽기 도움 상태 표를 따로 받을 필요가 없다(`MessageBubble` 도
     * `message` 에서만 읽는다).
     */
    messages,
    /**
     * 읽기 도움 상태를 **비운다.** 끄는 즉시 불러야 한다 — 설정이 꺼졌는데 화면에만 남은 읽기 도움문이
     * 있으면 사용자는 "꺼졌는데 왜 여전히 다듬어진 말이지" 라고 본다.
     */
    setCushions,
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

import type { Element } from "./engine";

/**
 * 사주 밸런스 게임의 질문 — 두 선택지 중 하나를 고르는 가벼운 질문.
 *
 * 선택지마다 오행 키워드가 하나 붙어 있다(`ELEMENT_WORD`). 투표한 뒤에 "이 선택의 키워드"로 보여 주는
 * **재미 표시**일 뿐이고, 고른 것으로 그 사람이 무엇인지 말하지 않는다. 질문은 팀 활동에서 흔한 순간을
 * 담고, 어느 쪽이 옳다고 하지 않는다. 역할과도 무관하다.
 *
 * `id` 는 DB 에 저장되는 값이다 — **바꾸지 않는다.** 문구는 고쳐도 되지만 id 를 바꾸면 이미 쌓인 표가
 * 떨어져 나간다. 질문을 지울 때는 목록에서만 빼면 되고, 남은 표는 집계에서 조용히 무시된다.
 */
export type BalanceChoice = "a" | "b";

export type BalanceQuestion = {
  id: string;
  prompt: string;
  a: { label: string; element: Element };
  b: { label: string; element: Element };
};

export const BALANCE_QUESTIONS: readonly BalanceQuestion[] = [
  {
    id: "meeting-start",
    prompt: "회의를 시작할 때",
    a: { label: "일단 아이디어부터 던져 본다", element: "fire" },
    b: { label: "먼저 오늘의 목표부터 맞춘다", element: "earth" },
  },
  {
    id: "opinions-split",
    prompt: "의견이 갈릴 때",
    a: { label: "충분히 더 이야기해 본다", element: "water" },
    b: { label: "일단 하나 정해서 해 본다", element: "wood" },
  },
  {
    id: "deadline",
    prompt: "마감이 다가오면",
    a: { label: "미리미리 끝내 둔다", element: "metal" },
    b: { label: "막판에 집중해서 몰아서 한다", element: "fire" },
  },
  {
    id: "collect",
    prompt: "자료를 모을 때",
    a: { label: "빠르게 넓게 모은다", element: "wood" },
    b: { label: "꼼꼼하게 분류하며 모은다", element: "metal" },
  },
  {
    id: "chat-reply",
    prompt: "팀 채팅에 답할 때",
    a: { label: "바로바로 답한다", element: "fire" },
    b: { label: "생각을 정리하고 답한다", element: "water" },
  },
  {
    id: "decide",
    prompt: "무언가를 정할 때",
    a: { label: "다 같이 투표로 정한다", element: "earth" },
    b: { label: "서로 의견을 듣고 조율한다", element: "water" },
  },
  {
    id: "present-prep",
    prompt: "발표를 준비할 때",
    a: { label: "슬라이드부터 만든다", element: "wood" },
    b: { label: "대본부터 쓴다", element: "metal" },
  },
  {
    id: "after-done",
    prompt: "팀플이 끝나면",
    a: { label: "바로 뒤풀이를 간다", element: "fire" },
    b: { label: "조용히 쉰다", element: "water" },
  },
];

const IDS = new Set(BALANCE_QUESTIONS.map((q) => q.id));

export const isBalanceQuestion = (id: unknown): id is string => typeof id === "string" && IDS.has(id);
export const isBalanceChoice = (c: unknown): c is BalanceChoice => c === "a" || c === "b";

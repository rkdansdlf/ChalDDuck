/**
 * poke(독촉) → 쿠션 번역기로 넘길 **요청문**을 만드는 순수 계산.
 *
 * ## 왜 순수 함수인가
 *
 * "누구에게 · 무엇을 · 언제까지" 를 **문장으로 엮는 규칙**은 화면에 있으면 안 된다.
 * 화면이 두 곳(poke 와 쿠션)에서 각각 만들면 **같은 독촉인데 말이 달라지고**, 어느 쪽이
 * 맞는지 알 길이 없어진다. 특히 **마감 문장을 만드는 규칙**은 그렇다 — 여기가 잘못 만들면
 * **존재하지 않는 마감**이 생긴다.
 *
 * ## 대칙 — **있는 것만 쓴다**
 *
 * - 마감은 **있을 때만** 문장으로 만든다. `미정` 이면 마감 문장을 아예 만들지 않는다.
 *   "언제까지" 를 지어내면 그건 독촉이 아니라 **압박**이고, 사람이 되풀이할 책임은 우리에게
 *   있다(쿠션 번역기의 대 principle — 요구를 없애거나 늦추지 않는다).
 * - 업무 이름도 **있는 그대로** 쓴다. 요약하지 않는다 — 짧게 만들려고 고치다가
 *   "무엇을" 이 사라지면 독촉이 아니라 인상이 된다.
 *
 * ## 여기서 "다듬지 않는다"
 *
 * 이 문장은 **사람이 하려던 독촉의 뼈대**이고, 말투는 쿠션 번역기가 바꾼다. 그래서
 * "그냥 보내기"(poke)와 "다듬고 보내기"(쿠션)는 **요구하는 내용이 같다** — 달라지는 건
 * 말투뿐이다. 이게 두 길의 유일한 차이여야 한다.
 */

/** poke 화면이 넘길 수 있는 값. **`Task` 전체가 아니라 필요한 것만** — reasons 같이는 나가지 않는다. */
export type PokeRequest = {
  /** 남에게 알려 줄 그 사람. 화면이 이미 걸러 낸 팀원 한 명이어야 한다. */
  assigneeName: string;
  /** 업무 제목. 있는 그대로 쓴다. */
  title: string;
  /**
   * 업무의 마감. **자유 텍스트**다("9/22", "다음 주", "미정"). 여기서 시각으로 바꾸지 않는다
   * — `Task.due` 정규화는 별도 트랙이고, 지금은 화면에 적힌 말을 그대로 쓴다.
   */
  due: string;
};

/** 마감 문장이 필요한지 — `미정` 과 빈 값은 "없음" 이다(`dueOf` 가 빈 값을 그렇게 저장한다). */
function hasDue(due: string): boolean {
  const trimmed = due.trim();
  return trimmed !== "" && trimmed !== "미정";
}

/**
 * 독촉 요청문을 만든다.
 *
 * **말투를 고르지 않는다** — 그것이 쿠션 번역기의 몫이다. 여기서 이미 부드럽게 만들면
 * "다듬고 보내기" 와 "그냥 보내기" 가 같은 문장이 되어 쿠션 도구가 아무 일도 하지 않는다.
 *
 * @returns 넘길 문장. 넘길 것이 없으면(담당자나 업무 이름이 비었다) `null` —
 *   **빈 문자열을 돌려주지 않는다.** 화면이 그걸 "다듬을 문장" 으로 오해하고 빈 칸을 연다.
 */
export function pokeRequestText(request: PokeRequest): string | null {
  const assignee = request.assigneeName.trim();
  const title = request.title.trim();
  // **둘 중 하나라도 없으면 문장을 만들지 않는다.** 없는 이름으로 부르거나 없는 일을 재촉하는
  // 문장은 만들 수 없다.
  if (!assignee || !title) return null;

  const parts = [`${assignee}님`, `${title} 부탁드려요`];

  // **마감은 있을 때만.** 없으면 "언제까지" 를 지어내지 않는다.
  if (hasDue(request.due)) parts.push(`${request.due.trim()}까지`);

  return `${parts.join(", ")}.`;
}

/**
 * poke 화면에서 **"다듬고 보내기"** 를 보여 줘야 하는가.
 *
 * - 담당자가 없으면 안 된다 — 보낼 사람이 없다.
 * - **오늘 이미 보냈으면 다시 권하지 않는다.** 같은 말을 두 번 다듬게 하면 한도가 두 번 깎이고,
 *   어차피 어제 알림을 받은 사람이니 의미가 없다.
 * - 업무 제목이 비었으면 안 된다 — 문장을 만들 수 없다.
 */
export function canOfferCushion(input: {
  assigneeName: string | null;
  title: string;
  alreadySent: boolean;
}): boolean {
  return (
    Boolean(input.assigneeName?.trim()) &&
    input.title.trim() !== "" &&
    !input.alreadySent
  );
}
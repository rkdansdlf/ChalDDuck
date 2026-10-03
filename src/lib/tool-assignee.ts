import { normalizeName } from "@/features/roles/roster-model";
import type { ToolMember } from "@/lib/team-tool-context";

// `ToolMember` 를 여기서 다시 편하게 쓴다 — 이 파일의 공개 API 는 `ToolMember` 를 **인자로**
// 받으므로, 이 types 를 그대로 노출해 **한 곳의 정의** 를 유지한다(중복 정의는 어긋난다).
export type { ToolMember };

/**
 * 모델이 적은 담당자 이름을 **실제 팀원 id** 로 매칭한다.
 *
 * ## 왜 코드가 하는가 — 이 파일이 2단계의 심장이다
 *
 * AI 서기는 "담당자는 메모에 그 사람이 하기로 적혀 있을 때만" 이름을 넣는다고 지시를
 * 받는다. 하지만 **지시만으로는 충분하지 않다.** 실측에서 무료 모델은 담당자 미정인 메모에
 * 팀에 있는 이름을 **문맥에서 집어와서** 채웠다(0단계 벤치: `ling-3.0-flash-sante:free`
 * 가 "자료 정리 → 유나" 로 채웠다). 즉 **문맥을 주면 오히려 추측이 늘어난다.**
 *
 * 그래서 두 겹으로 막는다.
 * 1. **프롬프트** — 팀원 이름을 준다(이 파일 옆의 `team-tool-context.ts`). 안 주면 모델은
 *    이름 전체를 지어내고, 그러면 매칭이 0건이라 사용자는 아무것도 못 한다.
 * 2. **코드(여기)** — 모델이 적은 이름이 실제 팀원인 **때만** 통과시킨다. 매칭되지 않으면
 *    `null` 이고, 그 `null` 은 사람이 정해야 한다는 뜻이다.
 *
 * ## 매칭하지 않는 경우의 수가 네 개인 이유
 *
 * 매칭의 실패를 "안 됨" 하나로 두면 **왜 안 됐는지**를 알 수 없고, 그러면 사람이 매번
 * 같은 실수를 되풀이한다. 실패를 이름을 붙여 구분한다. 화면·로그·벤치가 이 값을 그대로 쓴다.
 *
 * | 결과 | 뜻 | 고치는 곳 |
 * |---|---|---|
 * | `matched` | 팀원 id (전체 이름 또는 **성을 뺀 이름**, 유일할 때) | — |
 * | `unset` | "미정"/빈 값 — **모델도 정하지 않은 것** | 없음. 사람이 정하면 된다 |
 * | `no-match` | 이름이 **어느 팀원도 아니다** | 모델이 지어냈다. 문맥에 명단이 있더라면 문제 |
 * | `ambiguous` | **동명이인이 둘 이상** | 데이터 문제. **누군가 임의로 고르면 안 된다** |
 *
 * ## 왜 부분 일치를 하지 않는가 — 이 앱의 대 원칙
 *
 * "민준이" → "민준", "김민준이" → "김민준" 같은 처리를 붙이면 매칭률이 올라가고 **틀린
 * 배정이 같은 만큼 늘어납니다.** 팀플에서 담당자를 잘못 채우는 일은 그 일을 아무도 안 하게
 * 만드는 일입니다 — 07 의 "MBTI 로 역할 배정 금지" 와 같은 급의 약속이고, 실제로
 * 이미 한 번 사람이 조용히 배정당하는 사고가 났습니다(`git log`: "남의 할 일에 담당자를
 * 조용히 매달지 못하게 한다").
 *
 * **정확한 이름만 통과시키고, 애매하면 null.** `null` 은 실패가 아니라 "사람이 정해야 한다" 는
 * 신호입니다 — 화면이 그 문구를 그대로 보여 줍니다.
 */

/** 매칭이 실패한 이유. `null` 은 **매칭됐다** 는 뜻이다. */
export type AssigneeMissReason = "unset" | "no-match" | "ambiguous";

/** 매칭 결과. **성공이 아니면 왜인지**를 항상 함께 돌려준다. */
export type AssigneeMatch =
  | { id: string; name: string }
  | { id: null; reason: AssigneeMissReason; name: string | null };

/**
 * 한국어 **조사** — 이름 뒤에 붙어 나온다.
 *
 * 실측: 모델이 담당자를 `서연이` 로 적었다. `이서연` 과 `endsWith` 로는 한 글자 차이로
 * 매칭되지 않는다. 사람이 회의에서 "서연이가 했다"고 말한 그대로를 적은 것이라 **모델의
 * 잘못이 아니다** — 그러니 이것까지 거절하면 정상 매칭이 계속 실패한다.
 *
 * ## 왜 목록이 짧은가 — ** conservatism 이 목적이다**
 *
 * 조사는 길수록 위험하다. `이라고`(직급) 같은 긴 꼬리를 떼어 내면 사람 이름이 아닌 것이
 * 이름처럼 남을 수 있다. **짧고 확실한 것만** 떼고, 떼면 2 글자보다 짧아지면 **안 뗀다**
 * (`만이` → `만` 은 이름이 아니므로 1 글자가 되어 원래대로 둔다).
 *
 * ⚠️ **순서를 지킨다** — 긴 것을 먼저 확인해야 한다. `이라고` 를 `로` 로 떼면 `이` 가 남아
 * 어중간한 이름이 된다.
 */
const PARTICLES = ["이라고", "이라는", "이랑", "한테", "에게", "이고", "이라서", "이", "가", "은", "는", "을", "를", "의", "와", "과", "도", "만", "야"] as const;

/**
 * 이름에서 조사만 떼어 낸다. **2 글자보다 짧아지면 떼지 않는다.**
 *
 * ⚠️ **한 번이 아니라 계속 떼어야 한다.** `민준이가` 는 `가` 를 떼면 `민준이` 가 남고,
 * 거기서 또 `이` 를 떼야 `민준` 이 된다. **한 번만 떼면 절반의 형태가 남는다** — 실측에서
 * 나온 `서연이`(한 번에 됨)와 `민준이가`(두 번)를 모두 처리하려면 반복이 필요했다.
 *
 * 매번 길이가 줄므로 **반복은 반드시 끝난다** — 무한 루프가 되지 않는다.
 */
export function stripKoreanParticle(raw: string): string {
  let name = normalizeName(raw);
  for (;;) {
    const next = PARTICLES.reduce<string | null>((acc, particle) => {
      if (!name.endsWith(particle)) return acc;
      const left = name.slice(0, -particle.length);
      // **2 글자보다 짧아지면 떼지 않는다.** "만이" → "만" 은 이름이 아니다.
      return left.length >= 2 ? left : acc;
    }, null);
    // 더 떼낼 수 없으면(못 찾았거나 떼면 너무 짧아짐) 여기서 멈춘다.
    if (next === null) return name;
    name = next;
  }
}

/** 같은 이름이라고(null·빈 값) 담당자가 정해지지 않은 것으로 본다. */
function isUnsetName(name: string): boolean {
  const trimmed = normalizeName(name).toLowerCase();
  return trimmed === "" || ["미정", "없음", "null", "none", "n/a", "-", "모르겠음", "정해지지 않음"].includes(trimmed);
}

/**
 * 성을 뗀 이름으로도 배정한다 — **유일할 때만.**
 *
 * ## 왜 이 규칙이 없으면 기능이 아예 통하지 않는가
 *
 * 명단은 `김민준·최유나` 로 저장되지만 사람들은 회의에서 `민준·유나` 라고 말합니다. 모델도
 * 메모에 적힌 대로 `유나` 를 적습니다(실측). 그래서 **완전 일치만 하면 정상 매칭의 대부분이
 * 실패**하고, 매칭되지 않은 이름은 규칙대로 `null` 이 되어 화면에 아무것도 안 남습니다.
 * 규칙이 옳아서 기능이 죽는 경우입니다.
 *
 * ## 그래도 "유사도 매칭" 이 아니다
 *
 * 이건 추측이 아니라 **한국어 이름의 알려진 형태 두 가지**를 다루는 것입니다.
 * `유나` → `최유나` 는 `endsWith` 라는 **정확한 규칙**이고, 점수 계산이 없다. 억지로 붙인
 * 이름(`민준이`, `김민준 경`)은 매칭되지 않습니다 — 그건 여전히 `no-match` 다.
 *
 * ## 유일하지 않으면 `null` — 이 규칙이 위험을 막는다
 *
 * 팀에 `최유나` 와 `이유나` 가 있으면 "유나" 하나로 누구인지 알 수 없다. **첫째를 고르면
 * 아무도 책임질 사람이 없는 업무**가 생기고, 고른 사람은 그 사실을 모른다. `ambiguous` 를
 * 돌려서 **"누군지 물어야 한다"** 로 남기는 편이 낫습니다.
 *
 * ⚠️ **`Member.name` 에 `@@unique([teamId, name])` 가 있어 같은 팀의 같은 이름은 안 겹칩니다.**
 * 그래서 이 갈래는 **오늘 일어나지 않습니다.** 그래도 둡니다 — 성을 뗀 이름은 겹칠 수 있고
 * (`최유나`/`이유나`), 그 규칙이 풀리는 날 아무도 이 코드를 보지 않을 것입니다.
 */
function matchByGivenName(
  name: string,
  members: readonly ToolMember[],
): Array<ToolMember> {
  return members.filter((m) => {
    const full = normalizeName(m.name);
    // **성(1~2자)이 남아 있어야 한다.** 그래야 두 글짜리 이름 "민준" 에 "민" 이 붙지 않는다.
    return full.length > name.length && full.endsWith(name);
  });
}

/**
 * 모델이 적은 이름 하나를 팀원 한 명에게 매칭한다.
 *
 * @param name 모델이 적은 이름. **비워도 된다** — 그건 "담당 미정" 이라 정상이다.
 * @param members 팀원 명단. **이 명단에 있는 사람만** 담당자가 될 수 있다.
 */
export function matchAssigneeToMember(
  name: string | null | undefined,
  members: readonly ToolMember[],
): AssigneeMatch {
  // **조사를 먼저 뗀다.** 그래야 아래 규칙들이 `서연이` 같은 값을 다룬다 — 안 떼면 성을 뗀
  // 이름 규칙도, 전체 일치도, 성에 걸리지 않는다. 떼고 나서도 남는 게 없으면 그대로 간다.
  const said = stripKoreanParticle(name === null || name === undefined ? "" : name);

  if (isUnsetName(said)) return { id: null, reason: "unset", name: null };

  // 1순위 — **이름 전체가 같은 경우.** 성을 뗌 판정보다 먼저 본다(더 확실하기 때문).
  const exact = members.filter((m) => normalizeName(m.name) === said);
  if (exact.length === 1) return { id: exact[0].id, name: exact[0].name };
  if (exact.length > 1) return { id: null, reason: "ambiguous", name: said };

  // 2순위 — 성을 뺀 이름. **두 글자 이상일 때만**("유" 하나로 "유나" 를 찾으면 안 된다).
  if (said.length >= 2) {
    const given = matchByGivenName(said, members);
    if (given.length === 1) return { id: given[0].id, name: given[0].name };
    if (given.length > 1) return { id: null, reason: "ambiguous", name: said };
  }

  return { id: null, reason: "no-match", name: said };
}

/**
 * 후보 목록의 담당자를 **한꺼번에** 매칭한다.
 *
 * 후보마다 따로 부르되 **한 번에** 부르는 이유는 두 가지다.
 * - **같은 이름 규칙이 한 곳에 있어야 한다.** 후보마다 다른 판정을 하면 후보 3개 중 1개만
 *   매칭되는 상태가 조용히 나온다.
 * - **사람은 후보마다 확인해야 한다.** 매칭이 없으면 화면이 그 사실을 보여 주므로, 여기서
 *   임의로 지우지 않는다 — 후보 자체를 버리는 것은 사람이 정할 몫이다.
 */
export function matchAssigneeCandidates<T extends { assignee: string | null }>(
  candidates: readonly T[],
  members: readonly ToolMember[],
): Array<T & { matchedId: string | null; matchReason: AssigneeMissReason | null }> {
  return candidates.map((candidate) => {
    const match = matchAssigneeToMember(candidate.assignee, members);
    return {
      ...candidate,
      matchedId: match.id,
      // 매칭됐으면 사유가 없다 — 화면이 "왜 비었나" 를 물으면 그때 "이름이 명단에 없다" 다.
      matchReason: match.id === null ? (match as { reason: AssigneeMissReason }).reason : null,
    };
  });
}

/**
 * 화면의 담당자 칩에 **누가 골랐는지**를 붙인다.
 *
 * ## 왜 표시해야 하는가 — 2단계-a2 결정(한 번 유지 + 출처 표시)
 *
 * a1 이후 담당자 칩은 **명단에 실제로 있는 이름**을 보여 준다("민준" → "최유나"). 그런데
 * 그게 **더 그럴듯해졌다** — 명단에 없는 형태일 때는 임시처럼 보였는데, 실제 팀원 이름은
 * **결정한 것처럼 읽힌다.** 스크롤만 하는 사람은 구분하지 못한다.
 *
 * 이건 이 저장소가 이미 한 번 겪은 사고의 같은 모양이다
 * (`git log`: "남의 할 일에 담당자를 조용히 매달지 못하게 한다"). **위험은 승인이 몇 단계인지가
 * 아니라 누가 골랐는가를 아는가** 다 — 그래서 단계를 늘리지 않고 **출처를 밝힌다.**
 *
 * ## 언제 표시가 사라지는가
 *
 * **사람이 그 칩을 건드리면 사라진다.** 그 순간부터는 사람이 고른 값이라 AI 출처가 아니다.
 * 다시 같은 이름으로 돌아와도(순환 버튼이라 가능) 사람 선택이 우선이다 — 값이 같아도
 * **누가 정했는지가 다르다.**
 *
 * ## 표시하지 않는 경우
 *
 * - 담당자가 비어 있으면 — **`null` 을 돌려준다.** "AI 가 비웠어요" 를 칩에 붙이면 아무도
 *   원인을 모르고, 필요한 안내는 `assigneeReason` 쪽 문구가 이미 하고 있다.
 * - 예시 결과(`assigneeReason` 없음) — 매칭을 시도하지 않았으므로 "AI 가 읽었다" 는 말도 없다.
 */
export type AssigneeOrigin = "ai" | "human" | null;

/**
 * 담당자 칩의 출처.
 *
 * @param modelName 모델이(그리고 코드 매칭이) 정해 둔 이름.
 * @param currentNow 화면에 지금 보이는 이름 — 사람이 순환시키면 이게 바뀐다.
 * @param touched 사람이 이 칩을 건드렸는지.
 */
export function assigneeOrigin(input: {
  modelName: string | null;
  currentNow: string | null;
  touched: boolean;
  /** 예시 결과에는 없다 — 매칭을 시도하지 않았다는 뜻. */
  reason?: AssigneeMissReason | "matched";
}): AssigneeOrigin {
  // 사람이 건드렸으면 그 순간부터 사람 선택이다. 순환으로 같은 이름으로 돌아와도 그렇다.
  if (input.touched) return "human";
  // 담당자가 없으면 표시할 것이 없다 — "AI 가 비웠어요" 는 안내가 아니라 수족관이다.
  if (!input.currentNow) return null;
  // **매칭을 시도하지 않은 결과**(예시)는 "AI 가 읽었다" 고 말할 수 없다.
  if (!input.reason) return null;
  // 사람이 순환으로 값이 달라졌으면 이미 사람이 고른 값이다.
  if (input.currentNow !== input.modelName) return "human";
  return "ai";
}

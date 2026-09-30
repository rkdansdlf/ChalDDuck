import type { ClerkDraft, PresentDraft } from "@/lib/types";

/**
 * 모델이 돌려준 초안을 **화면에 올릴 수 있는 모양으로 정리한다.**
 *
 * ## 왜 `server-only` 가 아니다
 *
 * 프롬프트가 아니라 **여기가 지켜야 하는 약속**이기 때문이다. 화면도 서버도 같은 판정을 받아야
 * 하고, 스모크(`npm test`)가 모델을 부르지 않고 이 규칙을 확인할 수 있어야 한다 — AI 를
 * 불러야만 확인할 수 있는 약속은 안 지켜졌을 때 아무도 모른다.
 *
 * 도구와 약속은 두 가지다.
 * - **AI 서기** — 담당자는 회의에서 정해졌을 때만 이름이다. 정해지지 않았으면 `null`.
 * - **발표 지원** — 대본에 없던 수치·사례·주장을 넣지 않는다.
 *
 * ⚠️ 이 파일이 지킨 것은 **모양**이다. "메모에 없는 이름을 만들어 낼 것인가" 는 모델의
 * 일이라 코드가 막을 수 없다 — 그래서 그건 벤치(`npm run tool:bench`)가 잰다. 여기서
 * 막을 수 있는 것은 **모델이 이미 틀렸을 때 그것이 사람에게 담당자처럼 보이는 것을 막는 것**이다.
 */

/**
 * 모델이 "없음"을 적는 방식이 제각각이다 — 빈 문자열, "null", "미정", "<UNKNOWN>".
 * 무료 라우터에서 실제로 겪었다. 프롬프트로 부탁만 하지 않고 여기서 한 번 더 거른다.
 */
const NOTHING = new Set(["", "null", "none", "n/a", "미정", "없음", "<unknown>", "unknown", "-"]);

/**
 * model이 "없음"을 적을 때 **문장 부호를 다 붙여 온다** — "없음.", "미정입니다", "n/a ".
 *
 * 실측에서 `없음.` 이 그대로 남아 **담당자 자리에 이름처럼 보였다.** 앞뒤 공백만 걷어내는 것으로
 *는 못 막는다 — 사람이 읽을 글에는 마침표가 붙는 게 자연스럽기 때문이다. 그래서 **비교할 때는
 * 문장 부호와 "입니다" 류를 걷어낸다.**
 *
 * ⚠️ **표시할 값에는 이 처리를 하지 않는다.** 사람이 볼 이름이 "김민준." 이 되어서는 안 된다.
 * 여기서는 "없음인가" 를 **판단**하는 데만 쓴다.
 */
function bareOf(value: string): string {
  return value
    .replace(/[.。!！?？,，·:;'"`~\s]+/gu, "")
    .replace(/(입니다|했습니다|같습니다|입니다\.|없음입니다)/gu, "")
    .toLowerCase();
}

export function orNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  return NOTHING.has(bareOf(trimmed)) ? null : trimmed;
}

/** 모델이 준 후보 한 줄. 아직 신뢰하지 않는다 — `assignee` 는 문자열일 수도, 없을 수도 있다. */
type RawCandidate = {
  title?: string | null;
  assignee?: string | null;
  basis?: string | null;
  due?: string | null;
};

type RawClerkDraft = {
  summary?: string | null;
  candidates?: RawCandidate[] | null;
};

/**
 * AI 서기의 응답을 후보 목록으로 정리한다.
 *
 * ## 담당자를 `null` 로 만드는 세 갈래
 *
 * 1. **아예 안 왔다** — 필수가 아니어서 프롬프트를 못 지킨 모델이 이렇게 한다.
 * 2. **"없음" 을 적은 말** — `""`·`"미정"`·`"null"`·`"-"` 등. `orNull` 이 거른다.
 * 3. **빈 공백뿐인 경우** — 사람이 이름 한 글자도 안 적었는데 담당자가 있다고 보이는 것.
 *
 * 이 셋 중 어느 것이라도 남겨두면 **아무도 책임지지 않는 업무**가 화면에 놓인다 — 07 의
 * MBTI 배정 금지와 같은 급의 약속이다. 그래서 "이름이 없다"는 사실은 `null` 하나로만
 * 표현한다. 빈 문자열도 `"미정"` 도 `null` 이 아니라면 **정해진 것처럼 보인다.**
 *
 * ## `id` 를 다시 매기는 이유
 *
 * 모델이 준 번호는 신뢰하지 않는다. 화면이 편집·삭제·승인할 때 이 값으로 줄을 가리키는데,
 * 모델이 두 후보에 같은 번호를 주면 한 줄이 두 번 다루어진다. **여기서 다시 매겨 순서를
 * 고정한다.**
 */
export function shapeClerkDraft(raw: RawClerkDraft | null | undefined): ClerkDraft {
  const summary = (raw?.summary ?? "").trim();
  // **배열이 아니면 빈 목록으로 본다.** 모델이 함수의 인자를 이상한 모양으로 주면(실제로
  // `"candidates": "x"` 같은 것이 가능하다) 여기서 `.filter` 가 터져 도구 전체가 죽는다.
  // 초안을 못 만드는 것과 **화면이 꺼지는 것** 중 고를 수 있다면 전자를 고른다.
  const candidates = Array.isArray(raw?.candidates) ? raw.candidates : [];
  return {
    summary,
    candidates: candidates
      // 제목 없는 후보는 화면에서 빈 줄이 된다.
      .filter((c) => orNull(c?.title) !== null)
      .map((c, index) => ({
        id: `c${index + 1}`,
        title: (c.title ?? "").trim(),
        // 담당자는 **정해졌을 때만** 이름이다. 빈 문자열이 넘어오면 정해진 것처럼 보여
        // 아무도 책임지지 않는 업무가 생긴다.
        assignee: orNull(c?.assignee),
        basis: orNull(c?.basis) ?? "담당 미정 — 직접 정해 주세요",
        due: orNull(c?.due) ?? "미정",
      })),
  };
}

type RawPresentDraft = {
  refined?: string | null;
  questions?: (string | null)[] | null;
};

/**
 * 발표 지원의 응답을 정리한다.
 *
 * **질문만 남긴다.** 답을 적으면 "발표자가 모르는 답"이 초안으로 들어가는 길이 생긴다 —
 * 질문 뽑기가 목적인 도구가 아니라 그 답을 쓰는 도구가 된다.
 */
export function shapePresentDraft(raw: RawPresentDraft | null | undefined): PresentDraft {
  const questions = Array.isArray(raw?.questions) ? raw.questions : [];
  return {
    refined: (raw?.refined ?? "").trim(),
    questions: questions.map((q) => (q ?? "").trim()).filter(Boolean),
  };
}

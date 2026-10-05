import type { TeamToolContext } from "@/lib/team-tool-context";

/**
 * 리서처 검색어 **초안**을 팀 문맥에서 뽑는다.
 *
 * ## 왜 칩으로 보여 주고 자동으로 채우지 않는가
 *
 * 자동 완성처럼 **입력을 덮어쓰면 사람이 무엇을 검색할지 고를 수 없다.** 리서처의 결과는
 * 그대로 화면에 나오고 그 주소로 수업을 내므로, **어떤 말을 넣었는지가 결과의 근거**다.
 * 그걸 프로그램이 대신 정하면 "왜 이 결과가 나왔지" 를 알 길이 없어진다.
 *
 * 그래서 **초안만 만든다** — 누가 누르느냐는 사람이 정한다.
 *
 * ## 무엇을 뽑나 — 있는 것만
 *
 * 두 가지 신호만 씁니다. 둘 다 팀에 이미 있는 값이고, **어느 것도 지어내지 않습니다.**
 *
 * - **팀 이름** — 팀플 팀 이름에는 실제 과제 이름이 들어 있는 경우가 많다
 *   ("디지털콘텐츠기획 3조"). 그래서 가장 좋은 검색어 재료입니다.
 * - **열린 업무가 있는 역할** — "자료조사" 역할에 일이 쌓여 있으면 그쪽을 찾는 게 자연스럽습니다.
 *
 * ⚠️ **업무 제목은 쓰지 않습니다.** 일마다 바뀌어서 **추천 목록이 매일 달라지고**, 또
 * "OO 정리" 같은 제목을 그대로 검색하면 이미 있는 글만 나온다. 바뀌는 목록은 신뢰를 떨어뜨린다.
 *
 * ## 문장 조립을 여기서 전부 소유한다
 *
 * "관련 연구" 같은 꼬리를 붙이는 규칙이 화면마다 달라지면 같은 팀이 다른 말을 검색하게
 * 된다. 형식은 한 곳에서 만든다(`features/tools` 쪽과 같은 이유).
 */

/** 검색어 후보는 이만큼만 — 많으면 고르는 일 자체가 일이 된다. */
const SUGGESTION_LIMIT = 3;

/** 문장 중복을 없애기 위한 정규화 — 팀 이름이 두 번 나오면 하나만 남긴다. */
function keyOf(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

export type QuerySuggestion = { key: string; text: string };

/**
 * 팀 문맥에서 검색어 후보를 만든다. **빈 목록일 수 있다** — 팀 이름도 역할도 없는 경우.
 */
export function researchQuerySuggestions(context: Pick<TeamToolContext, "team" | "roles" | "openTasks">): QuerySuggestion[] {
  const out: QuerySuggestion[] = [];
  const seen = new Set<string>();

  const push = (key: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const unique = keyOf(trimmed);
    if (seen.has(unique)) return;
    seen.add(unique);
    out.push({ key, text: trimmed });
  };

  // 1) 팀 이름 — **실제 과제 이름이 들어 있는 경우가 많다.** 가장 좋은 재료다.
  if (context.team.name.trim()) {
    push("team", `${context.team.name.trim()} 관련 선행 연구`);
  }

  // 2) **열린 업무가 있는 역할만** — 아무 일도 없는 역할은 검색할 이유가 없다.
  const busyRoles = new Set(
    context.openTasks
      .map((t) => (t.assigneeName === null ? null : t.assigneeName))
      .filter((name): name is string => name !== null),
  );
  // 담당자 이름만으로는 역할을 모른다. 역할은 업무와 이름으로 연결되지 않으므로,
  // **열린 업무가 하나라도 있는 팀의 역할 전체**를 후보로 쓴다 — 없는 역할을 지어내는
  // 것보다 약간 넓히는 편이 낫다. 단, 목록이 **짧을 때만**(아래 SUGGESTION_LIMIT).
  if (busyRoles.size > 0) {
    for (const role of context.roles) {
      if (out.length >= SUGGESTION_LIMIT) break;
      push(`role-${role.key}`, `${role.name} 관련 연구자료`);
    }
  }

  return out.slice(0, SUGGESTION_LIMIT);
}
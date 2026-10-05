import { normalizeName } from "@/features/roles/roster-model";
import type { RoleKey } from "@/lib/types";

/**
 * AI 도구에 **팀 문맥을 넘기는 방식** — DB 객체를 던지지 않는다.
 *
 * ## 왜 투영(projection)인가
 *
 * "AI 서기한테 팀원 명단을 주자" 는 한 문장이고, 실제로는 **넘길 수 없는 것**을 함께
 * 결정해야 한다. 화면이 이미 갖고 있는 서버 DTO 를 그대로 프롬프트에 끼워 넣으면:
 * - **안 쓰는 값이 나간다**(기여 점수, MBTI, 알림 읽음 여부, 기기 정보). 쓸모없는 값은
 *   토큰이고, **토큰은 돈**이다. 그리고 값이 많을수록 판단이 흐려진다.
 * - **넘기지 않을 값을 고르는 일이 없어진다.** 오늘은 괜찮아도 내일 필드가 하나 추가되면
 *   그 필드도 자동으로 따라 들어온다 — **허락한 것만 나가야 하는데, 추가만 하면 나가니까.**
 *
 * 그래서 **허용 목록을 타입으로 고정**한다. 이 파일에 없는 필드는 타입이 받지 않는다.
 * 필드를 하나 늘리려면 **여기를 고쳐야 하고**, 그 고침이 곧 검토 대상이 된다.
 *
 * ## 여기 없는 것이 deliberate 인 것들
 *
 * | 넣지 않은 것 | 이유 |
 * |---|---|
 * | **MBTI** | 프로젝트 원칙 — **역할 배정에 쓰지 않는다.** 문맥에 실려 있으면 "비율에 맡기면 되겠다" 는 유혹이 생긴다 |
 * | 이메일·기기 정보 | 도구가 **할 일을 정하는 데** 필요 없다. 알림 대상이 아니라 |
 * | 기여 점수 | "점수가 낮으니 AI 가 대신 써 주면" 이라는 길이 열리면 사람이 아니라 시스템이 평가를 대신한다 |
 * | 원본 회의록 | 이미 들어오는 자리(사용자가 붙여 넣는 글)다. **두 번 들어갈 이유가 없다** |
 *
 * ## 크기를 자른다
 *
 * `MEMBER_LIMIT` 을 넘는 팀은 **이름만** 담는다. 사람 40명의 명단을 프롬프트에 통째로 넣으면
 * 프롬프트가 명단이 되어 모델이 지시를 듣지 못한다(실측: 이름이 많을수록 담당자 매칭이
 * 나빠진다). **멤버 id 는 항상 넣지 않는다** — 모델은 id 를 지어내기만 하고 정확하지 않으며,
 * **매칭은 코드가 한다**(아래 `tool-assignee.ts`).
 */

/** 한 팀에서 AI 문맥에 담을 사람의 수. 넘으면 나머지는 이름만 보낸다. */
const MEMBER_LIMIT = 20;

/** 명단 문자열이 이 글자를 넘으면 잘라 낸다 — 모델 입력 상한(`AI_INPUT_LIMIT`)과 별개로 두는 이유: 그쪽은 **원문**의 상한이고 여기는 **부가 정보**다. */
const CONTEXT_CHAR_LIMIT = 1200;

/** 팀원 한 명. **이름과 id 만** — 그 외 필드는 이 자리에 쓸 일이 생기면 늘리는 것이지, 앞에서부터 옮겨 오는 것이 아니다. */
export type ToolMember = {
  /** 서버가 매칭할 때 쓰는 값. **프롬프트에는 넣지 않는다.** */
  id: string;
  name: string;
};

/**
 * AI 도구 하나가 받는 팀 문맥.
 *
 * **`readonly` 다.** 이 객체를 도구가 고쳐 쓰면 **다음 호출에서 조용히 틀어진다** — 화면이
 * 넘긴 값을 도구가 바꾸면 어디서 틀어졌는지 알 길이 없다.
 */
export type TeamToolContext = {
  team: { name: string; dday: string | null };
  currentMember: ToolMember;
  members: readonly ToolMember[];
  roles: readonly { key: RoleKey; name: string }[];
  openTasks: readonly { id: string; title: string; assigneeName: string | null; due: string }[];
  boxDeadlines: readonly { role: RoleKey; name: string; due: string | null }[];
};

/**
 * 화면/액션이 넘긴 넓은 값을 **허용된 필드만** 남긴 문맥으로 만든다.
 *
 * 순수 함수다 — 서버에서도 스모크에서도 부를 수 있어야 한다(계약을 테스트해야 한다).
 * 여기서 **빠뜨린 필드는 프롬프트에도 들어가지 않는다.** 필터가 아니라 **선택**이라서,
 * 실수로 새 필드가 따라 들어오는 일은 없다.
 */
export function projectTeamToolContext(input: {
  team: { name: string; dday: string | null };
  currentMember: { id: string; name: string };
  members: ReadonlyArray<{ id: string; name: string }>;
  roles: ReadonlyArray<{ key: RoleKey; name: string }>;
  tasks: ReadonlyArray<{ id: string; title: string; assignee: string | null; due: string; status: string }>;
  boxes: ReadonlyArray<{ role: RoleKey; name: string; dueAt: string | null }>;
}): TeamToolContext {
  return {
    team: { name: input.team.name, dday: input.team.dday },
    currentMember: { id: input.currentMember.id, name: normalizeName(input.currentMember.name) },
    // **이름이 비면 그 사람은 없다** — 빈 이름으로 팀원이 20명인 것처럼 보이게 하지 않는다.
    members: input.members
      .filter((m) => normalizeName(m.name) !== "")
      .map((m) => ({ id: m.id, name: normalizeName(m.name) })),
    roles: input.roles.map((r) => ({ key: r.key, name: r.name })),
    // **끝난 업무는 문맥에서 뺀다.** "이건 끝났어" 를 전하면 "또 해달라" 고 읽을 수 있다.
    openTasks: input.tasks
      .filter((t) => t.status !== "done")
      .map((t) => ({
        id: t.id,
        title: t.title,
        // **담당자 이름이 아니라 id 를 보낸다** — 매칭은 코드가 하고 여기는 사람이 읽는 글이다.
        assigneeName: t.assignee === null ? null : normalizeName(t.assignee),
        due: t.due,
      })),
    boxDeadlines: input.boxes.map((b) => ({ role: b.role, name: b.name, due: b.dueAt })),
  };
}

/**
 * 문맥을 **프롬프트에 붙일 글**로 만든다.
 *
 * ## 왜 문자열을 만들어 넣는가
 *
 * 도구마다 "이 문맥을 어떻게 보여 줄지" 를 정하면 **같은 팀을 다루는데 다른 도구가 다른
 * 명단을 보게 된다.** 사람이 "표는 이 사람이 했고, 서기는 저 사람이 했다" 고 알게 되면
 * 어느 쪽이 사실인지 알 수 없다. 형식은 한 곳에서 만든다.
 *
 * ## id 를 넣지 않는 이유 — 여기서도
 *
 * 모델에게 `mem_a1b2` 같은 id 를 주면 **지어낸다.** 매칭은 `tool-assignee.ts` 가 코드에서
 * 한다. 여기 이름만 주면 **모델의 몫은 이름만 쓰는 것**이고, 그걸 틀리면 코드가 null 로 막는다.
 *
 * @param heading 이 도구가 무엇을 하는지 한 줄. 도구마다 다르다("할 일 후보" / "발표 준비").
 */
export function renderTeamContext(context: TeamToolContext, heading: string): string {
  const lines: string[] = [`# 팀 정보 (${heading})`, `팀: ${context.team.name}`];

  if (context.team.dday) lines.push(`팀 표시 마감: ${context.team.dday}`);

  // 이름을 **명단으로** 보여 준다 — "민준, 유나, 지훈" 형태. 한 줄에 한 사람씩이 모델엔 더 정확하다.
  const named = context.members.slice(0, MEMBER_LIMIT).map((m) => `- ${m.name}`);
  if (named.length > 0) lines.push(`팀원 이름(아래 이름만 씁니다):\n${named.join("\n")}`);
  if (context.members.length > named.length) {
    lines.push(`그 밖에 팀원이 ${context.members.length - named.length}명 있습니다. 이름을 모르면 넣지 마세요.`);
  }

  if (context.roles.length > 0) {
    lines.push(`역할: ${context.roles.map((r) => r.name).join(", ")}`);
  }

  const dueSoon = context.boxDeadlines.filter((b) => b.due !== null);
  if (dueSoon.length > 0) {
    lines.push(`제출함 마감: ${dueSoon.map((b) => `${b.name} ${b.due}`).join(", ")}`);
  }

  if (context.openTasks.length > 0) {
    lines.push(
      `아직 끝나지 않은 일: ${context.openTasks
        .map((t) => `${t.title}${t.assigneeName ? ` (${t.assigneeName})` : ""}${t.due ? ` · 마감 ${t.due}` : ""}`)
        .join(", ")}`,
    );
  }

  const text = lines.join("\n");
  // **잘렸다는 사실을 도구가 아는 것이 중요하다** — 그래야 "명단이 잘려서 팀원을 못 봤다" 고
  // **말할 수 있다.** 조용히 자르면 아무도 모르고, 모델이 없는 이름을 지어내면 그것도 모른다.
  //
  // ⚠️ **안내는 절대 잘리지 않게 자리를 미리 비운다.** 안내를 먼저 넣고 나서 전체를 자르면,
  // **길이가 이미 한계인 경우 안내가 바로 잘려 나가면서 아무 말도 안 남는다** — 조용히 잘린
  // 문맥이 가장 나쁜 경우다(누구도 왜 명단이 비었는지 알 수 없다).
  if (text.length > CONTEXT_CHAR_LIMIT) {
    return `${text.slice(0, CONTEXT_CHAR_LIMIT - TRUNCATION_NOTICE.length)}${TRUNCATION_NOTICE}`;
  }
  return text;
}

/** 명단이 잘렸을 때 모델에 알리는 문장. **마지막에 붙고, 절대 잘리지 않는다.** */
const TRUNCATION_NOTICE =
  "\n(팀 정보가 길어 뒤가 생략됐습니다. 모르는 이름을 지어내지 말고, 모르면 비워 두세요.)";

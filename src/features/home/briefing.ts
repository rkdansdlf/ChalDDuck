import type { IconName } from "@/components/ui/icon";
import { isDueSoon } from "@/lib/due";
import type { MeetingProposal, SubmissionBox, Task } from "@/lib/types";

/**
 * 홈의 "오늘의 브리핑" — **있던 숫자를 문장으로 바꾸는 자리.**
 *
 * ## 왜 이 파일이 모델을 부르지 않는가
 *
 * 기획안은 "내용은 이미 있는 숫자로 결정적으로 만들고, AI 는 문장만 다듬는다" 고 적었다.
 * 그 **첫 번째 문장만** 가져왔다. 두 번째를 가져오지 않은 것은 실측 때문이다.
 *
 * 브리핑을 만들려면 모델을 불러야 하는데, 그 결과는 이 앱의 **가장 자주 보는 화면**에
 * 놓인다. 한 번 남의 말을 다듬을 때마다 느려졌던 것과 같은 이유다 — 다만 브리핑은 **읽기만
 * 하는 사람이 받는다.** 읽기 도움과 달리 **본인이 누르지 않았다.** 홈을 열었는데 3초를
 * 기다리게 만드는 셈이고, 그래놓고 얻는 것은 "마감이 3건이나 있어요" 라는 **템플릿으로도
 * 충분한 문장**이다.
 *
 * 그래서 여기선 숫자를 **다듬는 AI 를 부르지 않는다.** 나중에 문장 품질이 아쉬우면 그때
 * 붙인다 — 붙일 때도 이 파일이 세는 규칙을 그대로 쓰면 된다.
 *
 * ## 이 파일의 대칙 — **없는 것은 없다고 쓴다**
 *
 * 아래 일곱 가지 중 **다섯 개만** 센다. 나머지는 데이터가 없어서 **세지 않는다.**
 *
 * | 세는 것 | 안 세는 이유 |
 * |---|---|
 * | ✅ 내 확인 대기 | 이미 계산되어 있다 |
 * | ✅ 오늘 회의 | `MeetingProposal.date` 가 "YYYY-MM-DD" 다 |
 * | ✅ 마감 미정 업무 | `Task.due` 가 "미정" 으로 저장된다(빈 값) |
 * | ✅ 독촉할 일 | poke 화면과 **같은 조건**(`pokeTargets` 를 함께 쓴다) |
 * | ✅ 마감이 임박한 업무 | **`Task.dueAt`(2-0 절)이 생겨서 이제 가능하다.** 정규값이 있는 일만 센다 |
 * | ❌ 회의가 끝났는데 메모 없음 | **회의록을 저장하는 곳이 없다**(스키마에 모델이 없다) |
 * | ❌ 발표 임박 | **발표일 필드가 없다.** `Team.dday` 는 "중간발표 D-12" 같은 문자열이다 |
 *
 * ⚠️ **"마감이 임박한 업무" 는 전에 세지 못했고, 그건 버그가 아니라 데이터가 없는 상태였다.**
 * `Task.due` 가 자유 텍스트("9/19", "다음 주", "9월쯤")라 비교할 시각이 없었고, 그래서
 * "아직 안 정한 일" 로 대체했다. `dueAt` 이 생기면서 둘은 **서로 다른 두 가지**가 되었다 —
 * **아직 안 정했다**(사람이 비워 뒀다)와 **임박했다**(정했다가 다가온다)를 같은 줄로 말하면
 * 그 줄은 아무것도 말하지 않게 된다. 그래서 둘 다 센다.
 *
 * 지워버린 게 아니라 **세지 않는다는 사실을 코드에 남긴다.** 다음 사람이 "브리핑에 발표 임박도
 * 넣자" 고 하면 여기서 왜 안 되는지 읽으면 된다.
 */

/**
 * 정규 마감 문자열 → 시각. **해석은 `lib/due.ts` 한 곳에서만** 한다.
 *
 * ⚠️ 여기서 `new Date(...)` 로 직접 파싱하면 **두 개의 기준**이 생긴다 — 하나는 느리고
 * 하나는 빠른 것이 화면마다 다른 말을 하게 된다. 변환만 하고 **판정은 하지 않는다.**
 */
function parseDueAt(value: string | null | undefined, _today: string): Date | null {
  if (!value) return null;
  const at = new Date(`${value}:00+09:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** 기준 시각(그날 00:00). "며칠 남았나" 의 0 은 자정이 되도록 맞춘다. */
function nowOf(today: string): Date {
  return new Date(`${today}T00:00:00+09:00`);
}

/** 카드의 한 줄. **숫자는 여기서만 만들어진다** — 화면이 개수를 세지 않는다. */
export type BriefingLine = {
  key: string;
  icon: IconName;
  /** 화면에 그대로 보여 줄 한 줄. */
  text: string;
  /** 이 값을 센 기준. 물으면 여기 답이 있다. */
  count: number;
  href: string;
  /** `warn` 은 사람이 지금 봐야 하는 것, `calm` 은 참고할 것. */
  tone: "calm" | "warn";
};

/** 상황별 도구 추천 한 개. **규칙만으로** 정한다 — 모델을 부르지 않는다. */
export type ToolSuggestion = {
  key: string;
  /** 추천 이유. **왜 지금 이 도구인지** — 추천에 이유가 없으면 광고가 된다. */
  because: string;
  toolKey: string;
  toolName: string;
  icon: IconName;
  href: string;
};

/**
 * 마감이 비어 있는 업무인가.
 *
 * `dueOf` 가 빈 값을 `"미정"` 으로 저장한다(`server/actions/tasks.ts`) — 그래서 그 문자열은
 * **"사람이 비워 뒀다"** 는 뜻이고, 화면에 적힌 "미정" 과 같은 말이다.
 *
 * "미정" 을 **정규화하지 않고** 이 문자열만 본다. "다음 주" 나 "9월쯤" 같은 자유 텍스트는
 * 파싱하면 **틀릴 확률이 높아서** 세지 않는다 — 틀린 숫자를 보여 주는 브리핑은 없는 것보다
 * 나쁩니다. **세는 것과 추측하는 것을 구분한다.**
 */
export function isDueUnset(task: Pick<Task, "due">): boolean {
  return task.due.trim() === "" || task.due.trim() === "미정";
}

/**
 * 내가 독촉할 수 있는 업무 — **poke 화면과 같은 조건.**
 *
 * 한쪽에서만 세면 두 화면의 숫자가 어긋난다(홈은 "3건" 이고 poke 화면은 빈 목록). 그래서
 * 조건을 **여기 한 곳에** 두고 양쪽이 함께 부른다 — 서버 액션이 같은 조건을 다시 검사하는
 * 것과 같은 이유로(`server/actions/tasks.ts`).
 */
export function pokeTargets(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => t.status !== "done" && t.assignee && !t.isMine && !t.assigneeLeft);
}

/**
 * "오늘" 이다 — 확정된 회의의 날짜가 오늘인가.
 *
 * `date` 는 `"YYYY-MM-DD"` 문자열이라 **비교가 된다.** `null` 이면 모르는 것이지 오늘이
 * 아니다 — 모르는 것과 아닌 것을 같은 값으로 보지 않는다(화면도 이미 그렇게 그린다).
 */
export function isMeetingToday(meeting: Pick<MeetingProposal, "stage" | "date">, today: string): boolean {
  return meeting.stage === "confirmed" && meeting.date === today;
}

/**
 * 마감이 임박한 제출함 — **진짜 시각이 있는 것만.**
 *
 * 제출함은 `dueAt` 이 `DateTime` 이라 유일하게 "며칠 남았나" 를 말할 수 있다. 역할별로
 * 매긴다: `deck`·`script` 는 발표 준비고, `research` 는 조사다 — **도구가 달라야 추천이
 * 다르다.** "임박" 은 3일 이내다. 넉넉히 잡으면 "임박" 이 아무것도 아니게 되고, 좁히면
 * 준비할 시간이 없다.
 *
 * ⚠️ **이 값은 `Team.dday` 가 아니다.** 팀 발표일 필드가 없어서 제출함 마감을 쓴다는 것은
 * **근거가 있는 대체**이지 같은 것이 아니다. 브리핑 문구도 제출함이라고 적어 뒤집어쓰지
 * 않는다.
 */
const NEAR_DUE_DAYS = 3;

export function boxesDueSoon(
  boxes: readonly Pick<SubmissionBox, "role" | "name" | "dueAt">[],
  today: string,
): Array<{ role: string; name: string; daysLeft: number }> {
  const todayMs = Date.parse(`${today}T00:00:00+09:00`);
  if (Number.isNaN(todayMs)) return [];
  const limit = todayMs + (NEAR_DUE_DAYS + 1) * 24 * 60 * 60 * 1000;

  const rows: Array<{ role: string; name: string; daysLeft: number }> = [];
  for (const box of boxes) {
    if (!box.dueAt) continue;
    const due = Date.parse(`${box.dueAt}:00+09:00`);
    if (Number.isNaN(due)) continue;
    // **이미 지난 마감은 "임박" 이 아니다.** 그것은 다른 이야기(늦었다)이고 이 카드의
    // 대상이 아니다 — 늦은 건 제출함 화면이 이미 붉게 보여 준다.
    if (due < todayMs || due >= limit) continue;
    rows.push({ role: box.role, name: box.name, daysLeft: Math.floor((due - todayMs) / (24 * 60 * 60 * 1000)) });
  }
  return rows.sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * 오늘의 브리핑을 만든다.
 *
 * @param today 한국 날짜(`YYYY-MM-DD`). **서버가 넘긴다** — 화면이 자기 시계로 "오늘" 을
 *   맞추면 기기 설정이 다른 사람과 **같은 홈이 다른 내용**을 보게 된다.
 */
export function buildBriefing(input: {
  today: string;
  /** `home-screen` 이 이미 세 놓은 "내 확인이 필요한 일" 수. */
  awaitingMe: number;
  meeting: MeetingProposal;
  tasks: readonly Task[];
}): BriefingLine[] {
  const lines: BriefingLine[] = [];

  if (input.awaitingMe > 0) {
    lines.push({
      key: "awaiting",
      icon: "list-checks",
      text: `확인이 필요한 일이 ${input.awaitingMe}건 있어요`,
      count: input.awaitingMe,
      href: "/team/contrib/members",
      tone: "warn",
    });
  }

  if (isMeetingToday(input.meeting, input.today)) {
    const time = input.meeting.slot?.time?.split("–")[0]?.trim();
    lines.push({
      key: "meeting",
      icon: "calendar-clock",
      text: time ? `오늘 ${time}에 회의가 있어요` : "오늘 회의가 확정돼 있어요",
      count: 1,
      href: "/schedule/slots",
      tone: "warn",
    });
  }

  /**
   * **마감 임박** — 정규값(`dueAt`)이 있는 일만 센다.
   *
   * 이전에는 **불가능했다.** `Task.due` 가 자유 텍스트("9월쯤", "다음 주")라 비교할 대상이
   * 없었고, 그래서 "아직 안 정한 일" 로 대체했다. `dueAt` 이 생겼으니 이제 진짜로 셀 수 있다.
   *
   * ⚠️ **세지 않는 것이 대부분이다** — 기존 행은 백필하지 않았고(`lib/due.ts`), 앞으로
   * 사람이 `2026-09-19` 처럼 **연도가 있는 값**을 적어야 채워진다. 그래서 이 줄이 rare하다.
   * **드문 줄이어도 괜찮다** — 있는 숫자만 말하는 것이 이 카드의 전부다.
   */
  const soon = input.tasks.filter(
    (t) =>
      t.status !== "done" &&
      // ⚠️ **정규값이 없으면 세지 않는다.** 표시 문자열을 여기서 다시 해석하면
      // `lib/due.ts` 와 **두 개의 기준**이 생기고 어느 쪽이 맞는지 알 수 없다.
      isDueSoon(parseDueAt(t.dueAt, input.today), nowOf(input.today)),
  );
  if (soon.length > 0) {
    lines.push({
      key: "soon",
      icon: "alarm-clock",
      text: soon.length === 1 ? "마감이 임박한 일이 있어요" : `마감이 임박한 일이 ${soon.length}건이에요`,
      count: soon.length,
      href: "/home/tasks",
      tone: "warn",
    });
  }

  const unset = input.tasks.filter((t) => t.status !== "done" && isDueUnset(t));
  if (unset.length > 0) {
    lines.push({
      key: "due",
      icon: "clock",
      // **"마감이 없다" 고 말하지 않는다** — "아직 안 정했다" 고 말한다. 팀이 못 정한 것과
      // 정하지 않기로 한 것은 다르다.
      text: `마감을 아직 안 정한 일이 ${unset.length}건이에요`,
      count: unset.length,
      href: "/home/tasks",
      tone: "warn",
    });
  }

  const poke = pokeTargets(input.tasks);
  if (poke.length > 0) {
    lines.push({
      key: "poke",
      icon: "hand",
      text: `남에게 알려 줄 일이 ${poke.length}건이에요`,
      count: poke.length,
      href: "/home/tasks/poke",
      tone: "calm",
    });
  }

  return lines;
}

/**
 * 지금 쓸 도구를 **규칙으로** 고른다. 모델을 부르지 않는다.
 *
 * ## 왜 모델을 부르지 않는가
 *
 * 추천은 **사실의 함수**다 — "독촉할 일이 3건이다" 에서 "쿠션 번역기가 맞다" 까지는 논리가
 * 없다. 모델이 필요한 곳은 "말투를 고칠까, 그냥 보낼까" 같은 판단이고, 홈이 첫 화면이라
 * **그 판단을 3초 뒤에 받는** 위치가 아니다. 추천을 틀리면 **한 번도 안 눌러본 도구를**
 * 소개하는 셈이라서, 규칙이 낫습니다.
 *
 * ## 규칙은 세 개뿐이다
 *
 * 1. 독촉할 일이 있으면 **쿠션 번역기** → poke 화면으로 바로 연결. "알려 줘야 하는데 말투를
 *    다듬어야 하는" 자리다 — 도구 추천과 화면 연결이 한 번에 된다.
 * 2. 발표 준비 제출함(`deck`·`script`) 마감이 임박했으면 **발표 지원**.
 * 3. 자료 제출함(`research`) 마감이 임박했으면 **AI 리서처**.
 *
 * **AI 서기 추천은 없습니다.** 기획안은 "회의가 끝났는데 메모가 없으면" 이라 했는데
 * **회의록을 저장하는 곳이 없어** "메모가 없는지" 를 알 수 없습니다. 이 자리에서 지어내면
 * 사용자는 "내 회의록이 사라졌다" 고 오해합니다. **저장소가 생기면 그때 규칙 하나를 더한다.**
 */
export function suggestTools(input: {
  tasks: readonly Task[];
  today: string;
  boxes: readonly Pick<SubmissionBox, "role" | "name" | "dueAt">[];
}): ToolSuggestion[] {
  const out: ToolSuggestion[] = [];
  const soon = boxesDueSoon(input.boxes, input.today);

  const poke = pokeTargets(input.tasks);
  if (poke.length > 0) {
    out.push({
      key: "cushion",
      because: `남에게 알려 줄 일 ${poke.length}건`,
      toolKey: "cushion",
      toolName: "쿠션 번역기",
      icon: "message-square-heart",
      href: "/home/tasks/poke",
    });
  }

  const deck = soon.find((b) => b.role === "deck" || b.role === "script");
  if (deck) {
    out.push({
      key: "present",
      because: `${deck.name} 마감이 ${deck.daysLeft <= 0 ? "오늘" : `${deck.daysLeft}일 뒤`}예요`,
      toolKey: "present",
      toolName: "발표 지원",
      icon: "presentation",
      href: "/tools/present",
    });
  }

  const research = soon.find((b) => b.role === "research");
  if (research) {
    out.push({
      key: "research",
      because: `${research.name} 마감이 ${research.daysLeft <= 0 ? "오늘" : `${research.daysLeft}일 뒤`}예요`,
      toolKey: "research",
      toolName: "AI 리서처",
      icon: "search",
      href: "/tools/researcher",
    });
  }

  return out;
}

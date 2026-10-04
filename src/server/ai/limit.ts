import "server-only";

import { AI_POLICY, AI_TOOL_NAMES } from "@/data/catalog";
import { db } from "@/server/db";
import type { SessionMember } from "@/server/session";

/**
 * AI 도구의 하루 한도.
 *
 * 왜 필요한가: 도구 5종은 호출마다 실제로 돈이 든다. 지금까지 문은 "팀원인가" 하나뿐이라,
 * 한 사람이 화면을 열어 두고 계속 고쳐 쓰기만 해도(쿠션 번역기·문장 변환은 입력이 멎을
 * 때마다 한 번씩 부른다) 비용에 바닥이 없었다.
 *
 * 세는 것은 **횟수뿐이다.** 입력한 글도 결과도 남기지 않는다 — 한도를 세는 데 필요하지
 * 않고, 남기기 시작하면 "무엇을 얼마나 보관하는지"가 곧 지켜야 할 약속이 된다.
 *
 * 한도 수치는 `AI_POLICY` 에 있고 아직 확정되지 않은 값이다.
 */

/**
 * `AI_TOOL_NAMES` 의 key 와 같은 어휘다. 화면·표·집계가 같은 이름을 쓴다.
 *
 * `read-cushion` 은 읽기 도움(19·31)다 — 사용자가 도구를 연 것이 아니라 **읽기 설정을
 * 켰을 뿐**인데도 모델을 부르므로 한도에서 빠지면 안 된다. 이 이름의 행이 없으면 "AI 를
 * 언제 왜 불렀나" 를 수습할 때 그 calls 가 통째로 사라진다.
 */
export type AiToolKey = "cushion" | "clerk" | "research" | "present" | "sentence" | "read-cushion";

/** 하루의 기준은 한국 날짜다 — 서버가 어디서 돌든 같은 하루여야 한다. */
function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/**
 * 오늘 **쓴** 횟수. 읽기 전용 — 아무것도 적지 않는다.
 *
 * ## 왜 "남은 횟수"가 아니라 "쓴 횟수"인가 (2026-09-28)
 *
 * 원래는 `mineLeft`·`teamLeft`·`perDay` 였다 — **한도가 있을 때의 모양**이다. 한도를 지우고
 * 나면 남은 횟수는 산술적으로 무의미해진다(없는 것을 남은 것으로 말하게 된다). 그러면 화면은
 * "57회 남음" 이라 말해야 하는데 실제로는 **한도가 없다.**
 *
 * **쓴 횟수**는 거짓이 될 수 없다. 오늘 팀이 18번 불렀다면 18 이다. 그리고 이 값이 유일하게
 * 답할 수 있는 질문 — "우리 팀이 AI 를 하루에 몇 번이나 쓰는가" 에 대한 답이다 — 이기도 하다.
 */
export type AiUsageToday = {
  /** 오늘 이 팀이 AI 도구를 부른 횟수. */
  team: number;
  /** 오늘 내가 AI 도구를 부른 횟수. */
  mine: number;
  /** 오늘 이 팀이 읽기 도움을 돌린 횟수. 도구와 따로 센다(읽기 도움은 자동 실행). */
  cushionTeam: number;
  /** 오늘 내가 읽기 도움을 돌린 횟수. */
  cushionMine: number;
};

/**
 * 오늘 **쓴** 횟수. 읽기 전용 — 아무것도 적지 않는다.
 *
 * 남은 횟수가 아니라 **쓴 횟수**를 세는 이유는 `AiUsageToday` 타입의 주석에 있다 — 한도가 없으면
 * "남음" 은 거짓이다.
 */
export async function aiUsageToday(me: SessionMember): Promise<AiUsageToday> {
  const day = todayInSeoul();
  /** 본 장부는 읽기 도움을 세지 않는다 — 세면 분리가 아니라 두 번 세게 된다. */
  const withoutCushion = { tool: { not: "read-cushion" as const } };
  const [team, mine, cushionTeam, cushionMine] = await Promise.all([
    db.aiUsage.count({ where: { teamId: me.teamId, day, ...withoutCushion } }),
    db.aiUsage.count({ where: { memberId: me.id, day, ...withoutCushion } }),
    db.aiUsage.count({ where: { teamId: me.teamId, day, tool: "read-cushion" } }),
    db.aiUsage.count({ where: { memberId: me.id, day, tool: "read-cushion" } }),
  ]);
  return { team, mine, cushionTeam, cushionMine };
}

/**
 * 한 번 썼다고 **적는다.** 막지 않는다 — **`read-cushion` 의 폭주 차단 하나만 예외**다.
 *
 * ## 왜 세는 것은 남기고 막는 것은 지웠는가 (2026-09-28)
 *
 * **`AiUsage` 는 한도 장부가 아니라 유일한 사용량 기록이었다.** "이 숫자가 한 번이라도 걸린 적이
 * 있는가" 라는 질문에 5분 만에 답한 것이 이 표였고, 답은 "14일간 한 번도 없었다" 였다. 그래서
 * 막는 쪽을 지웠다 — **근거 없는 숫자는 사용자에게 한도로 보이면서 아무 일도 하지 않는다.**
 *
 * 기록을 지우면 **다음번에 같은 질문을 할 수 없다.** 그래서 이 행은 그대로 둔다.
 *
 * ## 남긴 막힘 하나 — 읽기 도움 폭주
 *
 * 도구는 사람이 누른다. 아무도 안 누르면 아무 일도 없다. **읽기 도움만 메시지마다 자동으로**
 * 도므로, 여기만 무제한이 가능한 형태의 사고다. 재시도 폭주는 `MAX_ATTEMPTS`·`FAILURE_BACKOFF_MS`
 * 로 묶여 있으니 순환은 구속된다 — 여기는 그 위에 있는 마지막 방어선이고, 관측치가 하루 1회인
 * 숫자(5,000)는 폭주만 잡는다.
 *
 * **이 막힘을 사용자에게 한도로 말하지 않는다.** 관측치의 5,000배인 숫자를 "한도" 라고 말하면
 * 그것은 방어선이 아니라 다시 거짓말이다.
 *
 * ## 성공하면 돌려 주는 것 — **방금 적은 행의 id**
 *
 * 만든 행을 다시 찾지 않게 하려고다. 실패했을 때 그 행 하나만 지우려면("`refundAiUsage`")
 * **어느 행을 지운다는 뜻인지** 호출한 곳이 알고 있어야 한다. 예전에는 `{ ok: true }` 만 돌려줘서
 * 되돌릴 방법이 없었고, 이 함수를 부를 때 남긴 값이 전부였다.
 *
 * ## 실패하면 돌려 주는가 — **모델이 실패했을 때만 돌려 준다**
 *
 * 예전에도 돌려 주지 않았다. 그때의 이유는 "실패한 호출도 비용이 드니까"였고, 그 계산은 무료
 * 라우터(`openrouter/free`)에서는 성립하지 않는다. 이 모델은 **사용자가 고를 수 없는 쪽**에서
 * 실패한다 — 60초 타임아웃, 안전 필터 거절, 빈 응답. 기록에 남은 실패 3건이 전부 이 종류였다
 * (안전 필터 거절 2건 · 타임아웃 1건). 남겨 두면 **내 기록이 내 몫의 실패를 산다.**
 *
 * **거절(안전 필터)은 환불하지 않는다.** 거절은 `throw` 가 아니라 **모델이 돌려준 답**이라
 * 여기까지 오지 않는다 — 이 규칙이 거절을 공짜로 만들지 않는다. 지워지는 것은 **아무 답도 못
 * 받은** 호출뿐이다.
 *
 * ## 읽기와 쓰기는 **반드시 다른 함수**다
 *
 * 상태를 보려고 부른 것이 기록이 되는 사고를 막기 위해서다. 읽기는 `aiUsageToday`, 쓰기는 여기.
 *
 * ## 판단과 기록은 잠근 안에서 함께 한다
 *
 * 읽기 도움 폭주 판정은 팀의 하루 총량을 본다. 그 판단과 기록이 따로 놀면 **동시에 들어온 읽기 도움이
 * 둘 다 "아직 안 찼다" 를 보고 둘 다 지나간다** — 이것이 드라이브 용량에서 실제로 겪은 일이었고,
 * 같은 관용구(`Team` 행 `FOR UPDATE`)를 쓴다. 한 팀의 동시 호출은 많지 않아 기다림이 눈에 띄지
 * 않는다.
 *
 * **모델을 부르는 동안은 잡고 있지 않는다** — 여기서 끝나면 락이 풀린다. 실패해서 지운 몫은 그
 * 사이에 다른 호출이 이미 썼을 수 있으므로 기록이 원래보다 많아지지는 않는다 — 적게 되는 것뿐.
 */
export async function recordAiUsage(
  me: SessionMember,
  tool: AiToolKey,
): Promise<{ ok: true; usageId: string } | { ok: false; message: string }> {
  const day = todayInSeoul();
  // 읽기 도움은 자기 장부에만 적는다 — 본 장부에 함께 세면 두 번으로 세게 된다.
  const isCushion = tool === "read-cushion";
  const inBook = isCushion
    ? { tool: "read-cushion" as const }
    : { tool: { not: "read-cushion" as const } };

  return db.$transaction(async (tx): Promise<
    { ok: true; usageId: string } | { ok: false; message: string }
  > => {
    // 읽기 도움 폭주 판정은 팀의 하루 총량을 본다 — 판단과 기록을 한 잠금 안에서 함께 한다.
    await tx.$queryRaw`SELECT 1 FROM "Team" WHERE "id" = ${me.teamId} FOR UPDATE`;

    // **읽기 도움만** 막는다 — 폭주 차단. 도구는 사람이 누르므로 필요 없다.
    if (isCushion) {
      const teamUsed = await tx.aiUsage.count({ where: { teamId: me.teamId, day, ...inBook } });
      if (teamUsed >= AI_POLICY.cushionRunawayCapPerTeamPerDay) {
        return {
          ok: false,
          message: "읽는 순화가 오늘 지나치게 많이 돌아갑니다. 원문은 그대로 보입니다.",
        };
      }
    }

    const written = await tx.aiUsage.create({
      data: { teamId: me.teamId, memberId: me.id, tool, day },
    });

    // 방금 적은 행의 id 를 돌려준다 — 실패했을 때 **이 행 하나만** 되돌릴 수 있게.
    return { ok: true, usageId: written.id };
  });
}

/**
 * 실패한 호출이 적은 기록을 **그 행 하나만** 지운다.
 *
 * ## 왜 `deleteMany({ teamId, memberId, day })` 가 아니라 id 인가
 *
 * 예전의 사고를 그대로 피하기 위한 것이다 — 같은 날 그 사람이 쓴 다른 도구의 기록이 함께
 * 지워졌다. 되돌릴 수 있는 것은 **지금 되돌리고 있는 그 호출**뿐이다.
 *
 * `teamId`·`memberId` 를 함께 단다. id 하나만 믿으면 이 함수가 잘못 불렸을 때 **남의 행**을
 * 지울 수 있다(지금 이 값을 만들어 손에 쥔 곳은 `run.ts` 하나뿐이지만, 방어 없이 두지 않는다).
 *
 * ## 돌아오지 않는다
 *
 * DB 조회가 실패하면 **사용자에게 보여 줄 원래 실패 사유를 가리지 않는다.** 되돌림은 배려이고
 * 그 배려가 원래 목적을 해치는 경우(실패 이유를 말해야 할 때 조용히 지워짐)가 더
 * 나쁘다. 서버 로그에 남기고 `false` 를 돌려준다.
 *
 * 지워진 행은 어디에도 남지 않는다는 사실도 그대로 적어 둔다 — 실패의 원인을 아는 길은 서버
 * 로그뿐이다(`runTool` 이 `console.error` 로 남긴다). 쓰지 못한 시도를 세면 실패가 잘 안 되는
 * 앱으로 보이므로 **성공한 시도만** 세는 편이 정직하다.
 */
export async function refundAiUsage(me: SessionMember, usageId: string): Promise<boolean> {
  try {
    const { count } = await db.aiUsage.deleteMany({
      where: { id: usageId, teamId: me.teamId, memberId: me.id },
    });
    return count > 0;
  } catch (cause: unknown) {
    console.error(`[ai:limit] 기록을 되돌리지 못했습니다 (${usageId})`, cause);
    return false;
  }
}

/**
 * 보관 기간이 지난 사용 기록을 지운다. 예약 작업이 부른다.
 *
 * 허브 화면이 "기록은 N일 뒤 지워집니다"라고 적고 있으므로, 실제로 지우는 곳이 있어야
 * 그 문장이 참이 된다. `day` 는 `YYYY-MM-DD` 라 문자열로 비교해도 날짜 순서와 같다.
 */
export async function sweepAiUsage(): Promise<number> {
  const { count } = await db.aiUsage.deleteMany({ where: { day: { lt: retentionCutoffDay() } } });
  return count;
}

/** 보관 기간의 첫날(한국 날짜). 이날보다 앞선 기록은 지워졌어야 한다. */
function retentionCutoffDay(): string {
  const cutoff = new Date(Date.now() - AI_POLICY.retentionDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(cutoff);
}

/**
 * 팀의 AI 사용 내역을 CSV 로.
 *
 * 남아 있는 것이 누가·언제·어떤 도구를 썼는지뿐이라 내보낼 것도 그것뿐이다 — 입력한 글과
 * 결과는 처음부터 저장하지 않는다. 예약 작업이 하루 한 번 지우므로 그사이에 기한을 넘긴
 * 줄이 남아 있을 수 있어, 여기서도 보관 기간으로 한 번 더 거른다.
 *
 * 엑셀이 한글을 깨뜨리지 않도록 BOM 을 붙인다.
 */
export async function aiUsageCsv(teamId: string): Promise<string> {
  const rows = await db.aiUsage.findMany({
    where: { teamId, day: { gte: retentionCutoffDay() } },
    include: { member: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const toolName = new Map(Object.entries(AI_TOOL_NAMES));
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const lines = [
    ["날짜", "시각(한국)", "팀원", "도구"],
    ...rows.map((row) => [
      row.day,
      clock.format(row.createdAt),
      row.member.name,
      toolName.get(row.tool) ?? row.tool,
    ]),
  ];
  return "﻿" + lines.map((cells) => cells.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** 쉼표·따옴표·줄바꿈이 든 칸만 따옴표로 감싼다. 이름에 쉼표가 들어가도 칸이 밀리지 않는다. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

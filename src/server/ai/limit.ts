import "server-only";

import { AI_POLICY, AI_TOOLS } from "@/data/catalog";
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

/** `AI_TOOLS` 의 key 와 같은 어휘다. 화면·표·집계가 같은 이름을 쓴다. */
export type AiToolKey = "cushion" | "clerk" | "research" | "present" | "sentence";

/** 하루의 기준은 한국 날짜다 — 서버가 어디서 돌든 같은 하루여야 한다. */
function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/**
 * 한 번 쓸 수 있는지 보고, 쓸 수 있으면 썼다고 적는다.
 *
 * 세는 것과 쓰는 것을 한 함수에 둔 이유: 부르는 쪽이 둘 중 하나를 빠뜨리면 한도가
 * 조용히 사라진다. 모델을 부르기 **전에** 적는다 — 실패한 호출도 비용과 시간이 들었고,
 * 실패를 공짜로 두면 실패하는 요청을 무한히 보낼 수 있다.
 *
 * 한도를 넘으면 `message` 를 돌려준다. 화면이 그대로 보여 줄 문장이다.
 */
export async function consumeAiQuota(
  me: SessionMember,
  tool: AiToolKey,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const day = todayInSeoul();

  const [teamUsed, mineUsed] = await Promise.all([
    db.aiUsage.count({ where: { teamId: me.teamId, day } }),
    db.aiUsage.count({ where: { memberId: me.id, day } }),
  ]);

  if (teamUsed >= AI_POLICY.perTeamPerDay) {
    return {
      ok: false,
      message: `오늘 팀이 쓸 수 있는 AI 횟수(${AI_POLICY.perTeamPerDay}회)를 다 썼습니다. 내일 0시(한국)에 다시 채워집니다.`,
    };
  }

  if (mineUsed >= AI_POLICY.perMemberPerDay) {
    return {
      ok: false,
      message: `오늘 내가 쓸 수 있는 AI 횟수(${AI_POLICY.perMemberPerDay}회)를 다 썼습니다. 팀의 남은 횟수와는 별개입니다 — 내일 0시(한국)에 다시 채워집니다.`,
    };
  }

  await db.aiUsage.create({
    data: { teamId: me.teamId, memberId: me.id, tool, day },
  });

  return { ok: true };
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

  const toolName = new Map(AI_TOOLS.map((tool) => [tool.key, tool.name]));
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

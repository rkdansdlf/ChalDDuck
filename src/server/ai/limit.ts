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
 * `read-cushion` 은 읽기 순화(19·31)다 — 사용자가 도구를 연 것이 아니라 **읽기 설정을
 * 켰을 뿐**인데도 모델을 부르므로 한도에서 빠지면 안 된다. 이 이름의 행이 없으면 "AI 를
 * 언제 왜 불렀나" 를 수습할 때 그 calls 가 통째로 사라진다.
 */
export type AiToolKey = "cushion" | "clerk" | "research" | "present" | "sentence" | "read-cushion";

/** 하루의 기준은 한국 날짜다 — 서버가 어디서 돌든 같은 하루여야 한다. */
function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** 오늘 남은 횟수. 읽기 전용 — 이 함수는 한도를 깎지 않는다. */
export type AiQuota = {
  /** 내 몫의 남은 횟수. */
  mineLeft: number;
  /** 팀 몫의 남은 횟수. */
  teamLeft: number;
  /** 하루 총량. 화면이 "60회 중 N회" 라고 보여 준다. */
  perDay: number;
  /** 순화 몫은 따로다 — 도구 화면이 아니라 읽기 화면이 이 숫자를 본다. */
  cushion: {
    mineLeft: number;
    teamLeft: number;
    perDay: number;
  };
};

/**
 * 이 도구가 **어느 장부**를 쓰는지.
 *
 * 읽기 순화만 따로 센다(`AI_POLICY` 주석 참고). 판정을 한 함수로 모아야 화면의 숫자와
 * 실제로 막히는 지점이 어긋나지 않는다 — **읽는 쪽(`aiQuotaFor`)과 쓰는 쪽
 * (`consumeAiQuota`)이 같은 이 함수를 불러야** 그것이 보장된다.
 */
export function quotaPicks(tool: AiToolKey): { team: number; member: number } {
  return tool === "read-cushion"
    ? { team: AI_POLICY.readCushionPerTeamPerDay, member: AI_POLICY.readCushionPerMemberPerDay }
    : { team: AI_POLICY.perTeamPerDay, member: AI_POLICY.perMemberPerDay };
}

/**
 * 남은 횟수만 센다. **아무것도 적지 않는다.**
 *
 * 화면이 진입할 때 부를 수 있어야 하니, 세는 것과 쓰는 것을 반드시 갈라 둔다 — 한 함수에
 * 같이 두면 "상태를 보려고 부른 것"이 한도가 되어 이유를 알 수 없다.
 */
export async function aiQuotaFor(me: SessionMember): Promise<AiQuota> {
  const day = todayInSeoul();
  const picks = quotaPicks("read-cushion");
  // **본 장부는 순화를 세지 않는다.** 세면 분리가 아니라 두 번 차감이다 — 순화가 도구 몫까지
  // 먹으므로, 순화 몫이 남아 있는데도 쿠션 번역기가 막히는 상황이 그대로 생긴다.
  const withoutCushion = { tool: { not: "read-cushion" as const } };
  const [teamUsed, mineUsed, cushionTeam, cushionMine] = await Promise.all([
    db.aiUsage.count({ where: { teamId: me.teamId, day, ...withoutCushion } }),
    db.aiUsage.count({ where: { memberId: me.id, day, ...withoutCushion } }),
    db.aiUsage.count({ where: { teamId: me.teamId, day, tool: "read-cushion" } }),
    db.aiUsage.count({ where: { memberId: me.id, day, tool: "read-cushion" } }),
  ]);
  return {
    mineLeft: Math.max(0, AI_POLICY.perMemberPerDay - mineUsed),
    teamLeft: Math.max(0, AI_POLICY.perTeamPerDay - teamUsed),
    perDay: AI_POLICY.perMemberPerDay,
    cushion: {
      mineLeft: Math.max(0, picks.member - cushionMine),
      teamLeft: Math.max(0, picks.team - cushionTeam),
      perDay: picks.member,
    },
  };
}

/**
 * 한 번 쓸 수 있는지 보고, 쓸 수 있으면 썼다고 적는다. **한도를 깎는 유일한 자리.**
 *
 * ## 언제 깎나
 *
 * **모델을 부르는 그 순간에 깎는다.** 타이핑할 때도 깎지 않고, 화면을 열어도 깎지 않는다
 * (조회는 `aiQuotaFor` 가 한다). 예전에는 쿠션 번역기·문장 변환이 원문이 바뀔 때마다 입력이
 * 멎을 때(800ms) 자동으로 부르니, **고치는 행위 자체가 과금**이었다 — 고칠수록 한도가 줄었다.
 * 이제 생성은 버튼을 눌렀을 때만 일어난다(`use-ai-draft`).
 *
 * ## 성공했다면 무엇을 돌려 주는가 — **방금 적은 행의 id**
 *
 * 만든 행을 다시 찾지 않게 하려고다. 실패했을 때 그 행 하나만 지우려면("`refundAiQuota`")
 * **내가 어느 행을 지운다는 뜻인지** 호출한 곳이 알고 있어야 한다. 예전에는 `{ ok: true }`
 * 만 돌려줬으므로 되돌릴 방법이 없었고, 이 함수를 부를 때 남긴 값이 전부였다.
 *
 * ## 실패하면 돌려 주는가 — **모델이 실패했을 때만 돌려 준다**
 *
 * 예전에는 **돌려 주지 않았다.** 그때의 이유는 "실패한 호출도 시간과 돈이 들었고(타임아웃은
 * 특히 그렇다), 실패를 공짜로 두면 실패하는 요청을 무한히 보낼 수 있다"였다 — 한도가 아니라
 * **지속 가능한 비용**이 된다는 계산이었다.
 *
 * 그 계산은 무료 라우터(`openrouter/free`)에서는 성립하지 않는다. 이 모델은 **사용자가
 * 고를 수 없는 쪽**에서 실패한다 — 타임아웃 899초, 안전 필터 거절, 빈 응답. 한도가 붙은
 * 채로 그 실패를 쓰게 두면 **내 돈으로 내 몫의 실패를 산다.** 실제로 이 한도는 순화가 가장
 * 필요할 때(심한 욕설) 가장 자주 거절당하는 구간에서 먼저 바닥났다.
 *
 * 그래서 실패는 **사용자에게 돌려주고, 제공자에게 청구한다.** 되돌림이 막는 것은 사람이
 * 일부러 실패를 부르는 것이 아니라 **같은 실패를 무한히 누르는 것**뿐이고, 그것은 이후에
 * 폴백 모델·재시도(0단계 2번)와 함께 다룬다. 지금 이 자리에서 고치면 된다.
 *
 * **거절(안전 필터)은 환불하지 않는다.** 거절은 `throw` 가 아니라 **모델이 돌려준 답**이라
 * 여기까지 오지 않는다 — 즉 이 규칙이 거절을 공짜로 만들지 않는다. 환불되는 것은 **아무
 * 답도 못 받은** 호출뿐이다.
 *
 * 한도 초과로 막힌 경우에도 환불할 것이 없다 — 애초에 행을 만들지 않았다.
 *
 * ## 왜 세는 것과 쓰는 것이 한 함수에 있나
 *
 * 부르는 쪽이 둘 중 하나를 빠뜨리면 한도가 조용히 사라진다. 읽기(`aiQuotaFor`)와 쓰기는
 * **반드시 다른 함수**로 갈라 둔다 — 상태를 보려고 부른 것이 한도가 되는 사고를 막기 위해서다.
 *
 * 한도를 넘으면 `message` 를 돌려준다. 화면이 그대로 보여 줄 문장이다.
 *
 * ## 셋과 읽기는 잠근 안에서 함께 한다
 *
 * 예전에는 `count` 두 번 → `create` 로 있었다. `AiUsage` 에는 이를 잡아 줄 유니크 제약이
 * 없어서, 동시에 300개가 들어오면 300개 다 `0 회` 를 보고 300개 다 적고 **300개 다 모델을
 * 부른다** — 돈이 드는 길이 정확히 그 병목인데, 지킨 게 아니었다. 화면에 적히는 숫자는
 * 정확했다.
 *
 * 그래서 팀 행을 `FOR UPDATE` 로 잠근 안에서 센다(같은 관용구를 `server/actions/ice.ts` 와
 * `server/actions/drive.ts` 가 이미 쓴다). 한 팀의 동시 호출은 많지 않아(하루 200회 한도)
 * 기다림이 눈에 띄지 않는다.
 *
 * **모델을 부르는 동안은 잡고 있지 않는다** — 여기서 끝나면 락이 풀린다. 그 사이에 한도가
 * 차는 것은 맞다(실제로 그만큼 부른 것이므로). 실패해서 되돌린 몫은 그 사이 다른 호출이
 * 이미 썼을 수 있으므로 **한도가 원래보다 많아지지는 않는다** — 적게 되는 것뿐이다.
 */
export async function consumeAiQuota(
  me: SessionMember,
  tool: AiToolKey,
): Promise<{ ok: true; usageId: string } | { ok: false; message: string }> {
  const day = todayInSeoul();
  // 읽는 쪽(`aiQuotaFor`)과 **같은 선택**을 한다. 여기서만 다르면 화면의 숫자는 남았는데
  // 실제로는 막히는(또는 그 반대) 상태가 조용히 생긴다.
  const picks = quotaPicks(tool);
  // 순화는 자기 장부에만 적는다 — 본 장부에서 빼지 않으면 두 번 차감된다.
  const inBook =
    tool === "read-cushion"
      ? { tool: "read-cushion" as const }
      : { tool: { not: "read-cushion" as const } };

  return db.$transaction(async (tx): Promise<
    { ok: true; usageId: string } | { ok: false; message: string }
  > => {
    // 한 팀의 한도를 한 명씩 지킨다.
    await tx.$queryRaw`SELECT 1 FROM "Team" WHERE "id" = ${me.teamId} FOR UPDATE`;

    const teamUsed = await tx.aiUsage.count({ where: { teamId: me.teamId, day, ...inBook } });
    if (teamUsed >= picks.team) {
      return {
        ok: false,
        message: cushionRefusal(tool, `오늘 팀이 쓸 수 있는 AI 횟수(${picks.team}회)를 다 썼습니다. 내일 0시(한국)에 다시 채워집니다.`),
      };
    }

    const mineUsed = await tx.aiUsage.count({ where: { memberId: me.id, day, ...inBook } });
    if (mineUsed >= picks.member) {
      return {
        ok: false,
        message: cushionRefusal(
          tool,
          `오늘 내가 쓸 수 있는 AI 횟수(${picks.member}회)를 다 썼습니다. 팀의 남은 횟수와는 별개입니다 — 내일 0시(한국)에 다시 채워집니다.`,
        ),
      };
    }

    const written = await tx.aiUsage.create({
      data: { teamId: me.teamId, memberId: me.id, tool, day },
    });

    // 방금 적은 행의 id 를 돌려준다 — 실패했을 때 **이 행 하나만** 되돌릴 수 있게.
    return { ok: true, usageId: written.id };
  });
}

/**
 * 실패한 호출이 깎은 한도를 **그 행 하나만** 되돌린다.
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
 * 그 배려가 원래 목적을 해치는 경우(한도를 못 돌려받았다고 말해야 할 때 조용히 지워짐)가 더
 * 나쁘다. 서버 로그에 남기고 `false` 를 돌려준다.
 *
 * 지워진 행은 어디에도 남지 않는다는 사실도 그대로 적어 둔다 — 실패의 원인을 아는 길은 서버
 * 로그뿐이다(`runTool` 이 `console.error` 로 남긴다).
 */
export async function refundAiQuota(me: SessionMember, usageId: string): Promise<boolean> {
  try {
    const { count } = await db.aiUsage.deleteMany({
      where: { id: usageId, teamId: me.teamId, memberId: me.id },
    });
    return count > 0;
  } catch (cause: unknown) {
    console.error(`[ai:limit] 한도를 되돌리지 못했습니다 (${usageId})`, cause);
    return false;
  }
}

/**
 * 순화가 멈췄을 때 **왜**를 덧붙인다.
 *
 * 순화 몫이 바닥나면 원문이 보인다(안전한 실패다). 그런데 그 문장이 다른 AI 도구의 그것과
 * 같으면, 순화가 앱의 일부라는 사실이 사라진다 — "AI 한도를 다 썼습니다" 만 보면 무엇이
 * 멈춘 건지 알 수 없다.
 */
function cushionRefusal(tool: AiToolKey, message: string): string {
  return tool === "read-cushion" ? `${message} 읽는 순화만 멈췄습니다 — 다른 AI 도구는 쓸 수 있습니다.` : message;
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

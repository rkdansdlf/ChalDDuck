/**
 * AI 사용 기록 통합 검사 — **세되, 막지 않는다**를 실제로 돌려 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 2026-09-28 에 하루 사용량 한도를 **삭제했다.** 근거는 측정이었다 —
 *
 * - 운영 14일 기록의 최고 하루가 도구 **18회**(있던 한도 200 의 9%), 순화 **1회**였다.
 *   **한도에 닿은 날이 한 번도 없었고** 거절된 날도 없었다.
 * - 무료 라우터가 **속도 한도로** 막은 적도 없다. 기록에 남은 실패는 안전 필터 거절 2건과
 *   60초 타임아웃 1건 — 한도와 무관한 실패였다.
 *
 * 즉 그 숫자는 14일간 아무 일도 하지 않았고, 사용자에게 "하루 200회" 로 보이도록 찍혀 있었다.
 *
 * ## 여기서 지키는 것
 *
 * 1. **기록은 남는다** — 지우면 다음번에 "몇 번이나 쓰는가" 를 답할 수 없다. 이 표가 그 유일한 근거였다.
 * 2. **도구는 막지 않는다** — 사람이 누른다. 아무도 안 누르면 아무 일도 없다.
 * 3. **순화 폭주만 막는다** — 사람이 누르지 않아도 도는 유일한 기능이라 방어선이 필요하다.
 * 4. **실패한 호출은 기록에서 지운다** — 안전 필터 거절이 아니라 **아무 답도 못 받은** 호출.
 * 5. **판단과 기록은 한 잠금 안에서** — 동시 순화가 둘 다 "안 찼다" 를 보고 지나가면 안 된다.
 * 6. **읽기는 아무것도 적지 않는다.**
 *
 *   npm run test:ai
 */
import { randomUUID } from "node:crypto";

import { AI_POLICY } from "../../src/data/catalog.js";

/** 한국 날짜 — `ai/limit.ts` 의 `todayInSeoul()` 과 같은 기준이다. */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

const TOOL = "clerk";
const CUSHION = "read-cushion";

type Session = { as(token: string): void; nobody(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const limit = await import("../../src/server/ai/limit.js");
  const run_ = await import("../../src/server/ai/run.js");

  let failed = 0;
  let passed = 0;
  function check(what: string, got: unknown, want: unknown): void {
    const same = JSON.stringify(got) === JSON.stringify(want);
    passed += 1;
    if (same) console.log(`  ✓ ${what}`);
    else {
      failed += 1;
      console.log(`  ✗ ${what}\n      기대 ${JSON.stringify(want)}\n      실제 ${JSON.stringify(got)}`);
    }
  }
  const truthy = (what: string, got: unknown) => check(what, Boolean(got), true);

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const teamIds: string[] = [];

  async function makeTeam(label: string) {
    const team = await db.team.create({
      data: {
        name: `AI 사용 검사 ${label} ${suffix}`,
        course: "검증",
        code: `CD-${randomUUID().slice(0, 6).toUpperCase()}`,
      },
    });
    teamIds.push(team.id);
    const leader = await db.member.create({ data: { teamId: team.id, name: `김민준${suffix}` } });
    const mate = await db.member.create({ data: { teamId: team.id, name: `이서연${suffix}` } });
    const token = async (memberId: string) => {
      const t = randomUUID();
      await db.session.create({
        data: { token: t, memberId, expiresAt: new Date(Date.now() + 3600_000) },
      });
      return t;
    };
    const asMember = (m: { id: string; teamId: string; name: string }) => ({
      id: m.id,
      teamId: m.teamId,
      name: m.name,
      isLeader: m.id === leader.id,
    });
    return {
      id: team.id,
      leader: asMember(leader),
      mate: asMember(mate),
      leaderToken: await token(leader.id),
    };
  }

  /** 오늘 팀 장부를 `n` 줄까지 채운다(큰 숫자도 그대로 — 값만 넣어 두는 자리다). */
  async function fill(teamId: string, memberId: string, n: number, tool = TOOL): Promise<void> {
    if (n <= 0) return;
    await db.aiUsage.createMany({
      data: Array.from({ length: n }, () => ({ teamId, memberId, tool, day: today })),
    });
  }

  const usageCount = (teamId: string, tool = TOOL) =>
    db.aiUsage.count({ where: { teamId, day: today, tool } });

  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    session.as(token);
    try {
      return await work();
    } finally {
      session.nobody();
    }
  }

  try {
    console.log("\nAI 사용 기록 검사 (실제 DB · 실제 잠금)");

    /* ── 1) 읽기는 아무것도 적지 않는다 ─────────────────────── */
    console.log("\n읽기는 기록을 남기지 않는다");
    const A = await makeTeam("읽기");
    await fill(A.id, A.leader.id, 3);
    const first = await limit.aiUsageToday(A.leader);
    check("내가 쓴 횟수를 셉니다", first.mine, 3);
    check("팀이 쓴 횟수를 셉니다", first.team, 3);
    const second = await limit.aiUsageToday(A.leader);
    check("몇 번 읽어도 늘지 않는다", [first.mine, second.mine, await usageCount(A.id)], [3, 3, 3]);

    /* ── 2) 도구는 막지 않는다 ───────────────────────────────── */
    console.log("\n도구에는 한도가 없다 — 사람이 누른다");
    // **관측치를 크게 넘어선** 숫자를 심는다. 있으면 200 회 한도였을 자리에 해당한다.
    await fill(A.id, A.leader.id, 500);
    const before = await usageCount(A.id);
    const over = await limit.recordAiUsage(A.leader, TOOL);
    truthy("500 번을 쓴 뒤에도 한 번 더 쓸 수 있다", over.ok);
    check("한 줄 적힌다", await usageCount(A.id), before + 1);
    // 다른 사람도 마찬가지 — 남의 몫을 걱정하지 않아도 되는 것이 **한도 없는 앱**의 모습이다.
    truthy("다른 사람도 한도 걱정 없이 쓸 수 있다", (await limit.recordAiUsage(A.mate, TOOL)).ok);
    check("팀 전체로 합쳐 적힌다", await usageCount(A.id), before + 2);

    /* ── 3) 순화만 막는다 ────────────────────────────────────── */
    console.log("\n읽기 순화만 폭주를 막는다");
    const B = await makeTeam("폭주");
    const cap = AI_POLICY.cushionRunawayCapPerTeamPerDay;
    // 자리가 하나 남도록 심는다 — 다음 한 번이 경계를 넘는다.
    await fill(B.id, B.leader.id, cap - 1, CUSHION);
    const lastOne = await limit.recordAiUsage(B.leader, CUSHION);
    truthy("경계 직전까지 된다", lastOne.ok);
    const blocked = await limit.recordAiUsage(B.leader, CUSHION);
    check("경계를 넘으면 막힌다", blocked.ok, false);
    // **도구는 같은 자리에서 계속 된다** — 막힘이 순화에만 있다는 뜻이다.
    truthy("같은 자리에서 도구는 막히지 않는다", (await limit.recordAiUsage(B.leader, TOOL)).ok);
    check("막힌 줄은 적히지 않는다", await usageCount(B.id, CUSHION), cap);
    // 막혔을 때 말하는 것은 **사람이 읽을 수 있는 문장**이어야 한다.
    const reason = blocked.ok === false ? blocked.message : "";
    check("원문이 그대로 보인다고 말한다", reason.includes("원문"), true);
    check("방어선 수치를 사용자에게 말하지 않는다", reason.includes(String(cap)), false);

    /* ── 4) 동시 순화 — 판단과 기록이 한 잠금 안에서 ─────────── */
    console.log("\n같은 팀이 동시에 순화를 돌려도 경계를 넘지 않는다");
    const C = await makeTeam("동시");
    const room = 3;
    await fill(C.id, C.leader.id, cap - room, CUSHION);
    // 여유 3 인데 **열 명이 같은 순간에** 돈다.
    const many = await Promise.all(
      Array.from({ length: 10 }, () => limit.recordAiUsage(C.leader, CUSHION)),
    );
    check("열 명 중 정확히 3 만 된다", many.filter((r) => r.ok).length, room);
    check("경계를 넘지 않는다", await usageCount(C.id, CUSHION), cap);
    check("막힌 쪽은 이유를 말한다", many.filter((r) => !r.ok).every((r) => r.message.length > 0), true);

    /* ── 5) 장부는 따로다 ────────────────────────────────────── */
    console.log("\n도구와 순화는 따로 센다");
    const D = await makeTeam("장부");
    await limit.recordAiUsage(D.leader, TOOL);
    await limit.recordAiUsage(D.leader, CUSHION);
    const d = await limit.aiUsageToday(D.leader);
    check("도구가 1 이고 순화가 1 이다", [d.mine, d.cushionMine], [1, 1]);
    check("순화는 도구 장부에 섞이지 않는다", await usageCount(D.id, TOOL), 1);
    check("순화 장부에 적힌다", await usageCount(D.id, CUSHION), 1);

    /* ── 6) 실패한 호출은 기록에서 지운다 ────────────────────── */
    console.log("\n실패한 호출은 기록에 남지 않는다");
    const E = await makeTeam("실패");
    const savedKey = process.env.OPENROUTER_KEY;
    // 키가 있는 척해서 모델을 부르는 길로 들어가고, **주입한 호출**을 던지게 한다 —
    // `runTool` 이 모델 층을 주입받으므로 네트워크가 개입할 자리가 없다.
    process.env.OPENROUTER_KEY = "harness-test-key";
    try {
      const failed = await as(E.leaderToken, () =>
        run_.runTool(TOOL, async () => {
          throw new Error("모델이 응답하지 않았다");
        }),
      );
      check("실패가 사용자에게 돌아온다", failed.ok, false);
      check("기록에 남지 않는다", await usageCount(E.id), 0);

      const okRun = await as(E.leaderToken, () => run_.runTool(TOOL, async () => "정답"));
      check("성공한 호출의 값이 온다", okRun.ok === true && okRun.value, "정답");
      check("성공한 것만 기록된다", await usageCount(E.id), 1);
      check("쓴 횟수로 보인다", (await limit.aiUsageToday(E.leader)).mine, 1);

      // 남의 기록은 못 지운다.
      const mate = await limit.recordAiUsage(E.mate, TOOL);
      truthy("다른 사람의 기록이 생긴다", mate.ok);
      if (mate.ok) {
        const stolen = await limit.refundAiUsage(E.leader, mate.usageId);
        check("남의 기록은 못 지운다", stolen, false);
      }
      check("남의 기록은 그대로다", await usageCount(E.id), 2);
    } finally {
      if (savedKey === undefined) delete process.env.OPENROUTER_KEY;
      else process.env.OPENROUTER_KEY = savedKey;
    }

    /* ── 7) 하루의 기준 ──────────────────────────────────────── */
    console.log("\n하루의 기준은 한국 날짜다");
    const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
      new Date(Date.now() - 86_400_000),
    );
    await db.aiUsage.create({
      data: { teamId: E.id, memberId: E.leader.id, tool: TOOL, day: yesterday },
    });
    await limit.recordAiUsage(E.leader, TOOL);
    check("어제 것은 세지 않는다", (await limit.aiUsageToday(E.leader)).mine, 2);

    /* ── 8) 화면에 남은 '남음' 이 없는지 ─────────────────────── */
    console.log("\n한도가 지워졌는데 '남음' 이 남지 않았는가");
    // **문구가 남으면 그것이 거짓말이다.** 코드를 읽는 사람이 가장 먼저 믿는 곳이 주석과
    // 화면 문구이고, 두 곳이 제때 바뀌지 않으면 다음 사람이 그 말을 사실로 읽는다.
    const files = [
      "../../src/features/tools/cushion-screen.tsx",
      "../../src/features/tools/sentence-screen.tsx",
      "../../src/features/tools/ai-hub-screen.tsx",
      "../../src/features/chat/read-cushion-bar.tsx",
      "../../src/features/tools/draft-actions.tsx",
    ];
    for (const f of files) {
      const { readFileSync } = await import("node:fs");
      const code = readFileSync(new URL(f, import.meta.url), "utf8");
      check(`${f.split("/").pop()} 에 '회 남음' 이 없다`, /회\s*남음/.test(code), false);
      check(`${f.split("/").pop()} 에 '몫을 다 썼' 이 없다`, /몫을\s*다\s*썼/.test(code), false);
    }

    /* ── 9) AI 서버 액션 8종 검증 ────────────────────────────── */
    console.log("\nAI 서버 액션 8종 경계 통과 검증");
    const {
      getSentenceSample,
      getAiUsageToday,
      getTeamAiSummary,
      exportAiUsage,
      exportTeamAiUsage,
      summarizeMeeting,
      searchResearch,
      refineScript,
    } = await import("../../src/server/actions/ai.js");
    const F = await makeTeam("액션");

    // 문장 변환 예시의 키는 summary·email·peer_request·notice 다. `academic` 은 발표 모드 이름이라
    // 여기서는 빈 문장이 돌아온다(처음 이 검사는 그 이름을 써서 main 에서도 실패하고 있었다).
    const sample = await as(F.leaderToken, () => getSentenceSample("summary"));
    truthy("getSentenceSample이 문장을 반환한다", typeof sample === "string" && sample.length > 0);

    const todayUsage = await as(F.leaderToken, () => getAiUsageToday());
    check("getAiUsageToday가 내 사용량과 팀 사용량을 반환한다", [typeof todayUsage.mine, typeof todayUsage.team], ["number", "number"]);

    const teamSummary = await as(F.leaderToken, () => getTeamAiSummary());
    check("getTeamAiSummary가 주간 요약을 반환한다", typeof teamSummary.totalCalls, "number");

    const myExport = await as(F.leaderToken, () => exportAiUsage());
    truthy("exportAiUsage가 CSV 파일명과 내용을 생성한다", myExport.filename.endsWith(".csv") && typeof myExport.csv === "string");

    const teamExport = await as(F.leaderToken, () => exportTeamAiUsage());
    truthy("exportTeamAiUsage가 CSV 파일명과 내용을 생성한다", teamExport.filename.endsWith(".csv") && typeof teamExport.csv === "string");

    const clerkResult = await as(F.leaderToken, () => summarizeMeeting("오늘 18시에 최종 발표 자료를 맞추기로 함."));
    truthy("summarizeMeeting이 성공하거나 샘플을 반환한다", clerkResult.ok);

    const researchResult = await as(F.leaderToken, () => searchResearch("협업 툴 시장 동향"));
    truthy("searchResearch가 성공하거나 샘플을 반환한다", researchResult.ok);

    const scriptResult = await as(F.leaderToken, () => refineScript("발표 대본 예시 문장입니다.", "academic"));
    truthy("refineScript가 성공하거나 샘플을 반환한다", scriptResult.ok);
  } finally {
    for (const teamId of teamIds) {
      await db.member.deleteMany({ where: { teamId } });
      await db.team.delete({ where: { id: teamId } });
    }
    await db.$disconnect();
  }

  console.log(
    failed === 0
      ? `\n모두 통과 — ${passed}건 통과, 0건 실패\n`
      : `\n${failed}건 실패 / ${passed}건 중\n`,
  );
  return failed === 0;
}
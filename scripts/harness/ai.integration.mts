/**
 * AI 한도 통합 검사 — **몇 회까지 되고, 어디서 막히고, 되돌아오는가**를 실제로 돌려 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 한도는 **화면에 적히는 숫자**다. 팀장이 200회라고 말하고 화면이 "3회 남았습니다" 를
 * 보여 주는데 사실 130회를 썼다면, 그건 숫자가 아니라 거짓말이다.
 *
 * 그런데 한도가 지켜진다는 사실은 어디에도 고정되어 있지 않았다. 있던 것은 이것뿐이었다 —
 *
 * - 읽어도 차감되지 않는다 · 1회 쓰면 정확히 1 늘어난다 · 되돌리면 원래대로 (실제 DB)
 * - 코드 주석이 "팀 행을 `FOR UPDATE` 로 잠근다"고 말한다 (소스 텍스트)
 *
 * **경계가 실제로 막는지, 동시 호출이 실제로 직렬화되는지는 아무도 확인한 적이 없다.**
 * 드라이브에서 팀 잠금이 처음 실제로 재현됐을 때 버그가 하나 나왔던 것과 같은 종류의
 * 공백이다. 그날의 교훈 그대로 — **주석이 말하는 것과 코드가 하는 것은 다르다.**
 *
 * ## 검사하는 것
 *
 * 1. **읽는 쪽과 쓰는 쪽이 같은 판정이다** — 화면에 남은 만큼만 실제로 더 쓸 수 있다.
 *    이 둘이 어긋나면 화면이 거짓말을 한다(`ai/limit.ts` 주석이 말하는 그 위험).
 * 2. **팀 한도** 직전까지 되고, 그 다음은 막힌다.
 * 3. **1인 한도** 직전까지 되고, 그 다음은 막힌다 — **팀에 여유가 있어도.**
 * 4. **동시 호출** N개가 들어와도 정확히 한도만큼만 차감된다(팀 행 잠금이 실제로 일하는가).
 * 5. **순화(400·120)와 도구(200·60)는 서로 간섭하지 않는다** — 같은 장부에 적지만
 *    **다른 칸**에 센다.
 * 6. **실패한 호출은 한도를 되돌린다** — 그리고 남의 몫은 못 되돌린다.
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
        name: `AI 한도 검사 ${label} ${suffix}`,
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

  /** 오늘 팀 장부를 `n` 줄까지 채운다. */
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
    console.log("\nAI 한도 통합 검사 (실제 DB · 실제 잠금)");

    /* ── 1) 읽는 쪽과 쓰는 쪽이 같은 판정이다 ──────────────── */
    console.log("\n화면에 남은 만큼만 실제로 더 쓸 수 있다");
    const A = await makeTeam("읽기");
    await fill(A.id, A.leader.id, 3);
    const before = await limit.aiQuotaFor(A.leader);
    check("3회 썼으니 남은 것이 3 줄었다", AI_POLICY.perMemberPerDay - before.mineLeft, 3);
    // **이 하나가 핵심이다.** 화면의 숫자가 3 이면 3번 더 되고, 4번째는 막혀야 한다.
    let granted = 0;
    // **남은 만큼 + 1** 만큼 시도한다 — 그마지막 한 번이 막혀야 이 검사가 증명하는 것이 된다.
    // (5번만 돌면 "57이 남았는데 5번이나 됐네" 를 "57번 됐다" 와 구별하지 못한다)
    for (let i = 0; i <= before.mineLeft; i += 1) {
      const r = await limit.consumeAiQuota(A.leader, TOOL);
      if (r.ok) granted += 1;
      else {
        check("막힐 때 말하는 이유가 '내 몫' 이다", r.message.includes("내가 쓸 수 있는"), true);
        break;
      }
    }
    check("남은 만큼만 실제로 차감된다", granted, before.mineLeft);

    /* ── 2) 팀 한도 ─────────────────────────────────────────── */
    console.log("\n팀 한도는 팀 전체의 합으로 센다");
    const B = await makeTeam("팀 한도");
    // 두 사람에게 나눠 썼으면 **누가 썼는지와 무관하게** 팀 몫을 먹는다.
    const perTeam = AI_POLICY.perTeamPerDay;
    await fill(B.id, B.leader.id, perTeam - 1);
    const oneLeft = await limit.consumeAiQuota(B.mate, TOOL);
    truthy("팀 한도 직전까지는 된다", oneLeft.ok);
    const afterTeam = await limit.consumeAiQuota(B.mate, TOOL);
    check("그 다음은 팀 한도로 막힌다", afterTeam.ok === false && afterTeam.message.includes("팀이 쓸 수 있는"), true);
    check("막혔는데 기록은 늘지 않는다", await usageCount(B.id), perTeam);

    /* ── 3) 1인 한도 (팀에 여유가 있어도) ──────────────────── */
    console.log("\n1인 한도는 팀에 여유가 있어도 막는다");
    const C = await makeTeam("1인 한도");
    // 팀 장부는 비어 있고, **이 사람만** 꽉 찬다.
    await fill(C.id, C.leader.id, AI_POLICY.perMemberPerDay);
    const blocked = await limit.consumeAiQuota(C.leader, TOOL);
    check("내 몫이 바닥이면 막힌다", blocked.ok === false && blocked.message.includes("내가 쓸 수 있는"), true);
    check("막는 이유가 팀 탓이 아니다", blocked.ok === false && blocked.message.includes("팀의 남은 횟수와는 별개"), true);
    // 팀에는 여유가 있다는 것을 숫자로도 확인한다 — 위 두 줄이 거짓말하지 않게.
    const cQuota = await limit.aiQuotaFor(C.leader);
    check("팀에는 여전히 여유가 있다", cQuota.teamLeft > 0, true);
    // **다른 사람**은 팀 여유가 있으면 쓸 수 있다 — 1인 한도가 팀 한도를 덮지 않는다.
    truthy("다른 사람은 팀 여유가 있으면 쓸 수 있다", (await limit.consumeAiQuota(C.mate, TOOL)).ok);
    // 그리고 팀 한도는 두 사람의 합으로 나간다 — 방금 그 사람이 1회를 썼으니.
    check("팀 한도는 두 사람의 합이다", await usageCount(C.id), AI_POLICY.perMemberPerDay + 1);

    /* ── 4) 동시 호출 ───────────────────────────────────────── */
    console.log("\n같은 팀이 동시에 부르면 한도만큼만 차감된다");
    const D = await makeTeam("동시");
    const room = 3;
    await fill(D.id, D.leader.id, AI_POLICY.perTeamPerDay - room);
    // 열 명이 **같은 순간에** 달라고 한다. 여유는 3 이다.
    const many = await Promise.all(
      Array.from({ length: 10 }, () => limit.consumeAiQuota(D.mate, TOOL)),
    );
    const oks = many.filter((r) => r.ok).length;
    check("열 명 중 정확히 3명만 된다", oks, room);
    check("팀 장부가 한도를 넘지 않는다", await usageCount(D.id), AI_POLICY.perTeamPerDay);
    check("막힌 사람은 이유를 말한다", many.filter((r) => !r.ok).every((r) => r.message.length > 0), true);
    // 다른 사람이어도 같다 — 잠그는 것은 팀이기 때문에.
    const E = await makeTeam("동시2");
    await fill(E.id, E.leader.id, AI_POLICY.perTeamPerDay - room);
    const mixed = await Promise.all([
      ...Array.from({ length: 6 }, () => limit.consumeAiQuota(E.leader, TOOL)),
      ...Array.from({ length: 6 }, () => limit.consumeAiQuota(E.mate, TOOL)),
    ]);
    check("여러 명이 동시에 달라도 한도만큼만", mixed.filter((r) => r.ok).length, room);

    /* ── 5) 순화와 도구는 간섭하지 않는다 ──────────────────── */
    console.log("\n읽기 순화와 도구는 서로 간섭하지 않는다");
    const F = await makeTeam("장부");
    // 도구 장부를 **정확히 한도까지** 채운다 — 더는 못 쓴다.
    await fill(F.id, F.leader.id, AI_POLICY.perTeamPerDay);
    const toolBlocked = await limit.consumeAiQuota(F.leader, TOOL);
    check("도구는 막힌다", toolBlocked.ok, false);
    // 같은 팀·같은 사람이 순화를 쓰면 **되어야 한다** — 다른 장부이기 때문이다.
    const cushionOk = await limit.consumeAiQuota(F.leader, CUSHION);
    truthy("같은 사람이 순화는 쓸 수 있다", cushionOk.ok);
    // 그리고 순화의 몫은 따로 세어진다. `perDay` 는 **1인 몫**이다 — `AiQuota` 의
    // 주석이 말하듯 화면이 "60회 중 N회" 를 보여 주는 그 숫자(팀 몫은 `teamLeft` 의 기준).
    const cushionQuota = await limit.aiQuotaFor(F.leader);
    check("순화의 1인 몫은 따로 세어진다", cushionQuota.cushion.perDay, AI_POLICY.readCushionPerMemberPerDay);
    check("순화의 팀 몫도 따로 남는다", cushionQuota.cushion.teamLeft, AI_POLICY.readCushionPerTeamPerDay - 1);
    check("순화는 팀 몫에서 깎이지 않는다", await usageCount(F.id, TOOL), AI_POLICY.perTeamPerDay);
    check("순화 장부는 따로 적힌다", await usageCount(F.id, CUSHION), 1);
    // 반대 방향도 성립해야 한다 — 순화 장부가 가득 차도 도구가 된다.
    const G = await makeTeam("장부2");
    await fill(G.id, G.leader.id, AI_POLICY.readCushionPerTeamPerDay, CUSHION);
    check("순화가 바닥이면 순화가 막힌다", (await limit.consumeAiQuota(G.leader, CUSHION)).ok, false);
    truthy("같은 사람이 도구는 쓸 수 있다", (await limit.consumeAiQuota(G.leader, TOOL)).ok);

    /* ── 6) 실패하면 되돌아온다 ─────────────────────────────── */
    console.log("\n실패한 호출은 한도를 되돌린다");
    const H = await makeTeam("되돌림");
    const savedKey = process.env.OPENROUTER_KEY;
    // 모델을 **실제로 부르지 않고** 실패를 만든다 — 키가 있는 척하고 주입한 호출을 던지게 한다.
    // (`runTool` 은 모델 층을 주입받으므로 네트워크가 개입할 자리가 없다)
    process.env.OPENROUTER_KEY = "harness-test-key";
    try {
      const beforeFail = await limit.aiQuotaFor(H.leader);
      const failed = await as(H.leaderToken, () =>
        run_.runTool(TOOL, async () => {
          throw new Error("모델이 응답하지 않았다");
        }),
      );
      check("실패가 사용자에게 돌아온다", failed.ok, false);
      check("한도가 되돌아온다", (await limit.aiQuotaFor(H.leader)).mineLeft, beforeFail.mineLeft);
      check("기록도 그대로다", await usageCount(H.id), 0);

      // 성공하면 한 줄이 남는다.
      const okRun = await as(H.leaderToken, () => run_.runTool(TOOL, async () => "정답"));
      check("성공한 호출의 값이 온다", okRun.ok === true && okRun.value, "정답");
      check("성공하면 한 줄이 남는다", await usageCount(H.id), 1);
      check("한 줄이 남으면 남은 횟수가 줄었다", (await limit.aiQuotaFor(H.leader)).mineLeft, beforeFail.mineLeft - 1);

      // 남의 몫은 못 되돌린다.
      const mine = await limit.consumeAiQuota(H.mate, TOOL);
      truthy("다른 사람의 몫을 쓴다", mine.ok);
      if (mine.ok) {
        const stolen = await limit.refundAiQuota(H.leader, mine.usageId);
        check("남의 몫은 되돌릴 수 없다", stolen, false);
      }
      check("남의 몫은 여전히 차감되어 있다", await usageCount(H.id), 2);
    } finally {
      if (savedKey === undefined) delete process.env.OPENROUTER_KEY;
      else process.env.OPENROUTER_KEY = savedKey;
    }

    /* ── 7) 하루의 기준 ─────────────────────────────────────── */
    console.log("\n하루의 기준은 한국 날짜다");
    // 어제까지 차감되었던 몫은 오늘 다시 쓸 수 있어야 한다 — 자정을 넘겼으니까.
    const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
      new Date(Date.now() - 86_400_000),
    );
    await db.aiUsage.create({
      data: { teamId: H.id, memberId: H.leader.id, tool: TOOL, day: yesterday },
    });
    truthy("어제 몫은 오늘 몫이 아니다", (await limit.consumeAiQuota(H.leader, TOOL)).ok);
    const quota = await limit.aiQuotaFor(H.leader);
    check("오늘 것만 센다", AI_POLICY.perMemberPerDay - quota.mineLeft, 2);
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
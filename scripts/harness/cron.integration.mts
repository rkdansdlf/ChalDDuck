/**
 * 예약 작업 검사 — **하루에 한 번 도는 주소가 지키는 네 가지 약속**을 실제로 돌려 본다.
 *
 * ## 왜 이게 필요한가
 *
 * `/api/cron/meetings` 하나가 사용자 화면의 네 문장을 참으로 만든다 —
 *
 * | 화면이 말하는 것 | 실제로 해야 참이 되는 것 |
 * |---|---|
 * | "그 기록도 **90일 뒤** 자동 삭제됩니다" | `sweepAiUsage()` |
 * | "계측도 **같은 기간**으로 지운다" | `sweepAiCalls()` |
 * | 회의가 **마감되면 자동으로** 확정됩니다 | `confirmDueMeetings()` |
 * | 재입장 시도가 쌓이지 않습니다 | `sweepAttempts()` |
 *
 * **네 가지 모두 검사가 없었다.** 그리고 구조가 있다 — `confirmDueMeetings()` 가 맨 앞에 있고,
 * **그것이 던지면 뒤의 셋이 하나도 실행되지 않는다**(주석이 "그때는 치우는 일이 하루 밀리는 것뿐"
 * 이라고 적고 있지만, 그 결과로 **"90일 뒤 삭제됩니다" 라는 문장이 영영 거짓이 되고 아무도 모른다**).
 *
 * 오늘 하루에 화면 문장과 코드가 어긋나는 문제를 다섯 개 고쳤다(2GB 의 범위, 출처 링크, 동명이인,
 * 예상 질문, DM). 전부 그 문장이 참인지 아무도 확인하지 않아서 어긋나 있었다. 여기서도 **같은
 * 모양이고 더 조용하다** — 2GB이 틀린 건 팀 화면을 여는 사람이 알게 되지만, **cron이 안 돈다는
 * 것은 아무도 모른다.**
 *
 * ## 검사하는 것
 *
 * 1. **비밀값이 없거나 틀리면 401** — 조용히 열려 있는 쪽이 더 나쁘다.
 * 2. **보관 경계** — 90일 전 기록은 남고, **91일 전 기록은 지워진다.** 경계값을 검사해야 경계가
 *    증명된다. 100일 전만 심으면 "지운다" 만 확인된다.
 * 3. **계측도 같은 기간으로** 지워진다 — 기간이 다르면 "기록은 언제 지워지는가" 의 답이 두 개가 된다.
 * 4. **마감된 회의는 실제로 확정된다.**
 * 5. **화면을 다시 그리라고 알린다** — 캐시를 지우는 책임이 이 자리로 모였으므로.
 * 6. **청소가 셋 다 돌아간다는 사실을 응답으로 알린다** — 조용히 하는 쪽이 아니라.
 *
 *   npm run test:cron
 */
import { randomUUID } from "node:crypto";

type Session = {
  revalidated: string[];
  reset(): void;
};

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const { AI_POLICY } = await import("../../src/data/catalog.js");

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

  /** 한국 날짜를 N일 옮긴다 — `limit.ts` 와 같은 기준이다. */
  const seoul = (offsetDays: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
      new Date(Date.now() + offsetDays * 86_400_000),
    );

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const teamIds: string[] = [];

  const savedSecret = process.env.CRON_SECRET;

  try {
    console.log("\n예약 작업 검사 (실제 cron 주소 · 실제 스윕)");

    // 팀 하나를 만든다 — 스윕은 팀을 가리지 않고 날짜로 보므로 팀이 있어도 상관없다.
    const team = await db.team.create({
      data: {
        name: `예약 작업 검사 ${suffix}`,
        course: "검증",
        code: `CD-${randomUUID().slice(0, 6).toUpperCase()}`,
      },
    });
    teamIds.push(team.id);
    const member = await db.member.create({
      data: { teamId: team.id, name: `김민준${suffix}`, isLeader: true },
    });

    /* ── 1) 권한 ────────────────────────────────────────────── */
    console.log("\n비밀값이 없거나 틀리면 거절한다");
    const route = await import("../../src/app/api/cron/meetings/route.js");
    /**
     * cron 주소를 부른다. **환경값과 헤더를 따로 준다** — 같은 값을 둘 다 넣으면 아무 값이나
     * 통과하는지 알 수 없다(맞는 비밀값을 주는 것과 아무것도 안 주는 것 사이가 골라야 한다).
     */
    const call = (envSecret: string | null, headerSecret: string | null = envSecret) => {
      if (envSecret === null) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = envSecret;
      return route.GET(
        new Request("https://example.test/api/cron/meetings", {
          headers: headerSecret ? { authorization: `Bearer ${headerSecret}` } : {},
        }),
      );
    };

    const noSecret = await call(null);
    check("비밀값이 없으면 401", noSecret.status, 401);
    const wrong = await call("harness-secret", "wrong-secret");
    check("틀린 비밀값도 401", wrong.status, 401);
    check("거절은 이유를 말한다", ((await wrong.json()) as { error?: string }).error, "권한이 없습니다.");

    /* ── 2) 경계값을 심는다 ─────────────────────────────────── */
    console.log("\n보관 기간의 경계를 심는다");
    /**
     * **숫자를 정책에서 가져오지 않는다.** (2026-09-28 에 이 실수를 바로잡았다.)
     *
     * 처음에는 `KEEP = AI_POLICY.retentionDays` 로 심었다. 그랬더니 **보관 기간을 36500일로
     * 바꿔도 검사가 통과했다** — 기대값이 같은 상수에서 나오니 검사도 따라간 것이다. 화면이
     * "90일 뒤 삭제됩니다" 라고 말하는 동안 100년을 말하게 되는 종류의 검사는 아무것도 확인하지
     * 않는다.
     *
     * 그래서 **화면이 말하는 숫자(90)** 를 여기 적는다. 정책이 바뀌면 이 검사가 깨진다 — 그게
     * 목적이다. 아래에서 정책과 화면이 같은지 따로 확인한다.
     */
    const SHOWN_DAYS = 90;
    check("정책의 보관 기간이 화면이 말하는 숫자와 같다", AI_POLICY.retentionDays, SHOWN_DAYS);
    const inside = seoul(-SHOWN_DAYS); // 정확히 기간째 — 남아야 한다
    const outside = seoul(-(SHOWN_DAYS + 1)); // 하루 더 지났다 — 지워져야 한다
    const fresh = seoul(-1);

    const author = member.id;
    // `AiUsage` · `AiCall` · `RejoinAttempt` — 스윕이 지우는 세 곳을 **각각** 심는다.
    await db.aiUsage.create({
      data: { teamId: team.id, memberId: author, tool: "clerk", day: outside },
    });
    await db.aiUsage.create({
      data: { teamId: team.id, memberId: author, tool: "clerk", day: inside },
    });
    await db.aiCall.create({
      data: { teamId: team.id, memberId: author, day: outside, tool: "clerk", model: "openrouter/free", outcome: "ok", latencyMs: 10 },
    });
    await db.aiCall.create({
      data: { teamId: team.id, memberId: author, day: inside, tool: "clerk", model: "openrouter/free", outcome: "ok", latencyMs: 10 },
    });
    await db.rejoinAttempt.create({
      data: { key: `harness-old-${suffix}`, until: new Date(Date.now() - 86_400_000) },
    });
    await db.rejoinAttempt.create({
      data: { key: `harness-live-${suffix}`, until: new Date(Date.now() + 86_400_000) },
    });

    const usageBefore = await db.aiUsage.count({ where: { teamId: team.id } });
    check("심은 AI 사용 기록이 둘이다", usageBefore, 2);
    const attemptsBefore = await db.rejoinAttempt.count({
      where: { key: { startsWith: `harness-` } },
    });
    check("심은 재입장 시도가 둘이다", attemptsBefore, 2);

    /* ── 3) 마감된 회의 ─────────────────────────────────────── */
    console.log("\n마감된 회의는 실제로 확정된다");
    const slot = await db.meetingSlot.create({
      data: { teamId: team.id, day: "수", time: "16:00 – 18:00", available: 1, total: 1, weekKey: "none" },
    });
    const proposal = await db.meetingProposal.create({
      data: {
        teamId: team.id,
        proposedById: author,
        respondBy: new Date(Date.now() - 60_000),
        stage: "proposed",
        activeKey: null,
        date: "10/1",
        slotId: slot.id,
      },
    });

    /* ── 4) 실제로 부른다 ───────────────────────────────────── */
    console.log("\n예약 작업을 부른다");
    session.revalidated.length = 0;
    const res = await call("harness-secret");
    check("200 이다", res.status, 200);
    const body = (await res.json()) as {
      confirmed: number | null;
      swept: { attempts: number | null; aiUsage: number | null; aiCalls: number | null };
      failures: string[];
    };

    check("마감된 회의 1건이 확정되었다", body.confirmed, 1);
    // **조용히 실패하지 않는다** — 실패한 이름이 응답에 들어 있다. 0 과 실패는 다른 말이다.
    check("실패한 것이 없음을 말한다", body.failures, []);
    const settled = await db.meetingProposal.findUniqueOrThrow({
      where: { id: proposal.id },
      select: { stage: true },
    });
    check("제안 상태가 확정으로 바뀌었다", settled.stage, "confirmed");

    check("지난 AI 사용 기록 1건을 지웠다", body.swept.aiUsage, 1);
    check("지난 계측 1건을 지웠다", body.swept.aiCalls, 1);
    // ⚠️ **스윕은 전역이다.** 그래서 지운 "개수"를 세면 다른 잔여물까지 세어진다 — 로컬 DB 에
    // 남은 것이 12건이면 13 이 나온다(실제로 그랬다). **내가 만든 줄만** 확인한다.
    check("내가 심은 지난 재입장 시도는 지워졌다", await db.rejoinAttempt.count({ where: { key: `harness-old-${suffix}` } }), 0);

    check("화면을 다시 그리라고 알린다", session.revalidated.length >= 2, true);

    /* ── 5) 경계가 지켜졌는지 ───────────────────────────────── */
    console.log("\n경계는 지켜진다 — 기간째 기록은 산다");
    const leftDays = (
      await db.aiUsage.findMany({ where: { teamId: team.id }, select: { day: true } })
    ).map((r) => r.day).sort();
    check("기간째 기록은 남는다", leftDays.includes(inside), true);
    check("하루 더 지난 기록은 지워졌다", leftDays.includes(outside), false);
    check("어제 기록은 당연히 산다", leftDays.includes(fresh), false); // 없었을 뿐 — 지워지지 않았다는 뜻은 아니다

    const callsDays = (
      await db.aiCall.findMany({ where: { teamId: team.id }, select: { day: true } })
    ).map((r) => r.day);
    check("계측도 기간째는 남는다", callsDays.includes(inside), true);
    check("계측도 하루 더 지난 것은 지워졌다", callsDays.includes(outside), false);

    const liveAttempt = await db.rejoinAttempt.count({ where: { key: `harness-live-${suffix}` } });
    check("아직 유효한 재입장 시도는 지우지 않는다", liveAttempt, 1);

    /* ── 6) 두 번 불러도 되돌아오지 않는다 ───────────────────── */
    console.log("\n두 번 불러도 같은 일을 두 번 하지 않는다");
    const again = await call("harness-secret");
    const body2 = (await again.json()) as { confirmed: number | null; swept: { aiUsage: number | null } };
    check("두 번째에는 아무것도 확정하지 않는다", body2.confirmed, 0);
    // 내가 심은 기간째 기록이 **또 지워지지 않았는지**로 본다 — 개수가 아니라 내 행으로.
    check("두 번째에도 기간째 기록은 산다", await db.aiUsage.count({ where: { teamId: team.id, day: inside } }), 1);
  } finally {
    if (savedSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = savedSecret;
    for (const teamId of teamIds) {
      await db.rejoinAttempt.deleteMany({ where: { key: { startsWith: `harness-` } } });
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
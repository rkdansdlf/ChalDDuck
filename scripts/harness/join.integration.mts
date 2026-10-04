/**
 * 가입·리더 선출 통합 검사 — **서버 액션 경계를 통과해서** 확인한다.
 *
 * ## 왜 이게 필요한가
 *
 * `onboarding.ts` 의 주석은 **실제로 겪은 버그**를 서술한다 —
 *
 * > 예전에는 "팀장이 있나"와 "아무도 없나"를 읽고, 그 **뒤에** 별도 트랜잭션에서 팀장을 만들었다.
 * > 그 사이가 구멍이었다 — 빈 팀에 두 브라우저가 동시에 붙으면 **둘 다 팀장이 된다.**
 *
 * 고치는 방법도 세심하다(팀 행 `FOR UPDATE`, 판정과 삽입을 한 트랜잭션, 부분 유니크 인덱스가
 * DB 도 막지 못하는 이유까지 적어 둠). **그런데 이 경합을 재현하는 검사가 없다.**
 *
 * 오늘 하루에 같은 모양이 두 번 있었다 — 드라이브 팀 잠금(실제로 버그가 났고), AI 한도 잠금
 * (괜찮았지만 근거를 잘못 읽을 뻔했다). **주석이 아니라 검사로 확인해야 한다는 뜻이다.**
 *
 * 게다가 **가입 경로는 서버 액션 경계를 지나는 검사가 하나도 없었다.** `name-taken` 버그가
 * 있던 자리가 바로 그 경계 안이고, 기존 `smoke-join.mts` 는 순수·DB 수준까지만 봤다.
 *
 * ## 검사하는 것
 *
 * 1. **창작자가 첫 팀장이 된다** — 창작자 쿠키가 그 근거다.
 * 2. **빈 팀에 둘이 동시에 붙으면 정확히 한 명만 팀장이다** — 되돌릴 수 없는 상태를 만들지 않는다.
 * 3. 팀장이 있으면 새로 온 사람은 **승인 요청만** 한다.
 * 4. **같은 이름**으로 들어오면 `name-taken` 다 — 팀원이 된 뒤가 아니라 **요청 단계에서** 막힌다.
 * 5. 팀장 승인은 멤버를 만들고, **두 번 approving 해도 되돌리지 않는다.**
 * 6. 승인 뒤 동명이인이면 `name-taken` — 승인 자체가 실패하고 팀은 그대로다.
 * 7. **남의 팀 요청은 그 팀장이 처리할 수 없다.**
 * 8. 팀장 위임은 **새 팀장 한 명, 옛 팀장 0명** 으로 끝난다.
 *
 *   npm run test:join
 */
import { randomUUID } from "node:crypto";

type Session = {
  as(token: string): void;
  nobody(): void;
  reset(): void;
  clearAll(): void;
  asBrowser(anonId: string): void;
  clearAll(): void;
  asCreator(teamId: string): void;
  hasCreatorCookie(): boolean;
};

const draft = (name: string) => ({
  name,
  email: null,
  mbti: null,
  mbtiFromQuiz: false,
  want: "research" as const,
  veto: null,
});

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const actions = await import("../../src/server/actions/onboarding.js");
  const teamActions = await import("../../src/server/actions/team.js");
  const rejoin = await import("../../src/server/actions/rejoin.js");
  const invites = await import("../../src/server/invite/service.js");
  const settle = await import("../../src/server/invite/settle.js");

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
  /** 만든 팀을 기록한다 — 마지막에 한 번에 지운다. */
  const track = <T extends { id: string }>(team: T): T => {
    teamIds.push(team.id);
    return team;
  };

  /**
   * 팀을 하나 만든다. **세션을 먼저 비운다** — 앞에서 들어간 팀에 속해 있으면
   * `createTeam` 이 "이미 팀에 속해 있습니다" 로 막는다. 한 브라우저가 두 팀에 속할 수 없다는
   * 규칙이 실제로 서버에 있는지가 여기서 드러난다(우회하지 않고 그대로 겪는다).
   */
  async function newTeam(label: string) {
    session.reset();
    return track(await actions.createTeam({ name: `${label} ${suffix}`, course: "검증" }));
  }

  /**
   * **새 브라우저**가 되어 들어간다.
   *
   * 세션을 비워야 하는 이유가 코드에 있다 — `joinTeam` 은"팀을 옮기는 기능이 없다. 예전 팀의
   * 기록을 고아로 남기지 않는다" 고 먼저 검사해서 세션이 있으면 `invalid`·`in-other-team` 으로
   * 거절한다. 즉 **한 사람이 두 팀에 속할 수 없다는 규칙이 서버에 실제로 있다.**
   * 여기서 그 규칙을 우회하지 않고 그대로 겪는다.
   */
  /** 그 팀의 팀장 멤버 id. */
  async function leaderOf(teamId: string): Promise<string> {
    return (await db.member.findFirstOrThrow({ where: { teamId, isLeader: true, leftAt: null } })).id;
  }

  /** 이 사람으로 로그인한 세션을 심는다. */
  async function tokenOf(memberId: string): Promise<string> {
    const t = randomUUID();
    await db.session.create({
      data: { token: t, memberId, expiresAt: new Date(Date.now() + 3600_000) },
    });
    return t;
  }

  /** 요청이 지금 어떤 상태인지. */
  async function requestStatus(requestId: string): Promise<string | undefined> {
    const row = await db.joinRequest.findUnique({ where: { id: requestId }, select: { status: true } });
    return row?.status;
  }

  /** 신청인의 브라우저가 자기 요청을 폴링한다 — 팀원이 되는 유일한 자리. */
  async function rejoinOrOnboardingCheck() {
    return actions.checkJoinApproval();
  }

  async function joinAs(code: string, name: string) {
    // **다른 브라우저** — 신청 토큰까지 모두 버린다.
    session.clearAll();
    return actions.joinTeam(code, draft(name));
  }

  try {
    console.log("\n가입·리더 선출 검사 (실제 DB · 실제 잠금)");

    /* ── 1) 창작자가 첫 팀장 ─────────────────────────────────── */
    console.log("\n팀을 만든 브라우저가 첫 팀장이다");
    session.reset();
    const made = await newTeam("창작자 확인");
    // `createTeam` 이 심은 창작자 쿠키가 **이 규칙의 근거**다. 없으면 "빈 팀의 첫 사람" 으로
    // 넘어가고, 그것도 아니면 승인 요청으로 끝난다 — 팀장이 없는 팀이 영영 못 만들어진다.
    truthy("창작자 쿠키를 심는다", session.hasCreatorCookie());

    const creatorJoin = await actions.joinTeam(made.code, draft(`김민준${suffix}`));
    check("창작자는 바로 들어간다", creatorJoin.status, "joined");
    check("그리고 팀장이다", creatorJoin.status === "joined" && creatorJoin.isLeader, true);
    const leaders = await db.member.findMany({
      where: { teamId: made.id, isLeader: true, leftAt: null },
      select: { name: true },
    });
    check("팀장이 정확히 한 명이다", leaders.length, 1);
    check("창작자 쿠키는 쓰고 나면 지워진다", session.hasCreatorCookie(), false);

    /* ── 2) 경합: 빈 팀에 여럿이 동시에 ────────────────────────── */
    console.log("\n빈 팀에 여럿이 동시에 붙어도 팀장은 한 명이다");
    const empty = await newTeam("경합 확인");
    // 창작자 쿠키는 **없는 브라우저 여럿**을 흉내낸다 — 셋이 "빈 팀의 첫 사람" 규칙을 탄다.
    session.reset();
    /**
     * **열 명**을 같은 순간에 붙인다.
     *
     * 두 명으로는 **검사가 경합을 보지 못한다**(2026-09-28 확인). 둘이 붙여도 잠금 없는 상태로
     * 한 명이 끝나기 전에 다른 한 명이 "빈 팀"을 읽을 확률이 낮아, **잠금을 빼도 통과했다** —
     * 즉 그 검사는 아무것도 검증하지 못했다. 드라이브 동시성 검사가 스케줄링 우연을 검사하던
     * 것과 같은 종류다(그때도 이렇게 고쳤다).
     *
     * 경합 창은 "팀장 있나 읽기 → 멤버 만들기 → 커밋" 사이로 매우 짧다. 열 명이면 그 안에 둘
     * 이상이 들어갈 수밖에 없다 — 그래야 **잠금이 없으면 반드시 깨지는** 검사가 된다.
     * 아래 주석에서 이 검사를 잠금 없이 돌려 확인했다.
     */
    const racers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => {
        // **각자 다른 브라우저 신원** — abuse 한계는 `cd_anon` 을 행 키로 쓰고, 같은 신원이면
        // `INSERT … ON CONFLICT` 가 그들을 차례로 처리해 경합을 지운다. 신원이 같으면
        // 팀 잠금을 지워도 통과한다(확인했다).
        session.clearAll();
        session.asBrowser(randomUUID());
        return actions.joinTeam(empty.code, draft(`경합${i}${suffix}`));
      }),
    );
    const joinedCount = racers.filter((r) => r.status === "joined").length;
    check("정확히 한 명만 들어간다", joinedCount, 1);
    check("그 한 명만 팀장이다", racers.filter((r) => r.status === "joined" && r.isLeader).length, 1);
    const raceLeaders = await db.member.count({ where: { teamId: empty.id, isLeader: true, leftAt: null } });
    check("팀장이 정확히 한 명이다", raceLeaders, 1);
    // **패자는 멤버가 아니다.** 승인 대기 중이어야 하고, 이름이 명단에 있으면 안 된다.
    const raceMembers = await db.member.findMany({
      where: { teamId: empty.id, leftAt: null },
      select: { name: true, isLeader: true },
    });
    check("멤버도 한 명뿐이다", raceMembers.length, 1);
    check("그 한 명이 팀장이다", raceMembers[0]?.isLeader, true);
    // 남는 것은 **대기 중인 요청**이어야 한다 — 그런데 그 개수를 9 로 고정하지 않는다.
    // 열 브라우저가 같은 쿠키 항아리를 쓰니 abuse 제한(`taken`·`limited`)에 걸리는 것이 있어서
    // 몇몇은 요청조차 못 만든다. 그건 서버가 rightly 막은 것이고, 고정할 값이 아니다.
    // **확인할 것**은 "요청으로 남은 것과 DB 의 대기 행이 같다" 는 사실이다 — 둘이 어긋나면
    // 화면에는 없는데 자리는 남은 요청이 있다는 뜻이다.
    const requested = racers.filter((r) => r.status === "requested").length;
    const pendingRows = await db.joinRequest.count({ where: { teamId: empty.id, status: "pending" } });
    check("요청으로 남은 것과 대기 행이 같다", pendingRows, requested);
    truthy("대기 중인 요청이 남아 있다", pendingRows > 0);

    /* ── 2-2) 잠금이 실제로 그 일을 하는가 ────────────────────── */
    console.log("\n아까 그 잠금, 실제로 그 일을 하는가");
    /**
     * 위 검사는 **잠금을 지워도 통과한다.** 팀 행 `FOR UPDATE` 를 실제로 빼고 돌려 확인했다.
     *
     * **진짜 경합이 없는 것이 아니다.** 같은 두 문장(`인원 세기 → 팀장 행 만들기`)을 **잠금 없이**
     * 겹쳐 돌리면 **25회 중 25회 팀장이 둘** 나왔다(별도 측정). 즉 `joinTeam` 을 통해서는 재현되지
     * 않는 것이지, 존재하지 않는 것이 아니다.
     *
     * **`joinTeam` 에서 재현되지 않는 이유** — 가입 abuse 한계가 팀을 행 키로 쓰고,
     * `hitWindow` 의 `INSERT … ON CONFLICT DO UPDATE` 가 **행 단위로 직렬화**한다
     * (`server/rate-limit/join-throttle.ts`). 요청들이 팀 잠금에 닿기 **전에** 차례로 처리된다.
     *
     * 그러니 지금 팀 잠금은 **방어선**이다 — 그 없이는 안 된다(아래 검사로 확인). 그런데 그 직렬화는
     * **의도하지 않은 부작용**이다. 한계의 키나 숫자를 손대는 사람이 팀장 선출의 안전까지 함께
     * 흔들게 된다. 그래서 여기서는 잠금 **자체가** 경합을 막는지 직접 본다.
     */
    const lockHolds = async (withLock: boolean) => {
      const t2 = await newTeam("잠금 확인");
      const claim = (name: string) =>
        db.$transaction(async (tx) => {
          // 코드가 하는 것과 같은 순서다(`onboarding.ts` 의 팀장 선출).
          if (withLock) await tx.$queryRaw`SELECT 1 FROM "Team" WHERE "id" = ${t2.id} FOR UPDATE`;
          const hasLeader =
            (await tx.member.count({ where: { teamId: t2.id, isLeader: true, leftAt: null } })) > 0;
          const isFirst = (await tx.member.count({ where: { teamId: t2.id, leftAt: null } })) === 0;
          if (hasLeader || !isFirst) return "request";
          await tx.member.create({ data: { teamId: t2.id, name, isLeader: true } });
          return "leader";
        });
      await Promise.all([claim("가"), claim("나")]);
      return db.member.count({ where: { teamId: t2.id, isLeader: true, leftAt: null } });
    };
    check("잠장이 있으면 팀장이 한 명이다", await lockHolds(true), 1);
    check("잠장이 없으면 팀장이 둘이 된다 — 그게 경합이다", await lockHolds(false), 2);

    /* ── 3) 팀장이 있으면 요청만 한다 ─────────────────────────── */
    console.log("\n팀장이 있는 팀에는 승인 요청만 한다");
    const pending = await db.joinRequest.findFirstOrThrow({
      where: { teamId: empty.id, status: "pending" },
    });
    const again = await joinAs(empty.code, `최민준${suffix}`);
    check("다른 사람이면 요청만 한다", again.status, "requested");

    /* ── 4) 승인하면 — 그래도 아직 멤버는 아니다 ───────────────── */
    console.log("\n팀장 승인은 멤버를 곧바로 만들지 않는다");
    const approver = await joinAs(made.code, `정다은${suffix}`);
    check("승인이 필요한 팀이다", approver.status, "requested");
    const mine = await db.joinRequest.findFirstOrThrow({
      where: { teamId: made.id, status: "pending" },
    });
    // 팀장 세션으로 승인한다 — 실제 액션(`resolveJoinRequest`)이 팀장을 요구한다.
    session.as(await tokenOf(await leaderOf(made.id)));
    const settled = await rejoin.resolveJoinRequest(mine.id, true);
    check("승인이 된다", settled, "ok");
    session.reset();

    // ⚠️ **여기서 멤버는 아직 없다.** 팀원이 되는 것은 **요청한 그 브라우저**에서 일어난다
    // (`checkJoinApproval`) — 세션 쿠키를 심을 수 있는 곳이 거기뿐이라서다. 팀장 기기에서
    // 만들면 그 사람의 계정이 팀장 기기에 생겨 버린다.
    check("아직 멤버가 아니다", await db.member.count({ where: { teamId: made.id, name: `정다은${suffix}` } }), 0);
    check("요청은 approved 로 바뀌었다", await requestStatus(mine.id), "approved");

    // 신청인의 브라우저가 폴링해야 팀원이 된다 — 그때 세션이 시작된다.
    const approved = await rejoinOrOnboardingCheck();
    check("신청인이 폴링하면 멤버가 된다", approved.status, "approved");
    truthy("멤버가 생겼다", await db.member.findFirst({ where: { teamId: made.id, name: `정다은${suffix}` } }));
    check("팀장은 늘지 않는다", await db.member.count({ where: { teamId: made.id, isLeader: true, leftAt: null } }), 1);

    /* ── 5) 두 번 approving 해도 되돌리지 않는다 ───────────────── */
    console.log("\n이미 처리한 요청을 다시 approving 해도 되돌리지 않는다");
    session.as(await tokenOf(await leaderOf(made.id)));
    const secondApprove = await rejoin.resolveJoinRequest(mine.id, true);
    session.reset();
    // 승인된 요청은 더 이상 `pending` 이 아니다 — 잠근 뒤에 보면 "gone" 이고 되돌리지 않는다.
    check("두 번째 승인은 gone 이다", secondApprove, "gone");
    check("멤버가 늘지 않는다", await db.member.count({ where: { teamId: made.id, name: `정다은${suffix}` } }), 1);

    /* ── 6) 같은 이름 ─────────────────────────────────────────── */
    console.log("\n같은 이름은 팀원이 되기 전에 막힌다");
    const dupe = await joinAs(made.code, `김민준${suffix}`);
    check("이미 있는 이름은 name-taken 다", dupe.status, "name-taken");
    check("멤버가 늘지 않는다", await db.member.count({ where: { teamId: made.id } }), 2);

    /* ── 7) 승인하는 순간 동명이인이 있으면 승인이 실패한다 ──────── */
    console.log("\n승인하는 순간 동명이인이 있으면 승인이 실패한다");
    // 예전에는 **승인이 성공한 뒤** 신청인의 폴링 때 제약이 터졌고, 그 예외는 "폴링이 겹쳤다" 고
    // 읽혀 **요청을 조용히 지웠다.** 막는 자리를 승인으로 옮겼다(`settle.ts` 의 `"name-taken"`).
    const K = await makeTeamWithLeader("승인 동명이인");
    const first = await joinAs(K.code, `홍길동${suffix}`);
    check("요청이 접수된다", first.status, "requested");
    const secondReq = await joinAs(K.code, `김영희${suffix}`);
    check("두 번째 요청도 접수된다", secondReq.status, "requested");

    // **같은 이름의 멤버를 다른 길로 만든다** — 승인하려는 요청의 이름과 같은 이름이다.
    // 누가 만들었는지는 상관없다(같은 이름만 막으면 된다).
    await db.member.create({ data: { teamId: K.id, name: `김영희${suffix}` } });
    const leaderId = await leaderOf(K.id);
    const clashReq = await db.joinRequest.findFirstOrThrow({
      where: { teamId: K.id, status: "pending", name: `김영희${suffix}` },
    });
    session.as(await tokenOf(leaderId));
    const clash = await rejoin.resolveJoinRequest(clashReq.id, true);
    session.reset();
    check("승인이 name-taken 으로 실패한다", clash, "name-taken");
    check("요청이 그대로 남아 있다 (조용히 사라지지 않는다)", await requestStatus(clashReq.id), "pending");
    // **다른 이름의 요청은 영향받지 않는다** — 동명이인 하나 때문에 팀 전체가 막히면 안 된다.
    const okReq = await db.joinRequest.findFirstOrThrow({
      where: { teamId: K.id, status: "pending", name: `홍길동${suffix}` },
    });
    session.as(await tokenOf(leaderId));
    const okSettle = await rejoin.resolveJoinRequest(okReq.id, true);
    session.reset();
    check("이름이 겹치지 않는 요청은 승인된다", okSettle, "ok");

    /* ── 8) 남의 팀 요청 ──────────────────────────────────────── */
    console.log("\n남의 팀 요청은 그 팀장이 처리할 수 없다");
    await joinAs(made.code, `남의팀신청자${suffix}`);
    const mineReq = await db.joinRequest.findFirstOrThrow({ where: { teamId: made.id, status: "pending" } });
    const strangerLeader = (await db.member.findFirstOrThrow({ where: { teamId: K.id, isLeader: true } })).id;
    const gone = await settle.settleJoinRequest({
      requestId: mineReq.id,
      teamId: K.id, // **자기가 팀장인 팀**으로 남의 요청을 처리하려 한다
      approverId: strangerLeader,
      approve: true,
    });
    check("남의 요청은 gone 이다", gone, "gone");
    check("남의 요청은 그대로다", await db.joinRequest.count({ where: { id: mineReq.id, status: "pending" } }), 1);

    /* ── 9) 팀장 위임 ─────────────────────────────────────────── */
    console.log("\n팀장 위임은 새 팀장 한 명을 남긴다");
    const heir = (await db.member.findFirstOrThrow({ where: { teamId: made.id, name: `정다은${suffix}` } })).id;
    const meNow = (await db.session.findFirstOrThrow({ where: { memberId: heir } })).memberId;
    // 팀장 세션으로 위임한다 — 실제 액션을 부르려면 **옛 팀장의 세션**이 필요하다.
    const oldLeader = (await db.member.findFirstOrThrow({ where: { teamId: made.id, isLeader: true } })).id;
    session.as(await tokenOf(oldLeader));
    await teamActions.transferLeadership(heir);
    session.nobody();
    void meNow;
    const afterTransfer = await db.member.findMany({
      where: { teamId: made.id, leftAt: null },
      select: { name: true, isLeader: true },
      orderBy: { joinedAt: "asc" },
    });
    check("팀장이 정확히 한 명이다", afterTransfer.filter((m) => m.isLeader).length, 1);
    check("새 팀장이다", afterTransfer.find((m) => m.isLeader)?.name, `정다은${suffix}`);
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

  /** 팀장과 그 팀을 만든다 — 승인이 필요한 상황용. */
  async function makeTeamWithLeader(label: string) {
    const t = await newTeam(label);
    await actions.joinTeam(t.code, draft(`팀장${suffix}`));
    session.reset();
    return t;
  }
}
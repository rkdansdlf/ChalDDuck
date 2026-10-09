/**
 * 역할 추첨 검사 — **제안·동의·추첨·수락**이 규칙대로 되는지 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 여섯 액션이 전부 미검증이었다(`npm run audit:actions` 기준 "없음"). 그런데 규칙이 **`npm run
 * decisions` 가 세는 미결과 같은 자리에 있는 종류**다 — 팀이 동의해야 하는데 팀원이 몇 명을
 * 모으는지를 세는 곳이다.
 *
 * 구조를 읽으며 위험한 곳을 셌다 —
 *
 * - **반대는 제안을 지운다.** 저장하지 않는다. 되돌릴 길이 없고, 화면은 반대를 죽은 제안으로만
 *   말하기 때문이다(회의 제안과 같은 자리).
 * - **마감을 지난 뒤의 반대는 받지 않는다.** 경계는 열린 쪽이다 — 반대만 못 받게 되면 팀원이 답할
 *   수 없게 된다.
 * - **동의가 살아 있으면 뽑지 않는다.** 그리고 **도구는 팀이 동의한 것을 쓴다** — 눌러서 임의의
 *   도구로 바꾸면 팀이 동의한 대상이 아니게 된다.
 * - **같은 역할의 동시 제안**은 `P2002` 로 하나만 된다.
 * - **결과는 바로 확정되지 않고** 당사자가 받을 때까지 기다린다.
 *
 * ## 검사하는 것
 *
 * 1. 제안하면 팀에 **알림이 간다**(없으면 마감만 지나가고 아무도 모른다).
 * 2. **같은 역할에 두 번 제안할 수 없다.**
 * 3. 동의는 중복돼도 한 줄이다 · **반대는 제안을 지운다** · 팀에 알림이 간다.
 * 4. **팀 동의가 살 있으면 뽑지 않는다.**
 * 5. **도구는 팀이 동의한 것을 쓴다** — 임의의 도구로 바꿀 수 없다.
 * 6. **동시에 같은 역할을 뽑아도 하나만** 확정된다.
 * 7. 결과는 **당사자가 받을 때까지** 확정되지 않는다 · 받을 때 확정된다.
 * 8. 확정된 뒤에는 **다시 뽑을 수 없다** — 그리고 무효 추첨(당첨자가 나감)만 자리를 비운다.
 *
 *   npm run test:roles
 */
import { randomUUID } from "node:crypto";

type Session = {
  as(token: string): void;
  nobody(): void;
  reset(): void;
};

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const roles = await import("../../src/server/actions/roles.js");
  const { ROLES, RANDOM_TOOLS } = await import("../../src/data/catalog.js");
  // 액션이 쓰는 두 집합을 **같은 곳에서** 가져온다 — 순서를 바꿔 쓰면 검사가 제품을 안 따라간다.
  const TOOL_NAMES = new Set<string>(RANDOM_TOOLS.map((t) => t.name));
  // 타입을 좁힌다 — 실제 키 집합에서 고르는데도 타입은 `string` 이라서다.
  const role = ROLES[0]!.key as Parameters<typeof roles.proposeRoleDraw>[0];
  const tool = RANDOM_TOOLS[0]!.name;

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
  async function blocked(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
      return "(막지 않음)";
    } catch (e) {
      return (e as Error).message;
    }
  }

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const teamIds: string[] = [];

  async function makeTeam(label: string) {
    session.reset();
    const team = await db.team.create({
      data: {
        name: `역할 검사 ${label} ${suffix}`,
        course: "검증",
        code: `CD-${randomUUID().slice(0, 6).toUpperCase()}`,
      },
    });
    teamIds.push(team.id);
    // **하고 싶은 역할**을 심는다 — 추첨에 들어갈 사람이 없으면 `empty` 로 끝나고 **뽑힌 것이
    // 아니다.** 행만 만들어 두고 "뽑혔다" 고 읽으면 안 된다.
    // **팀장은 하고 싶은 역할을 비워 둔다** — 당첨 후보에서 빼는 것이다.
    //
    // 이게 없으면 당첨자가 팀장일 수 있고, 그러면 그 사람의 **세션이 사라진다**(나간 팀원의
    // 세션은 남지 않는다 — `session.ts`). 그러면 뒤의 검사가 "팀장은 다시 제안할 수 있다" 를
    // 보는데 **그 팀장은 이미 팀원이 아니다.** 제품이 옳고 **픽스처가 연약한** 경우다.
    const leader = await db.member.create({
      data: { teamId: team.id, name: `김민준${suffix}`, isLeader: true, wantRole: null },
    });
    const mate = await db.member.create({
      data: { teamId: team.id, name: `이서연${suffix}`, wantRole: role },
    });
    const third = await db.member.create({
      data: { teamId: team.id, name: `박도윤${suffix}`, wantRole: role },
    });
    const token = async (memberId: string) => {
      const t = randomUUID();
      await db.session.create({
        data: { token: t, memberId, expiresAt: new Date(Date.now() + 3600_000) },
      });
      return t;
    };
    return {
      id: team.id,
      leader,
      mate,
      third,
      asLeader: await token(leader.id),
      asMate: await token(mate.id),
      asThird: await token(third.id),
    };
  }

  /**
   * 그 사람으로 행동한다.
   *
   * ⚠️ **토큰이 문자열인지 먼저 본다**(2026-09-28 에 네 번 발생했다). 멤버 객체를 넘기면
   * 서버는 `token` 이 객체라며 Prisma 오류를 던지고, 그 **아래의 진짜 이유를 가린다.** 여기서
   * 막으면 "로그인이 필요합니다" 라는 **엉뚱한 말**이 아니라 **맞는 말**을 하게 된다.
   */
  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    if (typeof token !== "string") {
      throw new Error(
        `세션 토큰이 아니라 ${typeof token} 를 넘겼습니다 (멤버 객체면 .asMember 처럼 이름이 붙은 값을 쓰세요)`,
      );
    }
    session.as(token);
    try {
      return await work();
    } finally {
      session.nobody();
    }
  }

  const noticeCount = async (teamId: string, kind: string) => {
    const members = await db.member.findMany({ where: { teamId }, select: { id: true } });
    return db.notification.count({
      where: { memberId: { in: members.map((m) => m.id) }, kind },
    });
  };

  const consentOf = (teamId: string) =>
    db.roleDrawConsent.findFirst({ where: { teamId }, select: { id: true, tool: true } });

  const rejectionOf = async (teamId: string, role: string, memberId: string) =>
    (await db.roleRejection.findUnique({
      where: { teamId_role_memberId: { teamId, role: role as Parameters<typeof roles.claimSoleRole>[0], memberId } },
    })) !== null;

  const drawOf = (teamId: string) =>
    db.roleDraw.findFirst({
      where: { teamId },
      select: { id: true, accepted: true, role: true, tool: true, winnerId: true },
    });

  try {
    console.log("\n역할 추첨 검사 (실제 서버 액션)");

    const A = await makeTeam("제안");

    /* ── 1) 제안하면 팀에 알림이 간다 ────────────────────────── */
    console.log("\n제안하면 팀에 알림이 간다 — 없으면 마감만 지나간다");
    const noticesBefore = await noticeCount(A.id, "role-consent");
    check("제안된다", await as(A.asLeader, () => roles.proposeRoleDraw(role, tool)), "ok");
    const consent = await consentOf(A.id);
    truthy("동의 제안이 생긴다", consent);
    check("팀에 알림이 갔다", await noticeCount(A.id, "role-consent"), noticesBefore + 2);

    /* ── 2) 같은 역할에 두 번 제안할 수 없다 ─────────────────── */
    console.log("\n같은 역할에 두 번 제안할 수 없다");
    check("두 번째는 '이미 있다'", await as(A.asMate, () => roles.proposeRoleDraw(role, tool)), "already");

    /* ── 3) 동의와 반대 ──────────────────────────────────────── */
    console.log("\n동의는 중복돼도 한 줄이고, 반대는 제안을 지운다");
    check("동의한다", await as(A.asMate, () => roles.respondRoleDraw(role, true)), "ok");
    check("또 동의해도 괜찮다", await as(A.asMate, () => roles.respondRoleDraw(role, true)), "ok");
    const agreeRows = await db.roleConsentResponse.count({ where: { agree: true } });
    check("같은 사람의 동이는 한 줄이다", agreeRows, 1);

    const B = await makeTeam("반대");
    await as(B.asLeader, () => roles.proposeRoleDraw(role, tool));
    const beforeOppose = await noticeCount(B.id, "role-consent");
    check("반대한다", await as(B.asMate, () => roles.respondRoleDraw(role, false)), "ok");
    check("제안이 지워진다", await consentOf(B.id), null);
    check("팀에 알림이 간다", await noticeCount(B.id, "role-consent"), beforeOppose + 2);
    // **반대 뒤에도 저게 남지 않아야 한다** — 응답은 `onDelete: Cascade` 로 함께 지워진다.
    const orphanResponses = await db.roleConsentResponse.count();
    check("반대에 대한 응답도 함께 지워진다", orphanResponses, agreeRows);

    /* ── 4) 팀 동의가 살아 있으면 뽑지 않는다 ─────────────────── */
    console.log("\n팀 동의가 살아 있으면 뽑지 않는다");
    const before4 = await drawOf(A.id);
    check("동의 제안이 있으므로 뽑지 않는다", before4, null);
    const drewEarly = await blocked(() => as(A.asLeader, () => roles.drawForRole(role, tool)));
    check("막힌다", drewEarly.length > 0, true);

    /* ── 5) 도구는 팀이 동의한 것을 쓴다 ──────────────────────── */
    console.log("\n마감이 지나면 뽑을 수 있고, 도구는 **팀이 동의한 것**을 쓴다");
    const C = await makeTeam("도구");
    await as(C.asLeader, () => roles.proposeRoleDraw(role, tool));
    await as(C.asMate, () => roles.respondRoleDraw(role, true));
    await as(C.asThird, () => roles.respondRoleDraw(role, true));
    // ⚠️ **동의한 사람 수는 관계없다.** `awaitingConsent` 는 **마감 시각만** 본다 — 제안이 있고
    // 마감 전이면 전원이 동의해도 뽑을 수 없다. 그리고 **동의가 강제되지 않는다** — 마감 뒤에는
    // 동의가 없어도 뽑힌다(동의가 강제되면 동의하지 않는 팀이 생긴다).
    check("전원이 동의해도 마감이 전이면 못 뽑는다", (await as(C.asLeader, () => roles.drawForRole(role, tool))).status, "consent");

    // 마감을 지난 시각으로 바꾼다 — 시계를 기다릴 수는 없으므로 **기록을 옮긴다.**
    await db.roleDrawConsent.updateMany({
      where: { teamId: C.id },
      data: { respondBy: new Date(Date.now() - 60_000) },
    });

    // **이제 핵심이다: 누른 도구가 아니라 팀이 동의한 도구가 쓰인다.**
    // (제 안에 하나도 배정할 사람의 정보가 없으니 그쪽을 채우면 된다 — 여기서는 상태만 본다.)
    const otherTool = [...TOOL_NAMES].find((t) => t !== tool)!;
    const afterWindow = await as(C.asLeader, () => roles.drawForRole(role, otherTool));
    check("마감이 지나면 뽑는다", afterWindow.status, "ok");
    const drawn = await drawOf(C.id);
    check("팀이 동의한 도구가 쓰인다", drawn?.tool, tool);

    /* ── 6) 결과는 당사자가 받을 때까지 확정되지 않는다 ────────── */
    console.log("\n결과는 당사자가 받을 때까지 확정되지 않는다");
    check("아직 확정되지 않았다", drawn?.accepted, false);
    const winnerToken =
      drawn?.winnerId === C.leader.id
        ? C.asLeader
        : drawn?.winnerId === C.mate.id
          ? C.asMate
          : C.asThird;
    check("당사자가 받으면 확정된다", await as(winnerToken, () => roles.acceptRoleDraw(role)), "ok");
    check("확정되었다", (await drawOf(C.id))?.accepted, true);

    /* ── 7) 확정된 뒤에는 다시 뽑을 수 없다 ──────────────────── */
    console.log("\n확정된 뒤에는 다시 뽑을 수 없다 — 덮어쓰면 확정이라는 말이 무의미해진다");
    check("다시 제안해도 '정해졌다'", await as(C.asLeader, () => roles.proposeRoleDraw(role, tool)), "settled");
    check(
      "추첨도 이미 정해졌다",
      (await as(C.asLeader, () => roles.drawForRole(role, tool))).status,
      "settled",
    );
    check("확정은 그대로다", (await drawOf(C.id))?.accepted, true);

    /* ── 8) 무효 추첨(당첨자가 나감)만 자리를 비운다 ──────────── */
    console.log("\n무효 추첨만 자리를 비운다");
    const D = await makeTeam("무효");
    await as(D.asLeader, () => roles.proposeRoleDraw(role, tool));
    await as(D.asMate, () => roles.respondRoleDraw(role, true));
    await as(D.asThird, () => roles.respondRoleDraw(role, true));
    // **마감을 넘긴다** — 동의가 끝나야 뽑을 수 있다(위 5번과 같은 이유).
    await db.roleDrawConsent.updateMany({
      where: { teamId: D.id },
      data: { respondBy: new Date(Date.now() - 60_000) },
    });
    const dDrawn = await as(D.asLeader, () => roles.drawForRole(role, tool));
    check("뽑힌다", dDrawn.status, "ok");
    // **확정하지 않은 채** 당첨자가 나간다 — 그때만 자리를 비워 다시 제안할 수 있어야 한다.
    const winnerId = (await drawOf(D.id))?.winnerId ?? "";
    await db.member.update({
      where: { id: winnerId },
      data: { leftAt: new Date() },
    });
    check("자리 비워지고 다시 제안할 수 있다", await as(D.asLeader, () => roles.proposeRoleDraw(role, tool)), "ok");

    /* ── 9) 당사자가 거절하면 다시 비운다 ────────────────────── */
    console.log("\n당사자가 거절하면 결과가 지워지고 다시 비운다");
    const E = await makeTeam("거절");
    await as(E.asLeader, () => roles.proposeRoleDraw(role, tool));
    await db.roleDrawConsent.updateMany({
      where: { teamId: E.id },
      data: { respondBy: new Date(Date.now() - 60_000) },
    });
    check("뽑힌다", (await as(E.asLeader, () => roles.drawForRole(role, tool))).status, "ok");
    const eDrawn = await drawOf(E.id);
    const eWinnerId = eDrawn?.winnerId ?? "";
    check("아직 확정되지 않았다", eDrawn?.accepted, false);
    const eWinnerToken = eWinnerId === E.leader.id ? E.asLeader : eWinnerId === E.mate.id ? E.asMate : E.asThird;
    check("당사자가 거절한다", await as(eWinnerToken, () => roles.rejectRoleDraw(role)), "ok");
    check("결과가 지워진다", await drawOf(E.id), null);
    check("거절이 남는다", await rejectionOf(E.id, role, eWinnerId), true);

    /* ── 10) 남이 대신 거절할 수는 없다 ─────────────────────── */
    console.log("\n남이 대신 거절할 수는 없다");
    const F = await makeTeam("타인거절");
    await as(F.asLeader, () => roles.proposeRoleDraw(role, tool));
    await db.roleDrawConsent.updateMany({
      where: { teamId: F.id },
      data: { respondBy: new Date(Date.now() - 60_000) },
    });
    await as(F.asLeader, () => roles.drawForRole(role, tool));
    const fWinnerId = (await drawOf(F.id))?.winnerId ?? "";
    const fOther = fWinnerId === F.leader.id ? F.asMate : F.asLeader;
    check("다른 사람은 거절할 수 없다", await as(fOther, () => roles.rejectRoleDraw(role)), "not-yours");
    check("결과는 그대로다", (await drawOf(F.id))?.accepted, false);

    /* ── 11) 이미 확정한 것은 거절로 뒤집지 않는다 ──────────── */
    // ⚠️ **이 검사는 앞단 `myPendingDraw` 을 간다.** 아래 `deleteMany` 의 `accepted: false`
    // 를 끊어도 이건 깨지지 않는다 — 앞에서 확정분을 이미 "gone" 으로 돌려보냈기 때문이다.
    // 그래서 이 검사는 **뒤의 줄이 아니라 앞단을 지킨다.**
    console.log("\n이미 확정한 것은 거절로 뒤집지 않는다");
    const G = await makeTeam("확정후거절");
    await as(G.asLeader, () => roles.proposeRoleDraw(role, tool));
    await db.roleDrawConsent.updateMany({
      where: { teamId: G.id },
      data: { respondBy: new Date(Date.now() - 60_000) },
    });
    await as(G.asLeader, () => roles.drawForRole(role, tool));
    const gWinnerId = (await drawOf(G.id))?.winnerId ?? "";
    const gWinnerToken = gWinnerId === G.leader.id ? G.asLeader : gWinnerId === G.mate.id ? G.asMate : G.asThird;
    check("당사자가 받는다", await as(gWinnerToken, () => roles.acceptRoleDraw(role)), "ok");
    check("확정된 뒤에는 거절해도 안 돌아간다", await as(gWinnerToken, () => roles.rejectRoleDraw(role)), "gone");
    check("확정은 그대로다", (await drawOf(G.id))?.accepted, true);

    /* ── 12) 혼자 인 경우에만 그 역할을 맡는다 ──────────────── */
    console.log("\n혼자 인 경우에만 그 역할을 맡는다");
    const H = await makeTeam("혼자");
    await db.member.updateMany({ where: { teamId: H.id }, data: { wantRole: null } });
    await db.member.update({ where: { id: H.mate.id }, data: { wantRole: role } });
    check("혼자 고르면 맡는다", await as(H.asMate, () => roles.claimSoleRole(role)), "ok");
    check("확정된 자리로 남는다", (await drawOf(H.id))?.accepted, true);
    check("도구는 '담당' 이다", (await drawOf(H.id))?.tool, "담당");
    check("한 번만 맡는다", await as(H.asThird, () => roles.claimSoleRole(role)), "settled");

    /* ── 13) 겹치는 사람이 있으면 그건 추첨 몫 ──────────────── */
    console.log("\n겹치는 사람이 있으면 그건 추첨 몫");
    const I = await makeTeam("겹침");
    check("나만 고른 게 아니면 안 된다", await as(I.asThird, () => roles.claimSoleRole(role)), "not-yours");

    /* ── 14) 아무도 안 고르면 아무도 못 맡는다 ──────────────── */
    console.log("\n아무도 안 고르면 아무도 못 맡는다");
    const J = await makeTeam("아무도");
    await db.member.updateMany({ where: { teamId: J.id }, data: { wantRole: null } });
    check("고른 사람이 없으면 안 된다", await as(J.asLeader, () => roles.claimSoleRole(role)), "not-yours");

    /* ── 9) 모르는 값 ────────────────────────────────────────── */
    console.log("\n모르는 역할과 도구는 거절한다");
    const badRole = await blocked(() =>
      as(A.asLeader, () => roles.proposeRoleDraw("없는역할" as Parameters<typeof roles.proposeRoleDraw>[0], tool)),
    );
    check("모르는 역할은 거절한다", badRole.includes("알 수 없는 역할"), true);
    const badTool = await blocked(() => as(A.asLeader, () => roles.proposeRoleDraw(role, "없는도구")));
    check("모르는 도구는 거절한다", badTool.includes("알 수 없는 추첨 도구"), true);
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
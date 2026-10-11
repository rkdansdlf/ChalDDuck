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
  const { DEFAULT_ROLES: ROLES, RANDOM_TOOLS } = await import("../../src/data/catalog.js");
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

  const rolesAt = async (teamId: string) => {
    const { rolesOf } = await import("../../src/data/team-roles.js");
    return rolesOf(db, teamId);
  };
  const errOf2 = async (token: string, input: Parameters<typeof roles.addTeamRole>[0]) => {
    const r = await as(token, () => roles.addTeamRole(input));
    return r.status === "invalid" ? r.error : r.status;
  };

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

    /* ── 15) 예상 시간 ─────────────────────────────────────── */
    console.log("\n예상 시간은 범위 안의 정수만 저장하고, 지우면 미정으로 돌아간다");
    const K = await makeTeam("예상시간");
    const other = await makeTeam("예상시간-다른팀");
    check("적으면 저장된다", await as(K.asLeader, () => roles.setRoleEstimate(role, 8)), "ok");
    const stored = await db.roleEstimate.findMany({ where: { teamId: K.id } });
    check("행이 하나 생긴다", stored.map((e) => [e.role, e.hours]), [[role, 8]]);
    check("다시 적으면 같은 행을 고친다", await as(K.asLeader, () => roles.setRoleEstimate(role, 5)), "ok");
    check(
      "행이 늘지 않고 값만 바뀐다",
      (await db.roleEstimate.findMany({ where: { teamId: K.id } })).map((e) => e.hours),
      [5],
    );
    for (const bad of [0, -1, 100, 2.5, Number.NaN]) {
      check(`범위 밖(${bad})은 거절한다`, await as(K.asLeader, () => roles.setRoleEstimate(role, bad)), "invalid");
    }
    check(
      "모르는 역할은 거절한다",
      await as(K.asLeader, () => roles.setRoleEstimate("없는역할" as typeof role, 3)),
      "invalid",
    );
    check("거절된 값은 저장되지 않는다", (await db.roleEstimate.findMany({ where: { teamId: K.id } })).map((e) => e.hours), [5]);
    check(
      "다른 팀 행은 건드리지 않는다",
      await db.roleEstimate.count({ where: { teamId: other.id } }),
      0,
    );
    check("null 로 지운다", await as(K.asLeader, () => roles.setRoleEstimate(role, null)), "ok");
    check("지우면 행이 없다(0 이 아니라 미정)", await db.roleEstimate.count({ where: { teamId: K.id } }), 0);

    /* ── 16) 균형 추천 ─────────────────────────────────────── */
    type RK = Parameters<typeof roles.claimSoleRole>[0];
    const allKeys = ROLES.map((r) => r.key as RK);
    const coreKeys = ROLES.filter((r) => r.kind === "core").map((r) => r.key as string);
    const draws = (teamId: string) =>
      db.roleDraw.findMany({
        where: { teamId },
        select: { id: true, role: true, tool: true, winnerId: true, accepted: true },
        orderBy: { role: "asc" },
      });

    console.log("\n균형 추천은 받기 대기로 올라가고, 확정되지 않는다");
    const M = await makeTeam("균형");
    const first = await as(M.asLeader, () => roles.proposeBalancedRoles());
    check("역할 전부에 올라간다", first.status === "ok" ? first.proposed.map((p) => p.role).sort() : first.status, [...allKeys].sort());
    const rows = await draws(M.id);
    check("도구 이름은 균형 추천이다", [...new Set(rows.map((r) => r.tool))], ["균형 추천"]);
    check("아무도 받기 전에는 확정되지 않는다", rows.every((r) => r.accepted === false), true);
    const coreWinners = rows.filter((r) => coreKeys.includes(r.role)).map((r) => r.winnerId);
    check("세 사람 모두 핵심 업무를 하나는 받는다", new Set(coreWinners).size, 3);
    check("받는 사람에게 알림이 간다", (await db.notification.count({ where: { memberId: M.mate.id, kind: "task-assigned" } })) > 0, true);
    check("올린 사람 자신에게는 알림이 가지 않는다", await db.notification.count({ where: { memberId: M.leader.id, kind: "task-assigned" } }), 0);

    console.log("\n다시 올려도 이미 걸린 역할은 건드리지 않는다");
    check("새로 채울 역할이 없으면 none", (await as(M.asLeader, () => roles.proposeBalancedRoles())).status, "none");
    check("행이 늘지 않는다", (await draws(M.id)).length, 5);

    console.log("\n안 받으면 그 사람은 그 역할의 다음 추천에서 빠진다");
    const mine = rows.find((r) => r.winnerId === M.mate.id)!;
    const tokenOf = (id: string) => (id === M.leader.id ? M.asLeader : id === M.mate.id ? M.asMate : M.asThird);
    check("당사자가 안 받기를 누른다", await as(tokenOf(mine.winnerId), () => roles.rejectRoleDraw(mine.role as RK)), "ok");
    check("그 자리가 비었다", (await draws(M.id)).length, 4);
    const again = await as(M.asLeader, () => roles.proposeBalancedRoles());
    check("다시 올리면 그 역할 하나만 올라간다", again.status === "ok" ? again.proposed.map((p) => p.role) : again.status, [mine.role]);
    const redo = (await draws(M.id)).find((r) => r.role === mine.role)!;
    check("안 받은 사람이 아닌 다른 사람에게 간다", redo.winnerId !== mine.winnerId, true);

    console.log("\n피할 역할과 확정된 것, 동의 중인 것은 건드리지 않는다");
    const V = await makeTeam("제외");
    await db.member.update({ where: { id: V.mate.id }, data: { vetoRole: "deck" } });
    await db.member.update({ where: { id: V.third.id }, data: { vetoRole: "deck" } });
    // 확정된 추첨 하나, 동의를 받는 중인 역할 하나.
    await db.roleDraw.create({ data: { teamId: V.id, role: "research", tool: "담당", winnerId: V.mate.id, accepted: true } });
    await as(V.asLeader, () => roles.proposeRoleDraw("present" as RK, tool));
    await as(V.asLeader, () => roles.proposeBalancedRoles());
    const vrows = await draws(V.id);
    check("피할 역할로 고른 사람은 그 역할을 받지 않는다", vrows.find((r) => r.role === "deck")?.winnerId, V.leader.id);
    const research = vrows.find((r) => r.role === "research")!;
    check("확정된 역할은 그대로다", [research.winnerId, research.accepted, research.tool], [V.mate.id, true, "담당"]);
    check("동의를 받는 중인 역할은 비어 있다", vrows.some((r) => r.role === "present"), false);

    console.log("\n두 사람이 동시에 올려도 역할마다 하나뿐이다");
    const Conc = await makeTeam("동시");
    await Promise.all([
      as(Conc.asLeader, () => roles.proposeBalancedRoles()),
      as(Conc.asMate, () => roles.proposeBalancedRoles()),
    ]);
    check("행이 다섯을 넘지 않는다", (await draws(Conc.id)).length, 5);

    console.log("\n내 희망 역할 — 첫 희망 · 두 번째 희망 · 피할 역할");
    const W = await makeTeam("희망");
    const choice = (who: string, c: { want: string; want2: string | null; veto: string | null }) =>
      as(who, () => roles.setMyRoleChoices(c as Parameters<typeof roles.setMyRoleChoices>[0]));
    check("세 칸이 저장된다", await choice(W.asMate, { want: "research", want2: "deck", veto: "present" }), "ok");
    const saved = await db.member.findUnique({ where: { id: W.mate.id } });
    check("DB 에 그대로 들어간다", [saved?.wantRole, saved?.wantRole2, saved?.vetoRole], ["research", "deck", "present"]);
    check("두 번째·피할 역할은 비울 수 있다", await choice(W.asMate, { want: "script", want2: null, veto: null }), "ok");
    const cleared = await db.member.findUnique({ where: { id: W.mate.id } });
    check("비우면 null 이다", [cleared?.wantRole, cleared?.wantRole2, cleared?.vetoRole], ["script", null, null]);
    check("첫 희망을 피할 수는 없다", await choice(W.asMate, { want: "deck", want2: null, veto: "deck" }), "invalid");
    check("첫 희망을 두 번째로 또 고를 수 없다", await choice(W.asMate, { want: "deck", want2: "deck", veto: null }), "invalid");
    check("두 번째 희망을 피할 수는 없다", await choice(W.asMate, { want: "deck", want2: "manage", veto: "manage" }), "invalid");
    check("모르는 역할은 거절한다", await choice(W.asMate, { want: "없는역할", want2: null, veto: null }), "invalid");
    check("첫 희망이 없으면 거절한다", await choice(W.asMate, { want: null as unknown as string, want2: null, veto: null }), "invalid");
    check("거절된 값은 저장되지 않는다", (await db.member.findUnique({ where: { id: W.mate.id } }))?.wantRole, "script");
    check("남의 희망은 건드리지 않는다", (await db.member.findUnique({ where: { id: W.third.id } }))?.wantRole, role);

    /* ── 17) 팀 역할 편집 ──────────────────────────────────── */
    type In = Parameters<typeof roles.addTeamRole>[0];
    const spec = (name: string, kind = "core", note = ""): In => ({ name, note, kind });
    const keysOf = async (teamId: string) =>
      (await db.teamRole.findMany({ where: { teamId }, orderBy: { position: "asc" }, select: { key: true } })).map((r) => r.key);

    console.log("\n역할 편집은 팀장만 하고, 처음 고칠 때 기본 다섯 개가 팀의 것이 된다");
    const R = await makeTeam("역할편집");
    check("고치기 전에는 행이 없다(기본 다섯 개를 쓴다)", await db.teamRole.count({ where: { teamId: R.id } }), 0);
    check("팀원은 더할 수 없다", (await as(R.asMate, () => roles.addTeamRole(spec("설문 설계")))).status, "forbidden");
    check("거절된 편집은 아무것도 만들지 않는다", await db.teamRole.count({ where: { teamId: R.id } }), 0);
    const added = await as(R.asLeader, () => roles.addTeamRole(spec("설문 설계", "core", "문항 작성")));
    check("팀장은 더할 수 있다", added.status, "ok");
    const addedKey = added.status === "ok" ? added.key : "";
    check("새 키는 r- 로 시작한다", addedKey.startsWith("r-"), true);
    check("기본 다섯 개가 옮겨지고 맨 끝에 붙는다", await keysOf(R.id), [...ROLES.map((r) => r.key), addedKey]);
    check("기본 역할의 키는 그대로다", (await keysOf(R.id)).slice(0, 5), ROLES.map((r) => r.key));

    console.log("\n입력 검사");
    const errOf = async (input: In) => {
      const r = await as(R.asLeader, () => roles.addTeamRole(input));
      return r.status === "invalid" ? r.error : r.status;
    };
    check("빈 이름은 거절한다", await errOf(spec("   ")), "empty-name");
    check("같은 이름은 거절한다", await errOf(spec("설문 설계")), "name-taken");
    check("공백이 달라도 같은 이름이다", await errOf(spec("설문   설계")), "name-taken");
    check("기본 역할과 같은 이름도 거절한다", await errOf(spec("발표")), "name-taken");
    check("너무 긴 이름은 거절한다", await errOf(spec("가".repeat(21))), "long-name");
    check("너무 긴 설명은 거절한다", await errOf(spec("새 역할", "core", "가".repeat(61))), "long-note");
    check("모르는 유형은 거절한다", await errOf(spec("새 역할", "boss")), "bad-kind");
    check("거절된 입력은 저장되지 않는다", (await keysOf(R.id)).length, 6);

    console.log("\n고치기 — 키는 그대로라 기존 배정이 이어진다");
    const researchBefore = await db.roleDraw.create({ data: { teamId: R.id, role: "research", tool: "담당", winnerId: R.mate.id, accepted: true } });
    check("이름과 유형을 고친다", (await as(R.asLeader, () => roles.updateTeamRole("research", spec("자료 조사와 정리", "support")))).status, "ok");
    const renamed = await rolesAt(R.id);
    check("바뀐 값이 읽힌다", renamed.find((r) => r.key === "research"), { key: "research", name: "자료 조사와 정리", note: "", kind: "support" });
    check("확정된 배정은 그대로 이어진다", (await db.roleDraw.findUnique({ where: { id: researchBefore.id } }))?.winnerId, R.mate.id);
    check("팀원은 고칠 수 없다", (await as(R.asMate, () => roles.updateTeamRole("deck", spec("다른 이름")))).status, "forbidden");
    check("다른 역할의 이름으로는 못 바꾼다", (await as(R.asLeader, () => roles.updateTeamRole("deck", spec("발표")))).status, "invalid");
    check("자기 이름 그대로 저장은 된다", (await as(R.asLeader, () => roles.updateTeamRole("deck", spec("PPT 제작", "core")))).status, "ok");
    check("없는 역할은 gone", (await as(R.asLeader, () => roles.updateTeamRole("r-nothing", spec("아무거나")))).status, "gone");

    console.log("\n지우기 — 기록의 근거는 지우지 않고, 나머지는 함께 치운다");
    check("확정된 담당이 있는 역할은 지울 수 없다", await as(R.asLeader, () => roles.removeTeamRole("research")), { status: "blocked", reason: "confirmed" });
    const box = await db.submissionBox.create({ data: { teamId: R.id, role: "script", name: "대본", due: "10/1" } });
    check("제출함이 묶인 역할은 지울 수 없다", await as(R.asLeader, () => roles.removeTeamRole("script")), { status: "blocked", reason: "box" });
    check("팀원은 지울 수 없다", (await as(R.asMate, () => roles.removeTeamRole(addedKey))).status, "forbidden");

    // 지우는 역할에 걸린 것들 — 받기 대기 추첨, 안 받은 기록, 예상 시간, 희망·피할 역할.
    await db.roleDraw.create({ data: { teamId: R.id, role: addedKey, tool: "룰렛", winnerId: R.third.id } });
    await db.roleRejection.create({ data: { teamId: R.id, role: addedKey, memberId: R.leader.id } });
    await db.roleEstimate.create({ data: { teamId: R.id, role: addedKey, hours: 4 } });
    await db.member.update({ where: { id: R.third.id }, data: { wantRole: addedKey, wantRole2: addedKey } });
    await db.member.update({ where: { id: R.leader.id }, data: { vetoRole: addedKey } });
    const editNoticesBefore = await db.notification.count({ where: { memberId: R.mate.id, kind: "role-edit" } });
    check("걸린 것이 없으면 지울 수 있다", (await as(R.asLeader, () => roles.removeTeamRole(addedKey))).status, "ok");
    check("역할 행이 없어진다", (await keysOf(R.id)).includes(addedKey), false);
    check("받기 대기 추첨도 사라진다", await db.roleDraw.count({ where: { teamId: R.id, role: addedKey } }), 0);
    check("안 받은 기록도 사라진다", await db.roleRejection.count({ where: { teamId: R.id, role: addedKey } }), 0);
    check("예상 시간도 사라진다", await db.roleEstimate.count({ where: { teamId: R.id, role: addedKey } }), 0);
    const afterThird = await db.member.findUnique({ where: { id: R.third.id } });
    check("그 역할을 희망하던 사람의 희망이 비워진다", [afterThird?.wantRole, afterThird?.wantRole2], [null, null]);
    check("피하던 사람의 값도 비워진다", (await db.member.findUnique({ where: { id: R.leader.id } }))?.vetoRole, null);
    check("팀원에게 알림이 간다", (await db.notification.count({ where: { memberId: R.mate.id, kind: "role-edit" } })) > editNoticesBefore, true);
    check("다시 지우면 gone", (await as(R.asLeader, () => roles.removeTeamRole(addedKey))).status, "gone");
    await db.submissionBox.delete({ where: { id: box.id } });

    console.log("\n지워진 역할은 그 팀에서 더는 통하지 않는다");
    check("지워진 역할로는 제안할 수 없다", (await blocked(() => as(R.asLeader, () => roles.proposeRoleDraw(addedKey as typeof role, tool)))).includes("알 수 없는 역할"), true);
    check("지워진 역할로는 예상 시간을 못 적는다", await as(R.asLeader, () => roles.setRoleEstimate(addedKey as typeof role, 3)), "invalid");
    check("지워진 역할은 희망으로 못 고른다", await choice(R.asMate, { want: addedKey, want2: null, veto: null }), "invalid");
    check("다른 팀의 역할 키는 이 팀에서 통하지 않는다", await choice(W.asMate, { want: addedKey, want2: null, veto: null }), "invalid");

    console.log("\n새 역할은 추첨·추천에서 기본 역할과 똑같이 쓰인다");
    const N = await makeTeam("새역할");
    const nAdded = await as(N.asLeader, () => roles.addTeamRole(spec("설문 설계", "core")));
    const nKey = nAdded.status === "ok" ? nAdded.key : "";
    check("새 역할을 첫 희망으로 고를 수 있다", await choice(N.asMate, { want: nKey, want2: null, veto: null }), "ok");
    check("그 역할은 희망자만 후보다", await as(N.asLeader, () => roles.proposeRoleDraw(nKey as typeof role, tool)), "ok");
    const nBalance = await as(N.asLeader, () => roles.proposeBalancedRoles());
    check(
      "균형 추천은 새 역할까지 여섯 개를 본다(동의 중인 하나는 뺀다)",
      nBalance.status === "ok" ? nBalance.proposed.length : nBalance.status,
      5,
    );
    check("추천된 역할 중에 새 역할이 없다(동의를 받는 중이므로)", nBalance.status === "ok" && nBalance.proposed.some((p) => p.role === nKey), false);

    console.log("\n가입 화면은 들어가려는 팀의 역할을 초대 코드로 읽는다");
    const onboarding = await import("../../src/server/actions/onboarding.js");
    const codeOf = async (teamId: string) => (await db.team.findUnique({ where: { id: teamId } }))!.code;
    const Jn = await makeTeam("가입역할");
    const joinAdded = await as(Jn.asLeader, () => roles.addTeamRole(spec("설문 설계", "core")));
    const joinKey = joinAdded.status === "ok" ? joinAdded.key : "";
    const seen = await onboarding.getJoinRoles(await codeOf(Jn.id));
    check("팀이 더한 역할이 보인다", seen.map((r) => r.key).includes(joinKey), true);
    check("소문자 코드도 읽는다", (await onboarding.getJoinRoles((await codeOf(Jn.id)).toLowerCase())).length, 6);
    check("고치지 않은 팀은 기본 다섯 개다", (await onboarding.getJoinRoles(await codeOf(W.id))).map((r) => r.key), ROLES.map((r) => r.key));
    check("모르는 코드는 기본 다섯 개다(코드가 맞는지 알려 주지 않는다)", (await onboarding.getJoinRoles("NOPE-000")).length, 5);

    const draftFor = (want: string, veto: string | null = null) => ({
      name: `가입자${suffix}${Math.floor(Math.random() * 1e6)}`,
      email: "",
      mbti: null,
      mbtiFromQuiz: false,
      want,
      veto,
      birthDate: "",
      birthTime: "",
    }) as unknown as Parameters<typeof onboarding.joinTeam>[1];
    session.nobody();
    const code = await codeOf(Jn.id);
    const outsider = await onboarding.joinTeam(code, draftFor("research", "없는역할"));
    check("팀에 있는 역할로는 가입 요청이 선다(없는 피할 역할은 비워진다)", ["joined", "requested"].includes(outsider.status), true);
    const unknown = await onboarding.joinTeam(code, draftFor("없는역할"));
    check("팀에 없는 역할로는 가입할 수 없다", unknown, { status: "invalid", reason: "no-want" });

    console.log("\n마지막 하나는 지울 수 없다");
    const L = await makeTeam("마지막");
    for (const r of ROLES.slice(1)) await as(L.asLeader, () => roles.removeTeamRole(r.key));
    check("하나 남으면 지울 수 없다", await as(L.asLeader, () => roles.removeTeamRole(ROLES[0]!.key)), { status: "blocked", reason: "last" });
    check("그 하나만 남는다", await keysOf(L.id), [ROLES[0]!.key]);

    console.log("\n역할 수 상한");
    const X = await makeTeam("상한");
    for (let i = 0; i < 7; i++) check(`#${i + 1} 더한다`, (await as(X.asLeader, () => roles.addTeamRole(spec(`역할${i}`)))).status, "ok");
    check("열두 개가 넘으면 거절한다", await errOf2(X.asLeader, spec("하나 더")), "too-many");
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
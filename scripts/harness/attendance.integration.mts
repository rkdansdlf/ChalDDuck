/**
 * 출석 검사 — 팀장이 찍는 출석이 **기여 기록과 어긋나지 않는지** 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 출석 체크는 기여 기록을 **만든다**(`npm run audit:actions` 에서 "없음"이던 두 액션).
 * 기여 기록은 팀이 문서로 내는 근거라서, 출석이 잘못 쌓이면 **없던 참석이 기록에 남거나 한 번의
 * 참석이 두 번 세어진다.** 읽으며 위험한 곳을 셌다 —
 *
 * - **팀장만 저장한다.** 팀원이 찍으면 자기 기여를 스스로 만든다.
 * - **확정된 회의에만 찍는다.** 제안 중인 회의는 열리지 않았다.
 * - **명단에 섞인 남의 팀·나간 사람·없는 아이디는 버린다.** 안 버리면 남의 팀 기여 기록이 생긴다.
 * - **같은 명단을 두 번 저장해도 한 줄씩이다.** 화면은 저장 버튼을 두 번 누를 수 있다.
 * - **체크를 풀면 아직 아무도 건드리지 않은 기록만 회수한다.** 팀원이 확인했거나 이견이 달린
 *   기록은 팀의 판단이 붙었으므로 남는다 — 그러면 **다시 체크했을 때 기록이 둘이 되지 않는가**가
 *   이 검사의 핵심이다. 출석 행은 지워지고 새로 만들어지는데, 기록은 출석 행의 아이디에 묶여 있다.
 * - **조회는 팀으로 거른다.** 남의 팀 회의의 출석은 볼 수 없다.
 *
 * ## 검사하는 것
 *
 * 1. 권한 — 팀원·세션 없음·확정 전 회의·남의 팀 회의는 거절된다
 * 2. 저장하면 출석과 기여 기록이 **같은 수만큼** 생기고, 기록은 대기 상태의 자동 기록이다
 * 3. 같은 명단을 다시 저장해도 늘지 않는다 · 같은 순간에 두 번 저장해도 늘지 않는다
 * 4. 남의 팀·나간 사람·없는 아이디는 버려진다
 * 5. 체크를 풀면 아무도 건드리지 않은 기록은 회수된다
 * 6. 확인된 기록은 남고, **다시 체크해도 기록은 하나다**
 * 7. 조회 — 팀원도 보고, 편집 가능 여부는 팀장·확정 회의일 때만, 남의 팀 것은 볼 수 없다
 *
 *   npm run test:attendance
 */
import { randomUUID } from "node:crypto";

type Session = { as(token: string): void; nobody(): void; reset(): void; clearAll(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const attendance = await import("../../src/server/actions/attendance.js");

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

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const teamIds: string[] = [];

  async function makeTeam(label: string) {
    session.reset();
    const t = await db.team.create({
      data: { name: `출석 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(t.id);
    const leader = await db.member.create({ data: { teamId: t.id, name: `김민준${suffix}`, isLeader: true } });
    const mate = await db.member.create({ data: { teamId: t.id, name: `이서연${suffix}` } });
    const third = await db.member.create({ data: { teamId: t.id, name: `박지호${suffix}` } });
    const token = async (memberId: string) => {
      const tk = randomUUID();
      await db.session.create({ data: { token: tk, memberId, expiresAt: new Date(Date.now() + 3600_000) } });
      return tk;
    };
    return {
      id: t.id,
      leader,
      mate,
      third,
      asLeader: await token(leader.id),
      asMate: await token(mate.id),
    };
  }

  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    if (typeof token !== "string") throw new Error("세션 토큰이 아닙니다");
    session.as(token);
    try {
      return await work();
    } finally {
      session.nobody();
    }
  }

  /** 팀에 속한 회의 제안. `stage` 로 확정 여부를 고른다. */
  async function makeMeeting(teamId: string, stage: "proposed" | "confirmed", agenda?: string) {
    const leader = await db.member.findFirstOrThrow({ where: { teamId, isLeader: true } });
    const slot = await db.meetingSlot.create({
      data: { teamId, day: "2026-10-10", time: "10:00", available: 3, total: 3 },
    });
    return db.meetingProposal.create({
      data: {
        teamId,
        slotId: slot.id,
        proposedById: leader.id,
        stage,
        agenda: agenda ?? null,
        date: "2026-10-10",
        respondBy: new Date(Date.now() + 86_400_000),
      },
      select: { id: true },
    });
  }

  /** 던져진 이유를 문장으로 돌려준다. */
  async function blocked(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
      return "(막지 않음)";
    } catch (e) {
      return (e as Error).message;
    }
  }

  const attCount = (meetingId: string) => db.meetingAttendance.count({ where: { meetingId } });
  /** 이 회의의 출석에서 비롯된 기여 기록 — 출석 행이 지워져도 남을 수 있으므로 팀원으로 센다. */
  const contribOf = (memberId: string) =>
    db.contribRecord.findMany({
      where: { memberId, originType: "meeting_attendance" },
      select: { id: true, kind: true, state: true, source: true, title: true, originId: true },
    });

  try {
    /* ── 1) 권한 ───────────────────────────────────────────── */
    console.log("\n팀장만, 확정된 회의에만, 자기 팀 회의에만 찍는다");
    const A = await makeTeam("권한");
    const confirmed = await makeMeeting(A.id, "confirmed", "중간 점검");
    const proposed = await makeMeeting(A.id, "proposed");

    check(
      "팀원은 찍을 수 없다",
      await blocked(() => as(A.asMate, () => attendance.saveMeetingAttendance(confirmed.id, [A.mate.id]))),
      "팀장만 할 수 있습니다.",
    );
    check(
      "세션이 없으면 찍을 수 없다",
      await blocked(() => attendance.saveMeetingAttendance(confirmed.id, [A.mate.id])),
      "로그인이 필요합니다.",
    );
    check(
      "확정 전 회의에는 찍을 수 없다",
      await blocked(() => as(A.asLeader, () => attendance.saveMeetingAttendance(proposed.id, [A.mate.id]))),
      "확정된 회의에만 출석을 기록할 수 있습니다.",
    );
    check("없는 회의에는 찍을 수 없다", await blocked(() => as(A.asLeader, () => attendance.saveMeetingAttendance("없는회의", [A.mate.id]))), "회의를 찾을 수 없습니다.");

    const other = await makeTeam("이웃");
    check(
      "남의 팀 회의에는 찍을 수 없다",
      await blocked(() => as(other.asLeader, () => attendance.saveMeetingAttendance(confirmed.id, [other.mate.id]))),
      "회의를 찾을 수 없습니다.",
    );
    check("거절된 시도는 아무것도 남기지 않는다", (await attCount(confirmed.id)) + (await attCount(proposed.id)), 0);
    check("기여 기록도 남기지 않는다", (await contribOf(A.mate.id)).length, 0);

    /* ── 2) 저장하면 출석과 기여가 같이 생긴다 ─────────────── */
    console.log("\n찍으면 출석과 기여 기록이 같은 수만큼 생긴다");
    const saved = await as(A.asLeader, () => attendance.saveMeetingAttendance(confirmed.id, [A.leader.id, A.mate.id]));
    check("두 명을 센다", saved, { success: true, count: 2 });
    check("출석이 두 줄이다", await attCount(confirmed.id), 2);
    const mateRecords = await contribOf(A.mate.id);
    check("팀원 기록이 하나다", mateRecords.length, 1);
    check("회의 참석 종류다", mateRecords[0]?.kind, "meet");
    check("대기 상태다 — 찍는다고 확정되지 않는다", mateRecords[0]?.state, "pending");
    check("자동 기록이다", mateRecords[0]?.source, "auto");
    check("제목에 안건이 들어간다", mateRecords[0]?.title, "[회의 참석] 중간 점검");
    check("팀장 자신도 찍을 수 있다", (await contribOf(A.leader.id)).length, 1);
    check("찍지 않은 사람은 기록이 없다", (await contribOf(A.third.id)).length, 0);
    const checkedBy = await db.meetingAttendance.findMany({ where: { meetingId: confirmed.id }, select: { checkedById: true } });
    check("누가 찍었는지 남는다", [...new Set(checkedBy.map((c) => c.checkedById))], [A.leader.id]);

    /* ── 3) 두 번 저장해도 한 줄씩 ─────────────────────────── */
    console.log("\n같은 명단을 다시 저장해도 늘지 않는다");
    await as(A.asLeader, () => attendance.saveMeetingAttendance(confirmed.id, [A.leader.id, A.mate.id]));
    check("출석은 두 줄 그대로다", await attCount(confirmed.id), 2);
    check("기록도 그대로다", (await contribOf(A.mate.id)).length, 1);

    // 저장 버튼을 빠르게 두 번 누르는 것과 같다. 어느 쪽이 먼저든 DB 에는 한 줄씩이어야 하고,
    // 던졌다면 **사람이 읽을 수 있는 말**이어야 한다(Prisma 의 원문이 화면에 나가면 안 된다).
    const raceMeeting = await makeMeeting(A.id, "confirmed", "동시");
    const settled = await Promise.allSettled([
      as(A.asLeader, () => attendance.saveMeetingAttendance(raceMeeting.id, [A.mate.id, A.third.id])),
      as(A.asLeader, () => attendance.saveMeetingAttendance(raceMeeting.id, [A.mate.id, A.third.id])),
    ]);
    check("동시에 두 번 눌러도 출석은 두 줄이다", await attCount(raceMeeting.id), 2);
    const raceRecords = await db.contribRecord.count({
      where: { originType: "meeting_attendance", title: "[회의 참석] 동시" },
    });
    check("동시에 두 번 눌러도 기록은 두 건이다", raceRecords, 2);
    const raceErrors = settled
      .filter((s): s is PromiseRejectedResult => s.status === "rejected")
      .map((s) => (s.reason as Error).message);
    check(
      "던졌다면 DB 오류 원문이 아니다",
      raceErrors.every((m) => !/Unique constraint|Invalid `|prisma/i.test(m)),
      true,
    );

    /* ── 4) 명단에 섞인 이상한 아이디 ──────────────────────── */
    console.log("\n남의 팀·나간 사람·없는 아이디는 버려진다");
    const left = await db.member.create({
      data: { teamId: A.id, name: `최나감${suffix}`, leftAt: new Date() },
    });
    const sanitizeMeeting = await makeMeeting(A.id, "confirmed", "걸러내기");
    const result = await as(A.asLeader, () =>
      attendance.saveMeetingAttendance(sanitizeMeeting.id, [A.third.id, other.mate.id, left.id, "없는사람"]),
    );
    check("유효한 한 명만 센다", result.count, 1);
    check("출석은 한 줄이다", await attCount(sanitizeMeeting.id), 1);
    check("남의 팀 사람에게 기록이 생기지 않는다", (await contribOf(other.mate.id)).length, 0);
    check("나간 사람에게 기록이 생기지 않는다", (await contribOf(left.id)).length, 0);

    /* ── 5) 체크를 풀면 건드리지 않은 기록은 회수 ──────────── */
    console.log("\n체크를 풀면 아무도 건드리지 않은 기록은 회수된다");
    const revoke = await makeMeeting(A.id, "confirmed", "회수");
    await as(A.asLeader, () => attendance.saveMeetingAttendance(revoke.id, [A.mate.id, A.third.id]));
    const revokeTitle = "[회의 참석] 회수";
    const before = await db.contribRecord.count({ where: { title: revokeTitle } });
    check("먼저 두 건이 생긴다", before, 2);
    await as(A.asLeader, () => attendance.saveMeetingAttendance(revoke.id, [A.mate.id]));
    check("출석은 한 줄이 된다", await attCount(revoke.id), 1);
    const afterRecords = await db.contribRecord.findMany({ where: { title: revokeTitle }, select: { memberId: true } });
    check("푼 사람의 기록만 사라진다", afterRecords.map((r) => r.memberId), [A.mate.id]);
    await as(A.asLeader, () => attendance.saveMeetingAttendance(revoke.id, []));
    check("모두 풀면 출석이 없다", await attCount(revoke.id), 0);
    check("기록도 없다", await db.contribRecord.count({ where: { title: revokeTitle } }), 0);

    /* ── 6) 확인된 기록은 남고, 다시 체크해도 하나다 ───────── */
    console.log("\n팀원이 확인한 기록은 체크를 풀어도 남고, 다시 체크해도 둘이 되지 않는다");
    const kept = await makeMeeting(A.id, "confirmed", "확인됨");
    const keptTitle = "[회의 참석] 확인됨";
    await as(A.asLeader, () => attendance.saveMeetingAttendance(kept.id, [A.mate.id, A.third.id]));
    const mateRec = await db.contribRecord.findFirstOrThrow({ where: { title: keptTitle, memberId: A.mate.id } });
    const thirdRec = await db.contribRecord.findFirstOrThrow({ where: { title: keptTitle, memberId: A.third.id } });
    // 팀원 확인 한 건 · 이견 한 건 — 둘 다 팀의 판단이 붙은 기록이다.
    await db.contribConfirm.create({ data: { recordId: mateRec.id, memberId: A.third.id } });
    await db.contribDispute.create({ data: { recordId: thirdRec.id, byId: A.mate.id, text: "그 날 안 왔어요" } });

    await as(A.asLeader, () => attendance.saveMeetingAttendance(kept.id, []));
    check("출석은 풀린다", await attCount(kept.id), 0);
    check("확인이 붙은 기록은 남는다", await db.contribRecord.count({ where: { id: mateRec.id } }), 1);
    check("이견이 붙은 기록도 남는다", await db.contribRecord.count({ where: { id: thirdRec.id } }), 1);

    await as(A.asLeader, () => attendance.saveMeetingAttendance(kept.id, [A.mate.id, A.third.id]));
    check("다시 체크하면 출석이 두 줄이다", await attCount(kept.id), 2);
    // **여기가 핵심이다.** 출석 행은 지워졌다 새로 만들어져 아이디가 바뀐다. 기록이 출석 아이디에
    // 묶여 있으면 이미 있던 기록을 못 알아보고 새 기록을 또 만든다 — 한 번의 참석이 두 번 센다.
    check("같은 회의의 같은 사람 기록은 하나다 (확인된 쪽)", await db.contribRecord.count({ where: { title: keptTitle, memberId: A.mate.id } }), 1);
    check("같은 회의의 같은 사람 기록은 하나다 (이견 쪽)", await db.contribRecord.count({ where: { title: keptTitle, memberId: A.third.id } }), 1);

    /* ── 7) 조회 ───────────────────────────────────────────── */
    console.log("\n조회는 팀 안으로만, 편집은 팀장·확정 회의에서만");
    const view = await makeMeeting(A.id, "confirmed", "조회");
    await db.meetingResponse.create({ data: { proposalId: view.id, memberId: A.mate.id, agree: true } });
    await db.meetingResponse.create({ data: { proposalId: view.id, memberId: A.third.id, agree: false } });
    await as(A.asLeader, () => attendance.saveMeetingAttendance(view.id, [A.mate.id]));

    const asMate = await as(A.asMate, () => attendance.getMeetingAttendance(view.id));
    check("팀원도 볼 수 있다", asMate.attendees.length, 3); // 팀장·팀원·셋째 — 나간 사람은 빠진다
    check("팀원은 편집할 수 없다", asMate.canEdit, false);
    check("팀원이 팀장이 아니라고 말한다", asMate.isLeader, false);
    const mateRow = asMate.attendees.find((a) => a.memberId === A.mate.id);
    const thirdRow = asMate.attendees.find((a) => a.memberId === A.third.id);
    check("찍힌 사람은 출석으로 보인다", mateRow?.attended, true);
    check("찍힌 시각이 온다", typeof mateRow?.checkedAt, "string");
    check("동의한 사람은 동의로 보인다", mateRow?.agreed, true);
    check("찍히지 않은 사람은 결석으로 보인다", thirdRow?.attended, false);
    check("반대한 사람은 동의가 아니다", thirdRow?.agreed, false);
    check("찍히지 않았으면 시각이 없다", thirdRow?.checkedAt, null);
    check("나간 사람은 명단에 없다", asMate.attendees.some((a) => a.memberId === left.id), false);

    const asLeader = await as(A.asLeader, () => attendance.getMeetingAttendance(view.id));
    check("팀장은 확정 회의에서 편집할 수 있다", asLeader.canEdit, true);
    const proposedView = await as(A.asLeader, () => attendance.getMeetingAttendance(proposed.id));
    check("확정 전 회의는 팀장도 편집할 수 없다", proposedView.canEdit, false);

    check(
      "남의 팀 회의는 볼 수 없다",
      await blocked(() => as(other.asLeader, () => attendance.getMeetingAttendance(view.id))),
      "회의를 찾을 수 없습니다.",
    );
    check(
      "세션이 없으면 볼 수 없다",
      await blocked(() => attendance.getMeetingAttendance(view.id)),
      "로그인이 필요합니다.",
    );
  } finally {
    for (const id of teamIds) {
      const members = await db.member.findMany({ where: { teamId: id }, select: { id: true } });
      const memberIds = members.map((m) => m.id);
      await db.contribRecord.deleteMany({ where: { memberId: { in: memberIds } } });
      await db.meetingAttendance.deleteMany({ where: { meeting: { teamId: id } } });
      await db.meetingProposal.deleteMany({ where: { teamId: id } });
      await db.meetingSlot.deleteMany({ where: { teamId: id } });
      await db.member.deleteMany({ where: { teamId: id } });
      await db.team.delete({ where: { id } }).catch(() => {});
    }
    await db.$disconnect();
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}

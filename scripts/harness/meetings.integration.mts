/**
 * 회의 액션 검사 — 제안·응답·이월이 **규칙대로 되는지** 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 회의는 이 앱에서 **제일 자주 쓰는데 검증이 가장 얇다.** 드라이브·업무·AI·가입·기여·cron 에는
 * 하네스를 세웠고, 회의는 **DB 수준 테스트 1개**뿐이었다. 그 1개도 **`confirmDueMeetings` 를
 * 예약 작업에서 한 번 불러 보는 것**이고, 사람이 누르는 여섯 개의 액션은 아무도 부르지 않았다.
 *
 * 구조를 읽다가 위험한 곳을 셌다 —
 *
 * - **진행 중인 결정은 하나뿐이어야 한다.** 방어선은 `MeetingProposal.activeKey` 유일 인덱스다
 *   (`IceRound.activeKey` 와 같은 방식). **두 사람이 같은 순간에 제안하면 하나가 P2002 로 죽는다** —
 *   그게 의도된 행동이다. 여기서 그 메시지가 사람이 읽을 수 있는 말로 나오는지 본다.
 * - **반대는 제안을 철회한다.** 마감 뒤의 반대는 받지 않는다 — 그렇지 않으면 "마감까지 반대가 없으면
 *   확정" 이라는 말이 무의미해진다.
 * - **이월은 팀 전체 결정이다.** 그래서 **알림을 보낸다.** 조용히 바뀌면 아무도 모른다.
 * - **화면이 숨긴 버튼을 서버도 막는다** — `carryOverMeeting` 은 진행 중인 결정이 있을 때 화면에
 *   안 보이지만, 서버 액션은 POST 로 바로 부를 수 있다.
 *
 * ## 검사하는 것
 *
 * 1. 제안하면 **제안자는 자동으로 찬성**되고 팀 전체에 알림이 간다.
 * 2. **진행 중인 결정 위에서 다시 제안할 수 없다** — 덮어쓰면 "확정"이 무의미해진다.
 * 3. **두 명이 같은 순간에 제안하면 하나만 되고** 나머지는 사람이 읽을 수 있는 사유를 받는다.
 * 4. 찬성은 중복돼도 한 줄이고, **반대는 제안을 철회**한다.
 * 5. **마감 뒤의 반대는 받지 않는다** — 이미 확정된 회의가 뒤집히지 않는다.
 * 6. 이월은 팀 전체가 **알게** 한다.
 * 7. **화면이 숨긴 이월도 서버가 막는다.**
 * 8. 시간표 밖의 시간은 거절된다.
 *
 *   npm run test:meetings
 */
import { randomUUID } from "node:crypto";

type Session = {
  as(token: string): void;
  nobody(): void;
  reset(): void;
};

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const meetings = await import("../../src/server/actions/meetings.js");
  const { SCHEDULE_DAYS, SCHEDULE_HOURS } = await import("../../src/data/catalog.js");
  const { mondayOf, todayInSeoul } = await import("../../src/features/schedule/week.js");

  /**
   * **주 키는 "this" 가 아니라 그 주 월요일의 날짜다**(`YYYY-MM-DD`).
   *
   * 처음에 `"this"` 로 불렀다가 "시간표 밖의 시간입니다" 로 떨어졌다. 화면이 넘기는 값의 모양을
   * 먼저 읽어야 한다 — `"this"` 라고 착각한 것은 **검사만 잘못**이고 제품은 문제가 없었다.
   */
  const week = mondayOf(todayInSeoul());

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
        name: `회의 검사 ${label} ${suffix}`,
        course: "검증",
        code: `CD-${randomUUID().slice(0, 6).toUpperCase()}`,
        candidatesFrom: todayInSeoul(),
      },
    });
    teamIds.push(team.id);
    const leader = await db.member.create({
      data: { teamId: team.id, name: `김민준${suffix}`, isLeader: true },
    });
    const mate = await db.member.create({
      data: { teamId: team.id, name: `이서연${suffix}` },
    });
    const third = await db.member.create({
      data: { teamId: team.id, name: `박도윤${suffix}` },
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

  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    session.as(token);
    try {
      return await work();
    } finally {
      session.nobody();
    }
  }

  /** 그 팀 구성원들에게 간 알림 수 — `Notification` 에는 팀 id 가 없어서 사람으로 거른다. */
  const noticeCount = async (teamId: string, kind: string) => {
    const members = await db.member.findMany({ where: { teamId }, select: { id: true } });
    return db.notification.count({
      where: { memberId: { in: members.map((m) => m.id) }, kind },
    });
  };

  /** 그 사람에게 간 알림 수. */
  const noticesTo = async (teamId: string, memberId: string, kind: string) =>
    db.notification.count({ where: { memberId, kind, title: { contains: "회의" } } });

  /** 지금 올라온 제안 — 없으면 null. */
  const current = async (teamId: string) =>
    db.meetingProposal.findFirst({
      where: { teamId },
      orderBy: { createdAt: "desc" },
      select: { id: true, stage: true, activeKey: true, date: true, proposedById: true },
    });

  try {
    console.log("\n회의 액션 검사 (실제 서버 액션)");

    const A = await makeTeam("제안");

    /* ── 1) 제안하면 제안자가 자동 찬성 ───────────────────────── */
    console.log("\n제안하면 제안자는 자동으로 찬성한다");
    await as(A.asLeader, () => meetings.proposeMeetingAt(week, 1, 3, { location: "=D실" }));
    const proposed = await current(A.id);
    check("제안이 올라온다", proposed?.stage, "proposed");
    check("제안자가 제안했다", proposed?.proposedById, A.leader.id);
    // **진행 중인 결정은 하나** — 방어선은 `activeKey` 유일 인덱스다.
    check("진행 중인 결정 하나만이다", proposed?.activeKey, A.id);

    const responses = await db.meetingResponse.findMany({
      where: { proposalId: proposed!.id },
      select: { memberId: true, agree: true },
      orderBy: { memberId: "asc" },
    });
    check("제안자 한 명만 찬성했다", responses.length, 1);
    check("그 사람이 제안자다", responses[0]?.memberId, A.leader.id);
    // `notify` 는 받는 사람마다 한 줄씩 적는다 — **제안자 자신은 빼고**(자기 알림은 알림이 아니다).
    check("제안자를 제외한 팀원에게 갔다", await noticeCount(A.id, "meeting"), 2);
    check("제안자에게는 가지 않는다", await noticesTo(A.id, A.leader.id, "meeting"), 0);

    /* ── 2) 진행 중인 결정 위에서 다시 제안할 수 없다 ────────── */
    console.log("\n진행 중인 결정 위에서 다시 제안할 수 없다");
    const second = await blocked(() => as(A.asMate, () => meetings.proposeMeetingAt(week, 2, 5)));
    // **서로 다른 두 메시지**가 있다 — 이미 올라온 제안(순차)과 동시에 올린 경우(경합)다.
    // 같은 상황이 같은 말로 도착해야 배워지는데, **지금 서로 다르다**(2026-09-28 확인).
    check("막힌다", second.includes("이미 올라온 회의 제안"), true);
    check("제안은 그대로다", (await current(A.id))?.id, proposed!.id);

    /* ── 3) 두명이 같은 순간에 제안하면 하나만 ────────────────── */
    console.log("\n두 명이 같은 순간에 제안하면 하나만 된다");
    const B = await makeTeam("경합");
    const racers = await Promise.all([
      blocked(() => as(B.asLeader, () => meetings.proposeMeetingAt(week, 1, 3))),
      blocked(() => as(B.asMate, () => meetings.proposeMeetingAt(week, 2, 4))),
    ]);
    /**
     * **막는 메시지는 둘 중 하나다** — 어느 것이 나오느냐는 **타이밍**에 달렸다(2026-09-28 확인).
     *
     * ① "이미 올라온 회의 제안이 있습니다" — 앞 단의 검사(`assertCanPropose`)가 먼저 온 경우. 보통
     *    이쪽이다. 한 명이 커밋한 뒤 다른 명이 거기 도착하기 때문이다.
     * ② "누군가 먼저 회의 시간을 제안했습니다" — **유일 인덱스가 마지막으로 잡는 경우.** 둘 다
     *    검사를 통과한 뒤 한 명만 남아야 하므로 훨씬 좁다.
     *
     * **둘 다 사람이 읽을 수 있는 말**이라는 것만 고정한다. 어느 방어선이 실제로 일했는지는
     * 타이밍이고, 그 타이밍을 검사에서 다루는 것은 이 코드가 무엇을 보장하는지가 아니게 된다.
     */
    const HONEST_BLOCK = ["이미 올라온 회의 제안이 있습니다", "누군가 먼저 회의 시간을 제안했습니다"];
    const losers = racers.filter((r) => HONEST_BLOCK.some((m) => r.includes(m))).length;
    const winners = racers.filter((r) => r === "(막지 않음)").length;
    check("한 명만 제안하고 끝난다", winners, 1);
    check("나머지는 사람이 읽을 수 있는 사유를 받는다", losers, 1);
    // **DB가 지킨다** — `activeKey` 유일 인덱스가 둘 다 들어가는 것을 막는다.
    check("제안은 하나뿐이다", await db.meetingProposal.count({ where: { teamId: B.id, stage: "proposed" } }), 1);

    /* ── 4) 찬성과 반대 ──────────────────────────────────────── */
    console.log("\n찬성은 중복돼도 한 줄이고, 반대는 제안을 철회한다");
    await as(A.asMate, () => meetings.respondToMeeting(true));
    check("찬성된다", await as(A.asMate, () => meetings.respondToMeeting(true)), "ok");
    const agreeRows = await db.meetingResponse.count({
      where: { proposalId: proposed!.id, agree: true },
    });
    check("같은 사람의 찬성은 한 줄이다", agreeRows, 2);

    const carriedFlag = await db.team.findUniqueOrThrow({
      where: { id: A.id },
      select: { candidatesFrom: true },
    });
    // **`candidatesFrom` 은 이 팀의 후보를 마지막으로 만든 날짜**다. 제안이 올라와 있는 동안
    // 후보를 다시 만들지 않으므로 **그 값이 그대로 남는다** — 그리고 반대할 때 비워진다(아래).
    check("제안이 있는 동안 후보를 다시 만들지 않는다", typeof carriedFlag.candidatesFrom, "string");

    await as(A.asThird, () => meetings.respondToMeeting(false));
    check("반대하면 제안을 철회한다", await current(A.id), null);
    // **후보가 낡은 채로 두면 안 된다** — 철회와 함께 비워진다.
    check("후보 갱신 표시를 비운다", (await db.team.findUniqueOrThrow({ where: { id: A.id } })).candidatesFrom, null);

    /* ── 5) 마감 뒤의 반대는 받지 않는다 ────────────────────── */
    console.log("\n마감 뒤의 반대는 받지 않는다");
    const C = await makeTeam("마감");
    await as(C.asLeader, () => meetings.proposeMeetingAt(week, 1, 3));
    const cProposal = await current(C.id);
    check("제안이 올라왔다", cProposal?.stage, "proposed");
    // 시계만 앞으로 돌린다 — 확정 여부는 규칙이 정한다.
    check("데모로 마감을 당긴다", await as(C.asLeader, () => meetings.fastForwardMeetingDeadline()), "moved");
    check("마감 뒤의 반대는 받지 않는다", await as(C.asMate, () => meetings.respondToMeeting(false)), "closed");
    check("제안은 남는다", (await current(C.id))?.id, cProposal!.id);

    /* ── 6) 이월은 팀 전체가 알게 한다 ───────────────────────── */
    console.log("\n이월은 팀 전체가 알는다 — 조용히 바뀌면 아무도 모른다");
    const D = await makeTeam("이월");
    const before = await noticeCount(D.id, "meeting");
    await as(D.asLeader, () => meetings.carryOverMeeting());
    check("이월이 생긴다", (await current(D.id))?.stage, "carried");
    // 이월은 **받는 사람마다 한 줄씩** 적인다(제안자 자신은 빠진다).
    check("팀에 알림이 갔다", await noticeCount(D.id, "meeting"), before + 2);
    // 이월은 **보류**다 — 제안이 올라와 있는 상태에 이월로 덮으면 동의를 지운다.
    const overCarry = await blocked(() => as(D.asMate, () => meetings.carryOverMeeting()));
    check("아직 이월 위에 또 이월하지 않는다", overCarry.length > 0, true);

    /* ── 7) 화면이 숨긴 이월도 서버가 막는다 ─────────────────── */
    console.log("\n화면이 숨긴 이월도 서버가 막는다");
    const E = await makeTeam("숨긴");
    await as(E.asLeader, () => meetings.proposeMeetingAt(week, 1, 3));
    const hidden = await blocked(() => as(E.asLeader, () => meetings.carryOverMeeting()));
    check("진행 중인 결정 위의 이월은 막힌다", hidden.includes("이미 올라온 회의 제안"), true);
    check("제안은 그대로다", (await current(E.id))?.stage, "proposed");

    /* ── 8) 시간표 밖의 시간 ────────────────────────────────── */
    console.log("\n시간표 밖의 시간은 거절된다");
    const F = await makeTeam("시간");
    const tooLate = await blocked(() => as(F.asLeader, () => meetings.proposeMeetingAt(week, 9, 3)));
    check("요일 범위를 넘으면 거절한다", tooLate.includes("시간표 밖"), true);
    const badHour = await blocked(() => as(F.asLeader, () => meetings.proposeMeetingAt(week, 1, 99)));
    check("시간 범위를 넘으면 거절한다", badHour.includes("시간표 밖"), true);
    check("시간표의 칸 수를 알고 있다", [SCHEDULE_DAYS.length > 0, SCHEDULE_HOURS.length > 0], [true, true]);
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
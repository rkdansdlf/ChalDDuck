/**
 * 시간표·후보 검사 — 시간표를 **저장하고**, 후보를 **제안하고**, 못 오는 사람에게 **부탁하는**
 * 네 액션을 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 회의 시간은 이 앱이 제일 자주 쓰는 길인데 입구의 네 액션이 한 번도 불린 적이 없었다
 * (`npm run audit:actions` 에서 "없음"). `meetings` 하네스는 `proposeMeetingAt`(팀 겹쳐보기에서
 * 칸을 골라 제안)을 보지만 **후보 목록에서 고르는 `proposeMeeting`** 은 다른 함수다.
 *
 * 읽으며 위험한 곳을 셌다 —
 *
 * - **`saveMyBusyBlocks` 는 내 줄을 지우고 다시 넣는다.** 중간에 거절되면 **이전 시간표가 그대로
 *   남아야** 한다(지우고 못 넣으면 시간표가 날아간다). 그리고 **남의 줄은 건드리지 않는다.**
 * - **화면을 거치지 않고도 불린다.** 시간표 밖의 칸·알 수 없는 사유·이상한 주는 서버가 막아야
 *   하고, 기본 사유에 붙여 보낸 이름은 버려야 한다(사유는 본인에게만 보인다).
 * - **줄 수에 상한이 있는가.** 겹쳐 적어도 거절하지 않으므로, 상한이 없으면 한 번의 저장이
 *   수만 줄을 쓴다.
 * - **`askForTimetable` 은 "하루 한 번" 을 알림으로 센다.** 읽고 쓰는 사이가 벌어지므로 **동시에
 *   두 번 누르면 둘 다 통과**할 수 있다.
 * - **`proposeMeeting` 은 후보 행이 우리 팀 것인지 본다.** 제안은 24시간 안에 반대가 없으면
 *   자동 확정되므로, 남의 팀 후보나 지나간 시각이 새면 틀린 회의가 확정된다.
 * - **`requestRemoteInput` 은 받는 사람을 서버가 다시 센다.** 나·나간 사람·그 시간에 안 막힌
 *   사람에게 부탁이 가면 안 된다.
 *
 * ## 검사하는 것
 *
 * 1. 저장 — 내 줄만 바뀐다 · 사유 이름은 기본 사유에서 버려지고 직접 입력은 다듬어진다 ·
 *    거절되면 **이전 시간표가 남는다** · 지난 주는 조용히 버려진다 · 줄 수 상한 ·
 *    저장하면 후보가 다시 만들어지고 **제안이 올라와 있으면 건드리지 않는다**
 * 2. 부탁 — 자기·남의 팀·나간 사람에게는 못 보낸다 · 하루 한 번 · 동시에 눌러도 한 번
 * 3. 제안 — 남의 팀 후보·없는 후보 거절 · 제안자는 자동 찬성 · 진행 중이면 거절 ·
 *    상세 값 정리 · 이월 행 정리 · 지나간 시각 거절 · 동시 제안은 하나만
 * 4. 의견 요청 — 그 시간에 못 오는 사람만, 나는 빼고, 나간 사람은 빼고
 *
 *   npm run test:schedule
 */
import { randomUUID } from "node:crypto";
import { SCHEDULE_DAYS } from "../../src/data/catalog.js";
import {
  addDays,
  candidateDates,
  dayOf,
  nowHourInSeoul,
  scheduleWeeks,
  todayInSeoul,
} from "../../src/features/schedule/week.js";

type Session = { as(token: string): void; nobody(): void; reset(): void; clearAll(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const scheduleActions = await import("../../src/server/actions/schedule.js");
  const meetings = await import("../../src/server/actions/meetings.js");

  /**
   * **시각에 의존하지 않는다.** 후보 기간의 마지막 날은 늘 오늘이 아니고(`오늘 + 6`),
   * 그래서 "이미 지나간 시간" 규칙이 개입하지 않는다. 지나간 시간 규칙은 따로 본다.
   */
  const dates = candidateDates();
  const last = dates[dates.length - 1]!;
  const weeks = scheduleWeeks();

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
      data: { name: `시간표 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(team.id);
    const mk = (name: string, isLeader = false) =>
      db.member.create({ data: { teamId: team.id, name: `${name}${suffix}`, isLeader } });
    const leader = await mk("김민준", true);
    const mate = await mk("이서연");
    const third = await mk("박도윤");
    const token = async (memberId: string) => {
      const t = randomUUID();
      await db.session.create({ data: { token: t, memberId, expiresAt: new Date(Date.now() + 3600_000) } });
      return t;
    };
    return {
      id: team.id,
      leader,
      mate,
      third,
      mk,
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

  const blk = (over: Record<string, unknown> = {}) =>
    ({ id: "x", day: 0, startHour: 0, hours: 2, kind: "class", label: null, weekOf: null, ...over }) as never;

  /** 그 사람의 저장된 줄 — 비교하기 좋게 모양만. */
  const rowsOf = async (memberId: string) =>
    (
      await db.busyBlock.findMany({
        where: { memberId },
        select: { day: true, startHour: true, hours: true, kind: true, label: true, weekOf: true },
        orderBy: [{ day: "asc" }, { startHour: "asc" }, { kind: "asc" }],
      })
    ).map((r) => ({ ...r }));

  const slotsOf = (teamId: string) => db.meetingSlot.findMany({ where: { teamId }, select: { id: true } });

  /** 우리 팀의 후보 행 하나 — 제안이 가리키는 자리. 시각이 개입하지 않게 마지막 날 마지막 칸. */
  const makeSlot = (teamId: string, over: { day?: string; time?: string } = {}) =>
    db.meetingSlot.create({
      data: {
        teamId,
        day: over.day ?? SCHEDULE_DAYS[last.day]!,
        time: over.time ?? "18:00 – 19:00",
        available: 3,
        total: 3,
        weekKey: "this",
      },
      select: { id: true, day: true, time: true },
    });

  const proposalsOf = (teamId: string) =>
    db.meetingProposal.findMany({ where: { teamId }, orderBy: { createdAt: "asc" } });

  try {
    /* ── 1) 시간표 저장 ────────────────────────────────────── */
    console.log("\n시간표는 내 줄만 바꾸고, 거절되면 이전 시간표가 남는다");
    const A = await makeTeam("저장");

    check("세션이 없으면 저장할 수 없다", await blocked(() => scheduleActions.saveMyBusyBlocks([blk()])), "로그인이 필요합니다.");

    await as(A.asMate, () => scheduleActions.saveMyBusyBlocks([blk({ day: 3, startHour: 2, hours: 1, kind: "work" })]));
    const mateBefore = await rowsOf(A.mate.id);
    check("팀원의 시간표가 저장됐다", mateBefore.length, 1);

    await as(A.asLeader, () =>
      scheduleActions.saveMyBusyBlocks([
        blk({ day: 0, startHour: 0, hours: 2 }),
        blk({ day: 1, startHour: 1, hours: 1, kind: "custom", label: "  동아리   모임 " }),
        // 기본 사유에 붙여 보낸 이름은 버려진다 — 사유는 본인에게만 보이고, 이름은 직접 입력만의 것이다.
        blk({ day: 4, startHour: 3, hours: 1, kind: "work", label: "비밀직장" }),
        blk({ day: 2, startHour: 5, hours: 1, kind: "exam", weekOf: weeks[0] }),
        // 화면이 보낸 남의 아이디는 믿지 않는다.
        { ...(blk({ day: 6, startHour: 8, hours: 1 }) as object), memberId: A.mate.id } as never,
      ]),
    );
    const leaderRows = await rowsOf(A.leader.id);
    check("내 줄이 다섯 개 저장된다", leaderRows.length, 5);
    check(
      "직접 입력 이름은 다듬어진다",
      leaderRows.find((r) => r.kind === "custom")?.label,
      "동아리 모임",
    );
    check(
      "기본 사유의 이름은 버려진다",
      leaderRows.filter((r) => r.kind !== "custom").every((r) => r.label === null),
      true,
    );
    check("이 주만 적은 줄은 그 주를 달고 있다", leaderRows.find((r) => r.kind === "exam")?.weekOf, weeks[0]);
    check("남의 아이디를 보내도 팀원의 시간표는 그대로다", await rowsOf(A.mate.id), mateBefore);

    // 어떤 거절이든 **이전 시간표가 그대로 남아야** 한다.
    const keep = await rowsOf(A.leader.id);
    const good = blk({ day: 5, startHour: 0, hours: 1 });
    const rejects: Array<[string, unknown, string]> = [
      ["요일이 시간표 밖이면", blk({ day: 7 }), "시간표 밖의 시간이 있습니다."],
      ["요일이 음수면", blk({ day: -1 }), "시간표 밖의 시간이 있습니다."],
      ["끝이 시간표를 넘으면", blk({ startHour: 9, hours: 2 }), "시간표 밖의 시간이 있습니다."],
      ["길이가 0이면", blk({ hours: 0 }), "시간표 밖의 시간이 있습니다."],
      ["길이가 소수면", blk({ hours: 1.5 }), "시간표 밖의 시간이 있습니다."],
      ["알 수 없는 사유면", blk({ kind: "party" }), "알 수 없는 사유입니다."],
      ["직접 입력인데 이름이 비면", blk({ kind: "custom", label: "   " }), "직접 입력한 사유의 이름을 확인해 주세요."],
      ["직접 입력 이름이 너무 길면", blk({ kind: "custom", label: "가".repeat(11) }), "직접 입력한 사유의 이름을 확인해 주세요."],
      ["월요일이 아닌 날짜를 주로 보내면", blk({ weekOf: addDays(weeks[0], 1) }), "적을 수 없는 주입니다."],
      ["볼 수 있는 주 밖이면", blk({ weekOf: addDays(weeks[1]!, 7) }), "적을 수 없는 주입니다."],
      ["주가 날짜 모양이 아니면", blk({ weekOf: "다음주" }), "적을 수 없는 주입니다."],
    ];
    for (const [what, bad, message] of rejects) {
      // 좋은 줄과 같이 보낸다 — 한 줄이 나쁘면 **전체가** 거절되어야 한다.
      const got = await blocked(() => as(A.asLeader, () => scheduleActions.saveMyBusyBlocks([good, bad as never])));
      check(`${what} 거절한다`, got, message);
    }
    check("거절된 저장은 이전 시간표를 그대로 둔다", await rowsOf(A.leader.id), keep);

    // 화면을 연 사이에 주가 넘어간 경우 — 지난 주 줄은 조용히 버리고 나머지는 저장한다.
    await as(A.asLeader, () =>
      scheduleActions.saveMyBusyBlocks([blk({ day: 0, startHour: 0, hours: 1, weekOf: addDays(weeks[0]!, -7) }), good]),
    );
    const afterStale = await rowsOf(A.leader.id);
    check("지난 주 줄은 버려지고 나머지는 저장된다", afterStale.length, 1);
    check("남은 줄은 멀쩡한 줄이다", afterStale[0]?.day, 5);

    // 줄 수 상한 — 겹쳐 적어도 거절하지 않으므로, 상한이 없으면 한 번에 몇만 줄도 쓴다.
    // **정상적인 시간표는 거절하면 안 된다.** 화면은 같은 요일·같은 범위(매주 · 볼 수 있는 각 주)
    // 안에서 블록이 겹치지 않게 막으므로, 가장 꽉 채워도 한 칸짜리 70줄 × 범위 3 = 210줄이다.
    const full = [null, ...weeks].flatMap((weekOf) =>
      Array.from({ length: 7 * 10 }, (_, i) => blk({ day: Math.floor(i / 10), startHour: i % 10, hours: 1, weekOf })),
    );
    check("정상적으로 가득 채운 시간표(210줄)는 저장된다", full.length, 210);
    await as(A.asLeader, () => scheduleActions.saveMyBusyBlocks(full));
    check("꽉 찬 시간표가 그대로 들어간다", (await rowsOf(A.leader.id)).length, 210);
    await as(A.asLeader, () => scheduleActions.saveMyBusyBlocks([good]));
    check("다시 한 줄로 돌린다", (await rowsOf(A.leader.id)).length, 1);
    const flood = Array.from({ length: 500 }, () => blk());
    const floodResult = await blocked(() => as(A.asLeader, () => scheduleActions.saveMyBusyBlocks(flood)));
    check("터무니없이 많은 줄은 거절한다", floodResult.includes("너무 많"), true);
    check("거절된 홍수는 줄을 남기지 않는다", await rowsOf(A.leader.id), afterStale);

    await as(A.asLeader, () => scheduleActions.saveMyBusyBlocks([]));
    check("빈 목록으로 저장하면 내 줄만 비워진다", await rowsOf(A.leader.id), []);
    check("팀원의 줄은 그대로다", await rowsOf(A.mate.id), mateBefore);

    /* ── 1-2) 저장하면 후보가 다시 만들어진다 ──────────────── */
    console.log("\n저장하면 후보가 다시 만들어지고, 제안이 올라와 있으면 건드리지 않는다");
    const B = await makeTeam("후보");
    check("처음엔 후보가 없다", (await slotsOf(B.id)).length, 0);
    await as(B.asMate, () => scheduleActions.saveMyBusyBlocks([blk({ day: 0, startHour: 0, hours: 1 })]));
    const built = await slotsOf(B.id);
    check("저장하면 후보가 생긴다", built.length > 0, true);
    const teamRow = await db.team.findUniqueOrThrow({ where: { id: B.id }, select: { candidatesFrom: true } });
    check("후보를 만든 날이 오늘로 남는다", teamRow.candidatesFrom, todayInSeoul());

    // 이 팀의 후보 하나를 제안한다 → 제안이 올라와 있는 동안엔 후보 행이 그대로여야 한다.
    const pick = built[0]!;
    await as(B.asLeader, () => meetings.proposeMeeting(pick.id));
    const frozen = (await slotsOf(B.id)).map((s) => s.id).sort();
    await as(B.asThird, () => scheduleActions.saveMyBusyBlocks([blk({ day: 1, startHour: 1, hours: 1 })]));
    check(
      "제안이 올라와 있으면 후보 행을 다시 만들지 않는다",
      (await slotsOf(B.id)).map((s) => s.id).sort(),
      frozen,
    );

    /* ── 2) 시간표 부탁하기 ────────────────────────────────── */
    console.log("\n시간표를 부탁할 수 있는 사람과 횟수");
    const C = await makeTeam("부탁");
    const other = await makeTeam("이웃");
    const left = await C.mk("나간이");
    await db.member.update({ where: { id: left.id }, data: { leftAt: new Date() } });
    const asked = (to: string) =>
      db.notification.findMany({ where: { memberId: to, kind: "schedule-ask" }, select: { actorId: true, title: true } });

    check("세션이 없으면 부탁할 수 없다", await blocked(() => scheduleActions.askForTimetable(C.mate.id)), "로그인이 필요합니다.");
    check(
      "자기 자신에게는 부탁할 수 없다",
      await blocked(() => as(C.asLeader, () => scheduleActions.askForTimetable(C.leader.id))),
      "자기 자신에게는 부탁할 수 없습니다.",
    );
    check(
      "남의 팀 사람에게는 부탁할 수 없다",
      await blocked(() => as(C.asLeader, () => scheduleActions.askForTimetable(other.mate.id))),
      "팀원을 찾을 수 없습니다.",
    );
    check(
      "나간 사람에게는 부탁할 수 없다",
      await blocked(() => as(C.asLeader, () => scheduleActions.askForTimetable(left.id))),
      "팀원을 찾을 수 없습니다.",
    );
    check(
      "없는 사람에게는 부탁할 수 없다",
      await blocked(() => as(C.asLeader, () => scheduleActions.askForTimetable("없는사람"))),
      "팀원을 찾을 수 없습니다.",
    );
    check("거절된 시도는 알림을 남기지 않는다", (await asked(other.mate.id)).length + (await asked(left.id)).length, 0);

    check("처음 부탁은 간다", await as(C.asLeader, () => scheduleActions.askForTimetable(C.mate.id)), "sent");
    const first = await asked(C.mate.id);
    check("알림이 한 건 생긴다", first.length, 1);
    check("보낸 사람이 밝혀진다", first[0]?.actorId, C.leader.id);
    check("제목에 보낸 사람의 이름이 있다", first[0]?.title.includes(C.leader.name), true);
    check("같은 날 다시 부탁하면 보내지 않는다", await as(C.asLeader, () => scheduleActions.askForTimetable(C.mate.id)), "already");
    check("알림은 늘지 않는다", (await asked(C.mate.id)).length, 1);
    // 화면의 "오늘 보냄" 은 문(액션)과 **같은 표를 읽어야** 한다 — 달리 읽으면 버튼은 비어 있는데
    // 눌러 보면 "이미 보냈다" 거나, 그 반대가 된다.
    const { askedTodayBy } = await import("../../src/server/meetings/schedule-ask.js");
    check("화면이 읽는 '오늘 보낸 사람' 에 들어 있다", [...(await askedTodayBy(C.leader.id))], [C.mate.id]);
    check("받는 사람을 좁혀 읽어도 같다", [...(await askedTodayBy(C.leader.id, C.mate.id))], [C.mate.id]);
    check("보내지 않은 사람은 없다", [...(await askedTodayBy(C.leader.id, C.third.id))], []);
    check("다른 보낸 사람의 기록은 섞이지 않는다", [...(await askedTodayBy(C.third.id))], []);
    check("다른 사람에게는 부탁할 수 있다", await as(C.asLeader, () => scheduleActions.askForTimetable(C.third.id)), "sent");
    check("보낸 사람이 다르면 따로 센다", await as(C.asThird, () => scheduleActions.askForTimetable(C.mate.id)), "sent");

    // 버튼을 빠르게 두 번 누른 경우 — 읽고 쓰는 사이가 벌어져 둘 다 통과할 수 있다.
    // 한 번의 성공은 증거가 아니다 — 틈이 있어도 타이밍이 맞으면 통과한다. 받는 사람 여덟 명으로
    // 여덟 번 겹쳐 눌러 보고, **한 명이라도 두 번 받으면** 실패다.
    const targets = await Promise.all(Array.from({ length: 8 }, (_, i) => C.mk(`새얼굴${i}`)));
    const pairs = await Promise.all(
      targets.map((t) =>
        Promise.allSettled([
          as(C.asLeader, () => scheduleActions.askForTimetable(t.id)),
          as(C.asLeader, () => scheduleActions.askForTimetable(t.id)),
        ]),
      ),
    );
    const received = await Promise.all(targets.map(async (t) => (await asked(t.id)).length));
    check("동시에 두 번 눌러도 받는 사람에게는 한 번만 간다", received, targets.map(() => 1));
    check(
      "던졌다면 DB 오류 원문이 아니다",
      pairs
        .flat()
        .filter((s): s is PromiseRejectedResult => s.status === "rejected")
        .every((s) => !/Unique constraint|Invalid `|prisma/i.test((s.reason as Error).message)),
      true,
    );

    /* ── 3) 후보 제안 ──────────────────────────────────────── */
    console.log("\n후보를 제안하면 제안자는 찬성하고, 팀에 알려진다");
    const D = await makeTeam("제안");
    const dSlot = await makeSlot(D.id);
    const foreignSlot = await makeSlot(other.id);

    check("세션이 없으면 제안할 수 없다", await blocked(() => meetings.proposeMeeting(dSlot.id)), "로그인이 필요합니다.");
    check(
      "남의 팀 후보는 제안할 수 없다",
      await blocked(() => as(D.asMate, () => meetings.proposeMeeting(foreignSlot.id))),
      "회의 시간 후보를 찾을 수 없습니다.",
    );
    check(
      "없는 후보는 제안할 수 없다",
      await blocked(() => as(D.asMate, () => meetings.proposeMeeting("없는후보"))),
      "회의 시간 후보를 찾을 수 없습니다.",
    );
    check("거절된 시도는 제안을 남기지 않는다", (await proposalsOf(D.id)).length + (await proposalsOf(other.id)).length, 0);

    const before = Date.now();
    await as(D.asMate, () => meetings.proposeMeeting(dSlot.id));
    const [made] = await proposalsOf(D.id);
    check("제안이 하나 생긴다", made !== undefined, true);
    check("제안자가 기록된다", made?.proposedById, D.mate.id);
    check("후보의 요일이 가리키는 날짜가 붙는다", made?.date, last.date);
    check("진행 중인 결정을 지키는 키가 붙는다", made?.activeKey, D.id);
    check("기본 길이는 60분이다", made?.durationMinutes, 60);
    check("장소·안건은 비어 있다", [made?.location, made?.agenda], [null, null]);
    const window = made ? made.respondBy.getTime() - before : 0;
    check("응답 마감은 24시간 뒤다", window > 23.9 * 3600_000 && window < 24.1 * 3600_000, true);
    const resp = await db.meetingResponse.findMany({ where: { proposalId: made?.id }, select: { memberId: true, agree: true } });
    check("제안자는 그 자리에서 찬성한 것으로 센다", resp, [{ memberId: D.mate.id, agree: true }]);
    const noticeTo = (id: string) =>
      db.notification.count({ where: { memberId: id, kind: "meeting", title: { contains: "제안했습니다" } } });
    check("나머지 팀원에게 알림이 간다", [await noticeTo(D.leader.id), await noticeTo(D.third.id)], [1, 1]);
    check("제안자 자신에게는 가지 않는다", await noticeTo(D.mate.id), 0);

    check(
      "진행 중인 제안 위에는 다시 제안할 수 없다",
      await blocked(() => as(D.asThird, () => meetings.proposeMeeting(dSlot.id))),
      "이미 올라온 회의 제안이 있습니다.",
    );
    check("뒤엎지 않는다", (await proposalsOf(D.id)).length, 1);

    /* ── 3-2) 상세 값 정리 ────────────────────────────────── */
    console.log("\n장소·안건·길이는 서버가 정리한다");
    const E = await makeTeam("상세");
    const eSlot = await makeSlot(E.id);
    await as(E.asLeader, () =>
      meetings.proposeMeeting(eSlot.id, { location: ` ${"가".repeat(150)} `, agenda: "나".repeat(300), durationMinutes: 45 }),
    );
    const [eMade] = await proposalsOf(E.id);
    check("장소는 100자에서 잘린다", eMade?.location?.length, 100);
    check("안건은 200자에서 잘린다", eMade?.agenda?.length, 200);
    check("허용되지 않은 길이는 60분이 된다", eMade?.durationMinutes, 60);

    const F = await makeTeam("상세2");
    const fSlot = await makeSlot(F.id);
    await as(F.asLeader, () => meetings.proposeMeeting(fSlot.id, { location: "   ", agenda: "", durationMinutes: 90 }));
    const [fMade] = await proposalsOf(F.id);
    check("공백뿐인 장소는 비어 있다", fMade?.location, null);
    check("빈 안건은 비어 있다", fMade?.agenda, null);
    check("허용된 길이는 그대로다", fMade?.durationMinutes, 90);

    /* ── 3-3) 이월 행 정리 ────────────────────────────────── */
    console.log("\n이월해 둔 행은 새 제안과 함께 치워진다");
    const G = await makeTeam("이월");
    const gOld = await makeSlot(G.id, { time: "10:00 – 11:00" });
    const gNew = await makeSlot(G.id);
    await db.meetingProposal.create({
      data: { teamId: G.id, slotId: gOld.id, proposedById: G.leader.id, stage: "carried", respondBy: new Date(Date.now() - 3600_000) },
    });
    await as(G.asLeader, () => meetings.proposeMeeting(gNew.id));
    const gAll = await proposalsOf(G.id);
    check("이월 행은 사라지고 새 제안만 남는다", gAll.map((p) => p.stage), ["proposed"]);

    /* ── 3-4) 지나간 시각 ─────────────────────────────────── */
    console.log("\n오늘의 이미 지나간 시각은 제안할 수 없다");
    const nowHour = nowHourInSeoul();
    if (nowHour >= 1) {
      const H = await makeTeam("지난시각");
      const today = SCHEDULE_DAYS[dayOf(todayInSeoul())]!;
      const hSlot = await makeSlot(H.id, { day: today, time: `${String(nowHour - 1).padStart(2, "0")}:00 – ${String(nowHour).padStart(2, "0")}:00` });
      check(
        "한 시간 전은 거절한다",
        await blocked(() => as(H.asLeader, () => meetings.proposeMeeting(hSlot.id))),
        "이미 지나간 시간입니다. 다른 시간을 골라 주세요.",
      );
      check("거절되면 제안도, 결정을 잡는 키도 남지 않는다", (await proposalsOf(H.id)).length, 0);
    } else {
      console.log("  - (지금이 0시대라 건너뜀 — 한 시간 전이 어제다)");
    }

    /* ── 3-5) 동시 제안 ───────────────────────────────────── */
    console.log("\n두 명이 같은 순간에 제안하면 하나만");
    const I = await makeTeam("동시");
    const iSlot = await makeSlot(I.id);
    const race = await Promise.all([
      blocked(() => as(I.asLeader, () => meetings.proposeMeeting(iSlot.id))),
      blocked(() => as(I.asMate, () => meetings.proposeMeeting(iSlot.id))),
    ]);
    check("제안은 하나뿐이다", (await proposalsOf(I.id)).length, 1);
    check("한쪽은 성공하고 한쪽은 사람이 읽을 수 있는 말로 막힌다", race.filter((m) => m === "(막지 않음)").length, 1);
    check(
      "막힌 말은 DB 오류 원문이 아니다",
      race.filter((m) => m !== "(막지 않음)").every((m) => !/Unique constraint|Invalid `|prisma/i.test(m)),
      true,
    );

    /* ── 4) 의견 요청 ─────────────────────────────────────── */
    console.log("\n그 시간에 못 오는 사람에게만 의견을 부탁한다");
    const J = await makeTeam("의견");
    const jLeft = await J.mk("나간이");
    const jOtherWeek = await J.mk("다른주");
    const jFree = await J.mk("가능");
    const jSlot = await makeSlot(J.id, { time: "10:00 – 11:00" }); // 시간표 칸 번호 1
    const blockAt = (memberId: string, over: Record<string, unknown> = {}) =>
      db.busyBlock.create({
        data: { memberId, day: last.day, startHour: 1, hours: 1, kind: "class", weekOf: null, ...over },
      });
    await blockAt(J.mate.id); // 매주 막힘
    await blockAt(J.third.id, { weekOf: last.week }); // 그 주에만 막힘
    await blockAt(J.leader.id, { startHour: 5 }); // 다른 시간 — 막히지 않음
    await blockAt(jOtherWeek.id, { weekOf: addDays(last.week, 7) }); // 다른 주 — 막히지 않음
    await blockAt(jLeft.id); // 나간 사람 — 보내지 않음
    await db.member.update({ where: { id: jLeft.id }, data: { leftAt: new Date() } });
    const askedRemote = (id: string) =>
      db.notification.count({ where: { memberId: id, kind: "meeting", title: { contains: "의견을 부탁" } } });

    check("세션이 없으면 부탁할 수 없다", await blocked(() => meetings.requestRemoteInput(jSlot.id)), "로그인이 필요합니다.");
    check(
      "남의 팀 후보로는 부탁할 수 없다",
      await blocked(() => as(J.asLeader, () => meetings.requestRemoteInput(foreignSlot.id))),
      "회의 시간 후보를 찾을 수 없습니다.",
    );

    check("못 오는 두 명에게 간다", await as(J.asLeader, () => meetings.requestRemoteInput(jSlot.id)), 2);
    check("매주 막힌 사람이 받는다", await askedRemote(J.mate.id), 1);
    check("그 주에만 막힌 사람이 받는다", await askedRemote(J.third.id), 1);
    check("다른 시간에 막힌 사람은 받지 않는다", await askedRemote(J.leader.id), 0);
    check("다른 주에만 막힌 사람은 받지 않는다", await askedRemote(jOtherWeek.id), 0);
    check("나간 사람은 받지 않는다", await askedRemote(jLeft.id), 0);
    check("막히지 않은 사람은 받지 않는다", await askedRemote(jFree.id), 0);

    // 나도 막힌 시간이다 — 그래도 나에게 부탁하지 않는다.
    check("나는 빼고 센다", await as(J.asMate, () => meetings.requestRemoteInput(jSlot.id)), 1);
    check("내게는 알림이 가지 않는다", await askedRemote(J.mate.id), 1);

    const emptySlot = await makeSlot(J.id, { time: "17:00 – 18:00" });
    const beforeCount = await db.notification.count({ where: { kind: "meeting", title: { contains: "의견을 부탁" } } });
    check("아무도 못 오는 게 아니면 0이다", await as(J.asLeader, () => meetings.requestRemoteInput(emptySlot.id)), 0);
    check(
      "0이면 알림도 만들지 않는다",
      await db.notification.count({ where: { kind: "meeting", title: { contains: "의견을 부탁" } } }),
      beforeCount,
    );
  } finally {
    for (const teamId of teamIds) {
      await db.meetingProposal.deleteMany({ where: { teamId } });
      await db.meetingSlot.deleteMany({ where: { teamId } });
      await db.member.deleteMany({ where: { teamId } });
      await db.team.delete({ where: { id: teamId } }).catch(() => {});
    }
    await db.$disconnect();
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}

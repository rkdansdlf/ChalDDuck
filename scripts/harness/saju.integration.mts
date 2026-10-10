/**
 * 사주 검사 — **생년월일을 받고·지우고·읽는 길**이 서버 액션 경계를 통과해서 규칙대로 되는지 본다.
 *
 * `smoke-saju.mts` 가 계산과 입력 규칙을 순수 함수로 본다. 여기서는 **그 규칙이 실제 입구에서
 * 지켜지는가** 를 본다 — 화면을 거치지 않고 POST 로 바로 불려도.
 *
 * 1. **로그인하지 않으면 아무것도 저장하지 않는다.**
 * 2. **잘못된 입력이 기존 값을 덮어쓰지 않는다** — 검사에 실패한 요청은 DB 를 건드리지 않는다.
 * 3. **저장은 정규화된 문자열 그대로** — 시각을 비우면 `NULL` (시간대가 낀 값이 아니다).
 * 4. **문자열이 아닌 값·터무니없이 긴 값도 던지지 않고 돌려준다**(`.trim()` 에서 죽지 않는다).
 * 5. **남의 행은 건드리지 않고, 읽기도 본인 것만 읽는다.**
 * 6. **지우면 계산 결과도 함께 사라진다** — 저장된 파생값이 따로 없다.
 * 7. **팀 사주는 서로 보여 주는 만큼만** — 내가 등록하지 않으면 남의 값이 내려가지 않고, 응답에
 *    생년월일·시각이 없고, 떠난 사람·다른 팀은 빠진다.
 * 9. **회의 케미는 참석 예정자(불참 응답 제외)만, 서로 보여 주는 만큼만** — 다른 팀 회의·없는 회의·
 *    잘못된 번호는 null 이고 응답에 생년월일이 없다.
 * 8. **팀을 나가면 생년월일이 지워진다** — 행은 기록 근거라 남지만 이 값은 개인정보다(두 길 모두).
 * 11. **진행 방식 저장은 서버가 만든 글만, 확정된 회의에만, 팀 안에서만 — 안건은 건드리지 않고 오행 제안은 담지 않는다.**
 * 10. **밸런스 게임은 한 사람 한 표이고 고른 뒤에만 결과가 내려오며, 나간 사람·다른 팀의 표는 세지 않는다.**
 *
 *   npm run test:saju
 */
import { randomUUID } from "node:crypto";

type Session = {
  as(token: string): void;
  nobody(): void;
  reset(): void;
  clearAll(): void;
};

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const saju = await import("../../src/server/actions/saju.js");
  const api = await import("../../src/data/api.js");

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
  let teamId: string | null = null;
  /** 가입 검사가 만든 팀 — 마지막에 지운다(멤버·요청·세션은 cascade). */
  const joinTeamIds: string[] = [];
  const memberIds: string[] = [];

  /** 토큰이 문자열인지 먼저 본다 — 멤버 객체를 넘기면 Prisma 오류가 진짜 이유를 가린다. */
  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    if (typeof token !== "string") throw new Error(`세션 토큰이 아니라 ${typeof token} 를 넘겼습니다`);
    session.as(token);
    try {
      return await work();
    } finally {
      session.nobody();
    }
  }

  const birthOf = (memberId: string) =>
    db.member.findUnique({ where: { id: memberId }, select: { birthDate: true, birthTime: true } });

  try {
    session.reset();
    const team = await db.team.create({
      data: { name: `사주 검사 ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamId = team.id;
    const me = await db.member.create({ data: { teamId: team.id, name: `김민준${suffix}`, isLeader: true } });
    const other = await db.member.create({ data: { teamId: team.id, name: `이서연${suffix}` } });
    memberIds.push(me.id, other.id);
    const token = async (memberId: string) => {
      const tk = randomUUID();
      await db.session.create({ data: { token: tk, memberId, expiresAt: new Date(Date.now() + 3600_000) } });
      return tk;
    };
    const asMe = await token(me.id);
    const asOther = await token(other.id);

    console.log("\n로그인하지 않으면 저장하지 않는다");
    check("저장은 invalid", await saju.saveMyBirth("2001-03-02", "14:30"), "invalid");
    check("지우기도 invalid", await saju.clearMyBirth(), "invalid");
    check("아무 행도 바뀌지 않았다", await birthOf(me.id), { birthDate: null, birthTime: null });

    console.log("\n저장");
    check("정상 입력은 ok", await as(asMe, () => saju.saveMyBirth("2001-03-02", "14:30")), "ok");
    check("문자열 그대로 저장된다", await birthOf(me.id), { birthDate: "2001-03-02", birthTime: "14:30" });
    check("시각을 비우면 NULL", (await as(asMe, () => saju.saveMyBirth("2001-03-02", ""))) === "ok" && (await birthOf(me.id)), {
      birthDate: "2001-03-02",
      birthTime: null,
    });
    await as(asMe, () => saju.saveMyBirth("2001-03-02", "14:30"));

    console.log("\n잘못된 입력은 기존 값을 건드리지 않는다");
    const keep = { birthDate: "2001-03-02", birthTime: "14:30" };
    check("없는 날짜 → bad-date", await as(asMe, () => saju.saveMyBirth("2001-02-30", null)), "bad-date");
    check("1989 이전 → too-old", await as(asMe, () => saju.saveMyBirth("1980-01-01", null)), "too-old");
    check("미래 → future", await as(asMe, () => saju.saveMyBirth("2999-01-01", null)), "future");
    check("25시 → bad-time", await as(asMe, () => saju.saveMyBirth("2001-03-02", "25:00")), "bad-time");
    check("값이 그대로다", await birthOf(me.id), keep);

    console.log("\nPOST 로 이상한 값이 와도 던지지 않는다");
    const weird = async (date: unknown, time: unknown) =>
      as(asMe, () => saju.saveMyBirth(date as string, time as string | null)).catch((e: Error) => `던짐: ${e.message}`);
    check("날짜가 객체", await weird({ x: 1 }, null), "bad-date");
    check("날짜가 숫자", await weird(20010302, null), "bad-date");
    check("날짜가 아주 길다", await weird("2001-03-02" + "0".repeat(10_000), null), "bad-date");
    check("시각이 객체", await weird("2001-03-02", { x: 1 }), "bad-time");
    check("시각이 아주 길다", await weird("2001-03-02", "1".repeat(10_000)), "bad-time");
    check("값이 그대로다", await birthOf(me.id), keep);

    console.log("\n남의 행은 건드리지 않고, 읽기도 본인 것만");
    check("다른 팀원 행은 비어 있다", await birthOf(other.id), { birthDate: null, birthTime: null });
    const mine = await as(asMe, () => api.getMySaju());
    check("내 사주는 내 값에서 계산된다", mine && [mine.birthDate, mine.birthTime, mine.chart.dayMaster.stem], ["2001-03-02", "14:30", 0]);
    check("다른 팀원이 읽으면 자기 것(없음)이다", await as(asOther, () => api.getMySaju()), null);
    check("로그인하지 않으면 null", await api.getMySaju(), null);

    console.log("\n지우기");
    check("지우면 ok", await as(asMe, () => saju.clearMyBirth()), "ok");
    check("두 열이 NULL", await birthOf(me.id), { birthDate: null, birthTime: null });
    check("계산 결과도 함께 사라진다", await as(asMe, () => api.getMySaju()), null);

    console.log("\n저장값이 깨져 있어도 화면이 죽지 않는다");
    await db.member.update({ where: { id: me.id }, data: { birthDate: "엉터리", birthTime: null } });
    check("계산할 수 없으면 null", await as(asMe, () => api.getMySaju()), null);

    console.log("\n팀 사주 — 서로 보여 주는 만큼만, 생년월일은 내려가지 않는다");
    const engine = await import("../../src/lib/saju/engine.js");
    const third = await db.member.create({ data: { teamId: team.id, name: `박지호${suffix}` } });
    const gone = await db.member.create({
      data: { teamId: team.id, name: `최유나${suffix}`, birthDate: "2000-05-05", birthTime: null, leftAt: new Date() },
    });
    memberIds.push(third.id, gone.id);
    const asThird = await token(third.id);
    const foreignTeam = await db.team.create({
      data: { name: `사주 검사 외부 ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    const foreign = await db.member.create({
      data: { teamId: foreignTeam.id, name: `외부${suffix}`, birthDate: "1995-07-07", birthTime: "09:09" },
    });
    memberIds.push(foreign.id);
    try {
      await db.member.update({ where: { id: me.id }, data: { birthDate: "2001-03-02", birthTime: "14:30" } });
      await db.member.update({ where: { id: other.id }, data: { birthDate: "1999-12-31", birthTime: "03:07" } });

      const unreg = await as(asThird, () => api.getTeamSaju());
      check("등록하지 않았으면 남의 값은 내려가지 않는다", unreg.members, []);
      check("그래도 사람 수는 안다(등록을 권하는 문구용)", [unreg.activeCount, unreg.registeredCount, unreg.meRegistered], [3, 2, false]);

      const seen = await as(asMe, () => api.getTeamSaju());
      check("등록하면 등록한 사람이 보인다(떠난 사람·다른 팀은 빠진다)", seen.members.map((m) => m.name), [`김민준${suffix}`, `이서연${suffix}`]);
      check("내가 누구인지 표시된다", seen.members.map((m) => m.isMe), [true, false]);
      check("팀에 남은 사람 수에는 떠난 사람이 없다", seen.activeCount, 3);
      const wantStem = (d: string, t: string) => {
        const [y, mo, da] = d.split("-").map(Number);
        const [h, mi] = t.split(":").map(Number);
        return engine.calculateSaju({ year: y!, month: mo!, day: da!, hour: h!, minute: mi! })!.dayMaster.stem;
      };
      check("일간은 계산값과 같다", seen.members.map((m) => m.stem), [wantStem("2001-03-02", "14:30"), wantStem("1999-12-31", "03:07")]);
      check("오행은 사람마다 여섯 글자", seen.members.map((m) => Object.values(m.elements).reduce((a, b) => a + b, 0)), [6, 6]);

      const wire = JSON.stringify(seen) + JSON.stringify(unreg);
      check("응답 어디에도 생년월일·출생 시각이 없다", ["2001-03-02", "1999-12-31", "14:30", "03:07", "birth"].filter((x) => wire.includes(x)), []);

      await as(asMe, () => saju.clearMyBirth());
      const after = await as(asMe, () => api.getTeamSaju());
      check("내 사주를 지우면 남의 값도 다시 가려진다", [after.meRegistered, after.members], [false, []]);
    } finally {
      await db.member.deleteMany({ where: { teamId: foreignTeam.id } });
      await db.team.delete({ where: { id: foreignTeam.id } }).catch(() => {});
    }

    console.log("\n회의 케미 — 참석 예정자만, 서로 보여 주는 만큼만");
    const chemBorn = [
      [me.id, "2001-03-02", "14:30"],
      [other.id, "1999-12-31", "03:07"],
      [third.id, "2002-08-15", "07:20"],
    ] as const;
    for (const [id, d, t] of chemBorn) await db.member.update({ where: { id }, data: { birthDate: d, birthTime: t } });
    const fourth = await db.member.create({ data: { teamId: team.id, name: `정하윤${suffix}` } });
    memberIds.push(fourth.id);
    const asFourth = await token(fourth.id);
    const meeting = await db.meetingProposal.create({
      data: { teamId: team.id, proposedById: me.id, stage: "confirmed", date: "2026-10-12", respondBy: new Date() },
    });
    await db.meetingResponse.createMany({
      data: [
        { proposalId: meeting.id, memberId: me.id, agree: true },
        { proposalId: meeting.id, memberId: other.id, agree: false },
      ],
    });
    const chem = (token_: string, id: string) => as(token_, () => saju.getMeetingChemistry(id));

    const mine2 = await chem(asMe, meeting.id);
    check("참석 어려움으로 응답한 사람은 센 수에서도 목록에서도 빠진다", mine2?.members.map((m) => m.name), [`김민준${suffix}`, `박지호${suffix}`]);
    check("참석 예정 수는 응답하지 않은 사람까지 센다(반대만 뺀다)", [mine2?.activeCount, mine2?.registeredCount], [3, 2]);
    check("내가 등록했으면 보인다", mine2?.meRegistered, true);

    const against = await chem(asOther, meeting.id);
    check("불참 응답을 했어도 내 사주 등록은 그대로라 남의 것이 보인다(나는 목록에 없다)", [against?.meRegistered, against?.members.map((m) => m.name)], [true, [`김민준${suffix}`, `박지호${suffix}`]]);

    const unreg = await chem(asFourth, meeting.id);
    check("내가 등록하지 않았으면 남의 값은 내려가지 않는다", unreg?.members, []);
    check("그래도 사람 수는 안다", [unreg?.activeCount, unreg?.registeredCount, unreg?.meRegistered], [3, 2, false]);

    const team3 = await db.team.create({
      data: { name: `사주 검사 외부회의 ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    try {
      const m3 = await db.member.create({ data: { teamId: team3.id, name: `외부${suffix}b`, birthDate: "1995-07-07", birthTime: "09:09" } });
      memberIds.push(m3.id);
      const foreignMeeting = await db.meetingProposal.create({
        data: { teamId: team3.id, proposedById: m3.id, stage: "confirmed", date: "2026-10-12", respondBy: new Date() },
      });
      check("다른 팀의 회의는 읽지 못한다", await chem(asMe, foreignMeeting.id), null);
    } finally {
      await db.member.deleteMany({ where: { teamId: team3.id } });
      await db.team.delete({ where: { id: team3.id } }).catch(() => {});
    }
    check("없는 회의는 null", await chem(asMe, "없는회의"), null);
    check("문자열이 아닌 회의 번호도 던지지 않고 null", await as(asMe, () => saju.getMeetingChemistry({ x: 1 } as unknown as string)), null);
    check("로그인하지 않으면 null", await saju.getMeetingChemistry(meeting.id), null);
    const chemWire = JSON.stringify([mine2, against, unreg]);
    check("응답 어디에도 생년월일·출생 시각이 없다", ["2001-03-02", "1999-12-31", "2002-08-15", "14:30", "03:07", "07:20", "birth"].filter((x) => chemWire.includes(x)), []);
    await db.meetingProposal.delete({ where: { id: meeting.id } });
    for (const id of [me.id, other.id, third.id]) await db.member.update({ where: { id }, data: { birthDate: null, birthTime: null } });

    console.log("\n진행 방식 저장 — 서버가 만든 글만, 확정된 회의에만, 팀 안에서만");
    const flowActions = await import("../../src/server/actions/meeting-flow.js");
    const { meetingFlowText, planMeetingFlow } = await import("../../src/lib/saju/meeting-flow.js");
    const { MEETING_TIP } = await import("../../src/lib/saju/copy.js");
    const mkMeeting = (stage: string, respondBy: Date, extra: Record<string, unknown> = {}) =>
      db.meetingProposal.create({
        data: { teamId: team.id, proposedById: me.id, stage, date: "2026-10-12", respondBy, ...extra },
      });
    const flowOf = async (id: string) => (await db.meetingProposal.findUnique({ where: { id }, select: { flow: true, agenda: true } }))!;
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    const confirmed = await mkMeeting("confirmed", past, { agenda: "정기 회의 안건", durationMinutes: 60 });
    const wantText = meetingFlowText(planMeetingFlow(60), []);

    check("로그인하지 않으면 저장할 수 없다", await flowActions.saveMeetingFlow(confirmed.id), "invalid");
    check("로그인하지 않으면 지울 수도 없다", await flowActions.clearMeetingFlow(confirmed.id), "invalid");
    check("아무것도 바뀌지 않았다", (await flowOf(confirmed.id)).flow, null);
    check("없는 회의·잘못된 번호는 gone", [
      await as(asMe, () => flowActions.saveMeetingFlow("없는회의")),
      await as(asMe, () => flowActions.saveMeetingFlow({ x: 1 } as unknown as string)),
      await as(asMe, () => flowActions.saveMeetingFlow("")),
      await as(asMe, () => flowActions.saveMeetingFlow("x".repeat(1000))),
    ], ["gone", "gone", "gone", "gone"]);

    check("확정된 회의에 저장한다", await as(asMe, () => flowActions.saveMeetingFlow(confirmed.id)), "ok");
    const saved = await flowOf(confirmed.id);
    check("저장된 글은 서버가 회의 길이로 만든 글과 같다", saved.flow, wantText);
    check("글에 세 단계와 시간이 있다", /1\) .*\(30분\)/.test(saved.flow ?? "") && /2\) .*\(20분\)/.test(saved.flow ?? "") && /3\) .*\(10분\)/.test(saved.flow ?? ""), true);
    check("오행에서 고른 제안은 담기지 않는다(팀원 모두가 보는 칸이다)", [
      (saved.flow ?? "").includes("챙겨 볼 것"),
      Object.values(MEETING_TIP).some((tip) => (saved.flow ?? "").includes(tip)),
    ], [false, false]);
    check("안건은 그대로다(안건은 회의록·기여 기록 제목이다)", saved.agenda, "정기 회의 안건");
    check("다시 저장해도 같다", [await as(asMe, () => flowActions.saveMeetingFlow(confirmed.id)), (await flowOf(confirmed.id)).flow], ["ok", wantText]);

    // 사주를 등록하지 않은 팀원도 저장·지울 수 있다 — 저장하는 글에 사주 데이터가 없으므로 열쇠가 필요 없다
    check("사주를 등록하지 않은 팀원도 저장·지울 수 있다", [
      await as(asFourth, () => flowActions.clearMeetingFlow(confirmed.id)),
      (await flowOf(confirmed.id)).flow,
      await as(asFourth, () => flowActions.saveMeetingFlow(confirmed.id)),
    ], ["ok", null, "ok"]);

    const api2 = await as(asMe, () => api.getMeetingProposal(team.id));
    check("회의 조회가 저장된 진행 방식을 돌려준다", [api2.flow, api2.agenda], [wantText, "정기 회의 안건"]);
    check("지운다", [await as(asMe, () => flowActions.clearMeetingFlow(confirmed.id)), (await flowOf(confirmed.id)).flow], ["ok", null]);
    check("지운 뒤 회의 조회의 진행 방식은 null", (await as(asMe, () => api.getMeetingProposal(team.id))).flow, null);

    // 확정 여부는 화면과 같은 계산(effectiveStage)이다
    const waiting = await mkMeeting("proposed", future, { durationMinutes: 45 });
    check("아직 응답을 기다리는 제안에는 저장하지 않는다", [await as(asMe, () => flowActions.saveMeetingFlow(waiting.id)), (await flowOf(waiting.id)).flow], ["not-confirmed", null]);
    await db.meetingProposal.update({ where: { id: waiting.id }, data: { respondBy: past } });
    check("마감이 지났고 반대가 없으면 확정으로 본다(예약 작업이 표를 고치기 전에도)", await as(asMe, () => flowActions.saveMeetingFlow(waiting.id)), "ok");
    check("회의 길이에 맞춘 글이 저장된다(45분)", (await flowOf(waiting.id)).flow, meetingFlowText(planMeetingFlow(45), []));
    await db.meetingResponse.create({ data: { proposalId: waiting.id, memberId: other.id, agree: false } });
    await db.meetingProposal.update({ where: { id: waiting.id }, data: { flow: null } });
    check("반대가 붙은 제안은 마감이 지나도 확정이 아니다", [await as(asMe, () => flowActions.saveMeetingFlow(waiting.id)), (await flowOf(waiting.id)).flow], ["not-confirmed", null]);

    // 다른 팀의 회의는 저장도 지우기도 못 한다
    const teamC = await db.team.create({ data: { name: `사주 검사 진행방식 ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` } });
    try {
      const mC = await db.member.create({ data: { teamId: teamC.id, name: `진행방식외부${suffix}` } });
      memberIds.push(mC.id);
      const foreignMeeting = await db.meetingProposal.create({
        data: { teamId: teamC.id, proposedById: mC.id, stage: "confirmed", date: "2026-10-12", respondBy: past, flow: "남의 팀 글" },
      });
      check("다른 팀의 회의는 저장할 수 없다", await as(asMe, () => flowActions.saveMeetingFlow(foreignMeeting.id)), "gone");
      check("다른 팀의 회의는 지울 수 없다", [await as(asMe, () => flowActions.clearMeetingFlow(foreignMeeting.id)), (await flowOf(foreignMeeting.id)).flow], ["gone", "남의 팀 글"]);
    } finally {
      await db.member.deleteMany({ where: { teamId: teamC.id } });
      await db.team.delete({ where: { id: teamC.id } }).catch(() => {});
    }
    await db.meetingProposal.deleteMany({ where: { id: { in: [confirmed.id, waiting.id] } } });

    console.log("\n밸런스 게임 — 한 사람 한 표, 고른 뒤에만 결과, 팀 안에서만");
    const balanceAction = await import("../../src/server/actions/saju-balance.js");
    const { BALANCE_QUESTIONS } = await import("../../src/lib/saju/balance.js");
    const q1 = BALANCE_QUESTIONS[0]!.id;
    const q2 = BALANCE_QUESTIONS[1]!.id;
    const votesOf = (questionId: string) => db.sajuBalanceVote.findMany({ where: { teamId: team.id, questionId } });
    const results = (token_: string) => as(token_, () => api.getBalanceResults());
    const row = (r: Awaited<ReturnType<typeof api.getBalanceResults>>, id: string) => r.find((x) => x.questionId === id);

    check("로그인하지 않으면 투표할 수 없다", await balanceAction.voteBalance(q1, "a"), "invalid");
    check("로그인하지 않으면 결과가 비어 있다", await api.getBalanceResults(), []);
    check("없는 질문은 invalid", await as(asMe, () => balanceAction.voteBalance("없는질문", "a")), "invalid");
    check("선택이 a·b 가 아니면 invalid", await as(asMe, () => balanceAction.voteBalance(q1, "c")), "invalid");
    check("문자열이 아닌 값도 던지지 않고 invalid", [
      await as(asMe, () => balanceAction.voteBalance({ x: 1 } as unknown as string, "a")),
      await as(asMe, () => balanceAction.voteBalance(q1, null as unknown as string)),
    ], ["invalid", "invalid"]);
    check("잘못된 요청은 아무 행도 만들지 않는다", await db.sajuBalanceVote.count({ where: { teamId: team.id } }), 0);

    const before = row(await results(asMe), q1);
    check("고르기 전에는 결과(counts)가 내려오지 않는다", [before?.mine, before?.counts], [null, null]);

    check("투표한다", await as(asMe, () => balanceAction.voteBalance(q1, "a")), "ok");
    check("행의 팀은 세션에서 정해진다", (await votesOf(q1)).map((v) => [v.teamId, v.memberId, v.choice]), [[team.id, me.id, "a"]]);
    check("다시 누르면 바뀐다(한 사람 한 표)", [await as(asMe, () => balanceAction.voteBalance(q1, "b")), (await votesOf(q1)).map((v) => v.choice)], ["ok", ["b"]]);
    check("고른 뒤에는 결과가 내려온다", row(await results(asMe), q1), { questionId: q1, mine: "b", counts: { a: 0, b: 1 } });
    check("다른 질문은 여전히 가려져 있다", row(await results(asMe), q2)?.counts, null);

    await as(asOther, () => balanceAction.voteBalance(q1, "a"));
    await as(asThird, () => balanceAction.voteBalance(q1, "b"));
    check("팀원들의 표가 사람 수로 집계된다", row(await results(asMe), q1)?.counts, { a: 1, b: 2 });
    const wire2 = JSON.stringify(await results(asMe));
    check("누가 골랐는지는 응답에 없다(사람 번호·이름이 없다)", ["memberId", me.id, other.id, third.id, `김민준${suffix}`, `이서연${suffix}`].filter((x) => wire2.includes(x)), []);

    // 팀에서 나간 사람과 다른 팀의 표는 세지 않는다
    await db.sajuBalanceVote.create({ data: { teamId: team.id, memberId: gone.id, questionId: q1, choice: "a" } });
    const teamB = await db.team.create({ data: { name: `사주 검사 놀이 ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` } });
    try {
      const mB = await db.member.create({ data: { teamId: teamB.id, name: `다른팀${suffix}` } });
      memberIds.push(mB.id);
      await db.sajuBalanceVote.create({ data: { teamId: teamB.id, memberId: mB.id, questionId: q1, choice: "a" } });
      check("나간 사람과 다른 팀의 표는 세지 않는다", row(await results(asMe), q1)?.counts, { a: 1, b: 2 });
      const asB = await token(mB.id);
      check("다른 팀 사람이 보는 결과에 우리 팀 표가 섞이지 않는다", row(await results(asB), q1), { questionId: q1, mine: "a", counts: { a: 1, b: 0 } });
    } finally {
      await db.member.deleteMany({ where: { teamId: teamB.id } });
      await db.team.delete({ where: { id: teamB.id } }).catch(() => {});
    }
    check("모든 질문이 결과에 한 줄씩 있다", (await results(asMe)).length, BALANCE_QUESTIONS.length);

    console.log("\n온보딩 사주 — 가입 길 세 갈래가 같은 값을 옮긴다");
    const onb = await import("../../src/server/actions/onboarding.js");
    const rejoinActions = await import("../../src/server/actions/rejoin.js");
    const draftOf = (name: string, extra: Record<string, unknown> = {}) => ({
      name,
      email: null,
      mbti: null,
      mbtiFromQuiz: false,
      want: "research" as const,
      veto: null,
      ...extra,
    });
    const birthRow = (name: string, teamId_: string) =>
      db.member.findFirst({ where: { teamId: teamId_, name }, select: { birthDate: true, birthTime: true } });
    /** 새 팀을 만들고 그 첫 사람(팀장)으로 들어간다. 브라우저를 매번 새로 한다. */
    const leaderJoin = async (label: string, extra: Record<string, unknown>) => {
      session.clearAll();
      const t = await onb.createTeam({ name: `사주 가입 ${label} ${suffix}`, course: "검증" });
      joinTeamIds.push(t.id);
      const name = `팀장${label}${suffix}`;
      const r = await onb.joinTeam(t.code, draftOf(name, extra));
      return { t, name, status: r.status };
    };

    // 1) 창작자가 곧바로 팀장이 되는 길
    const direct = await leaderJoin("직접", { birthDate: "2001-03-02", birthTime: "14:30" });
    check("직접 입장(첫 팀장)이 된다", direct.status, "joined");
    check("직접 입장은 정규화된 생년월일·시각을 저장한다", await birthRow(direct.name, direct.t.id), { birthDate: "2001-03-02", birthTime: "14:30" });

    const noTime = await leaderJoin("시각없음", { birthDate: "2001-03-02", birthTime: "" });
    check("시각을 비우면 NULL 로 저장한다", await birthRow(noTime.name, noTime.t.id), { birthDate: "2001-03-02", birthTime: null });

    // 2) 서버가 다시 거른다 — 맞지 않으면 가입을 막지 않고 비워 둔다
    const badInputs: [string, Record<string, unknown>][] = [
      ["없는날짜", { birthDate: "2001-02-30", birthTime: null }],
      ["너무이른", { birthDate: "1980-01-01", birthTime: null }],
      ["미래", { birthDate: "2999-01-01", birthTime: null }],
      ["객체", { birthDate: { x: 1 }, birthTime: null }],
      ["아주긴값", { birthDate: "2001-03-02" + "0".repeat(10_000), birthTime: null }],
      ["잘못된시각", { birthDate: "2001-03-02", birthTime: "25:00" }],
    ];
    for (const [label, extra] of badInputs) {
      const b = await leaderJoin(label, extra);
      check(`${label}: 가입은 되고 생년월일은 저장하지 않는다`, [b.status, await birthRow(b.name, b.t.id)], ["joined", { birthDate: null, birthTime: null }]);
    }

    // 3) 승인 요청 길 — 요청 행이 들고 있다가 승인되면 Member 로 옮긴다
    const leaderMember = await db.member.findFirstOrThrow({ where: { teamId: direct.t.id, isLeader: true } });
    const asDirectLeader = await token(leaderMember.id);
    const requestJoin = async (name: string, extra: Record<string, unknown>) => {
      session.clearAll();
      return onb.joinTeam(direct.t.code, draftOf(name, extra));
    };

    const approvedName = `승인자${suffix}`;
    check("팀장이 있는 팀은 요청만 한다", (await requestJoin(approvedName, { birthDate: "1999-12-31", birthTime: "03:07" })).status, "requested");
    const req = await db.joinRequest.findFirstOrThrow({ where: { teamId: direct.t.id, name: approvedName } });
    check("요청 행이 생년월일을 들고 있다", [req.birthDate, req.birthTime], ["1999-12-31", "03:07"]);
    session.as(asDirectLeader);
    check("팀장이 승인한다", await rejoinActions.resolveJoinRequest(req.id, true), "ok");
    session.reset();
    check("승인만으로는 아직 Member 가 아니다", await birthRow(approvedName, direct.t.id), null);
    await onb.checkJoinApproval();
    check("신청인이 폴링하면 Member 로 옮겨진다", await birthRow(approvedName, direct.t.id), { birthDate: "1999-12-31", birthTime: "03:07" });
    check("옮긴 뒤 요청 행은 지워진다", await db.joinRequest.count({ where: { id: req.id } }), 0);

    // 4) 거절 — 요청 행은 감사 근거로 남지만 생년월일은 지운다
    const rejectedName = `거절${suffix}`;
    await requestJoin(rejectedName, { birthDate: "2000-05-05", birthTime: "09:09" });
    const req2 = await db.joinRequest.findFirstOrThrow({ where: { teamId: direct.t.id, name: rejectedName } });
    check("거절 전에는 요청 행에 들어 있다", req2.birthDate, "2000-05-05");
    session.as(asDirectLeader);
    check("팀장이 거절한다", await rejoinActions.resolveJoinRequest(req2.id, false), "ok");
    session.reset();
    const after2 = await db.joinRequest.findUnique({ where: { id: req2.id }, select: { status: true, birthDate: true, birthTime: true } });
    check("요청 행은 남지만 생년월일·시각은 지워진다", after2, { status: "rejected", birthDate: null, birthTime: null });

    // 5) 소유자가 값을 고쳐 다시 보내면 반영된다 — 사주를 빼면 지워진다
    const editName = `수정${suffix}`;
    await requestJoin(editName, { birthDate: "2002-08-15", birthTime: "07:20" });
    const editReq = () => db.joinRequest.findFirstOrThrow({ where: { teamId: direct.t.id, name: editName }, select: { birthDate: true, birthTime: true } });
    check("처음에는 들어 있다", await editReq(), { birthDate: "2002-08-15", birthTime: "07:20" });
    // 같은 브라우저(쿠키 유지)가 사주 없이 다시 보낸다
    check("소유자가 다시 보낸다", (await onb.joinTeam(direct.t.code, draftOf(editName))).status, "requested");
    check("사주를 빼고 보내면 지워진다", await editReq(), { birthDate: null, birthTime: null });
    session.reset();

    console.log("\n팀을 나가면 생년월일은 지워진다 (행과 기록은 남는다)");
    const team_ = await import("../../src/server/actions/team.js");
    const outcome = async (work: () => Promise<unknown>): Promise<string> => {
      try {
        await work();
        return "(막지 않음)";
      } catch (e) {
        const m = (e as Error).message;
        return m.startsWith("__harness_redirect__:") ? "redirect" : m;
      }
    };
    const born = { birthDate: "2001-03-02", birthTime: "14:30" };
    const leaver = await db.member.create({ data: { teamId: team.id, name: `나감${suffix}`, ...born } });
    const successor = await db.member.create({ data: { teamId: team.id, name: `이어받음${suffix}`, ...born } });
    memberIds.push(leaver.id, successor.id);
    const asLeaver = await token(leaver.id);
    check("팀원이 나간다", await outcome(() => as(asLeaver, () => team_.leaveTeam())), "redirect");
    const left = await db.member.findUnique({ where: { id: leaver.id }, select: { leftAt: true, birthDate: true, birthTime: true } });
    check("생년월일·시각이 지워졌다", [left?.birthDate, left?.birthTime], [null, null]);
    check("행은 남는다(나간 시각이 찍힌다)", left?.leftAt !== null, true);
    check("남은 사람의 값은 그대로다", await birthOf(successor.id), born);

    // 팀장이 넘기고 나가는 길도 같은 값을 지운다. 이 팀의 팀장은 `me` 이므로 별도 팀으로 한다.
    const team2 = await db.team.create({
      data: { name: `사주 검사 팀장 ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    try {
      const l2 = await db.member.create({ data: { teamId: team2.id, name: `팀장${suffix}`, isLeader: true, ...born } });
      const n2 = await db.member.create({ data: { teamId: team2.id, name: `후임${suffix}`, ...born } });
      memberIds.push(l2.id, n2.id);
      const asL2 = await token(l2.id);
      check("팀장이 넘기고 나간다", await outcome(() => as(asL2, () => team_.handOverAndLeave(n2.id))), "redirect");
      const gone2 = await db.member.findUnique({ where: { id: l2.id }, select: { leftAt: true, isLeader: true, birthDate: true, birthTime: true } });
      check("나간 팀장의 생년월일·시각도 지워졌다", [gone2?.birthDate, gone2?.birthTime], [null, null]);
      check("나갔고 팀장 지위도 내려놓았다", [gone2?.leftAt !== null, gone2?.isLeader], [true, false]);
      check("후임의 값은 그대로다", await birthOf(n2.id), born);
    } finally {
      await db.member.deleteMany({ where: { teamId: team2.id } });
      await db.team.delete({ where: { id: team2.id } }).catch(() => {});
    }
  } finally {
    for (const id of joinTeamIds) {
      await db.team.delete({ where: { id } }).catch(() => {});
    }
    if (teamId) {
      await db.member.deleteMany({ where: { teamId } });
      await db.team.delete({ where: { id: teamId } }).catch(() => {});
    }
    for (const memberId of memberIds) await db.session.deleteMany({ where: { memberId } });
    await db.$disconnect();
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}

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
 * 8. **팀을 나가면 생년월일이 지워진다** — 행은 기록 근거라 남지만 이 값은 개인정보다(두 길 모두).
 *
 *   npm run test:saju
 */
import { randomUUID } from "node:crypto";

type Session = {
  as(token: string): void;
  nobody(): void;
  reset(): void;
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

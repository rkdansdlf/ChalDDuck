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

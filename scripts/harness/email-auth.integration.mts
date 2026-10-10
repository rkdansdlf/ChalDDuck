/**
 * 이메일 인증 검사 — **요청·번호·매직 링크·팀 고르기·메일 변경**이 규칙대로 되는지
 * 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 여섯 액션이 미검증이었다(`npm run audit:actions` 기준 "없음"). 그런데 이 앱에 **가입·로그인이
 * 없는 것 같다**는 판단이 한 번도 뒤집힌 자리다 — 그래서 여기가 진짜 인증 경계다.
 *
 * 읽으며 위험한 곳을 셌다 —
 *
 * - **시도 횟수를 세는 길이 하나뿐이어야 한다.** 예전에는 Supabase 검증이 앞에서 실패하면
 *   로컬 `attempts` 가 늘지 않아 **브루트포스가 사실상 무제한**이었다. 검증 경로를 하나만
 *   남기면 카운트가 곧 그 하나뿐이 된다. **그 하나가 실제로 세는지** 봐야 한다.
 * - **같은 브라우저가 그 이메일의 소유자임을 trusting 없이 다시 볼 수 있어야 한다.** 그래서
 *   인증이 끝난 이메일만 쿠키(`cd_email`)에 남고, 팀 고르기는 **명단 안에서만** 된다.
 *   예전에는 `memberId` 하나만 보고 세션을 만들어서 **누구라도 팀원 한 명의 `id` 만 알면
 *   그 사람 세션이 붙었다.**
 * - **인증은 한 번 쓰면 끝난다.** 같은 쿠키로 다른 팀원에 다시 들어가지 못하게 한다.
 * - **재발송은 1분 동안 막는다.** 스팸·무한 발송을 막는 자리다.
 *
 * ## 검사하는 것
 *
 * 1. 형식이 틀린 이메일은 거절 · **1분 안의 재요청은 막는다**
 * 2. **틀린 번호는 횟수를 세고** 남은 횟수를 알려 준다 · 다섯 번이면 잠기고 **토큰이 지워진다**
 * 3. 맞는 번호는 통과하고 **한 번 쓰면 소모된다**
 * 4. 만료된 번호는 거절 · 매직 링크도 같다
 * 5. 팀이 없으면 `no-teams` · 하나면 곧 로그인 · 여러 개면 고르게 한다
 * 6. **팀 고르기는 인증된 이메일과 명단이 일치해야만 되고**, 한 번 쓰면 쿠키가 지워진다
 * 7. 남의 이메일·나간 사람·인증 없음은 모두 거절된다
 *
 *   npm run test:email-auth
 */
import { randomUUID } from "node:crypto";

type Session = {
  as(token: string): void;
  nobody(): void;
  reset(): void;
  clearAll(): void;
};

const EMAIL = "team.auth@example.test";

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const auth = await import("../../src/server/actions/email-auth.js");

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

  /**
   * 판별 유니온에서 필드를 **안전하게** 읽는다.
   *
   * 타입이 `status` 로 갈리는 값이라 `.reason` 을 바로 읽으면 컴파일이 안 된다. 그래도
   * 하네스가 하려는 것은 **판단을 하지 않고 그 필드가 진짜 무엇인지 읽는 것**이다 — 그래서
   * cast 한다. 이렇게 읽어야 "성공했는데 `reason` 이 없다" 와 "거절했는데 사유가 없다" 를
   * **구분할 수 있다.**
   */
  const reasonOf = (r: unknown) => (r as { reason?: string }).reason;
  const codeOf = (r: unknown) => (r as { previewCode?: string }).previewCode ?? "";
  const statusOf = (r: unknown) => (r as { status?: string }).status;
  const remainingOf = (r: unknown) => (r as { remainingAttempts?: number }).remainingAttempts;

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const teamIds: string[] = [];
  const emails = new Set<string>();

  /**
   * 팀을 만들고 **이메일이 붙은 사람**을 팀원 한 명으로 둔다.
   *
   * ⚠️ **이메일이 있어야 한다.** 인증은 "이메일 → 팀원" 순서로 매칭한다 — 이메일이 없는
   * 사람은 인증에 **아예 닿지 않는다.** 팀원만 만들고 이메일을 안 붙이면 모든 검사가
   * `no-teams` 로 끝나고, 통과한 것처럼 보인다.
   */
  async function makeTeam(label: string, { withEmail = true, email = EMAIL } = {}) {
    session.clearAll();
    const t = await db.team.create({
      data: { name: `인증 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(t.id);
    if (email) emails.add(email);
    const leader = await db.member.create({
      data: { teamId: t.id, name: `김민준${suffix}`, isLeader: true, email: withEmail ? email : null },
    });
    return { id: t.id, leader, email };
  }

  /** 인증용 토큰을 **직접** 심는다 — 메일을 기다릴 수는 없으므로 **기록을 옮긴다.** */
  async function seedToken(email: string, code: string, patch: Record<string, unknown> = {}) {
    const hash = (await import("../../src/server/auth/email-token.js")).hashOtp(code);
    return db.emailAuthToken.create({
      data: {
        email,
        codeHash: hash,
        token: randomUUID().replace(/-/g, ""),
        expiresAt: new Date(Date.now() + 600_000),
        attempts: 0,
        ...patch,
      },
    });
  }

  try {
    // ⚠️ **팀을 여기서 만들어야 한다.** 인증은 "이메일 → 팀원" 순서로 매칭하는데,
    // 팀이 없으면 **아무리 번호를 맞혀도 `no-teams` 다.** 팀을 나중에 만들면 앞의 검사가
    // 전부 "로그인 실패" 로 끝나고, 그건 **하네스 순서 잘못**이지 제품 문제가 아니다.
    const base = await makeTeam("기본", { email: EMAIL });

    /* ── 1) 형식과 재발송 ──────────────────────────────────── */
    console.log("\n형식이 틀리면 거절하고, 1분 안에는 다시 못 낸다");
    check("형식이 틀리면 거절한다", reasonOf(await auth.requestEmailAuth("team.auth@example")), "invalid-email");
    check("아무것도 아니어도 거절한다", reasonOf(await auth.requestEmailAuth("아무것도 아님")), "invalid-email");

    const requested = await auth.requestEmailAuth(EMAIL);
    check("요청한다", requested.ok, true);
    const code = codeOf(requested);
    // ⚠️ **여기서 인증번호를 못 받으면 아래 검사가 전부 "expired" 로 끝나고, 통과한 것처럼
    // 보인다.** 그래서 **6자리인지 먼저 확인한다** — 서버가 번호를 돌려주는 길이 살아 있어야
    // 나머지 검사가 의미를 갖는다.
    check("인증번호를 돌려준다", /^[0-9]{6}$/.test(code), true);

    const again = await auth.requestEmailAuth(EMAIL);
    check("1분 안에는 다시 못 낸다", reasonOf(again), "cooldown");
    // 시간을 앞당겨 재발송을 되살린다 — **시계를 기다리면 검사가 아니라 잠자기**가 된다.
    await db.emailAuthToken.updateMany({ where: { email: EMAIL }, data: { createdAt: new Date(Date.now() - 120_000) } });
    const later = await auth.requestEmailAuth(EMAIL);
    check("1분이 지나면 다시 낸다", later.ok, true);

    /* ── 2) 틀린 번호는 횟수를 센다 ───────────────────────── */
    console.log("\n틀린 번호는 횟수를 세고, 다섯 번이면 잠긴다");
    for (let i = 0; i < 4; i += 1) {
      const r = await auth.verifyEmailAuthCode(EMAIL, "000000");
      check(`틀린 번호 ${i + 1}회`, [statusOf(r), remainingOf(r)], ["wrong", 4 - i]);
    }
    const locked = await auth.verifyEmailAuthCode(EMAIL, "000000");
    check("다섯 번째면 잠긴다", statusOf(locked), "locked");
    // **잠기면 토큰이 지워진다** — 남겨 두면 "다시 시도"가 무한히 된다.
    check("잠기면 토큰이 지워진다", await db.emailAuthToken.count({ where: { email: EMAIL } }), 0);
    const afterLock = await auth.verifyEmailAuthCode(EMAIL, "000000");
    check("잠긴 뒤의 시도는 '만료' 다", statusOf(afterLock), "expired");

    /* ── 3) 맞는 번호는 한 번 쓰면 소모된다 ─────────────────── */
    console.log("\n맞는 번호는 통과하고 한 번 쓰면 끝난다");
    const good = await seedToken(EMAIL, "246810");
    const passedAuth = await auth.verifyEmailAuthCode(EMAIL, "246810");
    // **팀이 하나면 곧 로그인한다.**
    check("팀이 하나면 로그인한다", statusOf(passedAuth), "ok");
    check("토큰은 사라진다", await db.emailAuthToken.count({ where: { id: good.id } }), 0);
    const reuse = await auth.verifyEmailAuthCode(EMAIL, "246810");
    check("같은 번호는 다시 못 쓴다", statusOf(reuse), "expired");

    /* ── 4) 만료와 매직 링크 ───────────────────────────────── */
    console.log("\n만료된 번호와 매직 링크는 거절한다");
    await seedToken(EMAIL, "135790", { expiresAt: new Date(Date.now() - 1000) });
    check("만료된 번호는 거절한다", statusOf(await auth.verifyEmailAuthCode(EMAIL, "135790")), "expired");
    check("빈 매직 링크는 거절한다", statusOf(await auth.verifyEmailMagicToken("")), "error");
    check("없는 매직 링크는 거절한다", statusOf(await auth.verifyEmailMagicToken("없는토큰")), "expired");
    const magic = await seedToken(EMAIL, "112233");
    const expiredMagic = await auth.verifyEmailMagicToken(magic.token);
    check("매직 링크로도 로그인한다", statusOf(expiredMagic), "ok");
    check("매직 링크도 한 번 쓰면 끝난다", statusOf(await auth.verifyEmailMagicToken(magic.token)), "expired");

    /* ── 5) 팀이 없으면 알려 준다 ──────────────────────────── */
    console.log("\n이메일이 등록된 팀이 없으면 팀이 없다고 말한다");
    await seedToken("empty@example.test", "246810");
    const noTeam = await auth.verifyEmailAuthCode("empty@example.test", "246810");
    check("팀이 없으면 no-teams 다", statusOf(noTeam), "no-teams");

    /* ── 6) 팀 고르기는 인증된 이메일과 명단이 맞아야 한다 ── */
    console.log("\n팀 고르기는 인증된 이메일과 명단이 맞아야만 한다");

    // ⚠️ **여기서 항아리를 비우면 안 된다.** 인증이 끝나면 `cd_email` 쿠키가 남고, 팀 고르기는
    // **그 쿠키를 보고** "이 브라우저가 이 이메일의 소유자다" 를 판단한다. 내가 `clearAll()` 을
    // 해 버리면 **양수 검사가 저절로 거짓이 된다** — "맞는 사람이면 들어간다" 가 항상
    // `false` 이고, **거절 검사들은 통과한 것처럼 보인다.** 인증을 **직접** 하고 나서 본다.
    check("인증 없이는 고를 수 없다", (await auth.selectEmailTeamMember(base.leader.id)).ok, false);

    const multi = await makeTeam("여러팀A", { email: "two@example.test" });
    const multi2 = await makeTeam("여러팀B", { email: "two@example.test" });
    const single = await makeTeam("다른이메일", { email: "one@example.test" });
    check("같은 이메일이 두 팀에 있다", multi2.email === multi.email, true);

    const magicMulti = await seedToken("two@example.test", "222222");
    const listed = await auth.verifyEmailMagicToken(magicMulti.token);
    check("여러 팀이면 고르게 한다", statusOf(listed), "multiple");
    check("목록에 둘이 담긴다", (listed as { members?: unknown[] }).members?.length, 2);

    check("다른 팀원은 거절한다", (await auth.selectEmailTeamMember(single.leader.id)).ok, false);
    check("맞는 사람이면 들어간다", (await auth.selectEmailTeamMember(multi.leader.id)).ok, true);
    // **한 번 쓰면 쿠키가 지워진다** — 같은 쿠키로 다른 팀원에 다시 들어가지 못하게 한다.
    check("쿠키는 한 번 쓰면 끝난다", (await auth.selectEmailTeamMember(multi.leader.id)).ok, false);
    check("나간 사람도 거절한다", (await auth.selectEmailTeamMember(multi2.leader.id)).ok, false);

    /* ── 7) 나간 사람은 후보에서 빠진다 ────────────────────── */
    console.log("\n나간 사람은 후보에서 빠진다");
    const gone = await makeTeam("나감", { email: "gone@example.test" });
    await db.member.update({ where: { id: gone.leader.id }, data: { leftAt: new Date() } });
    const goneToken = await seedToken("gone@example.test", "333333");
    const goneList = await auth.verifyEmailMagicToken(goneToken.token);
    // 인증은 통과했으나 **명단이 비어 있다** — 나간 사람은 후보에서 빠진다.
    check("나간 사람만 있으면 팀이 없다고 말한다", statusOf(goneList), "no-teams");

    /* ── 8) 내 메일 읽기와 바꾸기 ──────────────────────────── */
    console.log("\n내 메일은 읽고 바꿀 수 있다");
    const reader = await makeTeam("내메일", { email: "me@example.test" });
    const readerToken = randomUUID();
    await db.session.create({ data: { token: readerToken, memberId: reader.leader.id, expiresAt: new Date(Date.now() + 3600_000) } });
    session.as(readerToken);
    check("내 메일을 읽는다", await auth.getMyEmail(), "me@example.test");
    check("형식이 틀리면 안 바꾼다", reasonOf(await auth.updateMemberEmail("또잘못")), "invalid-email");
    check(
      "바꾸지 않았다",
      (await db.member.findUnique({ where: { id: reader.leader.id }, select: { email: true } }))?.email,
      "me@example.test",
    );
    // 팀 내 다른 팀원이 이미 사용하는 이메일 방어
    await db.member.create({
      data: { teamId: reader.id, name: `동료${suffix}`, email: "teammate@example.test" },
    });
    check("팀 내 다른 팀원이 쓰는 이메일은 거절된다", reasonOf(await auth.updateMemberEmail("teammate@example.test")), "email-in-use");

    check("바꾼다", (await auth.updateMemberEmail("new@example.test")).ok, true);
    check("바뀌었다", await auth.getMyEmail(), "new@example.test");
    check(
      "인증 절차 없는 변경은 verifiedAt 이 null 이다",
      (await db.member.findUnique({ where: { id: reader.leader.id }, select: { emailVerifiedAt: true } }))?.emailVerifiedAt,
      null,
    );
    check("상태 조회도 verified: false 이다", (await auth.getMyEmailStatus()).verified, false);
    check("지우면 비운다", (await auth.updateMemberEmail("")).ok, true);
    check("비었다", await auth.getMyEmail(), null);
    check("비운 뒤 상태 조회도 verified: false 이다", (await auth.getMyEmailStatus()).verified, false);
    session.clearAll();
  } finally {
    for (const email of emails) {
      await db.emailAuthToken.deleteMany({ where: { email } });
      await db.member.updateMany({ where: { email }, data: { email: null, emailVerifiedAt: null } });
    }
    for (const email of ["new@example.test", "me@example.test", "gone@example.test", "two@example.test", "one@example.test", "empty@example.test"]) {
      await db.emailAuthToken.deleteMany({ where: { email } });
      await db.member.updateMany({ where: { email }, data: { email: null } });
    }
    for (const id of teamIds) {
      await db.member.deleteMany({ where: { teamId: id } });
      await db.team.delete({ where: { id } }).catch(() => {});
    }
    await db.$disconnect();
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}
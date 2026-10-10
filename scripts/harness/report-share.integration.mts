/**
 * 공유 토큰 검사 — **발급·재사용·폐기**가 규칙대로 되는지 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 두 액션이 미검증이었다(`npm run audit:actions` 기준 "없음"). 그런데 이건 **외부에 공개되는
 * 링크의 문**이다 — 교수가 열 수 있는 페이지가 토큰 하나로 열리고, **폐기가 약하면 끝난 것을
 * 계속 볼 수 있다.**
 *
 * 읽으며 위험한 곳을 셌다 —
 *
 * - **토큰은 32바이트 암호학적 랜덤** — 추측할 수 없어야 한다.
 * - **이미 유효한 토큰이 있으면 재사용** — 매번 새로 만들면 링크가 자꾸 바뀌어 쓴 적이 없는
 *   링크는 다 죽고, 팀에 "아직도 그 링크?" 가 된다.
 * - **만료된 토큰이 있으면 새 것을 만든다** — 예전 것을 살리면 만료만 남은 링크가 부활한다.
 * - **폐기하면 다음에는 새 것을 만든다** — 폐기된 것을 재사용하면 폐기가 소용없다.
 * - **다른 팀의 토큰은 폐기할 수 없다** — `teamId` 범위가 있어야 남의 링크를 지우지 않는다.
 *
 * ## 검사하는 것
 *
 * 1. 만들면 14일 뒤 만료 · url은 `/report/` 로 시작
 * 2. 같은 scope로 다시 부르면 **기존 토큰을 쓴다**(새 것 안 만듦)
 * 3. 다른 scope로는 새 토큰
 * 4. 폐기하면 **revokedAt 이 찍히고** 그 다음에는 새 토큰
 * 5. **다른 팀의 토큰은 폐기하지 않는다**
 * 6. 만료된 토큰을 재사용하지 않는다
 *
 *   npm run test:report-share
 */
import { randomUUID } from "node:crypto";

type Session = { as(token: string): void; nobody(): void; reset(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const share = await import("../../src/server/actions/report-share.js");

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
      data: { name: `공유 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(t.id);
    const leader = await db.member.create({ data: { teamId: t.id, name: `김민준${suffix}`, isLeader: true } });
    const token = randomUUID();
    await db.session.create({ data: { token, memberId: leader.id, expiresAt: new Date(Date.now() + 3600_000) } });
    return { id: t.id, leader, token };
  }

  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    if (typeof token !== "string") throw new Error(`세션 토큰이 아닙니다`);
    session.as(token);
    try { return await work(); } finally { session.nobody(); }
  }

  try {
    const A = await makeTeam("기본");
    const first = await as(A.token, () => share.createReportShareToken());
    check("url은 /report/ 로 시작한다", first.url.startsWith("/report/"), true);
    const days = (new Date(first.expiresAt).getTime() - Date.now()) / 86400000;
    check("만료는 약 14일 뒤다", Math.round(days), 14);

    const again = await as(A.token, () => share.createReportShareToken());
    check("같은 scope는 기존 토큰을 쓴다", again.token, first.token);

    const other = await as(A.token, () => share.createReportShareToken("internal"));
    check("다른 scope는 새 토큰이다", other.token !== first.token, true);

    await as(A.token, () => share.revokeReportShareToken(first.token));
    const revoked = await db.reportShareToken.findUnique({ where: { token: first.token } });
    check("폐기하면 revokedAt 이 찍힌다", revoked?.revokedAt !== null, true);
    const afterRevoke = await as(A.token, () => share.createReportShareToken());
    check("폐기된 것은 다시 쓰지 않는다", afterRevoke.token !== first.token, true);

    // 만료된 것은 재사용하지 않는다
    await db.reportShareToken.update({
      where: { token: afterRevoke.token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const afterExpire = await as(A.token, () => share.createReportShareToken());
    check("만료된 것은 재사용하지 않는다", afterExpire.token !== afterRevoke.token, true);

    // 다른 팀의 토큰은 폐기하지 않는다
    const B = await makeTeam("이웃");
    const bToken = await as(B.token, () => share.createReportShareToken());
    await as(A.token, () => share.revokeReportShareToken(bToken.token));
    const bRevoked = await db.reportShareToken.findUnique({ where: { token: bToken.token } });
    check("남의 토큰은 지우지 않는다", bRevoked?.revokedAt, null);

    // 토큰 상태 검증 (유효/폐기/만료/없음)
    const { getReportTokenStatus } = await import("../../src/server/contrib/report.js");
    check("유효한 토큰은 ok 상태", await getReportTokenStatus(bToken.token), "ok");
    check("폐기된 토큰은 revoked 상태", await getReportTokenStatus(first.token), "revoked");
    check("만료된 토큰은 expired 상태", await getReportTokenStatus(afterRevoke.token), "expired");
    check("없는 토큰은 not_found 상태", await getReportTokenStatus("fake-token-xyz"), "not_found");
  } finally {
    for (const id of teamIds) {
      await db.member.deleteMany({ where: { teamId: id } });
      await db.team.delete({ where: { id } }).catch(() => {});
    }
    await db.$disconnect();
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}

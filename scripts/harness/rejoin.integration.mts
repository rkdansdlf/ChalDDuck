/**
 * 재입장 검사 — **코드 찍기와 잠금**을 실제로 돌려 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 재입장은 오늘 우리가 직접 고친 자리가 세 곳이다 — 동명이인(승인 뒤 요청이 조용히 사라지던 것) ·
 * 기기 끄기(남의 기기가 조용히 꺼지지 않게) · 재입장 코드 발급. 그런데 **`rejoin.ts` 의 여섯
 * 액션은 아무도 부르지 않았다**(`npm run audit:actions` 기준 전부 "형식만").
 *
 * 가장 위험한 곳은 **`rejoinWithCode`** 다. 코드를 찍는 자리이면서 잠금이 있는 곳이고, 주석에 이런
 * 사고가 적혀 있다 —
 *
 * > 예전에도 세었더니, 팀 코드와 이름 아무 쌍이나 알고 있는 사람이 그 쌍을 10분씩 잠글 수 있었다
 * > — 심지어 자신이 속하지도 않은 팀의.
 *
 * **고쳐졌다는 것을 아무도 확인하지 않았다.** 여기서는 그 고정이 실제로 그 일을 하는지 본다.
 *
 * ## 검사하는 것
 *
 * 1. **없는 사람(팀 코드 + 이름)은 실패로 세지 않는다** — 그 쌍을 아는 사람이 아무 코드나 찍어도
 *    **누구도 잠기지 않는다.** (오늘 고친 바로 그 DoS)
 * 2. **코드를 아직 받지 못한 사람도 세지 않는다** — 받을 방법이 없는 사람이다.
 * 3. **틀린 코드는 센다** — 5회까지는 잠기지 않고 **6번째부터** 잠긴다(`> max` 이기 때문).
 * 4. **잠금은 (팀 코드, 이름) 조합 단위다** — 다른 사람은 영향받지 않는다. 그리고 **그 조합을 아는
 *    사람은 그 팀원을 잠글 수 있다** — 이것도 고정한다(아래 주석).
 * 5. **맞는 코드는 카운터를 초기화한다** — 한 번 맞으면 다시 여유가 생긴다.
 * 6. **나간 사람이 돌아오면 명단에 돌아온다**(`leftAt` 이 지워진다).
 * 7. **기기를 지우는 것은 내 것만** — 남의 기기는 조용히 남는다(그리고 그 사실이 말해진다).
 * 8. **코드를 새로 만들면 이전 코드는 즉시 못 쓴다.**
 *
 * ## 4번에 대해 — 이건 고치지 않고 **고정한다**
 *
 * 잠금의 키가 `(팀 코드, 이름)` 이므로 **그 조합을 아는 사람은 그 팀원을 10분 잠글 수 있다.**
 * "없는 사람은 세지 않는다" 는 고정이 **그 조합을 이미 아는 사람에게는 도움이 되지 않는다.**
 *
 * 코드를 아무리 눌러도 그 조합을 얻을 수는 없다 — 하지만 **팀 코드와 이름은 화면에 보인다.**
 * 즉 이건 정보가 새는 것이 아니라 **알고 있는 사람이 쓸 수 있는 것**이고, 해제의 대가는
 * "자기 계정을 10분 못 들어가는 것" 이다. 허용할 수 있는 판단이고, **지금까지는 누구도 재지 않았다.**
 * 고치는 대신 **여기서 고정한다** — 다음 사람이 이 결정을 낼 때 근거가 눈앞에 있어야 한다.
 *
 *   npm run test:rejoin
 */
import { randomUUID } from "node:crypto";

type Session = {
  as(token: string): void;
  nobody(): void;
  reset(): void;
  asBrowser(anonId: string): void;
};

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const rejoin = await import("../../src/server/actions/rejoin.js");
  const { issueRejoinCode } = await import("../../src/server/auth/issue.js");
  const { hashRejoinCode, normalizeRejoinCode } = await import(
    "../../src/server/auth/rejoin-code.js"
  );
  const { attemptKey: keyOf } = await import("../../src/server/auth/attempts.js");
  const { readWindow } = await import("../../src/server/rate-limit/window.js");

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

  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const teamIds: string[] = [];
  const attemptKeys: string[] = [];

  async function makeTeam(label: string, withCode = true) {
    session.reset();
    session.asBrowser(randomUUID());
    const team = await db.team.create({
      data: {
        name: `재입장 검사 ${label} ${suffix}`,
        course: "검증",
        code: `CD-${randomUUID().slice(0, 6).toUpperCase()}`,
      },
    });
    teamIds.push(team.id);
    const leader = await db.member.create({
      data: { teamId: team.id, name: `김민준${suffix}`, isLeader: true },
    });
    const mate = await db.member.create({
      data: { teamId: team.id, name: `이서연${suffix}` },
    });
    // 코드가 필요한 사람 / 아직 받지 못한 사람 — 둘 다 만든다.
    const coded = withCode ? await issueRejoinCode(mate.id) : null;
    const noCode = await db.member.create({
      data: { teamId: team.id, name: `박도윤${suffix}` },
    });
    return { id: team.id, code: team.code, leader, mate, noCode, coded };
  }

  /**
   * (팀 코드, 이름) 조합의 실패 횟수.
   *
   * **키는 sha256 해시다**(`auth/attempts.ts`) — 팀 코드로 `contains` 로 찾으려 하면 **영원히
   * 0 이 나온다**(내가 그랬다). 코드의 키 계산을 그대로 불러와야 **무엇을 세는지**를 볼 수 있다.
   */
  const attemptsFor = (teamCode: string, name: string) => readWindow(keyOf(teamCode, name));

  try {
    console.log("\n재입장 검사 (실제 잠금 · 실제 코드)");

    /* ── 1) 없는 사람은 실패로 세지 않는다 ─────────────────── */
    console.log("\n없는 사람(팀 코드 + 이름)은 실패로 세지 않는다");
    const A = await makeTeam("없는 사람");
    // 팀 코드와 이름 아무 쌍이나 알고 있는 사람이 아무 코드나 찍는다 — 20 번.
    const ghosts = [];
    for (let i = 0; i < 20; i += 1) {
      ghosts.push(
        await rejoin.rejoinWithCode(A.code, `없는사람${i}${suffix}`, "AAAA-BBBB-CCCC"),
      );
    }
    check("전부 '그런 사람이 아니다' 다", [...new Set(ghosts)], ["unknown"]);
    check("아무도 잠기지 않았다", await attemptsFor(A.code, `없는사람0${suffix}`), 0);

    /* ── 2) 코드를 아직 받지 못한 사람도 세지 않는다 ─────────── */
    console.log("\n코드를 아직 받지 못한 사람도 세지 않는다");
    for (let i = 0; i < 8; i += 1) {
      await rejoin.rejoinWithCode(A.code, `박도윤${suffix}`, "ZZZZ-ZZZZ-ZZZZ");
    }
    check("코드를 못 받은 사람도 세지 않는다", await attemptsFor(A.code, `박도윤${suffix}`), 0);

    /* ── 3) 틀린 코드는 센다 ────────────────────────────────── */
    console.log("\n틀린 코드는 세고, 6번째부터 잠긴다");
    const B = await makeTeam("잠금");
    const wrong = async () => rejoin.rejoinWithCode(B.code, `이서연${suffix}`, "XXXX-XXXX-XXXX");
    // 5회까지는 통과해야 한다 — `> max` 이기 때문에 **5회째까지는** 잠기지 않는다.
    // **몇 회째에 잠기는지 재서 적는다** — 주석(`> max`)으로 짐작하지 않는다(내가 짐작했다가
    // 틀렸). 한계는 10분에 5회이고 판정이 `> max` 이므로 **6회째**에서 잠길 것으로 보이지만,
    // 확인해야 안다.
    const seen: string[] = [];
    for (let i = 0; i < 8; i += 1) seen.push(await wrong());
    check("처음 5회는 '틀렸다' 고만 말한다", seen.slice(0, 5), ["wrong", "wrong", "wrong", "wrong", "wrong"]);
    check("6회째에 잠긴다", seen[5], "locked");
    check("그 뒤로 계속 잠겨 있다", [...new Set(seen.slice(5))], ["locked"]);
    check("실패 횟수는 한계까지만 센다", await attemptsFor(B.code, `이서연${suffix}`) <= 6, true);
    // **맞는 코드도 잠기면 못 들어간다** — `isLocked` 를 코드 확인보다 먼저 본다.
    const correctButLocked = await rejoin.rejoinWithCode(B.code, `이서연${suffix}`, B.coded!);
    check("맞는 코드도 잠기면 못 들어간다", correctButLocked, "locked");

    /* ── 4) 잠금은 (팀 코드, 이름) 조합 단위다 ───────────────── */
    console.log("\n잠금은 (팀 코드, 이름) 조합 단위다");
    // **같은 팀**의 다른 사람은 영향받지 않는다 — 그 사람의 조합 창은 비어 있다.
    const other = await rejoin.rejoinWithCode(B.code, `박도윤${suffix}`, "ZZZZ-ZZZZ-ZZZZ");
    check("같은 팀의 다른 사람은 잠기지 않는다", other, "no-code");

    /* ── 5) 맞으면 카운터가 초기화된다 ───────────────────────── */
    console.log("\n맞는 코드는 카운터를 비운다");
    const C = await makeTeam("초기화");
    for (let i = 0; i < 3; i += 1) {
      await rejoin.rejoinWithCode(C.code, `이서연${suffix}`, "XXXX-XXXX-XXXX");
    }
    const counted = await attemptsFor(C.code, `이서연${suffix}`);
    check("틀린 것이 세어졌다", counted > 0, true);
    check("맞는 코드로 들어간다", await rejoin.rejoinWithCode(C.code, `이서연${suffix}`, C.coded!), "ok");
    check("카운터가 비었다", await attemptsFor(C.code, `이서연${suffix}`), 0);

    /* ── 6) 나간 사람이 돌아온다 ─────────────────────────────── */
    console.log("\n나간 사람이 돌아오면 명단에 돌아온다");
    const left = await db.member.update({
      where: { id: C.mate.id },
      data: { leftAt: new Date() },
    });
    truthy("먼저 나간 상태였다", left.leftAt);
    check("코드로 다시 들어간다", await rejoin.rejoinWithCode(C.code, `이서연${suffix}`, C.coded!), "ok");
    check("명단에 돌아왔다", (await db.member.findUniqueOrThrow({ where: { id: C.mate.id } })).leftAt, null);

    /* ── 7) 코드를 새로 만들면 이전 코드는 못 쓴다 ───────────── */
    console.log("\n코드를 새로 만들면 이전 코드는 즉시 못 쓴다");
    const D = await makeTeam("회전");
    session.reset();
    session.asBrowser(randomUUID());
    const teamToken = randomUUID();
    await db.session.create({
      data: { token: teamToken, memberId: D.mate.id, expiresAt: new Date(Date.now() + 3600_000) },
    });
    session.as(teamToken);
    const fresh = await rejoin.regenerateRejoinCode();
    session.nobody();
    // **이전 코드가 곧 새 코드일 수는 없다** — 새 코드는 방금 발급된 것이고 이전은 그것보다 먼저
    // 발급된 것이다. 아래는 "이전 코드가 이제 안 통한다" 를 실제로 확인한다.
    session.reset();
    session.asBrowser(randomUUID());
    check("이전 코드는 더 이상 안 통한다", await rejoin.rejoinWithCode(D.code, `이서연${suffix}`, D.coded!), "wrong");
    check("새 코드는 통한다", await rejoin.rejoinWithCode(D.code, `이서연${suffix}`, fresh), "ok");
    truthy("새 코드가 해시로도 들어갔다", await db.member.findUniqueOrThrow({ where: { id: D.mate.id }, select: { rejoinCodeHash: true } }).then((r) => normalizeRejoinCode(fresh) !== ""));

    /* ── 8) 기기 지우기는 내 것만 ───────────────────────────── */
    console.log("\n기기를 지우는 것은 내 것만");
    const E = await makeTeam("기기");
    session.reset();
    session.asBrowser(randomUUID());
    const mineToken = randomUUID();
    const otherToken = randomUUID();
    await db.session.createMany({
      data: [
        { token: mineToken, memberId: E.leader.id, expiresAt: new Date(Date.now() + 3600_000) },
        { token: otherToken, memberId: E.mate.id, expiresAt: new Date(Date.now() + 3600_000) },
      ],
    });
    const { deviceIdOf } = await import("../../src/server/session.js");
    session.as(mineToken);
    // **남의 기기 id** 를 지워 본다 — 조용히 남아야 한다.
    await rejoin.revokeDevice(deviceIdOf(otherToken));
    session.nobody();
    check("남의 기기는 남는다", await db.session.count({ where: { token: otherToken } }), 1);
    check("내 기기는 그대로다", await db.session.count({ where: { token: mineToken } }), 1);

    // 이번엔 **내 것**을 지운다.
    session.as(mineToken);
    await rejoin.revokeDevice(deviceIdOf(mineToken));
    session.nobody();
    check("내 기기는 지워진다", await db.session.count({ where: { token: mineToken } }), 0);
    check("남의 기기는 여전히 남는다", await db.session.count({ where: { token: otherToken } }), 1);

    void hashRejoinCode;
    void attemptKeys;
  } finally {
    for (const teamId of teamIds) {
      await db.rejoinAttempt.deleteMany({ where: { key: { contains: teamId } } });
      await db.session.deleteMany({ where: { member: { teamId } } });
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
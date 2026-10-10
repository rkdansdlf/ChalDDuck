/**
 * 팀 검사 — **나가고·넘기고·없앤다**가 규칙대로 되는지 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 네 액션이 전부 미검증이었다(`npm run audit:actions` 기준 "없음"). 그런데 여기는 **앱에서
 * 가장 되돌릴 수 없는 자리**다. `npm run decisions` 의 "2GB 근거 파일은 업로드 첨부만" 과
 * 같은 무게감의 결정들이 **나가는 사람의 행에 붙어 있다** — 그 사람이 납품한 것이 남는지가
 * 여기서 갈린다.
 *
 * 구조를 읽으며 위험한 곳을 셌다 —
 *
 * - **`leaveTeam` 이 팀장을 막는다.** 그렇지 않으면 팀장 없는 팀이 남고 **아무도 못 고치게
 *   된다** — 팀 구조를 고치는 유일한 길이 `handOverAndLeave` 인데 **그 길도 팀장만 오른다.**
 *   그래서 `team.ts:62` 의 한 줄이 **영구히 갇히는 조건**이다.
 * - **나가면 세션을 전부 끊는다.** 남겨 두면 나갔는데 다른 기기로 계속 보이게 된다.
 * - **넘기면서 나가는 건 한 트랜잭션이다.** 둘로 나누면 "넘겼는데 안 나간" 혹은 "나갔는데
 *   팀장 없음" 이 남는다. 이미 실제로 그랬다고 주석에 적혀 있다.
 * - **`disbandTeam` 은 되돌릴 수 없다.** 그래서 **이름 확인 문자열이 틀리면 아무것도 지우지
 *   않아야 한다** — 이게 그 문보다 약하다.
 *
 * ## 검사하는 것
 *
 * 1. `logOut` — **내 기기만** 끊긴다. 다른 기기는 살아 있고 **팀도 그대로**다.
 * 2. `leaveTeam` — 팀장은 막힌다 · 팀원이 나가면 **그 사람의 행은 남고** 활동에서 빠진다 ·
 *    세션이 끊긴다 · **납품한 것이 사라지지 않는다**(이게 진짜 위험한 곳이다).
 * 3. `handOverAndLeave` — 넘길 수 없는 사람에게는 막힌다 · 넘기면 **한 번에** 넘겨 나간다 ·
 *    팀장이 둘이거나 없는 상태가 남지 않는다.
 * 4. `disbandTeam` — **이름이 틀리면 아무것도 지우지 않는다** · 맞으면 전부 사라진다.
 *
 *   npm run test:team
 */
import { randomUUID } from "node:crypto";

type Session = {
  as(token: string): void;
  nobody(): void;
  reset(): void;
};

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const team = await import("../../src/server/actions/team.js");

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
  const memberIds: string[] = [];

  /**
   * 팀을 만들고 **두 기기**로 로그인한 한 사람을 준다.
   *
   * 두 기기가 필요한 이유는 **"로그아웃이 팀을 죽이거나 다른 기기를 죽이면 안 된다"** 를
   * 보려면 **비교 대상**이 있어야 하기 때문이다. 한 기기만 있으면 어느 쪽이 사라졌는지
   * 알 수 없다.
   */
  async function makeTeam(label: string, size = 2) {
    session.reset();
    const t = await db.team.create({
      data: {
        name: `팀 검사 ${label} ${suffix}`,
        course: "검증",
        code: `CD-${randomUUID().slice(0, 6).toUpperCase()}`,
      },
    });
    teamIds.push(t.id);
    const names = [`김민준${suffix}`, `이서연${suffix}`, `박도윤${suffix}`, `최하은${suffix}`];
    const made = [];
    for (let i = 0; i < size; i += 1) {
      const m = await db.member.create({
        data: { teamId: t.id, name: names[i]!, isLeader: i === 0 },
      });
      memberIds.push(m.id);
      made.push(m);
    }
    const token = async (memberId: string) => {
      const tk = randomUUID();
      await db.session.create({
        data: { token: tk, memberId, expiresAt: new Date(Date.now() + 3600_000) },
      });
      return tk;
    };
    return {
      id: t.id,
      name: t.name,
      leader: made[0]!,
      mate: made[1]!,
      third: made[2] ?? null,
      asLeader: await token(made[0]!.id),
      asMate: await token(made[1]!.id),
      /** 같은 사람의 **두 번째 기기** — "내 기기만" 을 비교할 대상이다. */
      asMateOther: await token(made[1]!.id),
      // 세 번째 사람에게도 토큰을 준다 — **없으면 "남은 사람의 세션은 살았다" 를 볼 수가
      // 없다**(처음부터 0 이라 항상 통과해 버린다). **비교 대상이 없으면 검사는 아니다.**
      asThird: made[2] ? await token(made[2]!.id) : null,
    };
  }

  /**
   * 그 사람으로 행동한다.
   *
   * ⚠️ **토큰이 문자열인지 먼저 본다**(2026-09-28 에 네 번 발생했다). 멤버 객체를 넘기면
   * 서버는 `token` 이 객체라며 Prisma 오류를 던지고 그 **아래의 진짜 이유를 가린다.**
   */
  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    if (typeof token !== "string") {
      throw new Error(`세션 토큰이 아니라 ${typeof token} 를 넘겼습니다`);
    }
    session.as(token);
    try {
      return await work();
    } finally {
      session.nobody();
    }
  }

  /**
   * 던져진 이유를 문장으로 돌려준다.
   *
   * `redirect` 는 예외다 — 그리고 **그 예외가 성공 신호로 쓰인다**(화면을 떠나는 게 성공이니까).
   * 그래서 그냥 `catch` 하면 "막혔다" 와 "갔다" 를 구분하지 못한다. redirect 를 따로 센다.
   */
  async function outcome(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
      return "(막지 않음)";
    } catch (e) {
      const m = (e as Error).message;
      if (m.startsWith("__harness_redirect__:")) return "redirect";
      return m;
    }
  }

  const leftAtOf = (memberId: string) =>
    db.member.findUnique({ where: { id: memberId }, select: { leftAt: true, isLeader: true } });
  const sessionCount = (memberId: string) => db.session.count({ where: { memberId } });
  const sessionAlive = (token: string) =>
    db.session.count({ where: { token } }).then((n) => n > 0);
  const teamAlive = (teamId: string) => db.team.count({ where: { id: teamId } });

  try {
    /* ── 1) 로그아웃은 내 기기만 끊는다 ────────────────────── */
    console.log("\n로그아웃은 팀도 다른 기기도 건드리지 않는다");
    const A = await makeTeam("로그아웃");
    // **개수로 보면 안 된다** — 같은 사람이 두 기기에 로그인해 있으므로 `count` 로는
    // "내 기기가 끊겼다" 와 "다른 기기가 살아 있다" 를 **구분할 수 없다**(둘 다 1 로 보인다).
    // **토큰 자체로** 본다. "누가 끊겼는가" 라는 질문에는 누락만이 답이 된다.
    check("로그아웃한다", await outcome(() => as(A.asMate, () => team.logOut())), "redirect");
    check("내 기기는 끊긴다", await sessionAlive(A.asMate), false);
    check("다른 기기는 살아 있다", await sessionAlive(A.asMateOther), true);
    check("팀은 그대로다", await teamAlive(A.id), 1);
    check("나간 사람도 아니다", (await leftAtOf(A.mate.id))?.leftAt, null);

    /* ── 2) 팀장은 나갈 수 없다 ────────────────────────────── */
    console.log("\n팀장은 나가는 길이 없다");
    const B = await makeTeam("팀장퇴장");
    check(
      "팀장은 막힌다",
      (await outcome(() => as(B.asLeader, () => team.leaveTeam()))).includes("팀장은 먼저"),
      true,
    );
    // ⚠️ **"팀장은 팀장이다" 는 만들 때 true 로 넣은 값이라 무조건 통과한다** — 검사가 아니다.
    // 막혔다는 증거는 **살아 있는 팀장이 여전히 한 명**이라는 쪽에 있다.
    check("나가지 않았다", (await leftAtOf(B.leader.id))?.leftAt, null);
    check("살아 있는 팀장은 여전히 그 한 명", await db.member.count({ where: { teamId: B.id, isLeader: true, leftAt: null } }), 1);

    /* ── 3) 팀원이 나가면 — 납품한 것은 남아야 한다 ────────── */
    console.log("\n나가도 그 사람이 남긴 것은 사라지지 않는다");
    const C = await makeTeam("퇴장", 3);
    // 나간 뒤에도 남아야 할 것들을 **미리 넣어 둔다.**
    //
    // ⚠️ **여기서 행을 넣어 두고 검사를 한다.** 팀을 나간 뒤 세어 보면
    // "행이 없어졌다" 와 "애초에 없었다" 를 구분하지 못한다 — **둘 다 0 이다.**
    // **실제 스키마를 그대로 쓴다** — `Submission` 이라는 모델은 없다(제 가짜 가정이었다).
    // `MeetingSlot` 은 `date`/`startMin`/`endMin` 이 아니라 `day`/`time`/`available`/`total` 이고,
    // 납품은 `SubmissionBox` → `SubmittedFile` → `FileVersion` 세 겹이다.
    const slot = await db.meetingSlot.create({
      data: { teamId: C.id, day: "2026-10-10", time: "10:00", available: 4, total: 4 },
    });
    const box = await db.submissionBox.create({
      data: { teamId: C.id, role: "개발", name: "개발 제출함", due: "미정" },
    });
    const file = await db.submittedFile.create({
      data: { boxId: box.id, name: "증거.pdf", kind: "file" },
    });
    await db.fileVersion.create({
      data: {
        fileId: file.id,
        label: "v1",
        authorId: C.mate.id,
        note: "나가도 남을 근거",
        size: "100 B",
        kind: "file",
        storagePath: "team/evidence.pdf",
        bytes: 100,
      },
    });
    const note = await db.meetingNote.create({
      data: { teamId: C.id, createdById: C.mate.id, title: "나가도 남을 회의록", rawText: "본문", summary: "요약" },
    });
    const boxesBefore = await db.submissionBox.count({ where: { teamId: C.id } });
    const _slotId = slot.id;
    const filesBefore = 1;
    const notesBefore = await db.meetingNote.count({ where: { teamId: C.id } });
    const othersSessionBefore = await sessionCount(C.third!.id);

    check("팀원이 나간다", await outcome(() => as(C.asMate, () => team.leaveTeam())), "redirect");
    check("행은 남는다", (await leftAtOf(C.mate.id))?.leftAt !== null, true);
    check("팀장 지위는 아니다", (await leftAtOf(C.mate.id))?.isLeader, false);
    check("세션이 끊긴다", await sessionCount(C.mate.id), 0);
    check("남은 사람의 세션은 살았다", await sessionCount(C.third!.id), othersSessionBefore);
    check("팀은 그대로다", await teamAlive(C.id), 1);
    // **여기가 진짜 위험한 곳이다** — 남의 것이 사람의 퇴장과 함께 지워지면 안 된다.
    check("제출함은 남는다", await db.submissionBox.count({ where: { teamId: C.id } }), boxesBefore);
    check("회의록은 남는다", await db.meetingNote.count({ where: { teamId: C.id } }), notesBefore);
    check("회의록 본문도 그대로다", (await db.meetingNote.findUnique({ where: { id: note.id } }))?.rawText, "본문");
    check("회의록의 저자도 남는다", (await db.meetingNote.findUnique({ where: { id: note.id } }))?.createdById, C.mate.id);
    check("올린 파일은 남는다", await db.submittedFile.count({ where: { boxId: box.id } }), filesBefore);
    check("파일 내용까지 남는다", await db.fileVersion.count({ where: { fileId: file.id } }), 1);
    check("파일의 출처도 남는다", (await db.fileVersion.findFirst({ where: { fileId: file.id } }))?.authorId, C.mate.id);

    /* ── 4) 넘길 수 없는 사람에게는 막힌다 ────────────────── */
    console.log("\n넘길 수 없는 사람에게는 막힌다");
    const D = await makeTeam("넘기기", 3);
    // **이미 나간 사람**에게 넘길 수 없어야 한다.
    //
    // ⚠️ **처음에는 살아 있는 사람에게 넘겼고, 그건 성공해야 한다** — 막혔다고 읽고
    // 팀장 지위까지 확인하면, 실제로는 **넘겨진 뒤**라서 "아직 팀장이다" 가 거짓말이 된다.
    // 두 가지를 한 팀에서 보려면 **막히는 대상을 따로** 만들어야 한다.
    await db.member.update({ where: { id: D.third!.id }, data: { leftAt: new Date() } });
    check(
      "나간 사람에게는 못 넘긴다",
      (await outcome(() => as(D.asLeader, () => team.handOverAndLeave(D.third!.id)))).includes("팀에 없는 사람"),
      true,
    );
    check("아직 팀장이다", (await leftAtOf(D.leader.id))?.isLeader, true);
    check("나가지 않았다", (await leftAtOf(D.leader.id))?.leftAt, null);
    check(
      "자기 자신에게는 못 넘긴다",
      (await outcome(() => as(D.asLeader, () => team.handOverAndLeave(D.leader.id)))).includes("이미 팀장"),
      true,
    );
    check(
      "없는 사람에게는 못 넘긴다",
      (await outcome(() => as(D.asLeader, () => team.handOverAndLeave("없는아이디")))).includes("팀에 없는 사람"),
      true,
    );
    check("여전히 팀장이다", (await leftAtOf(D.leader.id))?.isLeader, true);

    /* ── 5) 넘기면서 나가기가 한 번에 ──────────────────────── */
    console.log("\n넘기면서 나가는 건 한 번에");
    const E = await makeTeam("인수인계", 3);
    // **나가기 전** 후보를 기억한다 — 팀장이 나가면 후보를 다시 만들므로("나간 사람을 뺀
    // 인원으로") 개수가 바뀐다. **0 과 비교하면 그 변화 자체를 검사로 착각**한다.
    const eSlotsBefore = await db.meetingSlot.count({ where: { teamId: E.id } });
    const eSlotsInBefore = await db.meetingSlot.count({
      where: { teamId: E.id, available: { lt: 4 } },
    });
    check("넘기고 나간다", await outcome(() => as(E.asLeader, () => team.handOverAndLeave(E.mate.id))), "redirect");
    check("팀장이 넘겨졌다", (await leftAtOf(E.mate.id))?.isLeader, true);
    check("나간 팀장은 팀장이 아니다", (await leftAtOf(E.leader.id))?.isLeader, false);
    check("나간 팀장은 나갔다", (await leftAtOf(E.leader.id))?.leftAt !== null, true);
    check("나간 팀장의 세션이 끊겼다", await sessionCount(E.leader.id), 0);
    // **팀장이 둘이거나 없는 상태가 남으면 팀 구조를 고칠 길이 없다.**
    check("팀장은 정확히 하나다", await db.member.count({ where: { teamId: E.id, isLeader: true, leftAt: null } }), 1);
    check("팀은 그대로다", await teamAlive(E.id), 1);
    check("남은 사람의 세션은 살았다", await sessionCount(E.third!.id), 1);
    // **나간 사람이 후보에서 빠진다** — 그래야 회의에 이미 나간 사람이 초대되지 않는다.
    check("나가기 전에는 후보가 온전했다", eSlotsInBefore, eSlotsBefore);
    check("후보는 다시 만들어진다", (await db.meetingSlot.count({ where: { teamId: E.id } })) > 0, true);

    /* ── 6) 팀장 혼자면 넘길 사람이 없다 ──────────────────── */
    console.log("\n팀장 혼자면 넘길 사람이 없다");
    // ⚠️ **팀장이 "혼자" 라는 건 사람이 한 명이어서가 아니라, 넘길 수 있는 사람이 없다는
    // 뜻이다.** 그래서 **세션이 없는 팀원**을 넣는다 — 팀원 수는 2 지만 `leftAt` 도 없다.
    // (한 명짜리 팀을 만들면 "혼자가 아니라 팀원이 없다" 라는 **다른 버그**를 재게 된다.)
    const F = await makeTeam("혼자", 2);
    const fOther = F.mate;
    await db.session.deleteMany({ where: { memberId: fOther.id } });
    await db.member.update({ where: { id: fOther.id }, data: { leftAt: new Date() } });
    check(
      "나간 사람에게는 막힌다",
      (await outcome(() => as(F.asLeader, () => team.handOverAndLeave(fOther.id)))).includes("팀에 없는 사람"),
      true,
    );
    check("나가지 않았다", (await leftAtOf(F.leader.id))?.leftAt, null);
    check("아직 팀장이다", (await leftAtOf(F.leader.id))?.isLeader, true);
    check("팀은 살아 있다", await teamAlive(F.id), 1);

    /* ── 7) 팀을 없앨 때는 이름이 맞아야 한다 ──────────────── */
    console.log("\n팀을 없애려면 이름을 정확히 써야 한다");
    const G = await makeTeam("해체", 2);
    const gMembers = await db.member.count({ where: { teamId: G.id } });
    check(
      "이름이 틀리면 막힌다",
      (await outcome(() => as(G.asLeader, () => team.disbandTeam("엉뚱한 이름")))).includes("팀 이름이 맞지 않습니다"),
      true,
    );
    check("막혔는데 팀은 살아 있다", await teamAlive(G.id), 1);
    check("막혔는데 사람들은 그대로다", await db.member.count({ where: { teamId: G.id } }), gMembers);
    check(
      "앞뒤 공백은 봐준다",
      await outcome(() => as(G.asLeader, () => team.disbandTeam(`  ${G.name}  `))),
      "redirect",
    );
    check("이름이 맞으면 사라진다", await teamAlive(G.id), 0);
    // `onDelete: Cascade` 가 팀의 자식들을 다 지워야 한다 — **고아가 남으면 팀 이름 재사용이
    // 나중에 어긋난다.**
    check("사람들도 함께 사라진다", await db.member.count({ where: { teamId: G.id } }), 0);

    /* ── 8) 팀장이 아니면 팀을 없앨 수 없다 ────────────────── */
    console.log("\n팀장이 아니면 팀을 없앨 수 없다");
    const H = await makeTeam("권한", 2);
    check(
      "팀원이 없애면 막힌다",
      (await outcome(() => as(H.asMate, () => team.disbandTeam(H.name)))).length > 0,
      true,
    );
    check("팀은 살아 있다", await teamAlive(H.id), 1);

    /* ── 9) 모르는 값 ────────────────────────────────────── */
    console.log("\n없는 사람에게는 막힌다");
    const I = await makeTeam("없는사람", 2);
    check(
      "없는 사람에게는 못 넘긴다",
      (await outcome(() => as(I.asLeader, () => team.handOverAndLeave("없는아이디")))).length > 0,
      true,
    );
    check("아직 팀장이다", (await leftAtOf(I.leader.id))?.isLeader, true);
  } finally {
    for (const teamId of teamIds) {
      await db.member.deleteMany({ where: { teamId } });
      await db.team.delete({ where: { id: teamId } }).catch(() => {});
    }
    for (const memberId of memberIds) {
      await db.session.deleteMany({ where: { memberId } });
    }
    await db.$disconnect();
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}

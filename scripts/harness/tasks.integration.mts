/**
 * 업무 액션 검사 — **권한 4곳이 실제로 지켜지는지** 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 오늘 업무 권한 네 곳을 닫았다 — 담당자 지정·제목·기한(넣은 사람+팀장) · 상태 변경(넣은 사람+팀장)
 * · 마감 수정(담당자+팀장) · 복원(올린 사람+팀장). **전부 `lib/task-permission.ts` 의 순수 함수로
 * 옮겼고**, 순수 함수는 실제로 돌려서 확인했다(22건).
 *
 * 그런데 **액션 본문은 소스 텍스트를 읽어서만 확인하고 있었다.**
 *
 * ```ts
 * const actions = readCode("../src/server/actions/tasks.ts");
 * check("순수 판정을 부른다", fn.includes("taskEditBlock("), true);
 * ```
 *
 * **순수 함수가 초록불이어도 액션이 그것을 제대로 쓰고 있다는 보장이 없다.** 그것은 오늘 다섯 번
 * 배운 정확한 문장이다 —
 *
 * - 드라이브 재전송: 주석은 괜찮았고 잠금 **순서**가 틀렸고, 그 버그가 실제로 났다
 * - AI 한도: **내가** 근거를 잘못 읽고 한 유지를 두려 했다
 * - 팀장 선출: 검사를 돌려보니 **검사가 잠금을 보고 있지 않았다**(abuse 한계가 먼저 직렬화)
 * - 첨부 저장: 순차로 눌러 재확인을 지워도 통과했다
 * - 기여 의견: 이것도 처음엔 경합을 보고 있지 않았고, **지운 뒤에야 깨졌다**
 *
 * 순수 규칙과 그것을 부르는 자리는 **다른 일**이다. 여기서는 후자를 본다.
 *
 * ## 검사하는 것
 *
 * 1. **만든 사람은 고친다** · **팀원은 남이 넣은 업무를 못 고친다** · **팀장은 된다** — 액션에서.
 * 2. **상태 변경도 같다** — 남의 업무를 남이 "다 했다"로 닫을 수 없다.
 * 3. **주인 없는 업무(넣기 전부터 있던 것)는 팀장에게만 연다** — 그리고 **고친 사람이 주인이 된다.**
 * 4. **배정은 조용하지 않다** — 담당자가 바뀌면 그 사람에게 알림이 간다.
 * 5. **같은 막힘에 같은 말을 한다** — 화면의 이유와 액션의 이유가 어긋나면 배워지지 않는다.
 * 6. **콕 찌르기는 담당자에게만, 하루에 한 번** — 내가 맡은 일은 나 자신에게 안 간다.
 * 7. **마감 수정은 제출함 담당자 또는 팀장만** — 이력이 남는다.
 *
 *   npm run test:tasks
 */
import { randomUUID } from "node:crypto";

type Session = {
  as(token: string): void;
  nobody(): void;
  reset(): void;
};

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const tasks = await import("../../src/server/actions/tasks.js");
  const drive = await import("../../src/server/actions/drive.js");

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
  /** 막혔을 때 왜인지까지 본다 — 조용히 아무 일도 일어나지 않는 쪽이 나쁘기 때문이다. */
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
        name: `업무 검사 ${label} ${suffix}`,
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

  /** 그 사람에게 쌓인 알림 — 누가, 무슨 종류로. */
  const notices = (memberId: string) => db.notification.count({ where: { memberId } });
  const noticesOf = (memberId: string, kind: string) =>
    db.notification.count({ where: { memberId, kind } });

  try {
    console.log("\n업무 액션 검사 (실제 서버 액션)");

    const A = await makeTeam("권한");

    /* ── 1) 넣고 고친다 ─────────────────────────────────────── */
    console.log("\n넣은 사람은 자기 업무를 고친다");
    await as(A.asLeader, () => tasks.addTask("team", `논문 찾기 ${suffix}`));
    const task = await db.task.findFirstOrThrow({
      where: { teamId: A.id, title: `논문 찾기 ${suffix}` },
      select: { id: true, createdById: true, assigneeId: true, status: true },
    });
    check("넣은 사람이 기록된다", task.createdById, A.leader.id);
    // **담당자와 기한은 비어 간다** — 넣는 사람이 임의로 남을 배정하는 것보다 미정으로 두는 편.
    check("담당자는 비어 있다", task.assigneeId, null);
    check("상태는 todo 다", task.status, "todo");

    await as(A.asLeader, () => tasks.updateTask(task.id, { title: `논문 찾기 고침 ${suffix}` }));
    check("고쳐진다", (await db.task.findUniqueOrThrow({ where: { id: task.id } })).title, `논문 찾기 고침 ${suffix}`);

    /* ── 2) 남의 업무 ───────────────────────────────────────── */
    console.log("\n팀원은 남이 넣은 업무를 못 고친다");
    const byMate = await blocked(() =>
      as(A.asMate, () => tasks.updateTask(task.id, { title: "남의 업무를 고치려 한다" })),
    );
    check("막힌다", byMate.includes("남이 넣은 업무라 고칠 수 없습니다"), true);
    check("제목은 그대로다", (await db.task.findUniqueOrThrow({ where: { id: task.id } })).title, `논문 찾기 고침 ${suffix}`);

    console.log("\n팀장은 남의 업무도 고친다");
    await as(A.asLeader, () => tasks.updateTask(task.id, { title: `팀장이 고침 ${suffix}` }));
    check("팀장은 된다", (await db.task.findUniqueOrThrow({ where: { id: task.id } })).title, `팀장이 고침 ${suffix}`);

    /* ── 3) 상태 변경도 같은 규칙 ───────────────────────────── */
    console.log("\n상태 변경도 넣은 사람 + 팀장");
    await as(A.asLeader, () => tasks.cycleTaskStatus(task.id));
    check("넣은 사람은 상태를 바꾼다", (await db.task.findUniqueOrThrow({ where: { id: task.id } })).status, "doing");
    const mateCycle = await blocked(() => as(A.asMate, () => tasks.cycleTaskStatus(task.id)));
    check("남의 업무 상태는 못 바꾼다", mateCycle.includes("남이 넣은 업무"), true);
    check("상태는 그대로다", (await db.task.findUniqueOrThrow({ where: { id: task.id } })).status, "doing");
    await as(A.asLeader, () => tasks.cycleTaskStatus(task.id));
    check("계속 바꿀 수 있다 (다음 상태로)", (await db.task.findUniqueOrThrow({ where: { id: task.id } })).status, "done");

    /* ── 4) 주인 없는 업무 ──────────────────────────────────── */
    console.log("\n넣기 전부터 있던 업무는 팀장에게만 열린다");
    const orphan = await db.task.create({
      data: { teamId: A.id, title: `시작 전에 있던 업무 ${suffix}`, kind: "team", due: "미정", createdById: null },
    });
    const orphanByMate = await blocked(() =>
      as(A.asMate, () => tasks.updateTask(orphan.id, { title: "고쳐 본다" })),
    );
    // **같은 막힘에 같은 말을 한다** — 화면은 "넣기 전에 있던 업무라 팀장만…" 이라고 하는데
    // 액션이 "만든 사람이 아니어서…" 라고 하면 사용자는 두 개의 다른 이유로 같은 막힘을 받는다.
    check("팀원에게는 막힌다", orphanByMate.includes("넣기 전에 있던 업무"), true);
    await as(A.asLeader, () => tasks.updateTask(orphan.id, { title: `팀장이 고친 시 업무 ${suffix}` }));
    check("팀장은 된다", (await db.task.findUniqueOrThrow({ where: { id: orphan.id } })).title, `팀장이 고친 시 업무 ${suffix}`);
    // **고친 사람이 주인이 된다** — 그렇지 않으면 "왜 이 사람만 되나" 가 영영 풀리지 않는다.
    check("고친 팀장이 주인이 된다", (await db.task.findUniqueOrThrow({ where: { id: orphan.id } })).createdById, A.leader.id);

    /* ── 5) 배정은 조용하지 않다 ────────────────────────────── */
    console.log("\n배정하면 그 사람에게 알림이 간다");
    await as(A.asLeader, () =>
      tasks.updateTask(task.id, { title: `배정할 업무 ${suffix}`, assignee: `이서연${suffix}` }),
    );
    check("담당자가 생긴다", (await db.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId, A.mate.id);
    // ⚠️ **이 한 줄이 오늘 처음 만든 규칙이다.** 예전에는 행만 쓰고 아무도 말하지 않았다.
    check("담당자에게 알림이 갔다", await noticesOf(A.mate.id, "task-assigned"), 1);
    check("넣은 사람에게는 가지 않는다", await noticesOf(A.leader.id, "task-assigned"), 0);

    // **재배정은 조용하다** — 넣을 때 이미 알았다.
    await as(A.asLeader, () =>
      tasks.updateTask(task.id, { title: `배정할 업무 ${suffix}`, assignee: `이서연${suffix}` }),
    );
    check("같은 사람에게 다시 배정하면 알리지 않는다", await noticesOf(A.mate.id, "task-assigned"), 1);

    /* ── 6) 콕 찌르기 ───────────────────────────────────────── */
    console.log("\n콕 찌르기는 담당자에게, 하루에 한 번");
    const pokeTaskRow = await db.task.create({
      data: {
        teamId: A.id,
        title: `찌를 업무 ${suffix}`,
        kind: "team",
        due: "미정",
        createdById: A.leader.id,
        assigneeId: A.mate.id,
      },
    });
    const before = await notices(A.mate.id);
    check("첫 번째는 보낸다", await as(A.asLeader, () => tasks.pokeTask(pokeTaskRow.id)), "sent");
    check("알림이 하나 늘었다", await notices(A.mate.id), before + 1);
    check("두 번째는 이미 보냈다고 말한다", await as(A.asLeader, () => tasks.pokeTask(pokeTaskRow.id)), "already");
    check("알림이 늘지 않는다", await notices(A.mate.id), before + 1);

    // **내가 맡은 일을 나에게 찌르는 일은 아니다.**
    const own = await db.task.create({
      data: {
        teamId: A.id,
        title: `내 업무 ${suffix}`,
        kind: "team",
        due: "미정",
        createdById: A.leader.id,
        assigneeId: A.third.id,
      },
    });
    const selfPoke = await blocked(() => as(A.asThird, () => tasks.pokeTask(own.id)));
    check("자기 업무는 찌를 수 없다", selfPoke.includes("내가 맡은 업무"), true);

    // 담당자가 없으면 대상이 아니다.
    const noOne = await db.task.create({
      data: { teamId: A.id, title: `담당자 없는 업무 ${suffix}`, kind: "team", due: "미정", createdById: A.leader.id },
    });
    const noOnePoke = await blocked(() => as(A.asLeader, () => tasks.pokeTask(noOne.id)));
    check("담당자 없는 일은 찌를 수 없다", noOnePoke.includes("찌를 수 있는 업무가 아닙니다"), true);

    /* ── 7) 마감 수정은 제출함 담당자 또는 팀장 ─────────────── */
    console.log("\n마감 수정은 제출함 담당자 또는 팀장만");
    const B = await makeTeam("마감");
    const box = await db.submissionBox.create({
      data: { teamId: B.id, role: "deck", name: "최종본", due: "10/1", ownerId: B.mate.id },
    });
    const byThird = await blocked(() => as(B.asThird, () => drive.setBoxDeadline(box.id, "2026-10-05T18:00")));
    check("제출함 담당자가 아니면 막힌다", byThird.includes("담당자 또는 팀장"), true);

    // ⚠️ **표시 문자열이 아니라 `dueAt` 이다.** 마감은 기계가 비교할 값 하나에 있다(드라이브
    // 하네스의 용량 검사와 같은 모양). `due` 는 사람이 읽는 문자열이라 **바꾸지 않는다** — 지울
    // 때만 "미정" 으로 맞춘다. 값을 `10/5` 로 주면 조용히 `ok:false` 다(형식이 ISO 이기 때문).
    const dueOfBox = async () =>
      (await db.submissionBox.findUniqueOrThrow({ where: { id: box.id } })).dueAt;
    check("앉은 값이 그대로다", await dueOfBox(), null);

    const badValue = await as(B.asMate, () => drive.setBoxDeadline(box.id, "10/5"));
    check("형식이 안 맞으면 조용히 실패한다", badValue.ok, false);
    check("그래도 값은 그대로다", await dueOfBox(), null);

    await as(B.asMate, () => drive.setBoxDeadline(box.id, "2026-10-05T18:00"));
    check("제출함 담당자는 된다", (await dueOfBox())?.toISOString().slice(0, 10), "2026-10-05");
    await as(B.asLeader, () => drive.setBoxDeadline(box.id, "2026-10-08T18:00"));
    check("팀장도 된다", (await dueOfBox())?.toISOString().slice(0, 10), "2026-10-08");

    // **변경 이력이 남는지** — 화면이 "이 제출함의 마감을 바꾼 사람" 을 말할 수 있어야 한다.
    const historyCount = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM "DeadlineChange" WHERE "boxId" = ${box.id}`;
    check("마감을 바꾼 기록이 남는다", Number(historyCount[0]?.n ?? 0), 2);
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
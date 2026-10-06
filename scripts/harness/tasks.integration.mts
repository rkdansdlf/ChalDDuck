/**
 * 업무 관리 액션 검사 (실제 DB · 실제 권한 · 기여 연동 · 콕 찌르기)
 *
 * ## 검사하는 것
 *
 * 1. **addTask** — 만든 사람이 주인(`createdById`)으로 남고, 마감과 정규값(`dueAt`)이 생성된다.
 * 2. **updateTask 권한** — 만든 사람과 팀장만 고칠 수 있고, 제3자 팀원은 거절된다.
 *    - 담당자 변경 시 새 담당자에게 `task-assigned` 알림이 발송된다.
 * 3. **cycleTaskStatus 순환 & 기여 연동** — 상태는 `todo` → `doing` → `done` → `todo` 로 돈다.
 *    - 남이 넣은 업무를 제3자가 임의로 닫거나 열 수 없다.
 *    - `done` 전환 시 `ContribRecord` 자동 생성, 되돌릴 때 자동 제거된다.
 * 4. **pokeTask 콕 찌르기** — 자기 자신은 찌를 수 없고, 팀원은 하루 한 번만 보낼 수 있다.
 *    - 오늘 두 번째 찌르기는 `"already"` 로 조용히 넘어가고 알림을 다시 보내지 않는다.
 * 5. **addTasksFromClerk** — 서기 후보가 일괄 생성되고 확인한 사람이 주인으로 등록된다.
 *
 *   npm run test:tasks
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
  const tasks = await import("../../src/server/actions/tasks.js");

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
    const team = await db.team.create({
      data: {
        name: `업무검사 ${label} ${suffix}`,
        course: "검증",
        code: `TK-${randomUUID().slice(0, 6).toUpperCase()}`,
      },
    });
    teamIds.push(team.id);

    const leader = await db.member.create({
      data: { teamId: team.id, name: `팀장${suffix}`, isLeader: true },
    });
    const mateA = await db.member.create({
      data: { teamId: team.id, name: `동료A${suffix}` },
    });
    const mateB = await db.member.create({
      data: { teamId: team.id, name: `동료B${suffix}` },
    });

    const token = async (memberId: string) => {
      const t = randomUUID();
      await db.session.create({
        data: { token: t, memberId, expiresAt: new Date(Date.now() + 3600_000) },
      });
      return t;
    };

    return {
      team,
      leader,
      mateA,
      mateB,
      leaderToken: await token(leader.id),
      mateAToken: await token(mateA.id),
      mateBToken: await token(mateB.id),
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

  try {
    console.log("\n업무 관리 액션 검사 (실제 DB · 권한 · 상태 순환 · 콕 찌르기)");

    /* ── 1) 업무 생성 (addTask) ───────────────────────────────── */
    console.log("\n업무 생성: 만든 사람이 주인이 된다");
    const T1 = await makeTeam("생성");

    await as(T1.mateAToken, () =>
      tasks.addTask("team", "1차 발표자료 초안 작성", { due: "2026-10-15" }),
    );

    const createdTask = await db.task.findFirst({
      where: { teamId: T1.team.id, title: "1차 발표자료 초안 작성" },
    });
    check("업무가 DB 에 생성되었다", Boolean(createdTask), true);
    check("만든 사람이 주인(createdById)으로 기록된다", createdTask?.createdById, T1.mateA.id);
    check("초기 상태는 todo 다", createdTask?.status, "todo");
    check("기한 문자열이 저장된다", createdTask?.due, "2026-10-15");
    check("기한 시각(dueAt)이 파싱되어 저장된다", createdTask?.dueAt instanceof Date, true);

    /* ── 2) 업무 수정 및 권한 (updateTask) ───────────────────── */
    console.log("\n업무 수정: 만든 사람과 팀장만 고칠 수 있고 알림이 간다");
    if (!createdTask) throw new Error("업무 생성 실패");

    // 제3자(동료B)가 수정 시도 -> 실패해야 함
    let thirdPartyBlocked = false;
    try {
      await as(T1.mateBToken, () =>
        tasks.updateTask(createdTask.id, { title: "동료B가 멋대로 바꾼 제목" }),
      );
    } catch (err: unknown) {
      thirdPartyBlocked = err instanceof Error && err.message.includes("남이 넣은 업무라");
    }
    check("제3자 팀원의 수정은 거절된다", thirdPartyBlocked, true);

    // 만든 사람(동료A)이 수정 -> 성공
    await as(T1.mateAToken, () =>
      tasks.updateTask(createdTask.id, {
        title: "1차 발표자료 최종본 작성",
        assignee: T1.mateB.name,
      }),
    );
    const updatedByCreator = await db.task.findUnique({ where: { id: createdTask.id } });
    check("만든 사람은 제목을 고칠 수 있다", updatedByCreator?.title, "1차 발표자료 최종본 작성");
    check("담당자가 동료B로 지정되었다", updatedByCreator?.assigneeId, T1.mateB.id);

    // 동료B에게 task-assigned 알림이 생성되었는지 확인
    const assignNotification = await db.notification.findFirst({
      where: { memberId: T1.mateB.id, kind: "task-assigned" },
    });
    check("새 담당자에게 배정 알림이 발송되었다", Boolean(assignNotification), true);

    // 팀장이 수정 -> 성공
    await as(T1.leaderToken, () =>
      tasks.updateTask(createdTask.id, {
        title: "1차 발표자료 최종본 검토",
        assignee: T1.mateB.name,
        due: "2026-10-18",
      }),
    );
    const updatedByLeader = await db.task.findUnique({ where: { id: createdTask.id } });
    check("팀장은 남이 넣은 업무도 고칠 수 있다", updatedByLeader?.title, "1차 발표자료 최종본 검토");

    /* ── 3) 상태 순환 및 기여도 자동 연동 (cycleTaskStatus) ──── */
    console.log("\n상태 순환: todo → doing → done → todo 및 기여도 연동");

    // 제3자(동료A는 담당자가 아니고, 동료B가 담당자이나 넣은 사람은 동료A)
    // 만든 사람(동료A)이나 팀장(leader)이 상태를 바꿀 수 있음. 제3자 검증을 위해 다른 새 팀원 기준 테스트:
    // T1.leader(팀장) 또는 T1.mateA(만든사람)은 가능, 다른 멤버는 불가
    const mateC = await db.member.create({
      data: { teamId: T1.team.id, name: `동료C${suffix}` },
    });
    const tokenC = randomUUID();
    await db.session.create({
      data: { token: tokenC, memberId: mateC.id, expiresAt: new Date(Date.now() + 3600_000) },
    });

    let cycleBlocked = false;
    try {
      await as(tokenC, () => tasks.cycleTaskStatus(createdTask.id));
    } catch (err: unknown) {
      cycleBlocked = err instanceof Error && err.message.includes("상태를 바꿀 수 없습니다");
    }
    check("무관한 팀원의 상태 변경은 거절된다", cycleBlocked, true);

    // 1단계: todo -> doing
    await as(T1.mateAToken, () => tasks.cycleTaskStatus(createdTask.id));
    const taskDoing = await db.task.findUnique({ where: { id: createdTask.id } });
    check("첫 클릭은 doing 으로 변경된다", taskDoing?.status, "doing");

    // 2단계: doing -> done
    await as(T1.mateAToken, () => tasks.cycleTaskStatus(createdTask.id));
    const taskDone = await db.task.findUnique({ where: { id: createdTask.id } });
    check("두 번째 클릭은 done 으로 변경된다", taskDone?.status, "done");

    // done 이 되면 ContribRecord 에 자동 기록이 남아야 한다
    const contribDone = await db.contribRecord.findFirst({
      where: { memberId: T1.mateB.id, originType: "task", originId: createdTask.id },
    });
    check("done 시점에 담당자의 기여 기록이 자동 생성된다", Boolean(contribDone), true);

    // 3단계: done -> todo (되돌리기)
    await as(T1.mateAToken, () => tasks.cycleTaskStatus(createdTask.id));
    const taskBackTodo = await db.task.findUnique({ where: { id: createdTask.id } });
    check("세 번째 클릭은 todo 로 복귀한다", taskBackTodo?.status, "todo");

    // todo 로 돌아가면 기여 기록이 자동으로 지워져야 한다
    const contribRemoved = await db.contribRecord.findFirst({
      where: { memberId: T1.mateB.id, originType: "task", originId: createdTask.id },
    });
    check("todo 복귀 시 기여 기록이 자동으로 취소(삭제)된다", contribRemoved, null);

    /* ── 4) 콕 찌르기 (pokeTask) ──────────────────────────────── */
    console.log("\n콕 찌르기: 자기는 못 찌르고 하루 한 번만 된다");

    // taskBackTodo 의 담당자는 동료B
    // 동료B 본인이 자기를 찌르면 에러
    let selfPokeBlocked = false;
    try {
      await as(T1.mateBToken, () => tasks.pokeTask(createdTask.id));
    } catch (err: unknown) {
      selfPokeBlocked = err instanceof Error && err.message.includes("내가 맡은 업무입니다");
    }
    check("자신이 담당자인 업무는 찌를 수 없다", selfPokeBlocked, true);

    // 동료A가 동료B의 업무를 찌름 -> 'sent'
    const pokeResult1 = await as(T1.mateAToken, () => tasks.pokeTask(createdTask.id));
    check("첫 콕 찌르기는 sent 로 성공한다", pokeResult1, "sent");

    // Poke 테이블 및 알림 생성 확인
    const pokeCount = await db.poke.count({ where: { taskId: createdTask.id, senderId: T1.mateA.id } });
    check("Poke 기록이 정확히 1건 남는다", pokeCount, 1);

    const pokeNotification = await db.notification.findFirst({
      where: { memberId: T1.mateB.id, kind: "poke" },
    });
    check("담당자에게 콕 찌르기 알림이 전달되었다", Boolean(pokeNotification), true);

    // 같은 날 같은 사람이 다시 찌르면 -> 'already' (중복 찌르기 방지)
    const pokeResult2 = await as(T1.mateAToken, () => tasks.pokeTask(createdTask.id));
    check("같은 날 두 번째 찌르기는 already 로 제한된다", pokeResult2, "already");

    const pokeCountAfter = await db.poke.count({ where: { taskId: createdTask.id, senderId: T1.mateA.id } });
    check("중복 찌르기 시 Poke 행이 추가되지 않는다", pokeCountAfter, 1);

    /* ── 5) AI 서기 후보 업무 반영 (addTasksFromClerk) ────────── */
    console.log("\n서기 연계: AI 서기 후보가 일괄 생성되고 확인자가 주인이 된다");
    const T2 = await makeTeam("서기연계");

    await as(T2.leaderToken, () =>
      tasks.addTasksFromClerk([
        { title: "회의록 기반 1번 액션 아이템", due: "2026-10-20", assignee: T2.mateA.name },
        { title: "회의록 기반 2번 액션 아이템", due: "미정", assignee: "없는사람" },
      ]),
    );

    const clerkTasks = await db.task.findMany({
      where: { teamId: T2.team.id, source: "clerk" },
      orderBy: { title: "asc" },
    });
    check("서기 후보 2건이 모두 생성되었다", clerkTasks.length, 2);
    check("매칭된 팀원이 담당자로 지정되었다", clerkTasks[0]?.assigneeId, T2.mateA.id);
    check("없는 이름은 담당자 미정(null)으로 남는다", clerkTasks[1]?.assigneeId, null);
    check("확인한 팀장이 만든 사람(createdById)으로 등록된다", clerkTasks[0]?.createdById, T2.leader.id);

    console.log(`\n모두 통과 — ${passed}건 통과, ${failed}건 실패\n`);
    return failed === 0;
  } finally {
    session.clearAll();
    // 생성된 테스트 팀 정리
    for (const tid of teamIds) {
      await db.team.deleteMany({ where: { id: tid } });
    }
  }
}
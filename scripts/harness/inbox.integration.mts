/**
 * 알림·배지·밥 모 결정 검사 — **누구의 것인가** 를 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 네 액션이 미검증이었다(`npm run audit:actions` 기준 "없음"). 공통점이 하나다 — **다 읽거나
 * 쓰는 게 "내 것" 인지 그게 규칙의 전부다.**
 *
 * 읽으며 위험한 곳을 셌다 —
 *
 * - **읽음은 내 알림에만 찍을 수 있다.** 조건에 `memberId` 를 **함께** 넣는 이유다. 알림 `id`
 *   만 알면 남의 알림을 읽음으로 바꿀 수 있으면 안 된다.
 * - **목록도 내 것만** — 그리고 **50개까지** 본다. 그 이상은 조용히 잘린다.
 * - **배지 숫자는 누군가의 수다.** 팀원이 방금 한 일이 내가 아무것도 누르지 않아도 배지에
 *   나타나야 한다 — 그래서 **내 요청 없이 다시 세는 길**이 있다.
 * - **밥 모 결정은 팀에 하나다.** 도구 이름이 목록에 없으면 화면에 없는 이름(`"제빵기 로
 *   정했습니다"`)이 남고 **되돌릴 수 없다.**
 *
 * ## 검사하는 것
 *
 * 1. **남의 알림은 읽음으로 못 바꾼다** — 내 것만 바뀐다
 * 2. id를 주면 **그 것만**, 주지 않으면 **내 읽지 않은 것 전부**
 * 3. **목록은 내 것만** newest-first · 읽지 않은 수가 정확하다
 * 4. 배지는 **팀원이 한 일이 나에게 보이고** · 읽으면 줄어든다
 * 5. 밥 모를 정하면 **팀에 하나** · **도구는 목록에 있는 것만** · 알림이 간다
 * 6. 다시 정하면 **덮어써지고** 알림에 "대신" 이 남는다
 *
 *   npm run test:inbox
 */
import { randomUUID } from "node:crypto";

type Session = { as(token: string): void; nobody(): void; reset(): void; clearAll(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const notifications = await import("../../src/server/actions/notifications.js");
  const nav = await import("../../src/server/actions/nav.js");
  const social = await import("../../src/server/actions/social.js");
  const { RANDOM_TOOLS } = await import("../../src/data/catalog.js");

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
      data: { name: `알림 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(t.id);
    const leader = await db.member.create({ data: { teamId: t.id, name: `김민준${suffix}`, isLeader: true } });
    const mate = await db.member.create({ data: { teamId: t.id, name: `이서연${suffix}` } });
    const token = async (memberId: string) => {
      const tk = randomUUID();
      await db.session.create({ data: { token: tk, memberId, expiresAt: new Date(Date.now() + 3600_000) } });
      return tk;
    };
    return { id: t.id, leader, mate, asLeader: await token(leader.id), asMate: await token(mate.id) };
  }

  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    if (typeof token !== "string") throw new Error("세션 토큰이 아닙니다");
    session.as(token);
    try { return await work(); } finally { session.nobody(); }
  }

  async function blocked(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
      return "(막지 않음)";
    } catch (e) {
      return (e as Error).message;
    }
  }

  /** 알림을 **직접** 심는다 — 어떤 행위가 알림을 보내는지 대신 **결과** 를 본다. */
  const seed = (memberId: string, title: string, minutesAgo = 0) =>
    db.notification.create({
      data: {
        memberId,
        kind: "who-does-it",
        title,
        body: "",
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
      },
      select: { id: true, readAt: true },
    });

  try {
    /* ── 1) 읽음은 내 알림에만 ─────────────────────────────── */
    console.log("\n읽음은 내 알림에만 찍힌다");
    const A = await makeTeam("읽음");
    const mine = await seed(A.leader.id, "내 알림");
    const yours = await seed(A.mate.id, "남의 알림");

    // ⚠️ **남의 알림 id 를 준다** — "내 것만" 이라는 말이 **없어야** 통과하는 자리다.
    await as(A.asLeader, () => notifications.markNotificationsRead([mine.id, yours.id]));
    check("내 알림은 읽음이다", (await db.notification.findUnique({ where: { id: mine.id } }))?.readAt !== null, true);
    check("남의 알림은 그대로다", (await db.notification.findUnique({ where: { id: yours.id } }))?.readAt, null);

    const mine2 = await seed(A.leader.id, "둘째");
    const mine3 = await seed(A.leader.id, "셋째");
    await as(A.asLeader, () => notifications.markNotificationsRead([mine2.id]));
    check("id를 주면 그 것만 읽는다", (await db.notification.findUnique({ where: { id: mine2.id } }))?.readAt !== null, true);
    check("나머지는 읽지 않은 채다", (await db.notification.findUnique({ where: { id: mine3.id } }))?.readAt, null);

    // **이미 읽은 것을 다시 찍어도 시각이 바뀌지 않아야** — 아니라면 "몇 번 읽었는지" 가 된다.
    const stamp = (await db.notification.findUnique({ where: { id: mine2.id } }))?.readAt;
    await as(A.asLeader, () => notifications.markNotificationsRead([mine2.id]));
    check("읽은 것은 다시 찍히지 않는다", (await db.notification.findUnique({ where: { id: mine2.id } }))?.readAt, stamp);

    const before = await db.notification.count({ where: { memberId: A.leader.id, readAt: null } });
    await as(A.asLeader, () => notifications.markNotificationsRead());
    check("id를 주지 않으면 내 읽지 않은 것 전부", await db.notification.count({ where: { memberId: A.leader.id, readAt: null } }), 0);
    check("남의 읽지 않은 것은 그대로다", await db.notification.count({ where: { memberId: A.mate.id, readAt: null } }), 1);
    check("아무 것도 남지 않았다", before, 1);

    /* ── 2) 목록은 내 것만 ─────────────────────────────────── */
    console.log("\n목록은 내 것만, 최신순으로");
    const old = await seed(A.leader.id, "먼저 온 것", 10);
    const fresh = await seed(A.leader.id, "나중에 온 것", 1);
    await as(A.asLeader, () => notifications.markNotificationsRead());
    const box = await as(A.asLeader, () => notifications.pollNotifications());
    check("목록이 온다", box.items.length > 0, true);
    // 순서는 **상대적** 으로 본다 — "맨 위" 를 절대 비교하면 앞선 시나리오가 남긴 알림이
    // 섞이고(더 최신이다) 매번 깨진다. "새 것이 먼저" 가 맞으면 충분하다.
    const atOld = box.items.findIndex((i) => i.id === old.id);
    const atFresh = box.items.findIndex((i) => i.id === fresh.id);
    check("최신이 먼저다", atOld > atFresh, true);
    check("이전 것도 안 잘린다", box.items.map((i) => i.id).includes(old.id), true);
    check("읽지 않은 수가 맞다", box.unread, 0);
    check("목록은 내 것만", box.items.every((i) => i.title !== "남의 알림"), true);

    /* ── 3) 배지 ───────────────────────────────────────────── */
    console.log("\n배지는 누군가의 일을 세어 준다");
    const B = await makeTeam("배지");
    const badges0 = await as(B.asLeader, () => nav.pollNavBadges());
    check("처음엔 조용하다", badges0.team, 0);
    check("읽지 않은 알림 수가 배지로 온다", badges0.notifications, 0);

    // **내가 아무것도 하지 않았는데** 배지가 올라야 한다 — 팀원이 한 일이 내게 보여야 한다.
    await seed(B.leader.id, "나한테 온 알림");
    const badges1 = await as(B.asLeader, () => nav.pollNavBadges());
    check("내가 안 한 일이 배지에 오른다", badges1.notifications, 1);

    // **남의 읽지 않은 알림은 배지에 섞이면 안 된다** — 내가 읽지 않은 것이지 남 것이 아니다.
    await seed(B.mate.id, "남한테 온 알림");
    const badges2 = await as(B.asLeader, () => nav.pollNavBadges());
    check("남의 알림은 섞이지 않는다", badges2.notifications, 1);

    await as(B.asLeader, () => notifications.markNotificationsRead());
    const badges3 = await as(B.asLeader, () => nav.pollNavBadges());
    check("읽으면 배지가 내려간다", badges3.notifications, 0);
    check("읽는 것은 내 것만", await db.notification.count({ where: { memberId: B.mate.id, readAt: null } }), 1);

    // **사람을 세는 자리는 parts 로 나뉜다** — 합계만 보면 어느 자리인지 알 수 없다.
    check("세부는 나뉘어 나온다", typeof badges3.parts.clashes, "number");

    /* ── 4) 밥 모 결정 ──────────────────────────────────────── */
    console.log("\n밥 모 결정은 팀에 하나다");
    const C = await makeTeam("밥");
    const tool = RANDOM_TOOLS[0]!.name;
    const picked = await as(C.asLeader, () => social.spinMenu(tool));
    check("정해진다", typeof picked === "string" && picked.length > 0, true);
    const team1 = await db.team.findUnique({ where: { id: C.id } });
    check("팀에 하나다", team1?.menuPick, picked);
    check("도구도 남는다", team1?.menuTool, tool);
    check("정한 사람이 남는다", team1?.menuDrawnBy, C.leader.id);
    check("언제 정했는지 남는다", team1?.menuPickedAt !== null, true);
    check("팀에 알림이 간다", await db.notification.count({ where: { memberId: C.mate.id, kind: "who-does-it" } }), 1);

    const picked2 = await as(C.asLeader, () => social.spinMenu(tool));
    check("다시 정하면 덮어쓴다", (await db.team.findUnique({ where: { id: C.id } }))?.menuPick, picked2);
    const notifyBody = await db.notification.findFirst({
      where: { memberId: C.mate.id, kind: "who-does-it" },
      orderBy: { createdAt: "desc" },
      select: { body: true },
    });
    // **"몇 명이 같은 걸로 돌린 거지?" 하고 되묻는다** — 앞선 것이 남아야 대답할 수 있다.
    check("알림에 도구가 남는다", (notifyBody?.body ?? "").includes(tool), true);
    check("갈아탄 것이 보인다", (notifyBody?.body ?? "").includes("대신"), true);

    // ⚠️ **도구 이름이 목록에 없으면 막아야 한다** — 저장되면 화면에 없는 이름이 남고 되돌릴 수 없다.
    check(
      "모르는 도구는 거절한다",
      (await blocked(() => as(C.asLeader, () => social.spinMenu("없는도구")))).includes("모르는 추첨 도구"),
      true,
    );
    check("거절해도 팀의 것은 그대로다", (await db.team.findUnique({ where: { id: C.id } }))?.menuPick, picked2);

    /* ── 5) 모르는 값 ──────────────────────────────────────── */
    console.log("\n모르는 아이디는 조용히 무시된다");
    await as(C.asLeader, () => notifications.markNotificationsRead(["없는아이디"]));
    check("없어도 예외가 없다", true, true);

    /* ── 6) 푸시 구독 관리 ──────────────────────────────────── */
    console.log("\n푸시 구독 관리");
    const push = await import("../../src/server/actions/push.js");
    const subCount0 = await as(C.asLeader, () => push.countSubscriptions());
    check("초기 푸시 구독 수는 0", subCount0, 0);

    const fakeSub = {
      endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
      keys: { p256dh: "key-p256dh", auth: "auth-secret" },
    };
    const saveRes = await as(C.asLeader, () => push.savePushSubscription(fakeSub));
    check("푸시 구독 저장 시도", saveRes === "saved" || saveRes === "not-configured", true);

    const clearRes = await as(C.asLeader, () => push.clearPushSubscription(fakeSub.endpoint));
    check("푸시 구독 해제 반환", typeof clearRes.cleared, "number");
  } finally {
    for (const id of teamIds) {
      await db.pushSubscription.deleteMany({ where: { member: { teamId: id } } });
      await db.notification.deleteMany({ where: { member: { teamId: id } } });
      await db.meetingNote.deleteMany({ where: { teamId: id } });
      await db.meetingProposal.deleteMany({ where: { teamId: id } });
      await db.member.deleteMany({ where: { teamId: id } });
      await db.team.delete({ where: { id } }).catch(() => {});
    }
    await db.$disconnect();
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}

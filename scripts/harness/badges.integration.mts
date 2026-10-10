/**
 * 알림함·배지 검사 — **모든 화면이 폴링으로 읽는** 숫자와 목록이 규칙대로 나오는지 서버 액션 경계를
 * 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * `pollNavBadges`·`pollNotifications`·`markNotificationsRead`·`markDriveSeen` 은 `audit:actions` 에서
 * "없음"이었다. 그런데 이 길은 **모든 탭이 몇십 초마다 부른다.** 틀리면 한 화면의 문제가 아니라
 * 사용자가 앱을 열 때마다 보는 숫자가 거짓이 된다. 읽으며 위험한 곳을 셌다 —
 *
 * - **남의 알림이 섞이지 않는다.** 알림은 `memberId` 한 조건이 전부다.
 * - **읽음은 내 것에만 찍힌다.** 알림 id 만 알면 남의 알림을 읽음으로 바꿀 수 있으면 안 된다.
 * - **빈 목록은 "전부"가 아니다.** `markNotificationsRead([])` 가 모든 알림을 읽음으로 바꾸면,
 *   화면이 거른 결과가 우연히 비었을 때 **안 읽은 알림이 통째로 사라진다.**
 * - **목록 창(50건)과 안 읽은 수는 다른 범위다.** 63건이 쌓였을 때 숫자는 63, 목록은 50건이어야 한다.
 * - **배지는 화면과 같은 답을 내야 한다.** 이미 확정된 회의, 이미 동의한 추첨, 이미 확인한 기록,
 *   내가 쓴 메시지·내가 올린 버전은 "내 할 일"이 아니다. 그리고 **다른 팀의 일은 세지 않는다.**
 * - **팀장만 승인 대기를 센다.**
 *
 * ## 검사하는 것
 *
 * 1. 알림 목록 — 내 것만 · 최신순 · 50건 창과 전체 안 읽은 수 · 세션 없으면 거절
 * 2. 읽음 — 내 것에만 · 이미 읽은 시각은 그대로 · 없는 id 는 조용히 · 빈 목록은 아무것도 안 바꾼다
 * 3. 배지 — 회의(응답 전/후·마감 뒤) · 채팅(DM 만·내가 쓴 것 제외·남의 DM 제외) · 기여(내 대기/
 *    내가 확인할 것) · 승인(팀장만) · 역할 겹침과 동의(서로 빼서 센다) · 합 · 팀 경계
 * 4. 드라이브 — 남이 올린 버전만 · 들어오기 전 것은 세지 않는다 · 열었다고 적으면 0 으로 돌아간다
 *
 * `test:inbox`(알림·배지·밥 메뉴 결정)와 겹치지 않는 쪽 — 이쪽은 **배지 숫자가 화면과 같은 답을 내는가**와
 * **읽음 처리의 경계**(빈 목록·50건 창·이미 읽은 시각)를 본다.
 *
 *   npm run test:badges
 */
import { randomUUID } from "node:crypto";

type Session = { as(token: string): void; nobody(): void; reset(): void; clearAll(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const notifications = await import("../../src/server/actions/notifications.js");
  const nav = await import("../../src/server/actions/nav.js");
  const drive = await import("../../src/server/actions/drive.js");
  const { dmThreadKey } = await import("../../src/data/api.js");

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
      data: { name: `알림 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(team.id);
    const mk = (name: string, isLeader = false) =>
      db.member.create({ data: { teamId: team.id, name: `${name}${suffix}`, isLeader } });
    const leader = await mk("김민준", true);
    const mate = await mk("이서연");
    const third = await mk("박도윤");
    const token = async (memberId: string) => {
      const t = randomUUID();
      await db.session.create({ data: { token: t, memberId, expiresAt: new Date(Date.now() + 3600_000) } });
      return t;
    };
    return {
      id: team.id,
      leader,
      mate,
      third,
      mk,
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

  const badges = (token: string) => as(token, () => nav.pollNavBadges());
  const note = (memberId: string, over: Record<string, unknown> = {}) =>
    ({ memberId, kind: "poke", title: "알림", body: "내용", ...over }) as never;

  try {
    /* ── 1) 알림 목록 ──────────────────────────────────────── */
    console.log("\n알림 목록은 내 것만, 최신순으로, 안 읽은 수는 전체 기준");
    const A = await makeTeam("목록");
    const B = await makeTeam("이웃");

    check("세션이 없으면 읽을 수 없다", await blocked(() => notifications.pollNotifications()), "로그인이 필요합니다.");
    const empty = await as(A.asLeader, () => notifications.pollNotifications());
    check("알림이 없으면 비어 있다", [empty.items, empty.unread], [[], 0]);

    const t0 = Date.now() - 3600_000;
    await db.notification.createMany({
      data: [
        note(A.leader.id, { title: "첫째", body: "b1", href: "/x", createdAt: new Date(t0) }),
        note(A.leader.id, { title: "둘째", createdAt: new Date(t0 + 1000), readAt: new Date() }),
        note(A.leader.id, { title: "셋째", createdAt: new Date(t0 + 2000) }),
        note(A.mate.id, { title: "팀원의 것" }),
        note(B.leader.id, { title: "다른 팀의 것" }),
      ],
    });
    const mine = await as(A.asLeader, () => notifications.pollNotifications());
    check("내 알림만 온다", mine.items.map((n) => n.title), ["셋째", "둘째", "첫째"]);
    check("안 읽은 수는 읽은 것을 뺀다", mine.unread, 2);
    check("읽음 여부가 항목에 붙는다", mine.items.map((n) => n.read), [false, true, false]);
    check("본문·이동 경로가 그대로 온다", [mine.items[2]?.body, mine.items[2]?.href], ["b1", "/x"]);
    check("시각이 문장으로 온다", typeof mine.items[0]?.when === "string" && mine.items[0].when.length > 0, true);
    const mateView = await as(A.asMate, () => notifications.pollNotifications());
    check("팀원은 자기 것만 본다", mateView.items.map((n) => n.title), ["팀원의 것"]);

    // 목록 창은 50건이지만 "안 읽은 N건" 은 전체 기준이다 — 두 숫자가 어긋나면 어느 쪽을 믿을지 모른다.
    const C = await makeTeam("창");
    await db.notification.createMany({
      data: Array.from({ length: 55 }, (_, i) =>
        note(C.leader.id, { title: `n${i}`, createdAt: new Date(t0 + i * 1000) }),
      ),
    });
    const windowed = await as(C.asLeader, () => notifications.pollNotifications());
    check("목록은 최근 50건이다", windowed.items.length, 50);
    check("가장 최근 것이 맨 위다", windowed.items[0]?.title, "n54");
    check("안 읽은 수는 창 밖까지 센다", windowed.unread, 55);
    check("탭 배지의 알림 수와 같은 숫자다", (await badges(C.asLeader)).notifications, 55);

    /* ── 2) 읽음 처리 ──────────────────────────────────────── */
    console.log("\n읽음은 내 알림에만 찍히고, 빈 목록은 아무것도 바꾸지 않는다");
    const D = await makeTeam("읽음");
    await db.notification.createMany({
      data: [
        note(D.leader.id, { title: "내 1" }),
        note(D.leader.id, { title: "내 2" }),
        note(D.leader.id, { title: "내 3" }),
        note(D.mate.id, { title: "팀원 1" }),
        note(D.mate.id, { title: "팀원 2" }),
      ],
    });
    const idOf = async (memberId: string, title: string) =>
      (await db.notification.findFirstOrThrow({ where: { memberId, title }, select: { id: true } })).id;
    const unreadOf = (memberId: string) => db.notification.count({ where: { memberId, readAt: null } });
    const mate1 = await idOf(D.mate.id, "팀원 1");
    const mine1 = await idOf(D.leader.id, "내 1");
    const mine2 = await idOf(D.leader.id, "내 2");

    check("세션이 없으면 읽음 처리할 수 없다", await blocked(() => notifications.markNotificationsRead()), "로그인이 필요합니다.");

    await as(D.asLeader, () => notifications.markNotificationsRead([mine1, mate1]));
    check("내 알림은 읽음이 된다", (await db.notification.findUniqueOrThrow({ where: { id: mine1 } })).readAt !== null, true);
    check("남의 알림 id 를 섞어 보내도 남의 알림은 그대로다", (await db.notification.findUniqueOrThrow({ where: { id: mate1 } })).readAt, null);
    check("내 나머지는 그대로 안 읽음이다", await unreadOf(D.leader.id), 2);

    const stamp = (await db.notification.findUniqueOrThrow({ where: { id: mine1 } })).readAt!.getTime();
    await new Promise((r) => setTimeout(r, 30));
    await as(D.asLeader, () => notifications.markNotificationsRead([mine1]));
    check(
      "이미 읽은 알림의 읽은 시각은 바뀌지 않는다",
      (await db.notification.findUniqueOrThrow({ where: { id: mine1 } })).readAt!.getTime(),
      stamp,
    );

    check("없는 id 는 조용히 지나간다", await blocked(() => as(D.asLeader, () => notifications.markNotificationsRead(["없는아이디"]))), "(막지 않음)");
    check("없는 id 는 아무것도 바꾸지 않는다", await unreadOf(D.leader.id), 2);

    // **빈 목록은 "전부" 가 아니다.** 화면이 거른 결과가 우연히 비었을 때 안 읽은 알림이 통째로 사라지면 안 된다.
    await as(D.asLeader, () => notifications.markNotificationsRead([]));
    check("빈 목록은 아무것도 읽음으로 바꾸지 않는다", await unreadOf(D.leader.id), 2);

    await as(D.asLeader, () => notifications.markNotificationsRead());
    check("목록을 안 주면 내 것 전부를 읽음으로 한다", await unreadOf(D.leader.id), 0);
    check("그래도 팀원의 것은 그대로다", await unreadOf(D.mate.id), 2);
    check("읽은 뒤 안 읽은 수가 0이다", (await as(D.asLeader, () => notifications.pollNotifications())).unread, 0);
    check("읽음 처리 뒤 한 건을 더 읽어도 오류가 없다", await blocked(() => as(D.asLeader, () => notifications.markNotificationsRead([mine2]))), "(막지 않음)");

    /* ── 3) 배지 ───────────────────────────────────────────── */
    console.log("\n세션이 없으면 배지를 읽을 수 없다");
    check("세션 없음", await blocked(() => nav.pollNavBadges()), "로그인이 필요합니다.");

    const E = await makeTeam("배지");
    const quiet = await badges(E.asLeader);
    check("아무 일도 없으면 모두 0이다", [quiet.team, quiet.cal, quiet.chat, quiet.drive, quiet.notifications], [0, 0, 0, 0, 0]);

    /* 3-1) 회의 */
    console.log("\n일정 배지는 내가 응답할 제안이 있을 때만 1이다");
    const slot = await db.meetingSlot.create({
      data: { teamId: E.id, day: "수", time: "18:00 – 19:00", available: 3, total: 3, weekKey: "this" },
    });
    const proposal = await db.meetingProposal.create({
      data: {
        teamId: E.id,
        slotId: slot.id,
        proposedById: E.leader.id,
        stage: "proposed",
        activeKey: E.id,
        respondBy: new Date(Date.now() + 3600_000),
      },
    });
    await db.meetingResponse.create({ data: { proposalId: proposal.id, memberId: E.leader.id, agree: true } });
    check("제안자는 이미 찬성했으니 0이다", (await badges(E.asLeader)).cal, 0);
    check("응답 전의 팀원은 1이다", (await badges(E.asMate)).cal, 1);
    check("다른 팀 사람에게는 보이지 않는다", (await badges(B.asLeader)).cal, 0);
    await db.meetingResponse.create({ data: { proposalId: proposal.id, memberId: E.mate.id, agree: true } });
    check("응답한 팀원은 0이 된다", (await badges(E.asMate)).cal, 0);
    check("응답 안 한 셋째는 그대로 1이다", (await badges(E.asThird)).cal, 1);
    // 마감이 지나 반대가 없으면 계산상 확정이다 — 예약 작업이 표를 고치기 전에도 응답하라고 하면 거짓이다.
    await db.meetingProposal.update({ where: { id: proposal.id }, data: { respondBy: new Date(Date.now() - 1000) } });
    check("마감이 지나면 저장된 단계가 proposed 여도 0이다", (await badges(E.asThird)).cal, 0);
    await db.meetingProposal.update({ where: { id: proposal.id }, data: { stage: "confirmed", activeKey: null } });
    check("확정된 회의에는 응답할 것이 없다", (await badges(E.asThird)).cal, 0);

    /* 3-2) 채팅 */
    console.log("\n채팅 배지는 나에게 온 안 읽은 DM 만 센다");
    const msg = (authorId: string, threadKey: string, over: Record<string, unknown> = {}) =>
      ({ teamId: E.id, threadKey, authorId, text: "안녕", whenLabel: "14:02", ...over }) as never;
    const dmMateLeader = dmThreadKey(E.mate.id, E.leader.id);
    await db.message.createMany({
      data: [
        msg(E.mate.id, dmMateLeader),
        msg(E.mate.id, dmMateLeader),
        msg(E.leader.id, dmMateLeader), // 내가 쓴 것 — 세지 않는다
        msg(E.mate.id, "team"), // 단톡방 — 세지 않는다
        msg(E.third.id, dmThreadKey(E.mate.id, E.third.id)), // 남들끼리의 DM — 내 것이 아니다
      ],
    });
    check("팀장은 팀원이 보낸 DM 두 개만 센다", (await badges(E.asLeader)).chat, 2);
    // 팀장이 팀원에게 쓴 한 건도 팀원에게는 받은 DM 이다 — "내가 쓴 것" 은 쓴 사람에게만 빠진다.
    check("팀원은 자기가 쓴 것을 빼고 받은 두 건(팀장·셋째)을 센다", (await badges(E.asMate)).chat, 2);
    check("남들끼리의 DM 은 셋째의 숫자에 들어가지 않는다", (await badges(E.asThird)).chat, 0);
    await db.readMark.create({ data: { memberId: E.leader.id, threadKey: dmMateLeader, readAt: new Date(Date.now() + 1000) } });
    check("방을 읽으면 그 방은 0이 된다", (await badges(E.asLeader)).chat, 0);
    await db.message.create({ data: msg(E.mate.id, dmMateLeader, { createdAt: new Date(Date.now() + 5000) }) });
    check("읽은 뒤에 온 것은 다시 센다", (await badges(E.asLeader)).chat, 1);

    /* 3-3) 기여 기록 */
    console.log("\n팀 배지: 내 기록의 확인 대기 + 내가 확인할 팀원 기록");
    const rec = (memberId: string, state: string, title: string) =>
      db.contribRecord.create({ data: { memberId, kind: "self", title, detail: "내용", source: "self", state } });
    const mineWaiting = await rec(E.leader.id, "pending", "내 기록 대기");
    await rec(E.leader.id, "ok", "내 기록 확정");
    const mateWaiting = await rec(E.mate.id, "pending", "팀원 기록 대기");
    const mateWaiting2 = await rec(E.mate.id, "pending", "팀원 기록 대기 2");
    await rec(E.mate.id, "ok", "팀원 기록 확정");
    await rec(E.mate.id, "disputed", "팀원 기록 이견");
    await rec(B.mate.id, "pending", "다른 팀 기록"); // 세지 않는다
    const leaving = await E.mk("나간이");
    await rec(leaving.id, "pending", "나간 사람 기록");
    await db.member.update({ where: { id: leaving.id }, data: { leftAt: new Date() } });

    let b = await badges(E.asLeader);
    check("내 기록 중 확인 대기는 1이다", b.parts.contribMine, 1);
    check("내가 확인할 팀원 기록은 3이다 (나간 사람 것 포함, 확정·이견·다른 팀 제외)", b.parts.contribAwaitingMe, 3);
    await db.contribConfirm.create({ data: { recordId: mateWaiting.id, memberId: E.leader.id } });
    b = await badges(E.asLeader);
    check("내가 이미 확인한 기록은 빠진다", b.parts.contribAwaitingMe, 2);
    // 팀원 입장: 내 기록(대기 2건)은 내가 확인할 수 없으니 빠지고, 팀장의 대기 1건 + 나간 사람의 1건이 남는다.
    check("내 기록은 내가 확인할 수 없으니 몫에 없다", (await badges(E.asMate)).parts.contribAwaitingMe, 2);
    void mineWaiting;
    void mateWaiting2;

    /* 3-4) 승인 대기 */
    console.log("\n승인 대기는 팀장만 센다");
    const claimant = await E.mk("기기바꿈");
    await db.memberClaim.create({ data: { memberId: claimant.id, token: randomUUID(), status: "pending" } });
    await db.memberClaim.create({ data: { memberId: claimant.id, token: randomUUID(), status: "approved" } });
    await db.joinRequest.create({ data: { teamId: E.id, name: `새내기${suffix}`, token: randomUUID(), status: "pending" } });
    await db.joinRequest.create({ data: { teamId: E.id, name: `거절됨${suffix}`, token: randomUUID(), status: "rejected" } });
    await db.joinRequest.create({ data: { teamId: B.id, name: `이웃${suffix}`, token: randomUUID(), status: "pending" } });
    check("팀장은 대기 중인 기기 변경 1 + 가입 요청 1 을 센다", (await badges(E.asLeader)).parts.approvals, 2);
    check("팀원은 승인 대기를 보지 않는다", (await badges(E.asMate)).parts.approvals, 0);

    /* 3-5) 역할 겹침과 동의 */
    console.log("\n역할 겹침과 동의는 서로 빼서 센다");
    const F = await makeTeam("역할");
    check("희망이 없으면 겹침이 없다", (await badges(F.asLeader)).parts.clashes, 0);
    await db.member.update({ where: { id: F.leader.id }, data: { wantRole: "deck" } });
    check("한 명뿐이면 겹침이 아니다", (await badges(F.asLeader)).parts.clashes, 0);
    await db.member.update({ where: { id: F.mate.id }, data: { wantRole: "deck" } });
    check("두 명이 같은 역할을 고르면 겹침이다", (await badges(F.asLeader)).parts.clashes, 1);
    await db.member.update({ where: { id: F.third.id }, data: { wantRole: "script" } });
    check("다른 역할을 고른 사람은 겹침을 늘리지 않는다", (await badges(F.asLeader)).parts.clashes, 1);

    const consent = await db.roleDrawConsent.create({
      data: { teamId: F.id, role: "deck", tool: "룰렛", proposedById: F.leader.id, respondBy: new Date(Date.now() + 3600_000) },
    });
    const withConsent = await badges(F.asMate);
    check("동의할 제안이 있으면 동의 몫이 1이다", withConsent.parts.consent, 1);
    check("그 역할은 겹침에서 빠진다 — 한 역할이 두 번 세어지지 않는다", withConsent.parts.clashes, 0);
    check("팀 배지는 둘의 합이다", withConsent.team, 1);
    await db.roleConsentResponse.create({ data: { consentId: consent.id, memberId: F.mate.id, agree: true } });
    const agreed = await badges(F.asMate);
    check("이미 동의했으면 동의 몫이 0이다", agreed.parts.consent, 0);
    check("동의한 사람에게는 겹침이 다시 남는다 — 팀 몫이다", agreed.parts.clashes, 1);
    await db.roleDraw.create({ data: { teamId: F.id, role: "deck", tool: "룰렛", winnerId: F.leader.id, accepted: true } });
    check("당사자 수락까지 끝나면 겹침이 아니다", (await badges(F.asMate)).parts.clashes, 0);

    /* 3-6) 합 */
    console.log("\n팀 배지는 몫의 합이다");
    const full = await badges(E.asLeader);
    check(
      "합이 맞는다",
      full.team,
      full.parts.clashes + full.parts.consent + full.parts.contribMine + full.parts.contribAwaitingMe + full.parts.approvals,
    );

    /* ── 4) 드라이브 ───────────────────────────────────────── */
    console.log("\n드라이브 배지는 남이 올린 버전만, 열었다고 적으면 0으로 돌아간다");
    const G = await makeTeam("드라이브");
    const box = await db.submissionBox.create({ data: { teamId: G.id, role: "deck", name: "최종본", due: "10/1" } });
    const file = await db.submittedFile.create({ data: { boxId: box.id, name: "발표", kind: "pptx" } });
    const version = (authorId: string, createdAt: Date, label: string) =>
      db.fileVersion.create({
        data: { fileId: file.id, label, authorId, note: "n", size: "1 B", kind: "pptx", createdAt },
      });
    // 방금 만든 팀원은 가입 시각이 "지금" 이라 조금 전 버전도 "들어오기 전" 이 된다 — 하루 전에 들어온 것으로 한다.
    const joined = new Date(Date.now() - 86_400_000);
    await db.member.updateMany({ where: { teamId: G.id }, data: { joinedAt: joined } });

    await version(G.mate.id, new Date(joined.getTime() - 86_400_000), "v0"); // 들어오기 전 — 세지 않는다
    check("들어오기 전에 올라온 버전은 세지 않는다", (await badges(G.asLeader)).drive, 0);
    // 버전 시각은 **과거**로 둔다 — 미래로 두면 "열었다" 고 적은 시각보다 뒤라 영원히 새 버전으로 센다.
    await version(G.mate.id, new Date(Date.now() - 2000), "v1");
    await version(G.leader.id, new Date(Date.now() - 2000), "v2"); // 내가 올린 것
    check("남이 올린 새 버전만 센다", (await badges(G.asLeader)).drive, 1);
    check("올린 사람 본인에게는 내 것이 빠진다", (await badges(G.asMate)).drive, 1);

    // 다른 팀의 드라이브는 보이지 않는다.
    check("다른 팀 사람은 이 팀의 버전을 세지 않는다", (await badges(B.asLeader)).drive, 0);

    check("세션이 없으면 열었다고 적을 수 없다", await blocked(() => drive.markDriveSeen()), "로그인이 필요합니다.");
    const seen = await as(G.asLeader, () => drive.markDriveSeen());
    check("열었다고 적으면 바로 0을 돌려준다", seen.drive, 0);
    check("다시 읽어도 0이다", (await badges(G.asLeader)).drive, 0);
    check("열지 않은 팀원은 그대로 1이다", (await badges(G.asMate)).drive, 1);
    await new Promise((r) => setTimeout(r, 30));
    await version(G.mate.id, new Date(), "v3");
    check("연 뒤에 올라온 것은 다시 센다", (await badges(G.asLeader)).drive, 1);
    const marks = await db.readMark.count({ where: { memberId: G.leader.id, threadKey: "drive" } });
    check("읽음 표시는 사람당 한 줄이다", marks, 1);
    await as(G.asLeader, () => drive.markDriveSeen());
    check("두 번 열어도 한 줄이다", await db.readMark.count({ where: { memberId: G.leader.id, threadKey: "drive" } }), 1);
  } finally {
    for (const teamId of teamIds) {
      const members = await db.member.findMany({ where: { teamId }, select: { id: true } });
      const memberIds = members.map((m) => m.id);
      await db.contribRecord.deleteMany({ where: { memberId: { in: memberIds } } });
      await db.message.deleteMany({ where: { teamId } });
      await db.meetingProposal.deleteMany({ where: { teamId } });
      await db.meetingSlot.deleteMany({ where: { teamId } });
      await db.roleDraw.deleteMany({ where: { teamId } });
      await db.roleDrawConsent.deleteMany({ where: { teamId } });
      await db.joinRequest.deleteMany({ where: { teamId } });
      await db.submissionBox.deleteMany({ where: { teamId } });
      await db.member.deleteMany({ where: { teamId } });
      await db.team.delete({ where: { id: teamId } }).catch(() => {});
    }
    await db.$disconnect();
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}

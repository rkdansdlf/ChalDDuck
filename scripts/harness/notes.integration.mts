/**
 * 회의록 검사 — **저장·연결·읽기**가 규칙대로 되는지 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * 세 액션이 미검증이었다(`npm run audit:actions` 기준 "없음"). 그런데 회의록은 **기록이 다르면
 * 회의가 없는 것이 된다** — "무슨 일 하기로 했는가" 를 잃는 자리다. 저장은 쉬워 보이지만
 * **같은 회의에 두 번 저장하는 경로**(`upsert`)와 **다른 팀의 회의에 붙는 길**이 있다.
 *
 * 읽으며 위험한 곳을 셌다 —
 *
 * - **`meetingId` 가 주어지면 그 회의가 **내 팀**인지 먼저 본다.** 안 보면 아무 팀의 회의에
 *   회의록을 붙일 수 있다.
 * - **한 회의에 회의록은 하나뿐이다** (`meetingId` 가 unique). 두 번 저장하면 갱신되어야 하고,
 *   갱신은 **만든 사람과 갱신한 사람이 달라질 수 있다** — `createdById` 는 갱신되지 않는다.
 * - **조회도 팀으로 필터링한다.** 회의록은 팀의 회의 내용이라 **남의 팀 것으로 볼 수 없다.**
 * - **제목이 비면 "회의록" 이 된다** · 제목은 100자로 잘리고 · `taskCount` 는 음수가 되지 않는다.
 *
 * ## 검사하는 것
 *
 * 1. 저장하면 팀에 붙고 작성자 이름이 따라 온다 · 제목이 비면 대체된다 · 100자에서 잘린다 ·
 *    `taskCount` 는 음수가 되지 않는다
 * 2. **같은 회의에 다시 저장하면 갱신된다** — 두 줄이 되지 않는다 · 만든 사람은 그대로다
 * 3. **다른 팀의 회의에는 붙일 수 없다**
 * 4. 조회 두 길이 **같은 내용을 돌려주고**, **다른 팀의 것은 보이지 않는다**
 * 5. 없는 회의·없는 회의록은 조용히 `null` 이다
 *
 *   npm run test:notes
 */
import { randomUUID } from "node:crypto";

type Session = { as(token: string): void; nobody(): void; reset(): void; clearAll(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const notes = await import("../../src/server/actions/notes.js");

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
      data: { name: `회의록 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(t.id);
    const leader = await db.member.create({ data: { teamId: t.id, name: `김민준${suffix}`, isLeader: true } });
    const mate = await db.member.create({ data: { teamId: t.id, name: `이서연${suffix}` } });
    const token = async (memberId: string) => {
      const tk = randomUUID();
      await db.session.create({ data: { token: tk, memberId, expiresAt: new Date(Date.now() + 3600_000) } });
      return tk;
    };
    return {
      id: t.id,
      leader,
      mate,
      asLeader: await token(leader.id),
      asMate: await token(mate.id),
    };
  }

  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    if (typeof token !== "string") throw new Error("세션 토큰이 아닙니다");
    session.as(token);
    try { return await work(); } finally { session.nobody(); }
  }

  /**
   * 팀에 속한 **진짜 회의 제안**을 하나 만든다 — 회의록이 붙을 자리다.
   *
   * `MeetingProposal` 에는 `label` 이 **없다.** 설명·제안 대상은 `MeetingSlot` 쪽에 있고
   * 제안은 `slotId` 로 물고 든다. 필드를 지어내면 DB 가 "그런 열 없다" 로 막아 주는데,
   * 그걸 **모르고 넘어가면** 존재하지 않는 필드인 줄 착각한다.
   */
  async function makeProposal(teamId: string) {
    const leader = await db.member.findFirstOrThrow({ where: { teamId, isLeader: true } });
    const slot = await db.meetingSlot.create({
      data: { teamId, day: "2026-10-10", time: "10:00", available: 4, total: 4 },
    });
    return db.meetingProposal.create({
      data: {
        teamId,
        slotId: slot.id,
        proposedById: leader.id,
        stage: "proposed",
        // 동의 마감 시각이 필수다 — 회의 제안은 언제까지 답을 받는지가 붙는다.
        respondBy: new Date(Date.now() + 86_400_000),
      },
      select: { id: true },
    });
  }

  /** 던져진 이유를 문장으로 돌려준다. */
  async function blocked(work: () => Promise<unknown>): Promise<string> {
    try {
      await work();
      return "(막지 않음)";
    } catch (e) {
      return (e as Error).message;
    }
  }

  const noteCount = (teamId: string) => db.meetingNote.count({ where: { teamId } });

  try {
    /* ── 1) 저장하면 팀에 붙는다 ───────────────────────────── */
    console.log("\n회의록은 팀에 붙고 작성자가 따라간다");
    const A = await makeTeam("저장");
    const saved = await as(A.asLeader, () =>
      notes.saveMeetingNote({ title: "  첫 회의  ", rawText: " 원본 ", summary: " 요약 ", taskCount: 3 }),
    );
    check("저장된다", saved.title, "첫 회의");
    check("본문이 잘린다", saved.rawText, "원본");
    check("요약도 잘린다", saved.summary, "요약");
    check("작업 수가 간다", saved.taskCount, 3);
    check("이 팀의 것이 된다", saved.teamId, A.id);
    check("작성자 이름이 따라온다", saved.createdByName, `김민준${suffix}`);
    check("회의 없이도 저장은 된다", saved.meetingId, null);

    const blank = await as(A.asLeader, () => notes.saveMeetingNote({ title: "   ", rawText: "x", summary: "y" }));
    check("제목이 비면 대체된다", blank.title, "회의록");
    check("작업 수가 음수가 되지 않는다", blank.taskCount, 0);
    const negative = await as(A.asLeader, () =>
      notes.saveMeetingNote({ title: "음수", rawText: "x", summary: "y", taskCount: -5 }),
    );
    check("음수를 0 으로 본다", negative.taskCount, 0);
    const long = await as(A.asLeader, () =>
      notes.saveMeetingNote({ title: "가".repeat(200), rawText: "x", summary: "y" }),
    );
    check("제목은 100자에서 잘린다", long.title.length, 100);

    /* ── 2) 같은 회의에 다시 저장하면 갱신 ─────────────────── */
    console.log("\n같은 회의에 다시 저장하면 갱신된다");
    const B = await makeTeam("갱신");
    const proposal = await makeProposal(B.id);
    const before = await noteCount(B.id);
    const first = await as(B.asLeader, () =>
      notes.saveMeetingNote({ meetingId: proposal.id, title: "초안", rawText: "원본", summary: "요약", taskCount: 1 }),
    );
    check("회의에 붙는다", first.meetingId, proposal.id);
    const second = await as(B.asMate, () =>
      notes.saveMeetingNote({ meetingId: proposal.id, title: "고친 초안", rawText: "수정", summary: "고침", taskCount: 2 }),
    );
    // **한 회의에 두 줄이면 안 된다** — 회의록이 두 개면 어느 쪽이 진짜인지 모른다.
    check("한 줄뿐이다", await noteCount(B.id), before + 1);
    check("같은 줄이 고쳐진다", second.id, first.id);
    check("제목이 바뀐다", second.title, "고친 초안");
    check("본문이 바뀐다", second.rawText, "수정");
    check("작업 수가 바뀐다", second.taskCount, 2);
    // **만든 사람은 그대로여야 한다** — 고친 사람이 만든 사람으로 바뀌면 기록이 거짓이 된다.
    check("만든 사람은 그대로다", second.createdById, B.leader.id);
    check("갱신 시각은 뒤로 간다", second.updatedAt >= first.updatedAt, true);

    /* ── 3) 다른 팀의 회의에는 붙일 수 없다 ────────────────── */
    console.log("\n다른 팀의 회의에는 붙일 수 없다");
    const C = await makeTeam("이웃");
    const cProposal = await makeProposal(C.id);
    check(
      "남의 회의에는 붙지 않는다",
      await blocked(() => as(A.asLeader, () => notes.saveMeetingNote({ meetingId: cProposal.id, title: "엉뚱", rawText: "x", summary: "y" }))).then((m) => m.includes("연결할 회의를 찾을 수 없습니다")),
      true,
    );
    check("남의 팀에 줄이 늘지 않는다", await noteCount(C.id), 0);
    check(
      "없는 회의에도 붙지 않는다",
      await blocked(() => as(A.asLeader, () => notes.saveMeetingNote({ meetingId: "없는회의", title: "엉뚱", rawText: "x", summary: "y" }))).then((m) => m.includes("연결할 회의를 찾을 수 없습니다")),
      true,
    );

    /* ── 4) 읽어도 팀 안으로만 ─────────────────────────────── */
    console.log("\n읽어도 자기 팀의 것이지만 보인다");
    const byProposal = await as(B.asMate, () => notes.getMeetingNoteByProposalAction(proposal.id));
    check("제안으로 읽는다", byProposal?.title, "고친 초안");
    check("작성자 이름도 온다", byProposal?.createdByName, `김민준${suffix}`);
    const byId = await as(B.asMate, () => notes.getMeetingNoteAction(second.id));
    check("아이디로 읽는다", byId?.rawText, "수정");
    check("두 길이 같은 내용을 준다", byId?.id, byProposal?.id);

    // **남의 팀 것은 보이지 않는다** — 회의록은 팀의 회의 내용이다.
    //
    // ⚠️ **세션을 지우고 부르면 안 된다.** 그건 "로그인이 필요합니다" 로 끝나고, **아무도 안
    // 봤다" 와 "못 봤다" 를 구분하지 못한다.** **다른 팀 사람으로** 부르는 게 크로스팀 경계다.
    check("남의 팀 사람은 제안으로 안 본다", await as(A.asLeader, () => notes.getMeetingNoteByProposalAction(proposal.id)), null);
    check("남의 팀 사람은 아이디로도 안 본다", await as(A.asLeader, () => notes.getMeetingNoteAction(second.id)), null);
    check("자기 팀 것은 보인다", (await as(B.asMate, () => notes.getMeetingNoteAction(second.id)))?.id, second.id);

    /* ── 5) 없는 것은 조용히 null ──────────────────────────── */
    console.log("\n없는 것은 조용히 null 이다");
    // ⚠️ **세션 없이 부르면 "로그인이 필요합니다" 로 끝난다** — 그건 없는 것을 조용히 `null`
    // 로 주는 것과 전혀 다르다. **누가 보는지**를 분명히 하고 부른다.
    check("세션 없으면 읽을 수 없다", await blocked(() => notes.getMeetingNoteAction("없는아이디")).then((m) => m.includes("로그인이 필요합니다")), true);
    check("없는 제안이다", await as(B.asLeader, () => notes.getMeetingNoteByProposalAction("없는회의")), null);
    check("없는 회의록이다", await as(B.asLeader, () => notes.getMeetingNoteAction("없는아이디")), null);
    check("회의 없는 저장은 새 줄이다", await noteCount(A.id), 4);
  } finally {
    for (const id of teamIds) {
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

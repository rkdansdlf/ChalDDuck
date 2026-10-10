/**
 * 드라이브 저장 경로 검사 — **올린 것을 팀에 알리는 길**과 **리서치 결과를 제출함에 저장하는 길**을
 * 서버 액션 경계를 통과해서 본다.
 *
 * ## 왜 이게 필요한가
 *
 * `announceUploads`·`getMyTeamSubmissionBoxesForSelect`·`saveResearchToDrive` 는 `audit:actions` 에서
 * "없음"이었다. 드라이브의 올리기(`prepareUpload`·`finishUpload`)는 `drive` 하네스가 지키지만 저 셋은
 * **같은 약속을 다른 문으로 지키는 길**이다 — 용량, 팀 경계, 버전 이름, 기여 기록.
 *
 * 읽으며 위험한 곳을 셌다 —
 *
 * - **`announceUploads` 는 화면이 보낸 id 를 믿지 않는다.** "내가 30분 안에 이 제출함에 올린 버전"이
 *   있는 파일만 알린다. 남의 파일을 내가 올린 것처럼 알리게 하면 안 된다.
 * - **`saveResearchToDrive` 는 `finishUpload` 의 규칙을 같이 지켜야 한다.** 버전 이름은 잠금 안에서
 *   고르고(같은 제목을 동시에 저장해도 `v1`·`v2`), 팀 용량 2GB 를 넘기지 않고, 저장소에 올리지 못했으면
 *   **기록을 남기지 않는다** — 객체 없는 버전 행은 미리보기가 404 가 되는 거짓이다.
 * - **제출함은 우리 팀 것이어야 한다.** 목록도 저장도 팀으로 거른다.
 *
 * ## 검사하는 것
 *
 * 1. 제출함 목록 — 내 팀 것만 · 이름순 · 세션 없으면 거절
 * 2. 알림 — 내가 방금 올린 것만 · 팀 경계 · 한 개/여러 개 말투 · 마감 후 제출 표시 · 복원은 늦은 제출이 아니다
 * 3. 저장 — 파일 이름 정리 · 같은 제목은 새 버전 · 동시에 저장해도 버전이 겹치지 않는다 · 기여 기록 ·
 *    팀 알림 · **팀 용량이 가득 차면 거절** · **저장소에 올리지 못하면 기록을 남기지 않는다**
 *
 * ⚠️ **이 검사는 저장소(Supabase) 키 없이 돈다.** 키가 없으면 저장소를 건드리지 않는 쪽 길이 검사되고,
 * 저장소 실패는 일부러 닿지 않는 주소를 심어 만든다. 진짜 객체를 올리는 길은 `npm run test:drive`
 * 가 본다.
 *
 *   npm run test:drive-save
 */
import { randomUUID } from "node:crypto";

import { MAX_BYTES, TEAM_CAP_BYTES } from "../../src/features/drive/file-rules.js";

type Session = { as(token: string): void; nobody(): void; reset(): void; clearAll(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
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
      data: { name: `저장 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(team.id);
    const mk = (name: string, isLeader = false) =>
      db.member.create({ data: { teamId: team.id, name: `${name}${suffix}`, isLeader } });
    const leader = await mk("김민준", true);
    const mate = await mk("이서연");
    const third = await mk("박도윤");
    const box = await db.submissionBox.create({ data: { teamId: team.id, role: "deck", name: "최종본", due: "10/1" } });
    const box2 = await db.submissionBox.create({ data: { teamId: team.id, role: "research", name: "자료", due: "10/1" } });
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
      box,
      box2,
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

  const addFile = (boxId: string, name: string, kind = "pdf") =>
    db.submittedFile.create({ data: { boxId, name, kind }, select: { id: true, name: true } });
  const addVersion = (
    fileId: string,
    authorId: string,
    over: { label?: string; createdAt?: Date; restoredFromId?: string | null } = {},
  ) =>
    db.fileVersion.create({
      data: {
        fileId,
        authorId,
        label: over.label ?? "v1",
        note: "n",
        size: "1B",
        kind: "pdf",
        bytes: 1,
        createdAt: over.createdAt ?? new Date(),
        restoredFromId: over.restoredFromId ?? null,
      },
      select: { id: true },
    });

  /** 올림 알림 — 제출함에 올렸다는 알림만. */
  const announced = (memberId: string) =>
    db.notification.findMany({
      where: { memberId, kind: "drive", title: { contains: "에 올렸습니다" } },
      select: { title: true, body: true, href: true, actorId: true },
      orderBy: { createdAt: "asc" },
    });
  const savedNotice = (memberId: string) =>
    db.notification.findMany({
      where: { memberId, kind: "drive", title: { contains: "참고자료" } },
      select: { title: true, body: true, href: true },
    });
  const versionsIn = (boxId: string) =>
    db.fileVersion.findMany({
      where: { file: { boxId } },
      select: { label: true, file: { select: { name: true, kind: true } }, authorId: true, storagePath: true, bytes: true },
      orderBy: { createdAt: "asc" },
    });

  const research = (over: Record<string, unknown> = {}) => ({
    title: "수면이 기억에 미치는 영향",
    source: "한국심리학회지",
    snippet: "수면은 깊은 단계에서 기억을 공고화한다.",
    url: "https://example.org/paper",
    year: "2021",
    ...over,
  });

  try {
    /* ── 1) 제출함 목록 ────────────────────────────────────── */
    console.log("\n저장할 제출함 목록은 내 팀 것만, 이름순이다");
    const A = await makeTeam("목록");
    const other = await makeTeam("이웃");
    // 일부러 이름 순서와 다르게 만든다 — 만든 순서가 아니라 이름순임을 본다. 영문으로 둔다: 한글·공백이
    // 섞인 이름의 순서는 DB 정렬 규칙(collation)이 정하는 것이지 앱의 규칙이 아니다.
    await db.submissionBox.create({ data: { teamId: A.id, role: "script", name: "Ccc", due: "10/1" } });
    await db.submissionBox.create({ data: { teamId: A.id, role: "manage", name: "Aaa", due: "10/1" } });
    await db.submissionBox.create({ data: { teamId: A.id, role: "present", name: "Bbb", due: "10/1" } });

    check("세션이 없으면 목록을 읽을 수 없다", await blocked(() => drive.getMyTeamSubmissionBoxesForSelect()), "로그인이 필요합니다.");
    const list = await as(A.asMate, () => drive.getMyTeamSubmissionBoxesForSelect());
    check(
      "팀원도 읽을 수 있고 영문 이름은 이름순이다",
      list.map((b) => b.name).filter((n) => /^[A-Z]/.test(n)),
      ["Aaa", "Bbb", "Ccc"],
    );
    check("모든 제출함이 나온다", list.length, 5);
    check("보이는 필드는 id·이름·역할뿐이다", Object.keys(list[0]!).sort(), ["id", "name", "role"]);
    check("역할이 같이 온다", list.find((b) => b.name === "Aaa")?.role, "manage");
    check("다른 팀의 제출함은 없다", list.some((b) => b.id === other.box.id || b.id === other.box2.id), false);
    check("다른 팀은 자기 것만 본다", (await as(other.asLeader, () => drive.getMyTeamSubmissionBoxesForSelect())).length, 2);

    /* ── 2) 올림 알림 ──────────────────────────────────────── */
    console.log("\n올렸다는 알림은 내가 방금 올린 것만 알린다");
    const B = await makeTeam("알림");
    const left = await B.mk("나간이");
    await db.member.update({ where: { id: left.id }, data: { leftAt: new Date() } });

    check("세션이 없으면 알릴 수 없다", await blocked(() => drive.announceUploads(B.box.id, ["x"])), "로그인이 필요합니다.");

    const mine = await addFile(B.box.id, "발표 자료.pptx", "pptx");
    await addVersion(mine.id, B.leader.id, { label: "v1" });
    const matesFile = await addFile(B.box.id, "팀원 자료.pdf");
    await addVersion(matesFile.id, B.mate.id);
    const stale = await addFile(B.box.id, "오래된 자료.pdf");
    await addVersion(stale.id, B.leader.id, { createdAt: new Date(Date.now() - 31 * 60 * 1000) });
    const inBox2 = await addFile(B.box2.id, "다른 칸 자료.pdf");
    await addVersion(inBox2.id, B.leader.id);

    // 한 번에 하나씩 확인한다 — 알림이 섞이면 어느 호출이 보낸 것인지 모른다.
    const countFor = async () => (await announced(B.mate.id)).length;

    await as(B.asLeader, () => drive.announceUploads(B.box.id, []));
    check("고른 파일이 없으면 아무것도 알리지 않는다", await countFor(), 0);
    await as(B.asLeader, () => drive.announceUploads(B.box.id, [matesFile.id]));
    check("남이 올린 파일은 내가 올린 것처럼 알리지 못한다", await countFor(), 0);
    await as(B.asLeader, () => drive.announceUploads(B.box.id, [stale.id]));
    check("30분보다 오래된 버전은 알리지 않는다", await countFor(), 0);
    await as(B.asLeader, () => drive.announceUploads(B.box.id, [inBox2.id]));
    check("다른 제출함의 파일은 이 제출함에 올렸다고 알리지 않는다", await countFor(), 0);
    await as(B.asLeader, () => drive.announceUploads(other.box.id, [mine.id]));
    check("남의 팀 제출함으로는 알릴 수 없다", [await countFor(), (await announced(other.mate.id)).length], [0, 0]);
    await as(B.asLeader, () => drive.announceUploads("없는제출함", [mine.id]));
    check("없는 제출함은 조용히 지나간다", await countFor(), 0);

    await as(B.asLeader, () => drive.announceUploads(B.box.id, [mine.id]));
    const one = await announced(B.mate.id);
    check("방금 올린 파일 하나는 알린다", one.length, 1);
    check("제목에 올린 사람과 제출함이 있다", one[0]?.title, `${B.leader.name}님이 최종본에 올렸습니다`);
    check("본문은 파일 이름과 버전이다", one[0]?.body, "발표 자료.pptx v1");
    check("파일 하나면 그 파일로 바로 간다", one[0]?.href, `/drive/${B.box.id}/${mine.id}`);
    check("보낸 사람이 밝혀진다", one[0]?.actorId, B.leader.id);
    check("셋째도 받는다", (await announced(B.third.id)).length, 1);
    check("올린 사람 자신은 받지 않는다", (await announced(B.leader.id)).length, 0);
    check("나간 사람은 받지 않는다", (await announced(left.id)).length, 0);

    // 여러 개를 올렸으면 한 번에 묶는다.
    const second = await addFile(B.box.id, "대본.pdf");
    await addVersion(second.id, B.leader.id);
    await as(B.asLeader, () => drive.announceUploads(B.box.id, [mine.id, second.id]));
    const many = (await announced(B.mate.id))[1];
    check("여러 개면 '외 N개' 로 묶는다", many?.body?.endsWith("외 1개"), true);
    check("여러 개면 제출함으로 간다", many?.href, `/drive/${B.box.id}`);

    // 같은 파일을 여러 번 올렸으면 가장 최근 것 하나로.
    const redo = await addFile(B.box.id, "수정본.pdf");
    await addVersion(redo.id, B.leader.id, { label: "v1", createdAt: new Date(Date.now() - 2000) });
    await addVersion(redo.id, B.leader.id, { label: "v2", createdAt: new Date(Date.now() - 1000) });
    await as(B.asLeader, () => drive.announceUploads(B.box.id, [redo.id]));
    check("같은 파일을 두 번 올렸으면 가장 최근 버전만 말한다", (await announced(B.mate.id))[2]?.body, "수정본.pdf v2");

    // 한 번에 보낼 수 있는 파일 id 는 50개까지만 본다 — 50개째 뒤에 있는 진짜 id 는 무시된다.
    const filler = Array.from({ length: 50 }, (_, i) => `없는파일${i}`);
    const before = await countFor();
    await as(B.asLeader, () => drive.announceUploads(B.box.id, [...filler, mine.id]));
    check("50개를 넘는 id 는 보지 않는다", await countFor(), before);

    // 마감 뒤에 올라온 버전은 알림에도 표시된다. 복원으로 생긴 버전은 마감과 무관하다.
    const C = await makeTeam("마감");
    await db.submissionBox.update({ where: { id: C.box.id }, data: { dueAt: new Date(Date.now() - 3600_000) } });
    const lateFile = await addFile(C.box.id, "늦은 자료.pdf");
    await addVersion(lateFile.id, C.leader.id);
    await as(C.asLeader, () => drive.announceUploads(C.box.id, [lateFile.id]));
    check("마감이 지난 뒤 올렸으면 알림에 표시된다", (await announced(C.mate.id))[0]?.body, "늦은 자료.pdf v1 · 마감 후 제출");

    const restored = await addFile(C.box.id, "복원 자료.pdf");
    const origin = await addVersion(restored.id, C.leader.id, { createdAt: new Date(Date.now() - 4 * 3600_000), label: "v1" });
    await addVersion(restored.id, C.leader.id, { label: "v2", restoredFromId: origin.id });
    await as(C.asLeader, () => drive.announceUploads(C.box.id, [restored.id]));
    check("복원으로 생긴 버전은 늦은 제출로 표시하지 않는다", (await announced(C.mate.id))[1]?.body, "복원 자료.pdf v2");

    /* ── 3) 리서치 결과 저장 ───────────────────────────────── */
    console.log("\n리서치 결과를 제출함에 저장한다");
    const D = await makeTeam("저장");
    const E = await makeTeam("이웃2");
    const savedBy = (memberId: string) =>
      db.contribRecord.findMany({
        where: { memberId, originType: "drive_version" },
        select: { kind: true, state: true, source: true, title: true },
      });

    check(
      "세션이 없으면 저장할 수 없다",
      await drive.saveResearchToDrive(D.box2.id, research()),
      { ok: false, error: "로그인이 필요합니다." },
    );
    check(
      "남의 팀 제출함에는 저장할 수 없다",
      await as(E.asLeader, () => drive.saveResearchToDrive(D.box2.id, research())),
      { ok: false, error: "제출함을 찾을 수 없습니다." },
    );
    check(
      "없는 제출함에는 저장할 수 없다",
      await as(D.asLeader, () => drive.saveResearchToDrive("없는제출함", research())),
      { ok: false, error: "제출함을 찾을 수 없습니다." },
    );
    check("거절된 저장은 아무것도 남기지 않는다", [(await versionsIn(D.box2.id)).length, (await versionsIn(E.box2.id)).length], [0, 0]);

    const first = await as(D.asMate, () => drive.saveResearchToDrive(D.box2.id, research()));
    check("저장된다", first, { ok: true, fileName: "[자료] 수면이 기억에 미치는 영향.pdf", boxName: "자료", boxId: D.box2.id });
    const v1 = await versionsIn(D.box2.id);
    check("버전이 하나 생긴다", v1.length, 1);
    check("이름은 v1 이고 PDF 문서다", [v1[0]?.label, v1[0]?.file.kind], ["v1", "pdf"]);
    check("저장한 사람이 올린 사람이다", v1[0]?.authorId, D.mate.id);
    check("저장소 키가 없으면 객체 경로를 남기지 않는다", v1[0]?.storagePath, null);
    check("바이트 수가 기록된다", (v1[0]?.bytes ?? 0) > 0, true);
    const records = await savedBy(D.mate.id);
    check("기여 기록이 하나 생긴다 — 파일 종류에 대기 상태의 자동 기록", [records.length, records[0]?.kind, records[0]?.state, records[0]?.source], [1, "file", "pending", "auto"]);
    const notices = await savedNotice(D.leader.id);
    check("팀에 알려진다", [notices.length, notices[0]?.href], [1, `/drive/${D.box2.id}`]);
    check("저장한 사람 자신에게는 가지 않는다", (await savedNotice(D.mate.id)).length, 0);

    // 같은 제목이면 새 파일이 아니라 새 버전이다.
    await as(D.asMate, () => drive.saveResearchToDrive(D.box2.id, research()));
    const v2 = await versionsIn(D.box2.id);
    check("같은 제목이면 같은 파일의 새 버전이다", [v2.length, v2.map((v) => v.label)], [2, ["v1", "v2"]]);
    check("파일은 하나뿐이다", await db.submittedFile.count({ where: { boxId: D.box2.id } }), 1);
    check("기여 기록은 버전마다 따로 쌓인다", (await savedBy(D.mate.id)).length, 2);
    await as(D.asMate, () => drive.saveResearchToDrive(D.box2.id, research({ title: "다른 논문" })));
    check("다른 제목이면 새 파일이다", await db.submittedFile.count({ where: { boxId: D.box2.id } }), 2);

    // 파일 이름 정리
    const dirty = await as(D.asLeader, () => drive.saveResearchToDrive(D.box.id, research({ title: 'a/b\\c:d*e?f"g<h>i|j' })));
    check("파일 이름에 못 쓰는 글자는 공백이 된다", dirty.ok && dirty.fileName, "[자료] a b c d e f g h i j.pdf");
    const onlyBad = await as(D.asLeader, () => drive.saveResearchToDrive(D.box.id, research({ title: '/\\:*?"' })));
    check("쓸 수 있는 글자가 없으면 '자료' 가 된다", onlyBad.ok && onlyBad.fileName, "[자료] 자료.pdf");
    const longTitle = await as(D.asLeader, () => drive.saveResearchToDrive(D.box.id, research({ title: "가".repeat(60) })));
    check("제목은 30자에서 잘린다", longTitle.ok && longTitle.fileName, `[자료] ${"가".repeat(30)}.pdf`);

    // 동시에 같은 제목을 저장해도 버전 이름이 겹치지 않는다 — 잠금이 한 명씩 지나가게 한다.
    const F = await makeTeam("동시");
    const pairs = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        Promise.all([
          as(F.asLeader, () => drive.saveResearchToDrive(F.box2.id, research({ title: `동시 ${i}` }))),
          as(F.asMate, () => drive.saveResearchToDrive(F.box2.id, research({ title: `동시 ${i}` }))),
        ]),
      ),
    );
    check("동시에 저장해도 모두 성공한다", pairs.flat().every((r) => r.ok), true);
    check("제목마다 파일은 하나뿐이다", await db.submittedFile.count({ where: { boxId: F.box2.id } }), 4);
    const fVersions = await versionsIn(F.box2.id);
    const labelsByFile = new Map<string, string[]>();
    for (const v of fVersions) labelsByFile.set(v.file.name, [...(labelsByFile.get(v.file.name) ?? []), v.label]);
    check(
      "각 파일의 버전은 v1·v2 로 겹치지 않는다",
      [...labelsByFile.values()].every((l) => JSON.stringify([...l].sort()) === JSON.stringify(["v1", "v2"])),
      true,
    );

    /* ── 3-2) 팀 용량 ─────────────────────────────────────── */
    console.log("\n팀 저장 용량이 가득 차면 저장하지 않는다");
    const G = await makeTeam("용량");
    // 제품 규칙이 허용하는 모양 그대로 — 한 파일은 MAX_BYTES 를 넘지 못하니 여러 파일로 나눠 심는다.
    // 한도에서 100바이트 모자란 곳까지 채운다(저장하려는 PDF 는 그보다 크다).
    let remaining = TEAM_CAP_BYTES - 100;
    for (let i = 0; remaining > 0; i += 1) {
      const bytes = Math.min(MAX_BYTES, remaining);
      remaining -= bytes;
      const f = await addFile(G.box.id, `채움 ${i + 1}`, "image");
      await db.fileVersion.create({
        data: { fileId: f.id, authorId: G.leader.id, label: "v1", note: "채움", size: `${bytes}B`, kind: "image", bytes, storagePath: `${G.id}/${G.box.id}/${randomUUID()}` },
      });
    }
    const filled = (await versionsIn(G.box2.id)).length;
    const full = await as(G.asMate, () => drive.saveResearchToDrive(G.box2.id, research()));
    check("한도를 넘으면 저장하지 않는다", full.ok, false);
    check("거절 이유를 사람이 읽을 수 있게 말한다", !full.ok && /용량|가득/.test(full.error), true);
    check("거절되면 버전이 늘지 않는다", (await versionsIn(G.box2.id)).length, filled);
    check("거절되면 기여 기록도 남지 않는다", (await savedBy(G.mate.id)).length, 0);

    /* ── 3-3) 저장소에 올리지 못했을 때 ────────────────────── */
    console.log("\n저장소에 올리지 못하면 기록을 남기지 않는다");
    const H = await makeTeam("저장소실패");
    // 일부러 닿지 않는 주소를 심어 "저장소는 설정돼 있는데 올리기가 실패하는" 상태를 만든다.
    const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
    process.env.SUPABASE_URL = "http://127.0.0.1:9";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_unreachable";
    let broken: Awaited<ReturnType<typeof drive.saveResearchToDrive>>;
    try {
      broken = await as(H.asMate, () => drive.saveResearchToDrive(H.box2.id, research()));
    } finally {
      if (saved.url === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = saved.url;
      if (saved.key === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = saved.key;
    }
    check("올리지 못했으면 실패로 돌려준다", broken.ok, false);
    // **객체 없는 버전 행은 거짓말이다** — 미리보기가 404 가 되고, 팀은 파일이 있다고 믿는다.
    check("버전 행을 남기지 않는다", (await versionsIn(H.box2.id)).length, 0);
    check("파일 행도 남기지 않는다", await db.submittedFile.count({ where: { boxId: H.box2.id } }), 0);
    check("기여 기록도 남기지 않는다", (await savedBy(H.mate.id)).length, 0);
    check("팀에 알리지 않는다", (await savedNotice(H.leader.id)).length, 0);
  } finally {
    for (const teamId of teamIds) {
      const members = await db.member.findMany({ where: { teamId }, select: { id: true } });
      await db.contribRecord.deleteMany({ where: { memberId: { in: members.map((m) => m.id) } } });
      await db.submissionBox.deleteMany({ where: { teamId } });
      await db.member.deleteMany({ where: { teamId } });
      await db.team.delete({ where: { id: teamId } }).catch(() => {});
    }
    await db.$disconnect();
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}

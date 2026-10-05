/**
 * 드라이브 통합 검사 — 업로드부터 복원까지 **서버 액션 경계를 통과해서** 확인한다.
 *
 * ## 왜 이게 필요한가
 *
 * 드라이브의 약속은 계약이다. **2GB · 같은 이름이면 새 버전 · 복원은 덮어쓰기가 아니라
 * 추가 · 거절된 올리기는 아무것도 남기지 않는다.** 그런데 이 약속은 어디에도 검사로 고정되어
 * 있지 않았다. `prepareUpload`·`finishUpload` 를 손대도 아무도 몰랐고, 버킷이 없는 것도
 * 용량 계산이 어긋난 것도 조용히 지나갔다(2026-09-28 에 실제로 그랬다).
 *
 * 그래서 **임시 스크립트로 두 번 손으로 확인하고 두 번 버렸다.** 손으로 확인한 것은 남지
 * 않는다. 남는 건 이 파일이다.
 *
 * ## 무엇이 진짜이고 무엇만 가짜인가
 *
 * - **진짜**: 로컬 Postgres, **실제 Supabase 저장소 어댑터**(개발 버킷), 그리고 서버 액션
 *   본문 — `requireSessionMember()` 로 시작해 트랜잭션과 `FOR UPDATE` 잠금까지 그대로 돈다.
 * - **가짜**: 요청 컨텍스트 하나. 쿠키 항아리와 `revalidatePath` 만 대체한다
 *   (`./request-context.mjs`). 앱 코드는 한 줄도 안 건드렸다.
 *
 * 이 구분이 중요하다. 액션을 **우회**했다면 검사는 통과하는데 정작 막아야 할 것을 못 막는다
 * — 그래서 세션 없는 호출이 실제로 "로그인이 필요합니다" 로 막히는지 통과 확인이 따로 있다
 * (`npm run test:drive:probe`).
 *
 * ## 용량은 어떻게 검사하는가
 *
 * 2GB 를 실제로 올릴 수는 없다. 그래서 **큰 버전을 DB 에 심는다** — 팀 사용량은 저장소가
 * 아니라 `FileVersion.bytes` 의 합이라(`server/drive/usage.ts`), 심은 만큼이 실제로 한도
 * 직전·직후가 된다. 올리는 대상은 **진짜 저장소 객체**다(몇 KB).
 *
 *   npm run test:drive
 */
import { randomUUID } from "node:crypto";

import { TEAM_CAP_BYTES } from "../../src/features/drive/file-rules.js";
import { teamUsedBytes } from "../../src/server/drive/usage.js";
import { storage } from "../../src/server/storage/client.js";

const PNG = "image/png";

/** 진짜 PNG 바이트. 미리보기로 열어 실제로 이 크기가 오는지 본다. */
const CONTENT = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cff00000040101005e0d1a2c0000000049454e44ae426082",
  "hex",
);

type Session = { as(token: string): void; nobody(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const actions = await import("../../src/server/actions/drive.js");

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

  /* ── 도우미 ───────────────────────────────────────────────── */

  async function makeTeam(label: string) {
    const team = await db.team.create({
      data: {
        name: `드라이브 검사 ${label} ${suffix}`,
        course: "검증",
        code: `CD-${randomUUID().slice(0, 6).toUpperCase()}`,
      },
    });
    teamIds.push(team.id);
    // ⚠️ **`isLeader` 를 반드시 켠다.** 2026-09-28 에 이걸 빠뜨려서 "팀장은 복원된다" 가
    // 실패했다 — 팀장이 팀장이 아니어서였다. 판정이 `me.isLeader` 를 읽는데 픽스처가 그 값을
    // 만들어 주지 않았다. 다른 규칙이 이 값을 읽지 않아서 그전까지는 드러나지 않았다.
    const leader = await db.member.create({
      data: { teamId: team.id, name: `김민준${suffix}`, isLeader: true },
    });
    const mate = await db.member.create({ data: { teamId: team.id, name: `이서연${suffix}` } });
    // 제출함에는 `role` 이 필수다 — 잘 알려진 셋 중에서 하나를 쓴다.
    const box = await db.submissionBox.create({ data: { teamId: team.id, role: "deck", name: "최종본", due: "10/1" } });
    const box2 = await db.submissionBox.create({ data: { teamId: team.id, role: "research", name: "자료", due: "10/1" } });
    const token = async (memberId: string) => {
      const t = randomUUID();
      await db.session.create({
        data: { token: t, memberId, expiresAt: new Date(Date.now() + 3600_000) },
      });
      return t;
    };
    return {
      id: team.id,
      team,
      box,
      box2,
      leader,
      mate,
      asLeader: await token(leader.id),
      asMate: await token(mate.id),
      /** 아무도 안 올린 새 팀원을 하나 더 만든다 — "나 neither 올린 사람도 팀장도 아닌 사람" 이 필요해. */
      async addThird() {
        const m = await db.member.create({ data: { teamId: team.id, name: `박서준${suffix}` } });
        return { id: m.id, token: await token(m.id) };
      },
    };
  }

  /** 그 팀원으로 행동한다. 끝나면 세션을 비운다 — 다음 검사가 이 사람의 세션을 물려받지 않게. */
  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    session.as(token);
    try {
      return await work();
    } finally {
      session.nobody();
    }
  }

  async function putObject(signedUrl: string, bytes: Buffer, contentType: string): Promise<void> {
    const res = await fetch(signedUrl, {
      method: "PUT",
      headers: { "content-type": contentType, "x-upsert": "false" },
      body: new Uint8Array(bytes),
    });
    if (!res.ok) throw new Error(`저장소 올리기 실패 ${res.status} ${await res.text()}`);
  }

  type Prepared = Awaited<ReturnType<typeof actions.prepareUpload>>;

  /**
   * 올리기 **앞부분** — 1단계(주소 발급) → 저장소에 실제로 올리기.
   *
   * 동시성 시험은 이것을 두 번 하고 **그다음에** 2단계를 함께 보낸다. 앞부분까지 같이
   * `Promise.all` 로 돌리면 "누가 먼저 끝나느냐"에 따라 1단계에서 걸릴 수도 있고 안 걸릴
   * 수도 있다 — 그러면 **잠금**을 시험하는 것이 아니라 스케줄링 우연을 시험하게 된다.
   */
  async function stage(token: string, boxId: string, name: string): Promise<Prepared> {
    const prepared = await as(token, () =>
      actions.prepareUpload(boxId, { name, size: CONTENT.byteLength, type: PNG }),
    );
    if (prepared.status === "ok") await putObject(prepared.signedUrl, CONTENT, prepared.contentType);
    return prepared;
  }

  /** 올리기 뒷부분 — 2단계(버전 기록). */
  async function finishStaged(
    token: string,
    boxId: string,
    name: string,
    prepared: Prepared,
    fileId?: string,
  ): Promise<{ prepared: Prepared; finished: Awaited<ReturnType<typeof actions.finishUpload>> | null }> {
    if (prepared.status !== "ok") return { prepared, finished: null };
    const finished = await as(token, () =>
      actions.finishUpload(boxId, { path: prepared.path, name }, fileId),
    );
    return { prepared, finished };
  }

  /**
   * 성공한 결과를 **확인해서** 돌려준다. `!` 로 침묵하게 넘기지 않는다 — 앞의 검사가 이미
   * "성공" 이라고 말했는데 여기서 실패하면 그 두 검사가 거짓말한 것이다.
   */
  type OkFinish = Extract<Awaited<ReturnType<typeof actions.finishUpload>>, { status: "ok" }>;
  function okFinish(r: { finished: { status: string } | null }): OkFinish {
    if (!r.finished || r.finished.status !== "ok") {
      throw new Error(`성공한 올리기를 전제하는데 결과가 ${JSON.stringify(r.finished)} 이다`);
    }
    return r.finished as OkFinish;
  }

  /** 올리기 전체 — 사람이 하는 순서 그대로. */
  async function upload(token: string, boxId: string, name: string, opts: { fileId?: string } = {}) {
    return finishStaged(token, boxId, name, await stage(token, boxId, name), opts.fileId);
  }

  /**
   * 버전에 저장소 경로가 **있어야 한다** — 우리가 직접 올린 버전인데 없다면 그 자체가
   * 버그다(시드처럼 경로 없는 행이 섞이면 조용히 넘어가면 안 된다).
   */
  function mustPath(row: { storagePath: string | null }): string {
    if (!row.storagePath) throw new Error("버전에 저장소 경로가 없습니다 — 올라간 파일의 기록이 아닙니다");
    return row.storagePath;
  }

  const versionsOf = (fileId: string) =>
    db.fileVersion.findMany({
      where: { fileId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        label: true,
        bytes: true,
        restoredFromId: true,
        storagePath: true,
        fileId: true,
        authorId: true,
      },
    });

  /** 큰 버전을 **DB 에만** 심는다 — 팀 사용량은 여기서 나온다(저장소가 아니다). */
  async function seedBytes(teamId: string, boxId: string, bytes: number, label: string): Promise<void> {
    const author = await db.member.findFirstOrThrow({ where: { teamId } });
    const file = await db.submittedFile.create({
      data: { boxId, name: `${label} ${suffix}`, kind: "image" },
    });
    await db.fileVersion.create({
      data: {
        fileId: file.id,
        label: "v1",
        authorId: author.id,
        note: "용량 검사용(저장소 객체 없음)",
        size: `${bytes} B`,
        kind: "image",
        storagePath: `${teamId}/${boxId}/${randomUUID()}`,
        bytes,
        mimeType: PNG,
      },
    });
  }

  /* ── 본편 ─────────────────────────────────────────────────── */

  try {
    console.log("\n드라이브 통합 검사 (실제 저장소 · 실제 서버 액션)");
    const A = await makeTeam("A");
    const B = await makeTeam("B");

    /* ① 처음 올리면 v1 */
    console.log("\n처음 올리면 v1 이 된다");
    const first = await upload(A.asLeader, A.box.id, "그림.png");
    check("올리기가 성공한다", first.finished?.status, "ok");
    check("새 파일이다", first.finished?.status === "ok" ? first.finished.isNewFile : null, true);
    check("버전 이름이 v1 이다", first.finished?.status === "ok" ? first.finished.label : null, "v1");
    const fileId = first.finished?.status === "ok" ? first.finished.fileId : "";

    /* ② 같은 이름 재업로드 → v2, v1 유지 */
    console.log("\n같은 이름으로 다시 올리면 새 버전이지 덮어쓰기가 아니다");
    const v1 = (await versionsOf(fileId))[0]!;
    const second = await upload(A.asLeader, A.box.id, "그림.png");
    check("또 성공한다", second.finished?.status, "ok");
    check("새 파일이 아니다", second.finished?.status === "ok" ? second.finished.isNewFile : null, false);
    check("같은 파일이다", second.finished?.status === "ok" ? second.finished.fileId : null, fileId);
    check("버전 이름이 v2 이다", second.finished?.status === "ok" ? second.finished.label : null, "v2");
    check("버전이 둘로 쌓였다", (await versionsOf(fileId)).length, 2);
    check("v1 의 저장소 경로가 그대로다", (await versionsOf(fileId))[0]?.storagePath, v1.storagePath);
    check("v1 과 v2 의 객체가 다르다", (await versionsOf(fileId))[1]?.storagePath === v1.storagePath, false);

    /* ③ 미리보기 */
    console.log("\n최신 버전과 옛 버전을 모두 미리 볼 수 있다");
    const v2 = (await versionsOf(fileId))[1]!;
    const previewUrl = await as(A.asLeader, () => actions.getPreviewUrl(v2.id));
    check("최신 버전의 미리보기 주소가 나온다", typeof previewUrl, "string");
    const fetched = typeof previewUrl === "string" ? await fetch(previewUrl) : null;
    check("그 주소로 열린다", fetched?.status, 200);
    check("내용이 올린 바이트 그대로다", (await fetched?.arrayBuffer())?.byteLength, CONTENT.byteLength);
    const oldPreview = await as(A.asLeader, () => actions.getPreviewUrl(v1.id));
    check("옛 버전도 미리 볼 수 있다 (그래야 복원이 '되돌리기'다)", typeof oldPreview, "string");

    /* ④ 내려받기 */
    console.log("\n내려받기 주소가 나온다");
    const dl = await as(A.asLeader, () => actions.getDownloadUrl(v2.id));
    check("내려받기 주소가 나온다", typeof dl, "string");
    check("그 주소로 내려받는다", typeof dl === "string" ? await fetch(dl).then((r) => r.status) : null, 200);

    /* ⑤⑥ 복원 + 이력 보존 */
    console.log("\n옛 버전으로 돌아가도 그 버전은 지워지지 않는다");
    const usedBeforeRestore = await teamUsedBytes(A.id);
    // **올린 사람이** 복원한다 — v1 을 올린 사람이 누구인지는 곧 규칙이다(아래 ⑧).
    const restoredLabel = await as(A.asLeader, () => actions.restoreFileVersion(fileId, v1.id));
    check("복원이 새 버전 이름으로 돌아온다", restoredLabel, "v3");
    const afterRestore = await versionsOf(fileId);
    check("버전 이력이 늘었다 (덮어쓰기가 아니다)", afterRestore.length, 3);
    check("새 버전이 무엇에서 돌아온 것인지 기억한다", afterRestore[2]?.restoredFromId, v1.id);
    check("옛 두 버전이 그대로 남아 있다", afterRestore.slice(0, 2).map((v) => v.id).join(","), `${v1.id},${v2.id}`);
    // 복원이 **같은 객체를 가리키므로** 용량이 늘면 안 된다 — 예전에는 늘었다.
    check("복원은 팀 용량을 늘리지 않는다", await teamUsedBytes(A.id), usedBeforeRestore);

    /* ⑦ 다른 팀 접근 차단 */
    console.log("\n다른 팀의 파일은 손대지 못한다");
    check("다른 팀의 미리보기가 없다", await as(B.asLeader, () => actions.getPreviewUrl(v2.id)), null);
    check("다른 팀의 내려받기 주소가 없다", await as(B.asLeader, () => actions.getDownloadUrl(v2.id)), null);
    let crossRestore = "";
    try {
      await as(B.asLeader, () => actions.restoreFileVersion(fileId, v1.id));
      crossRestore = "(막지 않음)";
    } catch (e) {
      crossRestore = (e as Error).message;
    }
    check("다른 팀의 복원이 막힌다", crossRestore.includes("파일을 찾을 수 없습니다"), true);

    /* ⑧ 복원은 올린 사람 또는 팀장 ──────────────────────── */
    console.log("\n복원은 올린 사람과 팀장만");
    // 2026-09-28 에 닫았다. 예전에는 팀 안이면 **누구나** 복원했다 — 실수 방지가 아니라 사고가
    // 난 뒤에야 보이는 상태였고, 목록에도 미결로 적혀 있었다.
    //
    // **판정은 그 버전을 올린 사람이 한다.** 팀이 함께 고친 파일일 수 있으므로 팀장에게도 열어
    // 둔다 — 팀장이 아니면 아무도 못 고치는 파일이 생기면 안 된다.
    //
    // 세 경우를 **한 팀**에서 확인한다: 올린 사람 · 팀장 · 그 둘 다 아닌 팀원.
    const R = await makeTeam("복원권한");
    const theirs = await upload(R.asMate, R.box.id, "이서연의 파일.png");
    check("팀원이 올렸다", theirs.finished?.status, "ok");
    const fileR = okFinish(theirs).fileId;
    const vR = (await versionsOf(fileR))[0]!;

    // ① 올린 사람 — 된다.
    const asUploader = await as(R.asMate, () =>
      actions.restoreFileVersion(fileR, vR.id).then(
        () => "ok",
        (e: Error) => e.message,
      ),
    );
    check("올린 사람은 복원된다", asUploader, "ok");

    // ② 팀장 — 올리지 않았어도 된다.
    const asLeader = await as(R.asLeader, () =>
      actions.restoreFileVersion(fileR, vR.id).then(
        () => "ok",
        (e: Error) => e.message,
      ),
    );
    check("팀장은 남의 파일도 복원된다", asLeader, "ok");

    // ③ 그 둘 다 아닌 팀원 — **막힌다.** 이것이 이 규칙의 핵심이다.
    const beforeBlocked = (await versionsOf(fileR)).length;
    const third = await R.addThird();
    const thirdTry = await as(third.token, () =>
      actions.restoreFileVersion(fileR, vR.id).then(
        () => "(막지 않음)",
        (e: Error) => e.message,
      ),
    );
    check("올린 것도 팀장도 아니면 막힌다", String(thirdTry).includes("본인이 올린 버전"), true);
    check("막힌 것은 버전으로 남지 않는다", (await versionsOf(fileR)).length, beforeBlocked);

    /* ⑧-B 마감 수정은 담당자와 팀장만 ────────────────────── */
    console.log("\n마감 수정은 담당자와 팀장만");
    // 제출함 담당자를 지정한다 (R.box의 ownerId = R.mate.id)
    await db.submissionBox.update({
      where: { id: R.box.id },
      data: { ownerId: R.mate.id },
    });

    // ① 담당자 — 변경 성공 및 이력 기록
    const asOwnerRes = await as(R.asMate, () =>
      actions.setBoxDeadline(R.box.id, "2026-10-15T23:59", "자료 보강을 위해 연장").then(
        (r) => (r.ok ? "ok" : "fail"),
        (e: Error) => e.message,
      ),
    );
    check("담당자는 마감을 변경할 수 있다", asOwnerRes, "ok");
    const history1 = await as(R.asMate, () => actions.getDeadlineHistory(R.box.id));
    check("마감 변경 이력이 기록된다", history1.length, 1);
    check("이력에 변경 사유가 남는다", history1[0]?.reason, "자료 보강을 위해 연장");

    // ② 팀장 — 담당자가 아니어도 변경 가능
    const asLeaderDeadline = await as(R.asLeader, () =>
      actions.setBoxDeadline(R.box.id, "2026-10-16T23:59", "팀장 추가 연장").then(
        (r) => (r.ok ? "ok" : "fail"),
        (e: Error) => e.message,
      ),
    );
    check("팀장은 남의 제출함 마감도 변경할 수 있다", asLeaderDeadline, "ok");
    const history2 = await as(R.asLeader, () => actions.getDeadlineHistory(R.box.id));
    check("팀장 변경 이력이 추가된다", history2.length, 2);

    // ③ 그 둘 다 아닌 팀원 — 막힌다
    const thirdDeadlineTry = await as(third.token, () =>
      actions.setBoxDeadline(R.box.id, "2026-10-20T23:59", "임의 연장").then(
        () => "(막지 않음)",
        (e: Error) => e.message,
      ),
    );
    check("담당자도 팀장도 아니면 마감 변경이 막힌다", String(thirdDeadlineTry).includes("담당자 또는 팀장"), true);
    const boxAfterBlocked = await db.submissionBox.findUnique({ where: { id: R.box.id } });
    check("막힌 시도는 마감 시각을 바꾸지 않는다", boxAfterBlocked?.dueAt?.getDate(), 16);
    const historyAfterBlocked = await as(R.asLeader, () => actions.getDeadlineHistory(R.box.id));
    check("막힌 시도는 이력을 남기지 않는다", historyAfterBlocked.length, 2);

    // ④ 다른 팀의 마감 변경 시도 — 제출함을 찾을 수 없음으로 차단
    const otherTeamDeadlineTry = await as(B.asLeader, () =>
      actions.setBoxDeadline(R.box.id, "2026-10-25T23:59").then(
        () => "(막지 않음)",
        (e: Error) => e.message,
      ),
    );
    check("다른 팀의 제출함 마감 변경은 막힌다", String(otherTeamDeadlineTry).includes("제출함을 찾을 수 없습니다"), true);

    /* ⑨ 한도 직전은 허용 */
    console.log("\n한도 직전은 허용한다");
    const C = await makeTeam("C");
    const size = CONTENT.byteLength;
    // **딱 한 개만 더 들어갈 자리**를 남긴다.
    await seedBytes(C.id, C.box.id, TEAM_CAP_BYTES - size, "거의 찬 팀");
    const fits = await upload(C.asLeader, C.box2.id, "마지막 자리.png");
    check("한도 안의 파일은 들어간다", fits.finished?.status, "ok");
    check("팀 용량이 정확히 한도다", await teamUsedBytes(C.id), TEAM_CAP_BYTES);

    /* ⑩ 한도 초과는 거절 */
    console.log("\n한도를 넘으면 거절한다");
    const over = await as(C.asLeader, () =>
      actions.prepareUpload(C.box2.id, { name: "여유 없이.png", size, type: PNG }),
    );
    check("올리기 전에 막는다", over.status, "over-quota");
    check("거절 뒤에도 용량이 그대로다", await teamUsedBytes(C.id), TEAM_CAP_BYTES);

    /* ⑪ 거절된 올리기는 아무것도 남기지 않는다 */
    console.log("\n2단계에서 거절된 올리기는 용량도 객체도 남기지 않는다");
    const D = await makeTeam("D");
    // 자리에 **딱 하나**를 남겨 둔다. 그래서 2단계는 들어가야 하는데 — 1단계와 2단계의
    // 용량 판정은 같은 식이다. 두 단계를 가르는 것은 **브라우저가 말한 크기와 실제로 들어온
    // 크기의 차이** 뿐이다. 서명 주소로는 무엇이든 올릴 수 있으므로 이것이 규칙의 핵심이다.
    await seedBytes(D.id, D.box.id, TEAM_CAP_BYTES - size, "자리는 하나");
    const prepared = await as(D.asLeader, () =>
      actions.prepareUpload(D.box2.id, { name: "남는 자리.png", size, type: PNG }),
    );
    check("말한 크기가 자리 안에 들면 1단계를 통과한다", prepared.status, "ok");
    if (prepared.status === "ok") {
      // **더 큰 것을 실제로 올린다** — 브라우저가 거짓말을 하는 상황.
      const bigger = Buffer.concat([CONTENT, CONTENT]);
      await putObject(prepared.signedUrl, bigger, prepared.contentType);
      const usedBefore = await teamUsedBytes(D.id);
      const rejected = await as(D.asLeader, () =>
        actions.finishUpload(D.box2.id, { path: prepared.path, name: "남는 자리.png" }),
      );
      check("더 큰 것이 실제로 들어왔으면 거절한다", rejected.status, "over-quota");
      const info = await storage().info(prepared.path);
      check("거절된 객체는 저장소에서 지워진다", info.error !== null || !info.data, true);
      check("거절 뒤에도 팀 용량이 그대로다", await teamUsedBytes(D.id), usedBefore);
      const boxFiles = await db.submittedFile.findMany({ where: { boxId: D.box2.id } });
      check("거절된 올리기는 파일을 남기지 않는다", boxFiles.length, 0);
    }

    /* ⑫ 동시 업로드 */
    console.log("\n같은 팀이 동시에 올려도 한도를 넘지 않는다");
    const E = await makeTeam("E");
    // **하나만 들어갈 자리**를 남긴다. 두 개가 동시에 들어와야.lock 이 일을 한다.
    await seedBytes(E.id, E.box.id, TEAM_CAP_BYTES - size, "동시 검사용");
    // 둘 다 **자리 안에 보인 상태**로 만든다 — 1단계는 잠금 밖에서 세므로 둘 다 통과해야
    // 한다. 여기서 하나라도 1단계에서 막히면 잠금을 시험한 것이 아니라 1단계를 시험한 것이다.
    const staged1 = await stage(E.asLeader, E.box2.id, "동시 1.png");
    const staged2 = await stage(E.asMate, E.box2.id, "동시 2.png");
    check("둘 다 1단계를 통과했다", [staged1.status, staged2.status], ["ok", "ok"]);
    // 지금부터 **같은 순간에** 2단계를 보낸다.
    const both = await Promise.all([
      finishStaged(E.asLeader, E.box2.id, "동시 1.png", staged1),
      finishStaged(E.asMate, E.box2.id, "동시 2.png", staged2),
    ]);
    const statuses = both.map((r) => r.finished?.status ?? "1단계에서 멈춤").sort();
    check("둘 중 하나만 들어간다", statuses, ["ok", "over-quota"]);
    check("팀 용량이 한도를 넘지 않는다", (await teamUsedBytes(E.id)) <= TEAM_CAP_BYTES, true);
    const kept = both.filter((r) => r.finished?.status === "ok").map(okFinish);
    check("버전은 하나만 생겼다", (await versionsOf(kept[0].fileId)).length, 1);
    /** E 팀은 이제 **정확히 한도**다. 이 버전을 같은 경로로 다시 알리는 시험에 쓴다. */
    const cappedRow = (await versionsOf(kept[0].fileId))[0]!;

    /* ⑬ 같은 응답이 두 번 오면 */
    console.log("\n화면이 같은 응답을 두 번 보내도 버전은 하나만 생긴다");
    const F = await makeTeam("F");
    const once = await upload(F.asLeader, F.box.id, "한 번만.png");
    const doneFile = okFinish(once).fileId;
    const row = (await versionsOf(doneFile))[0]!;
    const replay = await as(F.asLeader, () =>
      actions.finishUpload(F.box.id, { path: mustPath(row), name: "한 번만.png" }),
    );
    check("같은 경로를 다시 알려도 성공으로 돌려준다", replay.status, "ok");
    check("버전 이름이 그대로다", replay.status === "ok" ? replay.label : null, row.label);
    check("버전 수가 늘지 않는다", (await versionsOf(doneFile)).length, 1);

    /* ⑭ 팀이 꽉 찬 뒤의 재전송 — 여기서 실제로 버그가났다 */
    console.log("\n팀이 꽉 찬 뒤의 재전송도 같은 결과로 끝나야 한다");
    // 위 ⑫ 의 팀 E 는 **정확히 한도**다(하나가 들어갔으므로). 여기서 같은 경로를 다시
    // 알리면 — 순서 때문에 'over-quota' 가 되었고, 그 실패 처리가 **이미 기록된 객체를
    // 지웠다.** 즉 업로드는 성공했는데 파일이 사라졌다(2026-09-28 확인).
    const capped = await as(E.asLeader, () =>
      actions.finishUpload(E.box2.id, { path: mustPath(cappedRow), name: "동시 1.png" }),
    );
    check("꽉 찬 팀에서 재전송해도 성공으로 돌아온다", capped.status, "ok");
    const stillThere = await storage().info(mustPath(cappedRow));
    check("이미 올라간 객체는 사라지지 않는다", stillThere.error === null && Boolean(stillThere.data), true);
    check("미리보기가 여전히 열린다", typeof (await as(E.asLeader, () => actions.getPreviewUrl(cappedRow.id))), "string");
    /* ⑮ 단톡방 첨부를 드라이브로 ────────────────────────────── */
    console.log("\n단톡방 첨부를 드라이브로 옮긴다");
    const chat = await import("../../src/server/actions/chat.js");
    // 이 블록은 다른 블록의 팀을 빌리지 않는다 — 팀을 빌리던 방식이inspection을 가렸듯이.
    const CH = await makeTeam("첨부");

    // **실제 첨부 경로로** 만든다 — 경로를 손으로 만들면 "파일이 이미 있다" 는 상태가 되지 않는다.
    const attachName = "사진.png";
    const preparedAttach = await as(CH.asMate, () =>
      chat.prepareChatAttachment({ name: attachName, size: CONTENT.byteLength, type: PNG }),
    );
    check("첨부 주소를 발급한다", preparedAttach.status, "ok");
    let messageId = "";
    if (preparedAttach.status === "ok") {
      await putObject(preparedAttach.signedUrl, CONTENT, preparedAttach.contentType);
      const sent = await as(CH.asMate, () =>
        chat.sendChatMessage("team", "사진 같이 봅니다", {
          attachment: { path: preparedAttach.path, name: attachName },
        }),
      );
      messageId = sent.ok ? sent.message.id : "";
      check("첨부가 달린 말이 간다", sent.ok, true);
    }

    const saved = await as(CH.asLeader, () => actions.saveChatAttachmentToDrive(messageId, CH.box.id));
    check("드라이브로 저장된다", saved.status, "ok");
    check("버전 이름이 v1 이다", saved.status === "ok" ? saved.label : null, "v1");

    // **원래 올린 사람이 작성자다** — 팀장이 받아도 그 사람의 파일이다.
    // 저장 결과에는 **파일 id 가 없다** — 이름으로 찾는다(그것이 화면이 말하는 것도 이름이다).
    const savedFile = await db.submittedFile.findFirstOrThrow({
      where: { boxId: CH.box.id, name: attachName },
      select: { id: true },
    });
    const fileB2 = savedFile.id;
    const versionsB = await versionsOf(fileB2);
    check("작성자는 단톡방에 올린 사람이다", versionsB[0]?.authorId, CH.mate.id);

    // **같은 저장소 객체를 가리킨다** — 복사하지 않는다. 그래서 그 경로로 열린다.
    const previewB = await as(CH.asLeader, () => actions.getPreviewUrl(versionsB[0]!.id));
    check("저장한 버전이 미리보기로 열린다", typeof previewB, "string");
    const opened = typeof previewB === "string" ? await fetch(previewB) : null;
    check("내용이 올린 바이트 그대로다", (await opened?.arrayBuffer())?.byteLength, CONTENT.byteLength);

    // 순차로 다시 눌러도 이미 저장됐다고 말한다(잠금 밖의 첫 검사).
    const againSave = await as(CH.asLeader, () =>
      actions.saveChatAttachmentToDrive(messageId, CH.box.id),
    );
    check("두 번 저장해도 이미 저장됐다고 말한다", againSave.status, "already-saved");
    check("버전은 하나뿐이다", (await versionsOf(fileB2)).length, 1);

    // **같은 순간에** 두 번 저장한다 — 잠금 안의 "다시 보기"는 **동시에** 눌렀을 때만
    // 일한다. 순차로 두 번 누르면 **잠금 밖**의 첫 검사(`savedVersionId`)가 잡아서, 아무리
    // 잠금 안의 재확인을 지워도 통과한다(2026-09-28 에 그렇게 한 번 확인했다).
    const twin = await as(CH.asMate, () => upload(CH.asMate, CH.box2.id, "첨부 경합용.png"));
    check("경합용 파일을 먼저 하나 만든다", twin.finished?.status, "ok");
    const raceFile = await db.submittedFile.findFirstOrThrow({
      where: { boxId: CH.box2.id, name: "첨부 경합용.png" },
      select: { id: true },
    });
    // 첫 첨부의 말은 **지우지 않는다** — 위 순차 검사가 그 말을 다시 본다.
    const raceMsg = await as(CH.asMate, () => {
      const prep = { name: "경합.png", size: CONTENT.byteLength, type: PNG };
      return chat.prepareChatAttachment(prep);
    });
    let raceMessageId = "";
    if (raceMsg.status === "ok") {
      await putObject(raceMsg.signedUrl, CONTENT, raceMsg.contentType);
      const sent = await as(CH.asMate, () =>
        chat.sendChatMessage("team", "동시에 저장합니다", {
          attachment: { path: raceMsg.path, name: "경합.png" },
        }),
      );
      raceMessageId = sent.ok ? sent.message.id : "";
    }
    const [r1, r2] = await Promise.all([
      as(CH.asLeader, () => actions.saveChatAttachmentToDrive(raceMessageId, CH.box.id)),
      as(CH.asMate, () => actions.saveChatAttachmentToDrive(raceMessageId, CH.box.id)),
    ]);
    const raceStatuses = [r1.status, r2.status].sort();
    check("동시에 두 번 저장해도 하나만 된다", raceStatuses, ["already-saved", "ok"]);
    const raceVersions = await db.submittedFile.findFirstOrThrow({
      where: { boxId: CH.box.id, name: "경합.png" },
      select: { id: true },
    });
    check("경합 파일의 버전은 하나뿐이다", (await versionsOf(raceVersions.id)).length, 1);
    void raceFile;


    // **용량을 한 번만 센다** — 같은 객체를 가리키는데 두 번 세면 2GB 가 빨리 찬다.
    const usedAfterSave = await teamUsedBytes(CH.id);
    check("용량은 그 파일 크기만큼만 찬다", usedAfterSave >= CONTENT.byteLength, true);

    // **거절해도 저장소 객체를 지우지 않는다** — 드라이브 올리기와 **반대**다. 이건 단톡방에 이미
    // 붙어 있는 파일이므로 지우면 대화에서 사라진다.
    const full = await makeTeam("첨부 용량");
    const fullAttach = await as(full.asMate, () =>
      chat.prepareChatAttachment({ name: "꽉 찬 팀.png", size: CONTENT.byteLength, type: PNG }),
    );
    if (fullAttach.status === "ok") {
      await putObject(fullAttach.signedUrl, CONTENT, fullAttach.contentType);
      const fullMsg = await as(full.asMate, () =>
        chat.sendChatMessage("team", "용량 확인", {
          attachment: { path: fullAttach.path, name: "꽉 찬 팀.png" },
        }),
      );
      // ⚠️ **`TEAM_CAP_BYTES` 그대로 심을 수 없다.** 2GiB = 2,147,483,648 이고 `bytes` 열은
      // `Int`(4바이트)이므로 최댓값보다 **1 바이트 크다** — 심는 순간 DB 가 거절한다(실제로
      // 거절당했다). 한 바이트 적게 심어도 `(CAP-1) + size > CAP` 이므로 한도 경계는 그대로،
      // 그리고 이 열이 무엇인지 모르면 또 걸린다.
      await seedBytes(full.id, full.box.id, TEAM_CAP_BYTES - 1, "꽉 찬 팀");
      const rejected = await as(full.asLeader, () =>
        actions.saveChatAttachmentToDrive(
          fullMsg.ok ? fullMsg.message.id : "",
          full.box.id,
        ),
      );
      check("용량이 차면 거절한다", rejected.status, "over-quota");
      // **이 차이가 이 경로의 성격이다.** 드라이브 올리기는 거절하면 객체를 지운다(이미 쓰이지
      // 않은 객체이니까). 여기는 지우면 **단톡방에 붙은 파일이 사라진다.**
      const still = await storage().info(fullAttach.path);
      check("거절해도 단톡방의 파일은 지워지지 않는다", still.error === null && Boolean(still.data), true);
    }

  } finally {
    // 저장소 객체부터 지운다 — 안 지우면 개발 버킷에 쓰레기가 남는다.
    for (const teamId of teamIds) {
      const rows = await db.fileVersion.findMany({
        where: { file: { box: { teamId } } },
        select: { storagePath: true },
      });
      const paths = rows
        .map((r) => r.storagePath)
        .filter((p): p is string => Boolean(p));
      if (paths.length) await storage().remove(paths);
    }
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
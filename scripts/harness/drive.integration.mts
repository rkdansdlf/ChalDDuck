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
    const leader = await db.member.create({ data: { teamId: team.id, name: `김민준${suffix}` } });
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
      box,
      box2,
      leader,
      asLeader: await token(leader.id),
      asMate: await token(mate.id),
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

  /** 올리기 전체 — 사람이 하는 순서 그대로: 1단계 → 저장소 → 2단계. */
  async function upload(
    token: string,
    boxId: string,
    name: string,
    opts: { fileId?: string; bytes?: Buffer } = {},
  ) {
    const bytes = opts.bytes ?? CONTENT;
    const prepared = await as(token, () =>
      actions.prepareUpload(boxId, { name, size: bytes.length, type: PNG }),
    );
    if (prepared.status !== "ok") return { prepared, finished: undefined };
    await putObject(prepared.signedUrl, bytes, prepared.contentType);
    const finished = await as(token, () =>
      actions.finishUpload(boxId, { path: prepared.path, name }, opts.fileId),
    );
    return { prepared, finished };
  }

  /**
   * 성공한 올리기 결과를 **확인해서** 돌려준다. `!` 로 침묵하게 넘기지 않는다 — 앞의 검사가
   * 이미 "성공" 이라고 했으니 여기서 실패하면 그 두 검사가 거짓말한 것이다.
   */
  type OkFinish = Extract<Awaited<ReturnType<typeof actions.finishUpload>>, { status: "ok" }>;
  function okFinish(r: { finished?: Awaited<ReturnType<typeof actions.finishUpload>> }): OkFinish {
    if (!r.finished || r.finished.status !== "ok") {
      throw new Error(`성공한 올리기를 전제하는데 결과가 ${JSON.stringify(r.finished)} 이다`);
    }
    return r.finished;
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
      select: { id: true, label: true, bytes: true, restoredFromId: true, storagePath: true, fileId: true },
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
    const restoredLabel = await as(A.asMate, () => actions.restoreFileVersion(fileId, v1.id));
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

    /* ⑧ 팀 안에서의 복원 — 지금 계약(결정 대기 중) */
    console.log("\n팀 안의 복원 — 지금은 누구나 (결정 대기 중)");
    // ⚠️ **지금의 계약**을 고정한다. "팀 안이면 누구나" 는 2026-09-28 기준 사실이고 좁힐지
    // 말지는 아직 결정되지 않았다(`list-open-decisions.mjs` 2번). 결정을 내리면 **이 줄만**
    // 바꾸면 된다 — 규칙이 바뀌었다는 사실이 여기서 드러난다.
    const beforeMate = (await versionsOf(fileId)).length;
    const mateRestore = await as(A.asMate, () => actions.restoreFileVersion(fileId, v2.id));
    check("팀 안에서는 누구나 복원된다 (결정이 바뀌면 이 줄이 바뀐다)", typeof mateRestore, "string");
    check("복원이 버전으로 남는다", (await versionsOf(fileId)).length, beforeMate + 1);

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
    // 크기의 차이** 뿐이다. 서명 주소로는 무엇이든 올릴 수 있으므로 이것이 규칙의 핵���이다.
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
    const both = await Promise.all([
      upload(E.asLeader, E.box2.id, "동시 1.png"),
      upload(E.asMate, E.box2.id, "동시 2.png"),
    ]);
    const statuses = both.map((r) => r.finished?.status).sort();
    check("둘 중 하나만 들어간다", statuses, ["ok", "over-quota"]);
    check("팀 용량이 한도를 넘지 않는다", (await teamUsedBytes(E.id)) <= TEAM_CAP_BYTES, true);
    const kept = both.map(okFinish);
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
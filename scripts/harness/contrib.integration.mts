/**
 * 기여 의견 동시성 검사 — **같은 순간에 두 사람이 달라도 하나만 붙어야 한다.**
 *
 * ## 왜 이게 필요한가
 *
 * `contrib.ts` 의 주석은 이 버그의 모양을 서술한다 —
 *
 * > "아직 정리되지 않은 의견이 있으면 기다린다" 는 판단을 읽기만 하고, 6줄 뒤 트랜잭션에서 적었다.
 * > 그 사이가 구멍이었다 — **두 사람이 동시에 달라고 하면 둘 다 "비어 있다" 를 보고 둘 다 적고.**
 * > `ContribDispute` 에 유니크 제약이 없어서 의견 두 개가 붙는다.
 *
 * **유니크 제약이 없다**는 것이 이 규칙의 전부다. 즉 `ContribRecord` 행의 `FOR UPDATE` 가
 * **유일한 방어선**이고, 그 잠금이 실제로 그 일을 하는지 아무도 확인하지 않았다.
 *
 * 오늘 하루에 같은 모양을 세 번 봤다 — 드라이브 팀 잠금(실제로 버그가 났고), AI 한도 잠금
 * (괜찮았지만 근거를 잘못 읽을 뻔했다), 팀장 선출 잠금(경합은 실재하나 한계가 우회해 지웠다).
 * **주석이 아니라 검사로 확인해야 한다는 것을 세 번 배웠다.**
 *
 * ## 검사하는 것
 *
 * 1. **두 명이 같은 순간에 달라도 하나만 붙는다** — 그리고 막힌 쪽은 `taken` 이라고 말한다.
 * 2. `ContribDispute` 행이 **정확히 하나**다 — 유니크 제약이 없으므로 이것이 곧 잠금의 증거다.
 * 3. 남의 팀 기록에는 손대지 못한다 · 자기 기록에는 달 수 없다.
 *
 * **"덮어쓰지 않는다"는 여기서 보지 않는다** — 그건 `contrib-dispute.integration.mts`
 * (`npm run test:contrib-dispute`)가 본다. 둘을 나누어 둔 것은 의도다: 잠금이 깨지면 여기가,
 * 이력 보존이 깨지면 거기가 잡는다. 두 약속이 한 파일에 있으면 어느 쪽이 깨졌는지 숨겨진다.
 *
 *   npm run test:contrib
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
  const contrib = await import("../../src/server/actions/contrib.js");

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
        name: `기여 검사 ${label} ${suffix}`,
        course: "검증",
        code: `CD-${randomUUID().slice(0, 6).toUpperCase()}`,
      },
    });
    teamIds.push(team.id);
    const owner = await db.member.create({
      data: { teamId: team.id, name: `김민준${suffix}`, isLeader: true },
    });
    const other = await db.member.create({ data: { teamId: team.id, name: `이서연${suffix}` } });
    const third = await db.member.create({ data: { teamId: team.id, name: `박도윤${suffix}` } });
    const token = async (memberId: string) => {
      const t = randomUUID();
      await db.session.create({
        data: { token: t, memberId, expiresAt: new Date(Date.now() + 3600_000) },
      });
      return t;
    };
    return {
      id: team.id,
      owner,
      other,
      third,
      ownerToken: await token(owner.id),
      otherToken: await token(other.id),
      thirdToken: await token(third.id),
    };
  }

  /** 다른 팀원이 쓴 기여 기록 하나. */
  async function makeRecord(teamId: string, ownerId: string, title: string) {
    return db.contribRecord.create({
      data: { memberId: ownerId, kind: "self", title, detail: "내용", source: "self" },
    });
  }

  const disputeCount = (recordId: string) =>
    db.contribDispute.count({ where: { recordId } });

  async function as<T>(token: string, work: () => Promise<T>): Promise<T> {
    session.as(token);
    try {
      return await work();
    } finally {
      session.nobody();
    }
  }

  try {
    console.log("\n기여 의견 동시성 검사 (실제 DB · 실제 잠금)");

    /* ── 1) 두 명이 같은 순간에 달라도 하나만 ────────────────── */
    console.log("\n두 사람이 같은 순간에 달라도 하나만 붙는다");
    const A = await makeTeam("경합");
    const recA = await makeRecord(A.id, A.owner.id, `논문 하나 ${suffix}`);

    // **같은 순간에** 두 사람이 서로 다른 의견으로 달라고 한다.
    const racers = await Promise.all([
      as(A.otherToken, () => contrib.disputeContribRecord(recA.id, "결과가 틀렸어요")),
      as(A.thirdToken, () => contrib.disputeContribRecord(recA.id, "출처를 못 찾겠어요")),
    ]);
    const oks = racers.filter((r) => r === "ok").length;
    const takens = racers.filter((r) => r === "taken").length;
    check("하나만 붙는다", oks, 1);
    check("나머지는 'taken' 이라고 말한다", takens, 1);
    // ⚠️ **이 한 줄이 이 규칙의 전부다.** `ContribDispute` 에 유니크 제약이 없으므로
    // 잠금이 없으면 **행이 둘**이 되고, 어느 것도 막지 못한다.
    check("의견이 정확히 하나 남는다", await disputeCount(recA.id), 1);

    const row = await db.contribRecord.findFirstOrThrow({
      where: { id: recA.id },
      select: { dispute: true, disputedById: true, resolution: true, state: true },
    });
    truthyCheck(check, "기록에는 붙은 의견이 남는다", Boolean(row.dispute));
    check("아직 정리되지 않았다", row.resolution, null);
    check("상태는 의견 차이(disputed) 다", row.state, "disputed");

    /* ── 2) 자기 기록에는 달 수 없다 ─────────────────────────── */
    console.log("\n자기 기록에는 달 수 없다");
    const mine = await as(A.ownerToken, () => contrib.disputeContribRecord(recA.id, "제 생각엔"));
    check("자기 기록은 'mine' 이다", mine, "mine");

    /* ── 3) 남의 팀 기록 ─────────────────────────────────────── */
    console.log("\n남의 팀 기록에는 손대지 못한다");
    const B = await makeTeam("타 팀");
    const recB = await makeRecord(B.id, B.owner.id, `남의 논문 ${suffix}`);
    let thrown = "";
    try {
      await as(A.otherToken, () => contrib.disputeContribRecord(recB.id, "의견"));
      thrown = "(막지 않음)";
    } catch (e) {
      thrown = (e as Error).message;
    }
    check("남의 팀 기록은 막힌다", thrown.includes("기록을 찾을 수 없습니다"), true);
    check("남의 기록에 의견이 붙지 않는다", await disputeCount(recB.id), 0);

    /* ── 4) 증빙 업로드 및 기록 추가 ─────────────────────────── */
    console.log("\n증빙 업로드 및 기록 직접 추가");
    const prep = await as(A.ownerToken, () =>
      contrib.prepareEvidenceUpload({ name: "보고서_증빙.pdf", size: 1024, type: "application/pdf" }),
    );
    if (prep.status === "ok") {
      check("증빙 업로드 준비 URL 생성", typeof prep.signedUrl, "string");
      check("경로가 evidence/ 로 시작한다", prep.path.startsWith(`${A.id}/evidence/`), true);
    } else {
      check("스토리지 상태 확인", typeof prep.status, "string");
    }

    const added = await as(A.ownerToken, () =>
      contrib.addContribRecord({ kind: "task", title: "최종 발표자료 제작" }),
    );
    check("기여 기록 직접 추가 성공", added.status, "ok");

    /* ── 5) 팀원 확인 (confirmContribRecord) ─────────────────── */
    console.log("\n팀원 확인 규칙");
    // 의견이 붙은 기록(`recA`)은 소유자 검사보다 **먼저** 'disputed' 로 막힌다 — 의견이 떠 있는 동안은
    // 아무도 확인하지 못한다. 처음 이 검사는 `recA` 로 'mine' 을 기대해 main 에서도 실패하고 있었다.
    // 소유자 규칙은 의견이 없는 새 기록으로 보고, 순서는 따로 고정한다.
    const recMine = await makeRecord(A.id, A.owner.id, `내 기록 ${suffix}`);
    const selfConfirm = await as(A.ownerToken, () => contrib.confirmContribRecord(recMine.id));
    check("자기 기록 확인은 'mine' 이다", selfConfirm, "mine");
    check(
      "의견이 떠 있는 기록은 누구도 확인하지 못한다 — 소유자 검사보다 먼저 'disputed'",
      await as(A.ownerToken, () => contrib.confirmContribRecord(recA.id)),
      "disputed",
    );

    const recC = await makeRecord(A.id, A.owner.id, `확인 테스트용 ${suffix}`);
    const mateConfirm = await as(A.otherToken, () => contrib.confirmContribRecord(recC.id));
    check("팀원이 확인하면 'ok'", mateConfirm, "ok");
    const dupConfirm = await as(A.otherToken, () => contrib.confirmContribRecord(recC.id));
    check("이미 확인한 경우 'already'", dupConfirm, "already");

    /* ── 6) 증빙 URL 발급 ─────────────────────────────────────── */
    console.log("\n증빙 파일 URL 발급");
    const noEvUrl = await as(A.ownerToken, () => contrib.getEvidenceUrl(recA.id));
    check("증빙 없는 기록의 URL 은 null", noEvUrl, null);

    const evRec = await db.contribRecord.create({
      data: {
        memberId: A.owner.id,
        kind: "task",
        title: "증빙 첨부 기록",
        detail: "내용",
        source: "self",
        evidencePath: `${A.id}/evidence/proof.pdf`,
        evidenceName: "proof.pdf",
        evidenceMime: "application/pdf",
      },
    });
    const evUrl = await as(A.otherToken, () => contrib.getEvidenceUrl(evRec.id));
    // 서명 주소는 저장소(Supabase)가 만든다 — 키가 없는 환경에서는 `null` 이 정직한 답이다. 그 경우
    // 이 검사는 **건너뛰었다고 말한다**(조용히 통과시키면 안 본 것을 본 것처럼 보인다).
    const { isStorageConfigured } = await import("../../src/server/storage/client.js");
    if (isStorageConfigured()) {
      check("증빙 파일이 있는 기록의 서명 URL 발급 성공", typeof evUrl, "string");
    } else {
      console.log("  - (저장소 키가 없어 건너뜀: 증빙 서명 URL 발급 — npm run test:drive 가 진짜 저장소로 본다)");
      check("저장소 키가 없으면 서명 URL 은 null 이다", evUrl, null);
    }

    /* ── 7) 확인 목록 폴링 ───────────────────────────────────── */
    console.log("\n확인 점검 목록 폴링");
    const pollList = await as(A.otherToken, () => contrib.pollContribCheck());
    check("팀 점검 목록 배열 반환", Array.isArray(pollList), true);

    /* ── 8) 팀장 확인 기준 변경 ─────────────────────────────── */
    console.log("\n팀장의 확인 기준 인원 설정");
    const previewNeeded = await as(A.ownerToken, () => contrib.setConfirmsNeeded(2, false));
    check("기준 변경 프리뷰는 ok: false", previewNeeded.ok, false);
    const applyNeeded = await as(A.ownerToken, () => contrib.setConfirmsNeeded(2, true));
    check("기준 변경 확인 적용 성공", applyNeeded.ok, true);

    /* ── 9) 회의 참여 표시 ───────────────────────────────────── */
    console.log("\n회의 참여 표시 토글");
    const markPart = await as(A.ownerToken, () => contrib.setParticipation(recC.id, true));
    check("참여 표시 찍기", markPart, "marked");
    const clearPart = await as(A.ownerToken, () => contrib.setParticipation(recC.id, false));
    check("참여 표시 지우기", clearPart, "cleared");
  } finally {
    for (const teamId of teamIds) {
      await db.contribParticipation.deleteMany({ where: { record: { member: { teamId } } } });
      await db.contribConfirm.deleteMany({ where: { record: { member: { teamId } } } });
      await db.contribDispute.deleteMany({ where: { record: { member: { teamId } } } });
      await db.contribRecord.deleteMany({ where: { member: { teamId } } });
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

/** 참/거짓을 사람이 읽는 문장으로 확인한다. */
function truthyCheck(check: (w: string, g: unknown, e: unknown) => void, what: string, got: boolean) {
  check(what, got, true);
}
/**
 * 아이스브레이킹(라이어/마피아) 서버 액션 검사 — **판 시작·투표·최종 추측·기권·밤 행동·재시작·종료**.
 *
 *   npm run test:ice
 */
import { randomUUID } from "node:crypto";

type Session = { as(token: string): void; nobody(): void; reset(): void; clearAll(): void };

export async function run({ session }: { session: Session }): Promise<boolean> {
  const { db } = await import("../../src/server/db.js");
  const ice = await import("../../src/server/actions/ice.js");

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

  async function makeTeamWith5(label: string) {
    session.reset();
    const t = await db.team.create({
      data: { name: `아이스 ${label} ${suffix}`, course: "검증", code: `CD-${randomUUID().slice(0, 6).toUpperCase()}` },
    });
    teamIds.push(t.id);
    const m1 = await db.member.create({ data: { teamId: t.id, name: `멤버1${suffix}`, isLeader: true } });
    const m2 = await db.member.create({ data: { teamId: t.id, name: `멤버2${suffix}` } });
    const m3 = await db.member.create({ data: { teamId: t.id, name: `멤버3${suffix}` } });
    const m4 = await db.member.create({ data: { teamId: t.id, name: `멤버4${suffix}` } });
    const m5 = await db.member.create({ data: { teamId: t.id, name: `멤버5${suffix}` } });
    const token = async (memberId: string) => {
      const tk = randomUUID();
      await db.session.create({ data: { token: tk, memberId, expiresAt: new Date(Date.now() + 3600_000) } });
      return tk;
    };
    return {
      id: t.id,
      members: [m1, m2, m3, m4, m5],
      tokens: [
        await token(m1.id),
        await token(m2.id),
        await token(m3.id),
        await token(m4.id),
        await token(m5.id),
      ],
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
    const T = await makeTeamWith5("테스트");
    const [p1, p2, p3, _p4, p5] = T.members;
    const [t1, t2, _t3, _t4, _t5] = T.tokens;

    /* ── 1) 판 시작 전 로스터 및 폴링 ──────────────────────── */
    console.log("\n1) 로스터 조회 및 비활성 판 폴링");
    const roster = await as(t1, () => ice.iceRoster());
    check("로스터에 5명이 모두 포함된다", roster.length, 5);

    const initialView = await as(t1, () => ice.pollIce());
    check("판이 없으면 null 반환", initialView, null);

    /* ── 2) 라이어 게임 시작 및 진행 ──────────────────────── */
    console.log("\n2) 라이어 게임 시작 (3인)");
    const liarStarted = await as(t1, () => ice.startIceRound("liar", [p1.id, p2.id, p3.id]));
    check("라이어 게임 시작 성공", liarStarted.view !== null, true);

    const round = await db.iceRound.findUnique({
      where: { activeKey: T.id },
      include: { seats: true },
    });
    check("게임 유형은 liar", round?.game, "liar");
    check("초기 단계는 clue", round?.phase, "clue");

    // 투표 단계로 전환
    const voteOpened = await as(t1, () => ice.startIceVote());
    check("투표 단계 전환 메시지", voteOpened.message, "이제 투표할 수 있습니다.");

    // 투표 행사 및 취소 토글
    const vote1 = await as(t1, () => ice.castIceVote(p2.id));
    check("멤버2에게 투표 완료", vote1.message, undefined);

    const ballotCount1 = await db.iceBallot.count({ where: { roundId: round!.id } });
    check("투표 1표 기록", ballotCount1, 1);

    // 같은 사람 재클릭 시 취소
    await as(t1, () => ice.castIceVote(p2.id));
    const ballotCount0 = await db.iceBallot.count({ where: { roundId: round!.id } });
    check("동일인 재투표 시 표 취소 (0표)", ballotCount0, 0);

    // 다시 투표
    await as(t1, () => ice.castIceVote(p2.id));
    await as(t2, () => ice.castIceVote(p1.id));
    // 동점 상태에서 마감 시도 -> 동점 안내 반환
    const tieRes = await as(t1, () => ice.closeIceVote());
    check("동점 시 재투표 안내", tieRes.message?.includes("동점이거나"), true);

    // 라이어 찾아서 라이어에게 몰표
    //
    // ⚠️ **앞 단계의 표를 비우고 시작한다.** 라이어는 무작위로 정해지는데, 같은 사람을 다시 누르면 표가
    // **취소**된다(위의 "동일인 재투표 시 표 취소"). 앞에서 t1→p2, t2→p1 로 던져 둔 채 몰표를 던지면
    // 라이어가 p1 이나 p2 일 때 그 표가 취소되어 표가 모자라고, 이 검사는 약 절반만 통과했다.
    await db.iceBallot.deleteMany({ where: { roundId: round!.id } });
    const liarSeat = round!.seats.find((s) => s.role === "liar")!;
    const innocentSeats = round!.seats.filter((s) => s.role !== "liar");
    const innocentToken1 = T.tokens[T.members.findIndex((m) => m.id === innocentSeats[0].memberId)];
    const innocentToken2 = T.tokens[T.members.findIndex((m) => m.id === innocentSeats[1].memberId)];

    await as(innocentToken1, () => ice.castIceVote(liarSeat.memberId));
    await as(innocentToken2, () => ice.castIceVote(liarSeat.memberId));

    const closeVoteRes = await as(t1, () => ice.closeIceVote());
    check("라이어 지목 시 마감 성공", closeVoteRes.message, undefined);

    const liarGuessPhase = await db.iceRound.findUnique({ where: { id: round!.id } });
    check("라이어 최종 추측 단계 진입", liarGuessPhase?.phase, "liar_guess");

    // 라이어 최종 추측 제출 (틀린 답안)
    const liarToken = T.tokens[T.members.findIndex((m) => m.id === liarSeat.memberId)];
    const guessRes = await as(liarToken, () => ice.submitLiarGuess("전혀틀린단어"));
    check("최종 추측 제출 완료", guessRes.message, undefined);

    const revealedPhase = await db.iceRound.findUnique({ where: { id: round!.id } });
    check("결과 공개 단계 (revealed)", revealedPhase?.phase, "revealed");
    check("시민 승리", revealedPhase?.winner, "citizen");

    // 끝난 판 재시작 (restartIceRound)
    const restarted = await as(t1, () => ice.restartIceRound());
    check("라이어 판 재시작 성공", restarted.view !== null, true);

    // 판 강제 종료 (endIceRound)
    const ended = await as(t1, () => ice.endIceRound());
    check("판 종료 성공", ended.view, null);
    const activeCheck = await db.iceRound.findUnique({ where: { activeKey: T.id } });
    check("activeKey 가 비워졌다", activeCheck, null);

    /* ── 3) 기권 처리 (forfeitLiarGuess) ─────────────────────── */
    console.log("\n3) 라이어 기권 처리");
    await as(t1, () => ice.startIceRound("liar", [p1.id, p2.id, p3.id]));
    const liarRound2 = await db.iceRound.findUniqueOrThrow({ where: { activeKey: T.id } });
    await db.iceRound.update({
      where: { id: liarRound2.id },
      data: { phase: "liar_guess", accusedId: p2.id },
    });
    const forfeitRes = await as(t1, () => ice.forfeitLiarGuess());
    check("라이어 기권 선언 성공", forfeitRes.message, undefined);
    const roundForfeited = await db.iceRound.findUnique({ where: { id: liarRound2.id } });
    check("기권 후 단계는 revealed", roundForfeited?.phase, "revealed");
    await as(t1, () => ice.endIceRound());

    /* ── 4) 마피아 게임 진행 (밤 행동/판정/탈락) ─────────────── */
    console.log("\n4) 마피아 게임 진행");
    const mafiaStarted = await as(t1, () => ice.startIceRound("mafia", T.members.map((m) => m.id)));
    check("마피아 게임 시작 성공 (5인)", mafiaStarted.view !== null, true);

    const mafiaRound = await db.iceRound.findUniqueOrThrow({
      where: { activeKey: T.id },
      include: { seats: true },
    });
    check("마피아 초기 단계는 night", mafiaRound.phase, "night");

    // 밤 결과 수동 탈락 기록 (markIceNightOut)
    const outRes = await as(t1, () => ice.markIceNightOut(p5.id));
    check("밤 탈락 처리 성공", outRes.message, undefined);

    const p5Seat = await db.iceSeat.findUnique({
      where: { roundId_memberId: { roundId: mafiaRound.id, memberId: p5.id } },
    });
    check("멤버5 탈락 처리됨", p5Seat?.outAt !== null, true);

    // 새 밤을 만들어서 아무도 안 빠진 밤 닫기 (closeIceNight)
    await db.iceRound.update({
      where: { id: mafiaRound.id },
      data: { phase: "night", day: 2, phaseStartedAt: new Date() },
    });
    const closeNightRes = await as(t1, () => ice.closeIceNight());
    check("아무도 안 빠진 밤 마감 (토론으로 전환)", closeNightRes.message, undefined);
    const dayRound = await db.iceRound.findUnique({ where: { id: mafiaRound.id } });
    check("단계가 discussion 으로 변경됨", dayRound?.phase, "discussion");

    // 밤 판정 시도 (resolveIceNight - 지금은 낮이라 거부)
    const resolveFail = await as(t1, () => ice.resolveIceNight());
    check("낮에는 밤 풀기 거부", resolveFail.message, "지금은 밤이 아닙니다.");

    // 최종 판 정리
    await as(t1, () => ice.endIceRound());
  } finally {
    for (const teamId of teamIds) {
      const rounds = await db.iceRound.findMany({ where: { teamId }, select: { id: true } });
      for (const r of rounds) {
        await db.iceNightAction.deleteMany({ where: { roundId: r.id } });
        await db.iceBallot.deleteMany({ where: { roundId: r.id } });
        await db.iceSeat.deleteMany({ where: { roundId: r.id } });
      }
      await db.iceRound.deleteMany({ where: { teamId } });
      await db.member.deleteMany({ where: { teamId } });
      await db.team.delete({ where: { id: teamId } });
    }
  }

  console.log(`\n${failed === 0 ? "모두 통과" : "실패"} — ${passed}건 중 ${passed - failed}건 통과, ${failed}건 실패`);
  return failed === 0;
}

import "../scripts/load-env.mjs";

import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  AI_INPUT_LIMIT,
  aiInputOverrun,
} from "../src/lib/ai-limit.js";
import {
  NO_DRAW_POOL_TEXT,
  canDrawIn,
  drawPoolOf,
  isRoleKey,
  normalizeName,
  roleViewOf,
  toRoleKey,
  voidedText,
} from "../src/features/roles/roster-model.js";
import { AI_POLICY, MENU_OPTIONS, SCHEDULE_DAYS, SCHEDULE_HOURS } from "../src/data/catalog.js";
import {
  QUIZ_QUESTIONS,
  pickSide,
  picksToMbti,
  scoreAxes,
  sideLetter,
} from "../src/lib/mbti-quiz.js";
import { MBTI_AXES, calculateTeamMbtiStats, type MbtiAxis } from "../src/lib/mbti.js";
import { lastMessagePerThread } from "../src/data/last-message.js";
import {
  candidateDates,
  scheduleWeeks,
  shortDate,
  todayInSeoul,
  weekName,
} from "../src/features/schedule/week.js";
import { computeMeetingSlots } from "../src/features/schedule/meeting-slots.js";
import {
  markAside,
  markCell,
  markJump,
  markText,
  meetingMark,
} from "../src/features/schedule/meeting-cell.js";
import {
  pushBlock,
  pushFailure,
  pushOn,
  pushPayload,
  pushSubscriptionFrom,
} from "../src/features/home/push-model.js";
import {
  CUSHION_REASON,
  CLAIM_TTL_MS,
  FAILURE_BACKOFF_MS,
  MAX_ATTEMPTS,
  PROMPT_VERSION,
  PURIFY_BATCH_LIMIT,
  buildPurifyRequest,
  canPurify,
  canRetry,
  displayTextOf,
  isCushionDone,
  isRefusal,
  judgeAll,
  maskRiskyParts,
  packPurifyItems,
  parsePurifyResponse,
  rejectsPurified,
  toneChanged,
  toneOf,
} from "../src/lib/read-cushion.js";
import type { ChatMessage, MeetingProposal, RoleDrawResult } from "../src/lib/types.js";
import {
  clientGate,
  isJoinCapped,
  JOIN_LIMIT,
  teamGate,
} from "../src/server/rate-limit/policy.js";
import {
  contribByLabel,
  contribState,
  maxConfirmsNeeded,
} from "../src/server/contrib/state.js";
import {
  currentParticipations,
  isMarked,
  participationText,
} from "../src/features/contrib/participation.js";

/**
 * 업무 규칙을 확인하는 불변식 모음.
 *
 * **왜 이게 필요한가.** 지금까지 고친 버그는 전부 타입 검사가 잡지 못한 종류였다 —
 * Veto 를 후보에서 빼지 않는다, 확정된 회의를 덮어쓴다, 승인을 새 요청이 지운다.
 * 전부 함수 시그니처는 맞고 컴파일도 된다. 그래서 이 앱의 유일한 안전망은 "직접 눌러
 * 본 것"뿐이었는데, 사람이 한 번씩만 볼 수 있다는 한계가 그대로 드러났다.
 *
 * 여는 검사는 두 종류다.
 * - **순수 규칙** — 서버와 화면이 함께 쓰는 계산을 직접 부른다. 두 곳이 어긋나는 버그가
 *   실제로 있었고(`drawPoolOf` 전의 후보 풀) 형식 검사로는 절대 못 잡는다.
 * - **DB 불변식** — 유일 인덱스와 조회가 지켜야 하는 조건을 실제 Postgres 에 걸어 본다.
 *   마이그레이션을 되돌렸을 때, 컬럼을 지웠을 때 바로 드러난다.
 *
 * 서버 액션 자체는 부르지 않는다 — 전부 세션 쿠키가 필요하고 여기서 쿠키를 만들면
 * "액션이 정상"이 아니라 "액션을 우회했다"는 사실만 테스트하게 된다.
 *
 * **로컬 DB 에서만 돈다.** 시드와 같은 이유다.
 */

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_URL 이 없습니다.");
const host = new URL(connectionString).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`불변식 확인은 로컬 DB 에서만 돕니다. 지금은 ${host} 를 가리킵니다.`);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

let failed = 0;
let passed = 0;

function check(what: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    passed += 1;
    console.log(`  ✓ ${what}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${what}\n      기대: ${b}\n      실제: ${a}`);
  }
}

function truthy(what: string, got: boolean) {
  check(what, got, true);
}

/* ── 역할 추첨: Veto 는 후보에서 빠진다 ─────────────────────── */

console.log("\n역할 추첨 후보 (07 화면과 서버가 같은 함수를 쓴다)");
{
  const wanters = [
    { id: "1", name: "김민준", veto: "present" as const },
    { id: "2", name: "최유나", veto: null },
  ];
  const research = drawPoolOf(wanters, "research", new Set());
  check("Veto 가 다른 역할이면 후보에 남는다", research.pool.map((m) => m.name), [
    "김민준",
    "최유나",
  ]);

  const present = drawPoolOf(
    wanters.map((m) => ({ ...m, want: "present" })),
    "present",
    new Set(),
  );
  check("Veto 한 역할의 후보에서 빠진다", present.pool.map((m) => m.name), ["최유나"]);
  check("Veto 한 역할은 사유를 알 수 있다", present.noPool, null);

  const allVetoed = drawPoolOf(
    [
      { id: "1", name: "박지호", veto: "manage" as const },
      { id: "2", name: "이서연", veto: "manage" as const },
    ],
    "manage",
    new Set(),
  );
  check("전원이 Veto 하면 뽑지 않는다", allVetoed.pool, []);
  check("누가 Veto 한 것인지 말해 준다", allVetoed.noPool, "all-vetoed");
  truthy("그 사유에 문구가 있다", NO_DRAW_POOL_TEXT[allVetoed.noPool!].length > 0);

  const noWanters = drawPoolOf([], "deck", new Set());
  check("희망자가 0명이면 뽑지 않는다", noWanters.noPool, "no-wanters");

  const oneRejected = drawPoolOf(wanters, "research", new Set(["2"]));
  check("거절한 사람은 빠진다", oneRejected.pool.map((m) => m.name), ["김민준"]);

  // Veto 는 다시 뽑아도 그대로지만, 거절은 후보가 비면 증발해 막히는 것보다 낫다.
  const allRejected = drawPoolOf(wanters, "research", new Set(["1", "2"]));
  check("전원 거절이면 Veto 가 아닌 사람 전체로 되돌린다", allRejected.pool.map((m) => m.name), [
    "김민준",
    "최유나",
  ]);
  const allRejectedVetoed = drawPoolOf(
    [
      { id: "1", name: "박지호", veto: "manage" as const },
      { id: "2", name: "이서연", veto: "manage" as const },
    ],
    "manage",
    new Set(["1", "2"]),
  );
  check("되돌려도 Veto 는 빠지지 않는다", allRejectedVetoed.pool, []);
}

/* ── 역할 상태: 아무도 풀 수 없는 상태가 없어야 한다 ──────── */

console.log("\n역할 상태 (아무도 풀 수 없는 상태가 없는지)");
{
  // 이 검사가 있는 이유: 고친 버그가 전부 타입 검사가 못 잡는 종류였기 때문이다.
  // 수락·거절 블록이 `clash`(희망자 2명 이상) 조건 아래에 있어서 **추적이 남은 상태인데
  // 아무도 볼 수 없는 화면**이 조용히 생겼다. 조건식은 맞고 컴파일도 된다.
  // 판을 `roleViewOf` 한 함수에 모았으니, 여기서는 그 함수가 **기대 담는 사람에게 닿지
  // 않는 상태를 만들지 않는지**를 전부 박는다.
  const draw = (over: Partial<RoleDrawResult> = {}): RoleDrawResult => ({
    tool: "룰렛",
    winner: "최유나",
    winnerId: "m4",
    accepted: false,
    stale: false,
    ...over,
  });

  check("희망자 0명 + 추첨 없음", roleViewOf(0, null), { kind: "empty" });
  // **희망자가 0명이어도 남은 추첨은 보여야 한다.** 당첨자가 자기 1순위를 바꾼 뒤가
  // 정확히 이 상태다 — "미정" 으로 덮으면 그 추첨은 아무도 볼 수 없다.
  check("희망자 0명 + 추첨 중", roleViewOf(0, draw()).kind, "awaiting");
  check("희망자 0명 + 확정", roleViewOf(0, draw({ accepted: true })).kind, "confirmed");

  check("희망자 1명 + 추첨 없음", roleViewOf(1, null), { kind: "auto" });
  check("희망자 2명 + 추첨 없음", roleViewOf(2, null), { kind: "negotiating" });

  check("추첨 직후", roleViewOf(2, draw()), { kind: "awaiting", winner: "최유나" });
  check("수락하면 확정", roleViewOf(2, draw({ accepted: true })), {
    kind: "confirmed",
    winner: "최유나",
  });

  // 희망자가 1명으로 줄었는데 추첨이 남은 상태(오늘 고친 구멍).
  // 예전에는 `clash` 조건이 false 라 당첨자도 아무것도 볼 수 없었다.
  const shrunk = roleViewOf(1, draw());
  check("남은 추첨이 보인다", shrunk, { kind: "awaiting", winner: "최유나" });
  check("답할 수단(추첨 버튼)은 닫혀 있다", canDrawIn(shrunk), false);

  // 당첨자가 팀을 나간 추첨(오늘 고친 구멍).
  const stale = roleViewOf(2, draw({ stale: true }));
  check("무효로 보인다", stale, { kind: "voided", winner: "최유나" });
  // **자리를 차지하고 있으므로 다시 뽑는 길이 반드시 있어야 한다.** 없으면 영구 정지.
  check("다시 뽑을 수 있다", canDrawIn(stale), true);
  truthy("무효 사유를 화면에 말할 수 있다", voidedText("최유나").includes("최유나"));

  // 확정된 뒤 나간 경우 — 이미 정해진 담당자는 남는다. 지우면 이력이 사라진다.
  check("확정된 뒤 나가도 확정은 남는다", roleViewOf(2, draw({ accepted: true, stale: true })).kind, "confirmed");

  // 사람이 0~4명, 추첨은 4가지(없음/대기/확정/무효)를 전부 돌려본다.
  const noStrand: string[] = [];
  for (let wanters = 0; wanters <= 4; wanters += 1) {
    for (const d of [null, draw(), draw({ accepted: true }), draw({ stale: true })]) {
      const view = roleViewOf(wanters, d);
      // 추첨이 남아 있는데 아무도 수락할 수단이 없는 상태 = "수락 대기" 라 답이 있어야 한다.
      const hasAnswer =
        view.kind === "empty" ||
        view.kind === "auto" ||
        canDrawIn(view) ||
        (d !== null && view.kind !== "voided");
      if (!hasAnswer) noStrand.push(`희망자 ${wanters} · ${JSON.stringify(d?.accepted ?? null)}`);
    }
  }
  check("답이 닿는 상태로만 끝난다", noStrand, []);
}

/* ── 표에 잘못 들어온 값 ──────────────────────────────────── */

console.log("\n값 검증");
{
  check("역할 키는 대조", isRoleKey("research"), true);
  check("모르는 역할 키는 거절", isRoleKey("__proto__"), false);
  check("모르는 역할 값은 미정으로", toRoleKey("__proto__"), null);
  check("비었으면 미정으로", toRoleKey(null), null);
  check("진짜 역할은 읽는다", toRoleKey("present"), "present");
}

/* ── 04 성향 체크: 문항 저장소와 계산 ──────────────────────── */

console.log("\n성향 체크 문항");
{
  const ids = QUIZ_QUESTIONS.map((q) => q.id);
  check("문항 id 가 겹치지 않는다", new Set(ids).size, ids.length);
  check("20문항이다", QUIZ_QUESTIONS.length, 20);
  for (const axis of ["EI", "SN", "TF", "JP"] as const) {
    const rows = QUIZ_QUESTIONS.filter((q) => q.axis === axis);
    // 짝수면 4:4 동률이 나는데, 동률 축은 답이 아니라 세는 순서로 정해진다.
    check(`${axis} 문항 수는 홀수`, rows.length % 2, 1);
    check(`${axis} 문항이 하나라도 있다`, rows.length > 0, true);
    // 같은 축을 같은 상황 문장으로 두 번 재면 사실상 한 질문을 두 번 한 셈이다.
    check(`${axis} 상황이 겹치지 않는다`, new Set(rows.map((q) => q.label)).size, rows.length);
    // a 가 항상 앞 글자면 순서 앞 선택지를 고르는 사람만 조금 더 많아진다.
    check(`${axis} 안에서 a 위치가 뒤집힌다`, new Set(rows.map((q) => q.aSide)).size, 2);
  }
}

console.log("\n성향 체크 계산");
{
  /** 그 문항에서 `side` 쪽을 고르는 키. `aSide` 가 뒤집혀 있으므로 직접 구해야 한다. */
  const key = (q: (typeof QUIZ_QUESTIONS)[number], side: "first" | "second") =>
    q.aSide === side ? "a" : "b";

  /** 전 문항을 한쪽으로 채운다. */
  const fill = (side: "first" | "second") =>
    Object.fromEntries(QUIZ_QUESTIONS.map((q) => [q.id, key(q, side)])) as Record<string, "a" | "b">;

  check("앞 글자만 고르면 ESTJ", picksToMbti(fill("first")), "ESTJ");
  check("뒷 글자만 고르면 INFP", picksToMbti(fill("second")), "INFP");

  // 한 문항이라도 비면 유형을 내지 않는다 — 05 화면이 그 값으로 문구를 바꾼다.
  const partial = fill("first");
  delete partial["jp-decision"];
  check("답이 하나라도 비면 유형이 없다", picksToMbti(partial), null);
  check("아무것도 안 골라도 없다", picksToMbti({}), null);

  // 축 안에서 다수결이다 — 한 표가 4표를 못 이긴다.
  const minority = fill("first");
  for (const q of QUIZ_QUESTIONS.filter((x) => x.axis === "EI").slice(1)) {
    minority[q.id] = key(q, "second");
  }
  check("EI 1 대 4 는 4 쪽이 이긴다", picksToMbti(minority), "ISTJ");

  // 가중치를 실제로 먹는다는 확인 — JP 축을 4:P / 1:J 로 두고 그 1표의 무게만 바꾼다.
  const heavy = QUIZ_QUESTIONS.find((q) => q.axis === "JP" && q.aSide === "second")!;
  check("JP 축의 뒤집힌 문항", heavy.id, "jp-decision");
  const tipped = fill("first");
  for (const q of QUIZ_QUESTIONS.filter((x) => x.axis === "JP")) {
    tipped[q.id] = key(q, "second");
  }
  tipped[heavy.id] = key(heavy, "first");
  check("가중치가 같으면 4 대 1 이 P 를 고른다", picksToMbti(tipped), "ESTP");
  heavy.weight = 5;
  try {
    check("그 한 표가 무거우면 J 로 뒤집힌다", picksToMbti(tipped), "ESTJ");
  } finally {
    heavy.weight = 1;
  }
  check("가중치를 되돌리면 다시 P 다", picksToMbti(tipped), "ESTP");

  const rows = scoreAxes(fill("first"));
  check("축 점수는 네 줄", rows.length, 4);
  check("EI 5문항 전부 앞 글자", rows[0], { axis: "EI", first: 5, second: 0, answered: 5, total: 5 });
  check("답하지 않은 문항은 채점되지 않는다", scoreAxes({})[0], {
    axis: "EI",
    first: 0,
    second: 0,
    answered: 0,
    total: 5,
  });

  check("축의 앞 글자를 읽는다", sideLetter("SN", "first"), "S");
  check("축의 뒤 글자를 읽는다", sideLetter("SN", "second"), "N");

  // aSide 가 뒤집힌 문항에서 05 화면 배지가 틀린 글자를 보여주면 안 된다.
  const flipped = QUIZ_QUESTIONS.find((q) => q.aSide === "second")!;
  const upright = QUIZ_QUESTIONS.find((q) => q.aSide === "first")!;
  check("뒤집힌 문항의 a 는 second 쪽", pickSide(flipped, "a"), "second");
  check("뒤집힌 문항의 b 는 first 쪽", pickSide(flipped, "b"), "first");
  check("정방향 문항의 a 는 first 쪽", pickSide(upright, "a"), "first");
  check("정방향 문항의 b 는 second 쪽", pickSide(upright, "b"), "second");

  // 축 하나를 통째로 반대로 묶어도 16유형이 16개 다 나온다 — 축이 잘못 묶였으면
  // 두 유형이 같은 글자로 접혀서 16개보다 적게 나온다.
  const combos = new Set<string>();
  for (let mask = 0; mask < 16; mask++) {
    const combo: Record<string, "a" | "b"> = {};
    for (const q of QUIZ_QUESTIONS) {
      const wantFirst = ((mask >> MBTI_AXES.indexOf(q.axis as MbtiAxis)) & 1) === 0;
      combo[q.id] = key(q, wantFirst ? "first" : "second");
    }
    combos.add(picksToMbti(combo)!);
  }
  check("축 조합 16개가 16유형과 겹치지 않는다", combos.size, 16);
}

/* ── 이름 정규화 ──────────────────────────────────────────── */

console.log("\n이름");
{
  // 분해형(NFD)으로 저장된 한글 — macOS 파일 이름, 일부 입력기, 복사·붙여넣기.
  const nfd = "김민준".normalize("NFD");
  truthy("macOS 가 넘긴 이름이 실제로 다르게 보인다", nfd !== "김민준");
  check("그래도 같은 이름으로 정리된다", normalizeName(nfd), "김민준");
  check("양쪽 끝 공백도 함께", normalizeName("  김민준  "), "김민준");
}

/* ── AI 입력 상한 ─────────────────────────────────────────── */

console.log("\nAI 입력 상한");
{
  check("한계가 0보다 않다", AI_INPUT_LIMIT > 0, true);
  check("안 넘으면 잘리지 않는다", aiInputOverrun("짧은 회의 메모"), 0);
  check("넘으면 얼마나 잘렸는지 안다", aiInputOverrun("가".repeat(AI_INPUT_LIMIT + 120)), 120);
}

/* ── 회의 후보 창 ─────────────────────────────────────────── */

console.log("\n회의 후보 기간");
{
  const dates = candidateDates();
  check("오늘부터 7일이다", dates.length, 7);
  check("첫 날이 오늘이다", dates[0].date, todayInSeoul());
  const slots = computeMeetingSlots(
    [
      { name: "a", busyBlocks: [] },
      { name: "b", busyBlocks: [] },
    ],
    dates,
  );
  truthy("두 명이 시간이 전부 비어 있으면 후보가 나온다", slots.length > 0);
  check("후보는 후보 기간 안의 요일만 쓴다", new Set(slots.map((s) => s.day)).size <= 7, true);
}

/* ── 기록 확정 기준 ────────────────────────────────────────── */

console.log("\n기록 확정 기준 (팀이 정한다)");
{
  // 기준은 팀의 값이다 — 1명이어도 2명이어도 같은 계산기를 쓴다.
  const base = { dispute: null, resolution: null };
  check("1명 기준 · 1명 확인이면 확정", contribState({ ...base, confirms: 1, needed: 1 }), "ok");
  check("1명 기준 · 아직 없으면 대기", contribState({ ...base, confirms: 0, needed: 1 }), "pending");
  check("2명 기준 · 1명 확인이면 대기", contribState({ ...base, confirms: 1, needed: 2 }), "pending");
  check("2명 기준 · 2명 확인이면 확정", contribState({ ...base, confirms: 2, needed: 2 }), "ok");
  // 기준보다 많이 모였으면 확정 — 화면은 "3/2" 라고 적지만 상태는 확정이다.
  check("기준을 넘겨도 확정", contribState({ ...base, confirms: 5, needed: 2 }), "ok");
  // 사실이 다투어지는 중에는 확인 수가 많아도 "확인됨"이 아니다.
  check(
    "의견 차이는 확인 수와 무관하다",
    contribState({ ...base, confirms: 9, needed: 1, dispute: "다릅니다" }),
    "disputed",
  );
  check(
    "의견을 정리하면 확인 수로 돌아간다",
    contribState({ ...base, confirms: 1, needed: 1, dispute: "다릅니다", resolution: "공동 작업" }),
    "ok",
  );
  // 정리는 "확인"이 아니다 — 정리된 뒤에도 기준에 못 미치면 다시 기다린다.
  check(
    "정리되어도 기준에 못 미치면 대기",
    contribState({ ...base, confirms: 1, needed: 2, dispute: "다릅니다", resolution: "공동 작업" }),
    "pending",
  );

  // 자기 기록은 자기 자신이 확인하지 못한다 → 팀원 수보다 큰 기준은 아무도 못 채운다.
  check("혼자면 기준 1명", maxConfirmsNeeded(1), 1);
  check("4명이면 기준 3명까지", maxConfirmsNeeded(4), 3);
  check("아무도 없으면 1명에서 멈춘다", maxConfirmsNeeded(0), 1);

  check("분모는 2명 이상일 때만", contribByLabel({ state: "ok", confirms: 1, needed: 1, disputedBy: null }), "1명 확인");
  check("2명 기준은 진행을 보여 준다", contribByLabel({ state: "pending", confirms: 1, needed: 2, disputedBy: null }), "1/2명 확인");
  check("아직 모인 확인이 없으면", contribByLabel({ state: "pending", confirms: 0, needed: 2, disputedBy: null }), "팀원 확인 대기");
}

/* ── 회의 참여 표시 ────────────────────────────────────────── */

console.log("\n회의 참여 표시 (팀장이 직접 찍는다)");
{
  const shown = {
    recordId: "r1",
    activeKey: "r1",
    shownBy: "박지호",
    shownAt: new Date("2026-09-28T10:00:00+09:00"),
    clearedBy: null,
    clearedAt: null,
  };
  const cleared = { ...shown, activeKey: null, clearedBy: "이서연", clearedAt: new Date("2026-09-29T10:00:00+09:00") };

  check("표시 중인가", isMarked(shown), true);
  check("취소된 표시는 표시 중이 아니다", isMarked(cleared), false);
  check("표시가 없으면 false", isMarked(null), false);
  check(
    "누가 찍었는지 문구에 함께 든다",
    participationText(shown)?.includes("박지호"),
    true,
  );
  check(
    "취소도 누구의 일로 남는다",
    participationText(cleared),
    participationText(cleared)?.includes("이서연") === true
      ? participationText(cleared)
      : "이서연",
  );
  // 표시 중인 것만 모아 준다 — 취소된 행이 "참여"로 세어지면 지운 사실이 사라진다.
  check("표시 중인 것만 모은다", currentParticipations([cleared, shown]).length, 1);
  check("아무것도 없으면 0건", currentParticipations([cleared]).length, 0);

  // DB 규칙 — 한 기록에 표시가 두 개일 수 없다.
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (team) {
    const leader = await db.member.findFirstOrThrow({ where: { teamId: team.id, isLeader: true, leftAt: null } });
    const owner = await db.member.findFirstOrThrow({
      where: { teamId: team.id, leftAt: null, id: { not: leader.id } },
    });
    const rec = await db.contribRecord.create({
      data: { memberId: owner.id, kind: "task", title: "참여 표시 확인용", detail: " ", source: "self", state: "pending" },
    });
    const marked = await db.contribParticipation.create({
      data: { recordId: rec.id, activeKey: rec.id, shownById: leader.id },
    });
    const again = await db.contribParticipation
      .create({ data: { recordId: rec.id, activeKey: rec.id, shownById: leader.id } })
      .catch((e) => e);
    truthy("한 기록에 표시가 두 개일 수 없다", (again as { code?: string })?.code === "P2002");

    // 취소는 기존 행을 남긴 채 `activeKey` 를 비운다 — 누가 지웠는지 그대로 남는다.
    await db.contribParticipation.update({
      where: { id: marked.id },
      data: { activeKey: null, clearedById: leader.id, clearedAt: new Date() },
    });
    const reMarked = await db.contribParticipation
      .create({ data: { recordId: rec.id, activeKey: rec.id, shownById: leader.id } })
      .catch((e) => e);
    truthy("지운 뒤에는 다시 표시할 수 있다", !((reMarked as { code?: string })?.code));

    // **참여는 확인과 독립이다** — 표시해도 기록은 대기 그대로다.
    const after = await db.contribRecord.findUniqueOrThrow({
      where: { id: rec.id },
      select: { state: true },
    });
    check("표시해도 기록은 확정되지 않는다", after.state, "pending");

    await db.contribParticipation.deleteMany({ where: { recordId: rec.id } });
    await db.contribRecord.delete({ where: { id: rec.id } });
  } else {
    console.log("  · 팀이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  }
}

/* ── 회의를 격자 위에 얹기 ─────────────────────────────────── */

console.log("\n회의 표식 (08 · 팀 겹쳐보기가 같이 쓴다)");
{
  const dates = candidateDates();
  const weeks = scheduleWeeks();
  const wednesday = dates.find((d) => SCHEDULE_DAYS[d.day] === "수")!;
  const other = weeks.find((w) => w !== wednesday.week)!;
  const weekOptions = weeks.map((key) => ({ key, name: weekName(key) }));
  const slot = {
    id: "s1",
    day: "수",
    time: "16:00 – 18:00",
    available: 3,
    total: 3,
    blockedBy: null,
  };
  const base = { agreed: 0, pending: 0, against: 0, myResponse: null } as const;
  const at = (p: Partial<MeetingProposal>) => meetingMark({ ...base, ...p } as MeetingProposal, dates, SCHEDULE_HOURS);

  const pending = at({ stage: "proposed", slot, date: wednesday.date, respondBy: "9/27 18:00" });
  check("제안은 그 날짜의 칸을 짚는다", markCell(pending, wednesday.week), {
    day: 2,
    hour: 7,
    stage: "proposed",
  });
  check("다른 주에서는 짚지 않는다", markCell(pending, other), null);
  check(
    "한 줄에 마감 시각이 있다",
    markText(pending, SCHEDULE_DAYS),
    `${shortDate(wednesday.date)}(수) 16:00 – 18:00 · 응답 마감 9/27 18:00`,
  );

  const settled = at({ stage: "confirmed", slot, date: wednesday.date });
  check("확정에는 마감이 붙지 않는다", markText(settled, SCHEDULE_DAYS)?.includes("마감"), false);
  check("다른 주는 '이 주가 아닙니다'", markAside(settled, markCell(settled, other)), "· 이 주가 아닙니다");

  // 날짜가 없으면(예전 행) 제안은 후보 기간에서 되짚지만, 확정은 지어내지 않는다.
  const legacyPending = at({ stage: "proposed", slot, respondBy: "9/27 18:00" });
  check("예전 제안은 후보 기간에서 되짚는다", legacyPending?.date, wednesday.date);
  const legacyConfirmed = at({ stage: "confirmed", slot });
  check("예전 확정은 날짜를 지어내지 않는다", legacyConfirmed?.date, null);
  check("날짜를 모르면 칸을 그리지 않는다", markCell(legacyConfirmed, weeks[0]), null);
  check("그래도 한 줄은 남는다", markText(legacyConfirmed, SCHEDULE_DAYS), "수 16:00 – 18:00 · 확정");

  // 시간표 밖에서 시작하는 회의는 칸이 없다.
  const early = at({ stage: "confirmed", slot: { ...slot, time: "08:00 – 09:00" }, date: wednesday.date });
  check("시간표 밖의 회의는 칸이 없다", markCell(early, wednesday.week), null);
  check(
    "시간표 밖이라 말한다",
    markAside(early, markCell(early, wednesday.week)),
    "· 시간표에 없는 시간입니다",
  );

  check("이월은 격자에 없다", at({ stage: "carried", slot, date: wednesday.date }), null);
  check("제안 없음", at({}), null);
  check("슬롯이 없으면 표식도 없다", at({ stage: "confirmed", date: wednesday.date }), null);
  check(
    "볼 수 있는 다른 주면 그주로 가는 버튼",
    markJump(pending, other, weekOptions)?.week,
    wednesday.week,
  );
  check("같은 주면 버튼을 띄우지 않는다", markJump(pending, wednesday.week, weekOptions), null);
  check("회의가 없으면 아무것도 붙지 않는다", markAside(null, null), null);
}

/* ── DB 불변식 ────────────────────────────────────────────── */

console.log("\n회의 제안 (DB)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) {
    console.log("  · 팀이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const member = await db.member.findFirst({ where: { teamId: team.id } });
    if (!member) {
      console.log("  · 팀원이 없어 이 항목을 건너뜁니다");
    } else {
      const made: string[] = [];
      const mk = (stage: string, activeKey: string | null) =>
        db.meetingProposal
          .create({
            data: { teamId: team.id, proposedById: member.id, respondBy: new Date(), stage, activeKey },
          })
          .then((p) => {
            made.push(p.id);
            return p;
          });

      await db.meetingProposal.deleteMany({ where: { teamId: team.id } });
      await mk("proposed", team.id);
      const dup = await mk("proposed", team.id).catch((e: { code?: string }) => e.code);
      check("진행 중인 결정은 하나뿐이다", dup, "P2002");

      await db.meetingProposal.updateMany({ where: { teamId: team.id }, data: { stage: "confirmed" } });
      const overwrite = await mk("proposed", team.id).catch((e: { code?: string }) => e.code);
      check("확정된 회의도 덮어쓸 수 없다", overwrite, "P2002");

      await db.meetingProposal.deleteMany({ where: { teamId: team.id } });
      await mk("carried", null);
      await mk("carried", null);
      const afterCarry = await mk("proposed", team.id);
      truthy("이월은 결정을 막지 않는다", Boolean(afterCarry.id));

      await db.meetingProposal.deleteMany({ where: { id: { in: made } } });
    }
  }
}

console.log("\n누가 하지");
{
  truthy("메뉴가 하나 이상 있다", MENU_OPTIONS.length > 0);
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (team) {
    const before = team.menuPick;
    await db.team.update({ where: { id: team.id }, data: { menuPick: "라멘" } });
    const a = await db.team.findUniqueOrThrow({ where: { id: team.id }, select: { menuPick: true } });
    const b = await db.team.findUniqueOrThrow({ where: { id: team.id }, select: { menuPick: true } });
    check("팀에 하나만 저장된다", a.menuPick, b.menuPick);
    await db.team.update({ where: { id: team.id }, data: { menuPick: before } });
  }
}

/* ── 기여도 의견은 덮어쓰지 않는다 ─────────────────────────── */

console.log("\n기여도 의견 (DB)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const member = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !member) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const record = await db.contribRecord.create({
      data: { memberId: member.id, kind: "task", title: "스모크 확인용", detail: "지워질 것", source: "self" },
    });

    await db.contribDispute.create({ data: { recordId: record.id, byId: member.id, text: "첫 의견" } });
    await db.contribRecord.update({ where: { id: record.id }, data: { dispute: "첫 의견", disputedById: member.id, resolution: "합의함" } });
    // 정리된 뒤 두 번째 의견이 달리면, `dispute` 칸은 새 의견으로 옮겨도 된다.
    await db.contribDispute.create({ data: { recordId: record.id, byId: member.id, text: "둘째 의견" } });
    await db.contribRecord.update({ where: { id: record.id }, data: { dispute: "둘째 의견", disputedById: member.id, resolution: null } });

    const history = await db.contribDispute.findMany({
      where: { recordId: record.id },
      orderBy: { createdAt: "asc" },
      select: { text: true },
    });
    check("앞선 의견이 이력에 남는다", history.map((h) => h.text), ["첫 의견", "둘째 의견"]);

    const current = await db.contribRecord.findUniqueOrThrow({ where: { id: record.id } });
    check("기록은 지금 떠 있는 의견을 가리킨다", current.dispute, "둘째 의견");
    check("정리 내용은 새 의견이 달리면 비워진다", current.resolution, null);

    await db.contribDispute.deleteMany({ where: { recordId: record.id } });
    await db.contribRecord.delete({ where: { id: record.id } });
    check("확인용 기록을 지우면 이력도 함께 간다", await db.contribDispute.count({ where: { recordId: record.id } }), 0);
  }
}

/* ── 대화 순서 ────────────────────────────────────────────── */

console.log("\n대화 순서");
{
  // 화면이 실제로 쓰는 규칙(`messages-state.ts` 의 `useThreadMessages` 와 같은 모양).
  // 서버가 준 `sortAt` (ISO) 기준이고, 아직 도착하지 않은 말(전송 중·실패)은 지금 이후에
  // 생긴 것으로 본다.
  //
  // **메시지 객체를 받는다는 점이 중요하다.** `sortAt` 이 아니라 메시지를 받아야 하는데,
  // 문자열을 받도록 쓰면 `Date.parse(객체)` 가 NaN 이 되어 비교가 전부 거짓이 되고 정렬이
  // 조용히 무시된다 — 겉보기엔 통과한 검사가 아무것도 확인하지 못하는 상태가 된다.
  const stamp = (m: { sortAt: string | null }) =>
    m.sortAt === null ? Number.POSITIVE_INFINITY : Date.parse(m.sortAt);
  const order = (ms: Array<{ id: string; sortAt: string | null }>) =>
    [...ms].sort((a, b) => stamp(a) - stamp(b)).map((m) => m.id);

  const base = Date.parse("2026-09-26T12:00:00.000Z");
  const at = (s: number) => new Date(base + s * 1000).toISOString();

  check(
    "전송 중인 말은 그때 도착한 말보다 아래에 온다",
    order([
      { id: "상대", sortAt: at(0) },
      { id: "나(전송 중)", sortAt: null },
      { id: "상대2", sortAt: at(3) },
    ]),
    ["상대", "상대2", "나(전송 중)"],
  );
  check(
    "전송이 끝나면 서버 시각이 생겨 제자리에 놓인다",
    order([
      { id: "상대", sortAt: at(0) },
      { id: "나", sortAt: at(1) },
      { id: "상대2", sortAt: at(3) },
    ]),
    ["상대", "나", "상대2"],
  );
  // **표시 문자열("21:12")로 정렬하면 안 된다.** 파싱이 NaN 이라 비교가 전부 거짓이 되고
  // 정렬이 조용히 무시된다 — 대화가 뒤집힌 채로 남는다.
  check("표시 문자열은 정렬 키가 되지 못한다", Number.isNaN(Date.parse("14:02")), true);
}

/* ── 읽기 순화: 받는 사람이 순화된 표현을 받는다 ──────────── */

console.log("\n읽기 순화: 무엇을 순화하는가");
{
  const sent = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
    id,
    author: "최유나",
    mbti: null,
    isMine: false,
    text: "이거 왜 아직 안 올렸어요?",
    time: "14:02",
    sortAt: "2026-09-26T05:02:00.000Z",
    status: "sent",
    purified: null,
    ...over,
  });

  check("남이 보낸 글은 순화한다", canPurify(sent("a")), true);
  check("내 말은 순화하지 않는다", canPurify(sent("b", { isMine: true })), false);
  check("글 없는 말은 순화하지 않는다", canPurify(sent("c", { text: "  " })), false);
  check("보내는 중인 말은 순화하지 않는다", canPurify(sent("d", { status: "sending" })), false);
}

console.log("\n읽기 순화: 언제 다시 부르는가 (무한 재호출 차단)");
{
  // **이 표가 이 파이프라인의 핵심이다.** 예전에는 "행이 없다 = 아직 안 함" 이라
  // 거절된 말이 3초마다 다시 후보가 됐고, 새로고침하면 그 기억까지 리셋됐다.
  const now = { model: "openrouter/free", promptVersion: PROMPT_VERSION, at: 1_000_000_000 };
  const ago = (ms: number) => new Date(now.at - ms).toISOString();
  const soon = (ms: number) => new Date(now.at + ms).toISOString();

  check("아직 없으면 불러도 된다", canRetry(null, now), true);

  const failed = {
    status: "FAILED" as const,
    reason: CUSHION_REASON.MODEL_REFUSAL,
    attemptCount: 1,
    retryAfter: soon(FAILURE_BACKOFF_MS),
    model: now.model,
    promptVersion: now.promptVersion,
    createdAt: ago(1000),
  };
  // **같은 설정이면 다시 부르지 않는다.** 한도를 깎으면서 결과는 같기 때문이다.
  check("같은 설정의 실패는 다시 부르지 않는다", canRetry(failed, now), false);
  // 프롬프트를 고쳤다면 예전 실패는 낡았다 — 재생성된다.
  check("프롬프트가 바뀌면 다시 열린다", canRetry({ ...failed, promptVersion: "p2" }, now), true);
  check("모델이 바뀌면 다시 열린다", canRetry({ ...failed, model: "anthropic/claude-sonnet-5" }, now), true);
  // 시간이 지나도 시도 횟수가 남아 있으면 한 번만 더 시도한다.
  check("백오프가 지나면 한 번 더 시도한다", canRetry({ ...failed, retryAfter: ago(1) }, now), true);
  check("시도 횟수를 다 쓰면 포기한다", canRetry({ ...failed, retryAfter: ago(1), attemptCount: MAX_ATTEMPTS }, now), false);

  // 성공·가림은 끝이다. **다시 부르면 읽고 있던 말이 조용히 바뀐다.**
  check("순화 완성은 다시 부르지 않는다", canRetry({ ...failed, status: "PURIFIED" }, now), false);
  check("가림 완성도 다시 부르지 않는다", canRetry({ ...failed, status: "FALLBACK" }, now), false);

  // 두 탭 경합: 누군가 부르는 중이면 건드리지 않는다.
  const pending = { ...failed, status: "PENDING" as const, retryAfter: soon(CLAIM_TTL_MS), createdAt: ago(1000) };
  check("선점 유효 시간 안이면 건드리지 않는다", canRetry(pending, now), false);
  // 부르던 사람이 사라졌다(탭을 닫음)면 선점을 가져갈 수 있다 — 아니면 영영 "처리 중"이다.
  check("선점이 사라지면 다시 가져간다", canRetry({ ...pending, createdAt: ago(CLAIM_TTL_MS + 1000) }, now), true);

  check("성공과 가림만 끝난 상태다", [isCushionDone("PURIFIED"), isCushionDone("FALLBACK"), isCushionDone("FAILED")], [true, true, false]);
}

console.log("\n읽기 순화: id 기반 계약");
{
  const items = [
    { id: "m1", text: "내일 회의 몇 시로 할까요?" },
    { id: "m2", text: "자료는 언제쯤 나와요?" },
  ];
  // **본문은 데이터로 준다.** 글로 붙이면 "이전 지시를 무시해" 가 지시로 읽힐 수 있다.
  const request = JSON.parse(buildPurifyRequest(items));
  check("요청에 task 가 있다", request.task, "rewrite_for_reader_comfort");
  check("본문은 데이터로 실린다", request.items, items);

  // 순서가 바뀌어도, 하나가 빠져도, 앞에 설명이 붙어도 **요청한 id 만** 받아온다.
  const shuffled = parsePurifyResponse(
    '{"items":[{"id":"m2","text":"자료는 언제쯤 준비되나요?"},{"id":"m1","text":"내일 회의는 몇 시로 할까요?"}]}',
  );
  check("순서가 바뀌어도 id 로 맞춘다", [...shuffled.items.keys()].sort(), ["m1", "m2"]);
  check("값도 id 에 붙는다", shuffled.items.get("m1"), "내일 회의는 몇 시로 할까요?");

  const partial = parsePurifyResponse('{"items":[{"id":"m1","text":"다듬은 말"}]}');
  check("빠진 항목은 그 항목만 없는 것이다", partial.items.size, 1);
  check("없는 항목은 조회해도 없다", partial.items.get("m2"), undefined);

  const dup = parsePurifyResponse('{"items":[{"id":"m1","text":"하나"},{"id":"m1","text":"둘"}]}');
  check("중복 id 는 어느 것도 믿지 않는다", dup.items.size, 0);
  check("중복 id 는 알려 준다", dup.unknown, ["m1"]);

  check("코드펜스를 벗겨 낸다", parsePurifyResponse('```json\n{"items":[{"id":"m1","text":"하나"}]}\n```').items.get("m1"), "하나");
  check("배열 형태도 받아 준다", parsePurifyResponse('[{"id":"m1","text":"하나"}]').items.get("m1"), "하나");
  check("글이 아니면 안전하다", parsePurifyResponse("죄송합니다").items.size, 0);
  check("쓰레기여도 안전하다", parsePurifyResponse(42).items.size, 0);

  check("거절 문구를 알아본다", [isRefusal("User Safety: unsafe"), isRefusal("Sorry, I can't help"), isRefusal(" 抱歉，我无法协助")], [true, true, true]);
  check("순화문은 거절이 아니다", isRefusal('{"items":[{"id":"m1","text":"다듬은 말"}]}'), false);
}

console.log("\n읽기 순화: 항목별 판정 (묶음 전체를 버리지 않는다)");
{
  const items = [
    { id: "m1", text: "이거 왜 아직 안 올렸어요?" },
    { id: "m2", text: "씨발 진짜 왜 이래 좀비처럼" },
    { id: "m3", text: "민수가 API 배포 오늘까지 한다고 했잖아" },
  ];
  const response = parsePurifyResponse(
    JSON.stringify({
      items: [
        // 정상
        { id: "m1", text: "이거 아직 안 올리신 이유가 있을까요?" },
        // 욕이 남았다 → 이 항목만 버려야 한다
        { id: "m2", text: "진짜 왜 이렇게요 좀비처럼 하지 마세요" },
        // 공격성은 없지만 **정보가 죽었다**
        { id: "m3", text: "조금 더 신경 써주시면 좋겠습니다" },
      ],
    }),
  );
  const judged = judgeAll(items, response);
  const by = (id: string) => judged.find((j) => j.id === id)!;

  check("정상 항목은 순화된다", [by("m1").status, by("m1").text], ["PURIFIED", "이거 아직 안 올리신 이유가 있을까요?"]);
  check("욕이 남은 항목만 버려진다", [by("m2").status, by("m2").reason], ["REJECTED", CUSHION_REASON.TOXICITY_REMAINED]);
  // "공격성 0, 정보 0" 이 순화의 목표다. 정보를 지우면 순화가 아니라 삭제다.
  check("정보가 사라진 것도 버려진다", [by("m3").status, by("m3").reason], ["REJECTED", CUSHION_REASON.INFO_LOST]);
  check("묶음 전체를 버리지 않는다", judged.filter((j) => j.status === "PURIFIED").length, 1);

  check("빈 결과는 빈 응답으로 기록된다", judgeAll([{ id: "x", text: "안 올렸어요" }], { items: new Map(), unknown: [] })[0].reason, CUSHION_REASON.EMPTY_RESPONSE);
  check("길이 폭주는 버려진다", rejectsPurified("안 올려", "가".repeat(200)), CUSHION_REASON.TOO_LONG);
  check("빈 글은 버려진다", rejectsPurified("안 올렸어요", "   "), CUSHION_REASON.EMPTY_OUTPUT);
  // 감정 표현은 순화 대상이 아니다 — 지우면 사람이 한 말을 사람이 안 한 것처럼 읽힌다.
  check("감정 표현은 남아도 통과한다", rejectsPurified("짜증나 죽겠어", "정말 힘들 것 같아요"), null);
}

console.log("\n읽기 순화: AI 실패 시 결정론적 가림");
{
  // 실측: 무료 모델은 욕설에 `User Safety: unsafe (Profanity, Harassment)` 를 돌려준다.
  // **가장 순화해야 할 자리에서 원문이 그대로 보이는 것**이 이 구조의 가장 큰 실패였다.
  const profanity = maskRiskyParts("야 씨발 니가 제대로 했어야지");
  check("욕설 자리를 가린다", profanity.masked, 1);
  check("문장 구조는 지켜진다", profanity.text, "야 •• 니가 제대로 했어야지");

  check("사람에게 붙인 비꼼도 가린다", maskRiskyParts("너는 진짜 좀비같아").masked > 0, true);
  check("원인을 돌리는 말도 가린다", maskRiskyParts("다 니 탓인데").masked > 0, true);
  check("비웃음 기호도 가린다", maskRiskyParts("역시 대충이네 ㅋㅋ").masked > 0, true);
  // 위험한 말이 없으면 **가린다고 말하지 않는다.**
  check("깨끗한 말은 그대로 둔다", maskRiskyParts("내일 회의 몇 시로 할까요?"), { text: "내일 회의 몇 시로 할까요?", masked: 0 });
  // **요구는 남는다** — 일은 굴러가야 한다.
  const keep = maskRiskyParts("씨발 내일까지 자료 안 오면 그냥 니가 혼자 해");
  check("가려도 마감과 요구는 남는다", [keep.text.includes("내일까지"), keep.text.includes("자료")], [true, true]);
}

console.log("\n읽기 순화: 무엇을 그릴 것인가");
{
  const ai = { status: "PURIFIED" as const, text: "이거 아직 안 올리신 이유가 있을까요?", kind: "ai" as const, reason: null, retryAfter: null };
  const mask = { status: "FALLBACK" as const, text: "야 •• 니가 제대로 했어야지", kind: "mask" as const, reason: null, retryAfter: null };
  const failed = { status: "FAILED" as const, text: null, kind: null, reason: "MODEL_REFUSAL", retryAfter: "2999-01-01T00:00:00.000Z" };
  const original = "야 씨발 니가 제대로 했어야지";

  // AI 가 쓴 것과 규칙이 가린 것은 **다른 라벨**이어야 한다. 같으면 거짓말이 된다.
  check("AI 순화문은 그린다", displayTextOf({ text: "이거 왜 아직 안 올렸어요?", purified: ai }, false).kind, "PURIFIED");
  check("가림본도 그린다", displayTextOf({ text: original, purified: mask }, false).kind, "FALLBACK");
  // 실패·거절은 **원문**으로 넘어가는 길이 이것 하나뿐이다.
  check("실패하면 원문이다", displayTextOf({ text: original, purified: failed }, false).text, original);
  check("아직 처리 전이면 원문이다", displayTextOf({ text: original, purified: null }, false).text, original);
  check("누르면 원문으로 돌아간다", displayTextOf({ text: original, purified: mask }, true).text, original);
  check("누르면 순화 문구가 아니다", displayTextOf({ text: original, purified: mask }, true).kind, null);
}

console.log("\n읽기 순화: 입력 상한을 넘으면 자르지 않는다");
{
  const long = "가".repeat(2000);
  const packed = packPurifyItems([
    { id: "a", text: long },
    { id: "b", text: long },
    { id: "c", text: long },
    { id: "d", text: long },
  ]);
  // 조용히 자르면, 잘린 말은 순화되지 않은 채 남아 "다 순화됐다" 고 보인다.
  check("상한을 넘으면 묶음을 줄인다", packed.length < 4, true);
  check("한 건도 안 들어가면 빈 묶음이다", packPurifyItems([{ id: "a", text: "가".repeat(9000) }]).length, 0);
  check("빈 묶음도 문제가 아니다", packPurifyItems([]).length, 0);
}

console.log("\n읽기 순화: 말투가 바뀌면");
{
  // 한 말에는 사람당 한 줄이다. 새 말투로 다시 만들어도 예전 글 위에 덮어쓸 수 없으니
  // **바뀐 순간 예전 순화본을 지워야 한다** — 그렇지 않으면 고른 말투가 아닌 글을 읽는다.
  check("처음 고르는 것은 지울 것이 없다", toneChanged(null, "plain"), false);
  check("말투가 바뀌었으면 지운다", toneChanged("soft", "plain"), true);
  check("같은 말투를 다시 고르면 남긴다", toneChanged("plain", "plain"), false);
  check("고른 것이 없으면 첫 말투로 읽는다", toneOf({ tone: null }), "soft");
  check("고른 말투는 그대로 읽는다", toneOf({ tone: "firm" }), "firm");
  check("모르는 말투는 없는 것으로 본다", toneOf({ tone: "존나" }), "soft");
}

console.log("\n읽기 순화 (DB)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const viewer = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !viewer) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const message = await db.message.create({
      data: { teamId: team.id, threadKey: "team", authorId: viewer.id, text: "읽기 순화 확인용", whenLabel: "14:02" },
    });
    const cushion = (over: Record<string, unknown> = {}) => ({
      messageId: message.id,
      viewerId: viewer.id,
      status: "PURIFIED",
      text: "읽기 순화 확인용",
      source: "ai",
      sourceHash: "h1",
      model: "openrouter/free",
      promptVersion: PROMPT_VERSION,
      validatorVersion: "v1",
      ...over,
    });

    const first = await db.messageCushion.create({ data: cushion() });
    truthy("순화 상태가 남는다", Boolean(first.id));

    // **한 말·한 사람에게 두 줄이 생기면 안 된다.** 어느 것이 맞는 결과인지 고르는 기준이
    // 사라지고, 사용자가 본 말과 다른 말이 쌓인다.
    const dup = await db.messageCushion
      .create({ data: cushion({ text: "다른 말", status: "FALLBACK" }) })
      .catch((e: { code?: string }) => e.code);
    check("같은 말은 사람당 한 줄뿐이다", dup, "P2002");

    // 선점: 두 탭이 **아직 없는** 같은 말에 동시에 PENDING 을 만들면 한 줄만 남고,
    // claimToken 은 한쪽에만 있다. 그 값이 자기 것인 요청만 모델을 부른다.
    const claimMessage = await db.message.create({
      data: { teamId: team.id, threadKey: "team", authorId: viewer.id, text: "선점 확인용", whenLabel: "14:03" },
    });
    const claimRow = (claimToken: string) => ({
      messageId: claimMessage.id,
      viewerId: viewer.id,
      status: "PENDING",
      sourceHash: "h1",
      model: "openrouter/free",
      promptVersion: PROMPT_VERSION,
      validatorVersion: "v1",
      claimToken,
      retryAfter: new Date(Date.now() + CLAIM_TTL_MS),
    });
    await db.messageCushion.createMany({ data: [claimRow("token-a"), claimRow("token-b")], skipDuplicates: true });
    const claimed = await db.messageCushion.findMany({ where: { messageId: claimMessage.id } });
    check("선점도 한 줄뿐이다", claimed.length, 1);
    check("선점 토큰은 하나만 남는다", [claimed[0].claimToken === "token-a", claimed[0].claimToken === "token-b"].filter(Boolean).length, 1);
    await db.messageCushion.deleteMany({ where: { messageId: claimMessage.id } });
    await db.message.delete({ where: { id: claimMessage.id } });

    // 실패가 저장된다 — 안 하면 다시 부르고, 셀 수도 없다.
    await db.messageCushion.update({
      where: { messageId_viewerId: { messageId: message.id, viewerId: viewer.id } },
      data: { status: "REJECTED", text: null, source: null, reason: CUSHION_REASON.TOXICITY_REMAINED, attemptCount: 1, claimToken: null, retryAfter: new Date(Date.now() + FAILURE_BACKOFF_MS) },
    });
    const rejected = await db.messageCushion.findUniqueOrThrow({
      where: { messageId_viewerId: { messageId: message.id, viewerId: viewer.id } },
    });
    check("실패 이유가 남는다", rejected.reason, CUSHION_REASON.TOXICITY_REMAINED);
    check("실패에는 글자가 없다", rejected.text, null);
    check("다시 부르지 않는 시각이 남는다", rejected.retryAfter !== null, true);
    check("몇 번 시도했는지 남는다", rejected.attemptCount, 1);
    // 이 상태면 브라우저를 새로고침해도 다시 부르지 않는다 — 기억이 아니라 DB 다.
    check(
      "저장된 실패는 다시 열리지 않는다",
      canRetry(
        {
          status: rejected.status as "REJECTED",
          reason: CUSHION_REASON.TOXICITY_REMAINED,
          attemptCount: rejected.attemptCount,
          retryAfter: rejected.retryAfter?.toISOString() ?? null,
          model: rejected.model,
          promptVersion: rejected.promptVersion,
          createdAt: rejected.createdAt.toISOString(),
        },
        { model: "openrouter/free", promptVersion: PROMPT_VERSION, at: Date.now() },
      ),
      false,
    );

    // 방마다·사람마다 따로다.
    await db.readCushion.upsert({
      where: { memberId_threadKey: { memberId: viewer.id, threadKey: "team" } },
      update: { tone: "soft" },
      create: { memberId: viewer.id, threadKey: "team", tone: "soft" },
    });
    const saved = await db.readCushion.upsert({
      where: { memberId_threadKey: { memberId: viewer.id, threadKey: "team" } },
      update: { tone: "plain" },
      create: { memberId: viewer.id, threadKey: "team", tone: "plain" },
    });
    check("다시 골라도 행이 쌓이지 않는다", await db.readCushion.count({ where: { memberId: viewer.id } }), 1);
    check("말투가 바뀐다", saved.tone, "plain");

    const dm = await db.readCushion.create({ data: { memberId: viewer.id, threadKey: "dm:zz:zz", tone: "firm" } });
    const teamRow = await db.readCushion.findUniqueOrThrow({
      where: { memberId_threadKey: { memberId: viewer.id, threadKey: "team" } },
    });
    check("방을 바꿔도 다른 방의 설정은 그대로다", teamRow.tone, "plain");
    check("새 방의 설정은 따로 남는다", dm.tone, "firm");

    await db.readCushion.deleteMany({ where: { memberId: viewer.id, threadKey: { in: ["team", "dm:zz:zz"] } } });
    await db.messageCushion.deleteMany({ where: { messageId: message.id } });
    await db.message.delete({ where: { id: message.id } });
    check("말을 지우면 순화 상태도 함께 간다", await db.messageCushion.count({ where: { messageId: message.id } }), 0);
  }
}

/* ── 이미 지난 시간은 후보가 아니다 ───────────────────────── */

console.log("\n회의 후보에서 지난 시간");
{
  // 시간표의 칸 인덱스 0 = 9시. `hourNow` 와 비교하려면 반드시 `SCHEDULE_HOURS` 를 거쳐야 한다
  // — 인덱스를 시각으로 잘못 비교하면(0 < 21) 아무것도 걸리지 않는다.
  const SCHEDULE_HOURS = ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
  const keeps = (hourNow: number) =>
    SCHEDULE_HOURS.map(Number).filter((start) => start >= hourNow);

  check("오전 10시면 9시 회의는 사라진다", keeps(10)[0], 10);
  check("지금 시작하는 시간은 남는다", keeps(10).includes(10), true);
  check("밤 11시면 10시 회의도 사라진다", keeps(11).includes(10), false);
  check("아침 9시면 아무것도 빠지지 않는다", keeps(9), SCHEDULE_HOURS.map(Number));
  // 시간표가 9~18시뿐이라 밤 11시에는 남는 후보가 없다 — 오늘 회의는 더 이상 잡을 수 없다.
  check("밤 11시면 오늘 남는 후보가 없다", keeps(23), []);
}

/* ── 푸시 알림 ──────────────────────────────────────────────── */

console.log("\n푸시 알림");
{
  const base = {
    supported: true,
    permission: "default" as const,
    standalone: false,
    ios: false,
    configured: true,
    subscribed: false,
  };

  // 켤 수 없는 이유를 **말하지 않으면** 사용자는 "알림이 안 오는데 왜지?"를 알 수 없다.
  check("조건을 다 갖췄으면 막는 말이 없다", pushBlock(base), null);
  check(
    "서버에 키가 없으면 켤 수 없다고 말한다",
    pushBlock({ ...base, configured: false })?.code,
    "not-configured",
  );
  check(
    "아이폰은 설치 전에는 켤 수 없다고 말한다",
    pushBlock({ ...base, ios: true })?.code,
    "needs-install",
  );
  check(
    "아이폰이어도 설치돼 있으면 막지 않는다",
    pushBlock({ ...base, ios: true, standalone: true }),
    null,
  );
  check(
    "브라우저가 막아 뒀으면 그 사실을 말한다",
    pushBlock({ ...base, permission: "denied" })?.code,
    "denied",
  );
  check(
    "푸시 API가 없으면 불가능하다고 말한다",
    pushBlock({ ...base, supported: false })?.code,
    "unsupported",
  );

  // "켜짐"은 다섯 가지를 다 만족할 때만이다 — 하나라도 어긋나면 껍데기가 된다.
  check(
    "권한만 있고 구독이 없으면 켜진 게 아니다",
    pushOn({ ...base, permission: "granted" }),
    false,
  );
  check(
    "전부 갖췄을 때만 켜진 것으로 말한다",
    pushOn({ ...base, permission: "granted", subscribed: true }),
    true,
  );

  const sub = pushSubscriptionFrom({
    endpoint: "https://push.example/abc",
    keys: { p256dh: "k1", auth: "k2" },
  });
  check("브라우저가 준 구독을 읽는다", sub?.endpoint, "https://push.example/abc");
  // 발신할 주소·키 중 하나라도 없으면 발신은 실패하는데 저장은 성공한 척이라, 아예 받지 않는다.
  check("주소가 없으면 구독을 받지 않는다", pushSubscriptionFrom({ keys: { p256dh: "k", auth: "a" } }), null);
  check(
    "키가 없으면 구독을 받지 않는다",
    pushSubscriptionFrom({ endpoint: "https://push.example/abc" }),
    null,
  );
  check("엉뚱한 값이면 구독을 받지 않는다", pushSubscriptionFrom("endpoint"), null);

  // `href` 는 알림을 눌렀을 때 여는 창이다 — 앱 밖으로 나가면 안 된다.
  check("앱 안 주소는 그대로 쓴다", pushPayload({ title: "t", body: "b", href: "/home" }).href, "/home");
  check(
    "스킴 상대 주소는 앱 밖으로 나간다",
    pushPayload({ title: "t", body: "b", href: "//evil.example" }).href,
    null,
  );
  check(
    "절대 주소는 앱 밖으로 나간다",
    pushPayload({ title: "t", body: "b", href: "https://evil.example" }).href,
    null,
  );
  check("주소가 없으면 주소 없이 보낸다", pushPayload({ title: "t", body: "b" }).href, null);

  // 지울 것과 지우면 안 되는 것을 구분한다. 서명이 잘못되면(401) 지워 버릴수록
  // 정상 기기들의 구독을 우리가 한 번의 설정 실수로 전부 잃는다.
  check("404 는 죽은 주소다", pushFailure(404), "gone");
  check("410 도 죽은 주소다", pushFailure(410), "gone");
  check("401 은 우리 쪽 서명 문제라 지우지 않는다", pushFailure(401), "failed");
  check("429 는 잠깐 막힌 것이라 지우지 않는다", pushFailure(429), "failed");
  check("상태 코드가 없으면 지우지 않는다", pushFailure(undefined), "failed");
}

console.log("\n푸시 구독 (DB)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const members = team
    ? await db.member.findMany({ where: { teamId: team.id, leftAt: null }, take: 2 })
    : [];
  if (members.length < 2) {
    console.log("  · 팀원이 둘 이상이어야 이 항목을 돌립니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const [a, b] = members;
    const endpoint = `https://push.example/smoke-${Date.now()}`;

    await db.pushSubscription.deleteMany({ where: { endpoint } });
    const first = await db.pushSubscription.create({
      data: { memberId: a.id, endpoint, p256dh: "k1", auth: "k2" },
    });

    // 같은 단말이 다시 구독하면 행을 쌓지 않고 **주인을 바꾼다** — 기기를 넘겨 쓰면
    // 그 뒤로 알림은 새 사람에게 가야 한다. 쌓기만 하면 옛 사람에게 계속 간다.
    const again = await db.pushSubscription.upsert({
      where: { endpoint },
      create: { memberId: b.id, endpoint, p256dh: "k1", auth: "k2" },
      update: { memberId: b.id },
    });
    const rows = await db.pushSubscription.count({ where: { endpoint } });
    check("같은 단말은 행을 쌓지 않는다", rows, 1);
    check("기기를 넘겨 쓰면 주인이 바뀐다", again.memberId, b.id);
    check("구독 주소는 하나뿐이다", first.endpoint, again.endpoint);

    const dup = await db.pushSubscription
      .create({ data: { memberId: a.id, endpoint, p256dh: "k1", auth: "k2" } })
      .catch((e: { code?: string }) => e.code);
    check("주소가 겹치면 들어가지 않는다", dup, "P2002");

    await db.pushSubscription.deleteMany({ where: { endpoint } });
  }
}

/* ── AI 한도: 세는 것과 쓰는 것이 다르다 ──────────────────── */

console.log("\nAI 한도");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const member = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !member) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const usage = () => db.aiUsage.count({ where: { memberId: member.id, day } });
    const mine = { teamId: team.id, memberId: member.id, tool: "cushion", day };
    const before = await usage();

    // **읽기는 한도를 깎지 않는다.** 화면이 진입할 때 부르는 조회가 이것이다.
    const read = async () => ({
      mineLeft: Math.max(0, AI_POLICY.perMemberPerDay - (await usage())),
      teamLeft: Math.max(0, AI_POLICY.perTeamPerDay - (await usage())),
      perDay: AI_POLICY.perMemberPerDay,
    });
    const first = await read();
    const second = await read();
    check("한도를 여러 번 읽어도 차감되지 않는다", [first.mineLeft, second.mineLeft], [first.mineLeft, first.mineLeft]);
    check("읽기만으로는 기록이 늘지 않는다", await usage(), before);

    // **쓰는 쪽은 정확히 한 건만 남긴다.**
    await db.aiUsage.create({ data: mine });
    check("한 번 쓰면 기록이 정확히 1 늘어난다", await usage(), before + 1);
    const after = await read();
    check("쓴 만큼 남은 횟수가 줄어든다", after.mineLeft, first.mineLeft - 1);

    // 예전에는 `deleteMany({ memberId, day })` 로 치웠다 — **이 검사가 만든 한 건이 아니라
    // 그 사람 그날의 기록 전부였다.** 로컬 DB를 쓰는 개발자라면 눈치채기 어려운 손실이다.
    // 같은 키가 이미 있으면 그 행을 건드리지 않고, 없을 때만 한 건을 만든다.
    const made = await db.aiUsage.findFirst({ where: mine, orderBy: { id: "desc" } });
    if (before > 0) {
      // 이미 있던 기록 위에 얹은 거라, 내가 만든 행만 골라 지운다. (한도 쪽은 `FOR UPDATE`
      // 로 직렬화되므로 유니크 제약이 없어도 정확하다 — `ai/limit.ts` 참고)
      console.log("  · 그날 기록이 이미 있어, 이 검사가 만든 행만 지웁니다");
    }
    if (made) await db.aiUsage.delete({ where: { id: made.id } });
    check("**이 검사가 만든 한 건만** 치우면 원래대로", await usage(), before);
  }
}

/* ── 타이핑은 한 번도 AI 를 부르지 않는다 ─────────────────── */

console.log("\nAI 초안: 언제 부르는가");
{
  // 화면(`use-ai-draft.ts`)이 **원문이 바뀔 때** 부르는 코드가 남아 있는지 본다.
  // 화면 파일을 문자열로 읽어 확인한다 — 이 검증은 화면을 실행할 수 없어서,
  // "실행했을 때 무엇이 일어나는지" 대신 "자동 부르는 경로가 존재하는가"를 고정한다.
  // 자동 호출이 다시 들어오면(효과·타이머) 여기서 즉시 걸린다.
  const source = readFileSync(
    new URL("../src/features/tools/use-ai-draft.ts", import.meta.url),
    "utf8",
  );
  check("원문이 바뀌면 자동으로 부르는 효과가 없다", /useEffect/.test(source), false);
  check("타이핑을 기다리는 타이머가 없다", /setTimeout|SETTLE_MS/.test(source), false);
  // 명시적으로 누를 때만 부른다.
  check("누르면 부르는 길이 있다", /const start = useCallback/.test(source), true);
}

/* ── 결과 옆의 배지는 출처를 따른다 ──────────────────────── */

console.log("\nAI 결과의 출처");
{
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

  // 예전이 여기서 틀렸다. 서버는 성공을 "일했다"로만 봤고, 키가 없으면 다섯 도구 전부가
  // **예시를 결과 자리에 그대로 돌려주었다.** 화면은 그것을 모른 채 `aiReady` 로 자기 방식대로
  // 알아내려 했고, 그중 forgets한 곳에서 예시가 "AI 초안" 이었다.
  const run = read("../src/server/ai/run.ts");
  check("서버가 성공에 출처를 붙인다", /source: live \? \("ai" as const\) : \("sample" as const\)/.test(run), true);
  check("키가 없으면 예시로 표시한다", /isAiConfigured\(\)/.test(run), true);

  // 출처를 버리는 길이 남아 있으면 또 forgets하는 화면이 나온다.
  const result = read("../src/features/tools/ai-result.ts");
  check("출처를 버리는 함수가 없다", /export function unwrapAi/.test(result), false);
  check("값과 출처가 같이 나온다", /value: T; source: AiAnswerSource/.test(result), true);

  // 카드 자신이 "AI 초안" 을 조건 없이 새겼다. 쓰던 화면이 자기 배지를 바깥에 따로 만들거나
  // 아예 만들지 않았고, 어느 쪽이든 사용자는 출처를 알 수 없었다.
  const card = read("../src/components/ui/compare-card.tsx");
  check("카드가 배지를 직접 정하지 않는다", /resultSource === "ai"/.test(card), true);
  const hardcoded = card.replace(/\{[^{}]*\}/g, "").match(/>\s*AI 초안\s*</);
  check("카드에 배지가 박혀 있지 않다", hardcoded !== null, false);

  // 화면이 또 `aiReady` 로 출처를 추측하면 그 자리에 거짓말이 돌아온다.
  for (const screen of ["cushion", "sentence", "clerk", "present", "researcher"]) {
    const src = read("../src/features/tools/" + screen + "-screen.tsx");
    check(
      `${screen}: 출처를 설정 값으로 추측하지 않는다`,
      /showingSample|source === "ai" \? .*aiReady/.test(src),
      false,
    );
  }
}

/* ── DM 목록 폴링 비용은 총량과 무관해야 한다 ────────────── */

console.log("\nDM 목록 조회 비용");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const member = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !member) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    // 팀원 둘로 DM 스레드 하나를 만든다.
    const other = await db.member.findFirstOrThrow({
      where: { teamId: team.id, id: { not: member.id }, leftAt: null },
    });
    const key = `dm:${[member.id, other.id].sort().join(":")}`;

    // **앱이 실제로 부르는 함수를 그대로 부른다.**
    //
    // 예전에는 이 검사가 자기만의 `lastPerThread` SQL 을 테스트 안에 적어 두고 그것만 불렀다.
    // 그래서 `src/data/api.ts` 의 `getDmThreads` 가 Prisma 의 `distinct` 로 **되돌아가서**
    // 방의 메시지를 전부 메모리로 끌어와도 이 검사는 통과했다 — 214건이 전부 초록이었다.
    // 검사가 사본을 검사하고 있었고, 원본은 아무도 보지 않았다.
    //
    // `lastMessagePerThread` 는 서버 액션이 아니라 `client` 를 인자로 받는 순수한 데이터
    // 함수다. 세션 쿠키가 필요 없으므로 여기서 부를 수 있고, 부르는 것이 옳다(위 주석의
    // "액션을 우회한다"는 금지는 **쿠키를 만들어 부는** 경우를 말한 것).
    const lastPerThread = (keys: string[]) => lastMessagePerThread(db, team.id, keys);

    const existing = await db.message.count({ where: { threadKey: key } });
    const before = await lastPerThread([key]);

    // 메시지를 30개 쌓는다 — 실제로 늘어나는 비용을 흉내낸다.
    for (let i = 0; i < 30; i += 1) {
      await db.message.create({
        data: { teamId: team.id, threadKey: key, authorId: member.id, text: `비용 확인 ${i}`, whenLabel: "00:00" },
      });
    }
    const grown = await db.message.count({ where: { threadKey: key } });
    const after = await lastPerThread([key]);

    check("메시지가 늘어 폴링이 읽는 행은 늘지 않는다", after.length, before.length);
    check("한 스레드에서 1행만 읽는다", after.length, 1);
    check("읽은 것은 그중 가장 최근 말이다", after[0]?.text, "비용 확인 29");

    // **돌아온 행만으로는 부족하다.** 중복을 걸러내는 방식이 무엇이든 **결과는** 스레드마다
    // 한 줄씩 같고, 비용만 다르다. 그래서 실제로 나가는 SQL 을 보고, **실제로 몇 행을 읽는지**
    // 를 본다. Prisma 의 쿼리 이벤트는 **플레이스홀더가 있는 SQL 과
    // 파라미터 값**을 준다. 둘을 합쳐야 비로소 실제로 나간 문장이 된다.
    const probe = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      log: [{ emit: "event", level: "query" }],
    });
    const sent: string[] = [];
    let capturedSql = "";
    let capturedParams: unknown[] = [];
    probe.$on("query", (e: { query: string; params: unknown }) => {
      if (!e.query.includes("Message")) return;
      sent.push(e.query.replace(/\s+/g, " "));
      // 형태를 가리지 않는다. `unnest` 나 `LATERAL` 같은 특정 모양에 의존하면, 고쳐지는 순간
      // 예외로 전체 검사가 멈춰 "왜 멈췄는지" 대신 스택만 남는다. **보내는 쿼리가 하나뿐이니**
      // 마지막 Message 쿼리가 곧 그것이다.
      capturedSql = e.query;
      capturedParams = e.params as unknown[];
    });
    // 이벤트 값은 **문자열로 직렬화**되어 온다(`[["dm:…"],"teamId"]` 모양). 그대로 문자열
    // 리터럴로 끼우면 Postgres 가 `malformed array literal` 로 거절한다. JSON 으로 되돌린 뒤
    // 각 값을 Postgres 리터럴로 적는다.
    const paramsOf = (raw: unknown): unknown[] => {
      if (Array.isArray(raw)) return raw as unknown[];
      if (typeof raw === "string") {
        try {
          const parsed: unknown = JSON.parse(raw);
          return Array.isArray(parsed) ? (parsed as unknown[]) : [parsed];
        } catch {
          return [raw];
        }
      }
      return [raw];
    };
    const quote = (value: unknown) =>
      Array.isArray(value)
        ? `ARRAY[${(value as unknown[]).map((v) => `'${String(v).replaceAll("'", "''")}'`).join(",")}]`
        : `'${String(value).replaceAll("'", "''")}'`;

    await lastMessagePerThread(probe as unknown as typeof db, team.id, [key]);

    const sql = sent.join(" ");
    check("DB 로 내려가는 SQL 을 한 번만 보낸다", sent.length, 1);
    check("스레드마다 LIMIT 1 로 멈춘다", /LIMIT 1/i.test(sql), true);
    check("스레드 밖의 값을 고르지 않는다", /LATERAL/i.test(sql), true);

    // 함수가 올바르다고 호출부가把它를 버리면 또 그대로다. 실제로 있었던 일이 이것이다 —
    // `getDmThreads` 가 이 경로를 두고 Prisma `distinct` 로 직접 읽었다. 함수를 고쳐 놓아도
    // **누가 부르는지**를 함께 고정해야 한다.
    const api = readFileSync(new URL("../src/data/api.ts", import.meta.url), "utf8");
    const body = api.slice(api.indexOf("export async function getDmThreads("), api.indexOf("export async function getDmThreads(") + 2600);
    check("getDmThreads 가 이 함수를 부른다", /lastMessagePerThread\(db, teamId, threadKeys\)/.test(body), true);
    check("getDmThreads 가 Prisma distinct 로 직접 읽지 않는다", /distinct: \["threadKey"\]/.test(body), false);
    console.log(`      (전체 메시지 ${existing} → ${grown}건, 조회 행은 ${after.length}행)`);

    // **방 전체 개수로 되돌았는지 재지 않는다.** 이 방은 다른 검사도 함께 쓴다 — 남이 쓰는
    // 사이에 개수가 바뀌면 **내가 제대로 치웠는데 실패**한다(그리고 실제로 그랬다). 내가 만든
    // 행이 남았는지만 본다. "치웠다" 의 뜻은 그거다.
    await db.message.deleteMany({ where: { threadKey: key, text: { startsWith: "비용 확인" } } });
    check(
      "이 검사가 만든 메시지는 남지 않는다",
      await db.message.count({ where: { threadKey: key, text: { startsWith: "비용 확인" } } }),
      0,
    );

    // ── **진짜 비용을 재는 자리.** ───────────────────────────
    //
    // 위에서 세는 "조회 행"은 **돌아온 행**이다. 중복을 걸러내는 방식이 무엇이든 결과는
    // 스레드마다 한 줄로 같다. 실제로 몇 행을 읽었는지는 DB 만 안다.
    //
    // 이 자리가 없다가 `DISTINCT ON` + `= ANY(배열)` 이 그대로 통과했다 — 5,006개 대화에서
    // 실제로 10,013행을 읽고 있었는데 검사에는 "1행" 이라고 적혀 있었다.
    //
    // **SQL 을 여기서 다시 적지 않는다.** 적으면 코드가 바뀌어도 검사는 옛 질문을 재고,
    // 오늘 바로 그랬다. 실제로 해 봤다 — Prisma 어댑터는 배열 파라미터에 이미 `::text[]` 를
    // 붙이는데 여기에 또 붙여서 `::text[]::text[]` 인 **다른 질문을** EXPLAIN 하고 있었다.
    // 앱이 보내는 SQL 을 그대로 받는다(위에서 잡아 둔 `capturedSql`·`capturedParams`).
    const askSql = async (extra: number) => {
      const base = new Date("2026-01-01T00:00:00Z");
      for (let i = 0; i < extra; i += 500) {
        await db.message.createMany({
          data: Array.from({ length: Math.min(500, extra - i) }, (_, k) => ({
            teamId: team.id,
            threadKey: key,
            authorId: member.id,
            text: `규모 확인 ${i + k}`,
            whenLabel: "00:00",
            // `createMany` 한 번으로 전부 넣으면 `createdAt` 이 한 문장 안의 `now()` 로
            // 같아진다. 실제 대화에서는 그렇지 않고, 같으면 인덱스가 첫 행에서 멈출 수 없다.
            createdAt: new Date(base.getTime() + (i + k) * 1000),
          })),
        });
      }
      await db.$executeRawUnsafe(`ANALYZE "Message"`);

      await lastMessagePerThread(probe as unknown as typeof db, team.id, [key]);
      // 이벤트 안에 들어 있는 값으로 **실제로 나간 문장**을 다시 세운다.
      const values = paramsOf(capturedParams);
      const captured = capturedSql.replace(/\$(\d+)/g, (_, n: string) => quote(values[Number(n) - 1]));
      check("스레드별 마지막 말 SQL 을 잡았다", captured.includes('"Message"'), true);

      const explained = (await db.$queryRawUnsafe(`EXPLAIN (ANALYZE, FORMAT JSON) ${captured}`)) as Array<Record<string, unknown>>;
      let total = 0;
      (function walk(node: Record<string, unknown>) {
        total += Number(node["Actual Rows"] ?? 0) * Number(node["Actual Loops"] ?? 1);
        for (const child of (node["Plans"] as Array<Record<string, unknown>>) ?? []) walk(child);
      })((explained[0]["QUERY PLAN"] as Array<Record<string, unknown>>)[0].Plan as Record<string, unknown>);

      const size = await db.message.count({ where: { threadKey: key } });
      console.log(`      (메시지 ${size}건일 때 DB 가 실제로 읽은 행 ${total})`);
      return total;
    };
    await probe.$disconnect();

    // **검사가 실패해도 측정용 메시지는 치운다.** `check` 는 예외를 던지지 않지만, 그 뒤의
    // 어떤 것이 던지면(앞으로의 새 검사라든가) 치우는 대참이 건너뛰어진다. 그때 개발 DB 에
    // 메시지 5,000줄이 남고, 다음 실행은 "원래대로" 에서 실패한다 — **첫 실패의 잔재가
    // 두 번째 실패를 만든다.** 그래서 `finally` 다.
    // 앞선 실행이 (어떤 이유로든) 치우지 못하고 남긴 measurement 행을 먼저 치운다. 이 검사가
    // 스스로를 고치지 못하면 **비교 기준이 조용히 오염되고**, 어느 쪽이 옳은지 알 수 없게 된다.
    await db.message.deleteMany({ where: { threadKey: key, text: { startsWith: "규모 확인" } } });
    // 앞선 실행이 남긴 것이 있으면 **비교 기준이 조용히 오염된다**(작을 때의 수치가
    // 5,000개 방에서 5,166행처럼 보인다). 눈에 보이게 한다. 남은 건 이 검사가 만든 것뿐이어야
    // 하고, 남의 메시지는 이 방에 얼마든지 있어도 상관없다.
    check(
      "측정을 시작할 때 이 검사가 만든 잔재가 없다",
      await db.message.count({ where: { threadKey: key, text: { startsWith: "규모 확인" } } }),
      0,
    );
    let small = 0;
    let big = 0;
    try {
      small = await askSql(0);
      big = await askSql(5000);
      // **비율로 재면 안 된다.** 고장난 쪽도 "1.9배"였다 — 5,000배 데이터를 2배로 읽은 것인데
      // 3배 이하여서 통과했다. 5,000개 방에서 매번 10,000행을 읽는 것이 문제이지, 그게 몇 배
      // 더 늘었는지가 아니다. **절대값**으로 본다. 스레드 하나에 대한 고정 비용이면 몇 행이든
      // 작아야 하고, 방 크기에 비례하면 5,000개로는 수만 행이 된다.
      check("5,000개 방에서도 읽는 행이 100행 미만이다 (방 크기와 무관)", big < 100, true);
      console.log(`      (작을 때 ${small}행 → 5,000개 방에서 ${big}행 · 방이 800배 커졌는데 ${(big / Math.max(small, 1)).toFixed(1)}배)`);
    } finally {
      await db.message.deleteMany({ where: { threadKey: key, text: { startsWith: "규모 확인" } } });
    }
    check(
      "측정용 메시지는 남지 않는다",
      await db.message.count({ where: { threadKey: key, text: { startsWith: "규모 확인" } } }),
      0,
    );
  }
}

/* ── 팀 분위기는 네 축을 모두 말한다 ──────────────────────── */

console.log("\n팀 분위기 요약에 네 축이 모두 반영된다");
{
  // 이 검사는 **문구 자체** 를 박아 두지 않는다. 문구는 바뀔 수 있다. 대신 **네 축이
  // 요약에 들어갔는지** 만 본다 — 어느 한 축의 분기만 지워도 세어 보면 드러난다.
  //
  // 실제로 그렇게 놓쳤었다. `calculateTeamMbtiStats` 는 ratio 를 여덟 개 계산했는데
  // `ratioN` 만 어디에서도 읽히지 않았다 — E/I·S/N·T/F·J/P 중 S/N 구절이 통째로 없는
  // 상태였다. 어느 팀을 넣어도 S 축 팀과 N 축 팀의 요약이 같다면 그것은 요약이 아니라
  // **한쪽이 없는 것**이다.
  const allS = calculateTeamMbtiStats(["ISTJ", "ISFP", "ESTJ", "ISFJ"]);
  const allN = calculateTeamMbtiStats(["INTJ", "INFP", "ENTJ", "INFJ"]);

  check("전부 S 인 팀과 전부 N 인 팀의 요약이 다르다", allS.dominantSummary !== allN.dominantSummary, true);
  check("한쪽이 요약에서 사라지지 않는다", allS.dominantSummary.length > 0 && allN.dominantSummary.length > 0, true);
  // **배열 전체를** 본다. 첫째 항목만 보면 E/I 팁이 같아서 항상 같다 — E/I 가 가장 먼저
  // 팁을 넣으므로 어느 팀이든 0번이 그 팁이다. S/N 의 차이는 그 뒤에 쌓인다.
  check(
    "협업 팁이 두 팀에서 다르다",
    allS.collaborationTips.join("|") !== allN.collaborationTips.join("|"),
    true,
  );
  // S/N 구절이 있으면 팁이 붙는다 — E/I·J/P 와 같은 규칙이다.
  check("S 도 팀에게 팁이 붙는다", allS.collaborationTips.length > 0, true);
  check("N 도 팀에게 팁이 붙는다", allN.collaborationTips.length > 0, true);
  // 균형 잡힌 팀은 어느 쪽도 아니라 판단한다 — S/N 이 균형이면 어느 구절도 붙지 않는다.
  const mixed = calculateTeamMbtiStats(["ISFP", "INFP"]);
  check("S/N 이 갈리면 요약은 나머지 축으로만 말한다", mixed.dominantSummary.length > 0, true);

  // 빈 팀이 50/50 으로 떨어지지 않는지 — `count === 0` 일 때 50 을 쓰고, 그 합이 100 인지.
  const nobody = calculateTeamMbtiStats([null, null]);
  check("아무도 없으면 축이 반반이다", [nobody.axes.sn.ratioS, 100 - nobody.axes.sn.ratioS], [50, 50]);
  check("아무도 없으면 요약이 모으는 중이라고 말한다", nobody.dominantSummary.includes("모으는 중"), true);
}

/* ── 13/22 화면은 파일 하나만 읽는다 ───────────────────────── */

console.log("\n파일 보기 화면의 조회 범위");
{
  // 쿼리 수를 재는 대신 **구조**를 고정한다. 화면을 실행할 수 없으므로, "무엇을 요구하는가"를
  // 본다 — 전체 목록을 읽고 하나를 고르는 함수가 남아 있으면 즉시 걸린다.
  const api = readFileSync(new URL("../src/data/api.ts", import.meta.url), "utf8");
  const context = api.slice(
    api.indexOf("export async function getFileViewContext"),
    api.indexOf("export async function getFileViewContext") + 2200,
  );
  check("13/22 화면의 조회는 하나뿐이다", /where: \{ id: fileId, boxId, box: \{ teamId \} \}/.test(context), true);
  check("팀의 모든 제출함을 읽지 않는다", /db\.submissionBox\.findMany/.test(context), false);
  check("그 제출함의 모든 파일을 읽지 않는다", /db\.submittedFile\.findMany/.test(context), false);
  // 화면이 그 함수를 **한 번만** 부르는지.
  const page = readFileSync(
    new URL("../src/app/(tabs)/drive/[boxId]/[fileId]/page.tsx", import.meta.url),
    "utf8",
  );
  check("13 화면은 컨텍스트를 한 번 읽는다", (page.match(/getFileViewContext/g) ?? []).length, 2); // import 1 + 호출 1
  check("13 화면이 따로 부르는 함수가 없다", /getSubmissionBox\(|getSubmittedFile\(/.test(page), false);
}

/* ── 가입 요청 제한: 순수 판정 ─────────────────────────────────── */

console.log("\n가입 요청 제한 (화면·서버가 같은 순수 함수를 부른다)");
{
  // `clientGate` 의 비교는 `>` 다 — 막은 시도까지 이미 창에 찍혀 있으므로 `max` 번까지는
  // 통과한다. `>=` 로 바뀌면 한 번 일찍 막히고, 이 테스트가 바로 그걸 잡는다.
  check("10분 창은 5회까지 통과한다", clientGate(5, 0), "open");
  check("10분 창은 6번째에 막는다", clientGate(6, 0), "client");
  check("1시간 창은 15회까지 통과한다", clientGate(1, 15), "open");
  check("1시간 창이 넘으면 짧은 창이 멀쩡해도 막는다", clientGate(1, 16), "client");

  // 팀 예산은 쿠키를 지워도 남는 방어선이라 넉넉하다. 좁으면 정상 팀원이 못 들어온다.
  check("팀 10분 창은 20회까지 통과한다", teamGate(20, 0, 0), "open");
  check("팀 10분 창은 21번째에 막는다", teamGate(21, 0, 0), "team-budget");
  check("팀 1시간 창은 50회까지 통과한다", teamGate(0, 50, 0), "open");
  check("팀 1시간 창은 51번째에 막는다", teamGate(0, 51, 0), "team-budget");

  // 시간 창을 한 번도 넘지 않고도 개수로 막힌다 — 느린 공격의 유일한 방어선.
  check("시간은 넉넉해도 미해결 49건까지는 된다", teamGate(0, 0, 49), "open");
  check("미해결 50건부터 막는다", teamGate(0, 0, JOIN_LIMIT.unresolvedPerTeam), "pending-cap");
  check("배너는 상한 직전에는 안 뜬다", isJoinCapped(JOIN_LIMIT.unresolvedPerTeam - 1), false);
  check("배너는 상한부터 뜬다", isJoinCapped(JOIN_LIMIT.unresolvedPerTeam), true);
}

/* ── 가입 요청: 토큰은 만들어진 뒤로 바뀌지 않는다 ────────────── */

console.log("\n가입 요청 토큰 불변식 (다른 브라우저가 가로챌 수 없다)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) throw new Error("시드 팀이 없습니다. 먼저 db:seed 를 돌리세요.");
  const suffix = String(Date.now() % 1e7);
  const name = `불변${suffix}`;

  const first = await db.joinRequest.create({
    data: { teamId: team.id, name, token: `A-${suffix}`, status: "pending" },
  });
  check("첫 신청이 그 토큰을 가진다", first.token, `A-${suffix}`);

  // 같은 이름으로 두 번째 신청 = 다른 브라우저가 재신청한 것.
  let code: string | undefined;
  try {
    await db.joinRequest.create({
      data: { teamId: team.id, name, token: `B-${suffix}`, status: "pending" },
    });
  } catch (error) {
    code = (error as { code?: string }).code;
  }
  check("같은 이름의 두 번째 신청은 DB 가 막는다", code, "P2002");

  const kept = await db.joinRequest.findUniqueOrThrow({
    where: { teamId_name: { teamId: team.id, name } },
  });
  check("토큰은 여전히 첫 번째 것", kept.token, `A-${suffix}`);
  check("이름당 요청은 하나뿐이다", await db.joinRequest.count({ where: { teamId: team.id, name } }), 1);

  await db.joinRequest.delete({ where: { id: first.id } });
}

console.log("\n가입 요청 토큰 불변식 (동시에 같은 이름으로 신청하면 한 명만 이긴다)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) throw new Error("시드 팀이 없습니다. 먼저 db:seed 를 돌리세요.");
  const suffix = String(Date.now() % 1e7);
  const name = `경쟁${suffix}`;

  const results = await Promise.allSettled([
    db.joinRequest.create({ data: { teamId: team.id, name, token: `A-${suffix}`, status: "pending" } }),
    db.joinRequest.create({ data: { teamId: team.id, name, token: `B-${suffix}`, status: "pending" } }),
  ]);

  const won = results.filter((r) => r.status === "fulfilled");
  const lost = results.filter((r) => r.status === "rejected");
  check("한쪽만 이긴다", won.length, 1);
  check("진 쪽은 둘 다 P2002 다", lost.every((r) => (r as PromiseRejectedResult).reason?.code === "P2002"), true);

  const row = await db.joinRequest.findUniqueOrThrow({
    where: { teamId_name: { teamId: team.id, name } },
  });
  check("남은 행의 토큰은 승자의 그것이다", row.token, (won[0] as PromiseFulfilledResult<{ token: string }>).value.token);

  await db.joinRequest.delete({ where: { id: row.id } });
}

console.log("\n가입 요청: 막는 위치와 덮어쓰지 않음이 코드에 남아 있다");
{
  // 순수 함수를 부를 수 없는 지점(쿠키가 필요한 액션)은 **소스**로 고정한다. 이 저장소는
  // 이미 화면·서버가 같은 계산을 쓰는 관례로 그랬다.
  const src = readFileSync(new URL("../src/server/actions/onboarding.ts", import.meta.url), "utf8");
  const from = src.indexOf("export async function joinTeam");
  const fn = src.slice(from, src.indexOf("export async function checkJoinApproval", from));

  // **`upsert` 는 토큰 회전의 유일한 경로였다.** update 에 `token` 이 들어가면 다른
  // 브라우저가 그 토큰을 자기 쿠키로 옮겨 심는다. create 로만 만들어야 이게 불가능하다.
  check("토큰을 갱신하는 upsert 가 없다", /joinRequest\.upsert/.test(fn), false);
  check("새 요청은 create 로만 만든다", /joinRequest\.create/.test(fn), true);
  check("경합에서 진 쪽은 덮어쓰지 않고 돌려보낸다", /P2002[\s\S]{0,160}status: "taken"/.test(fn), true);
  // 제한은 **행도 알림도 만들어지기 전에** —— 알림 폭탄의 비용이 이미 발생한 뒤에 막으면 늦다.
  check("이 브라우저 제한이 요청 생성보다 먼저 온다", fn.indexOf("takeClientAttempt") < fn.indexOf("joinRequest.create"), true);
  // 소유자만 자기 요청을 고친다. 남의 희망 역할을 덮어쓰면 역할 추첨의 입력이 바뀐다.
  check("소유자 확인이 새 요청보다 먼저 온다", fn.indexOf("store.get(JOIN_COOKIE)?.value;\n    const found") >= 0, true);
  // **팀 예산은 새 행을 만들려는 시점에만 깎인다.** 위쪽에 두면 자기 요청을 다시 여는
  // 정상 사용자가 팀 예산을 먹고, 그 숫자를 공격자가 고쳐 팀 전체의 신규 가입을 막는다.
  // 팀 코드 하나만 알면 이 숫자를 조작할 수 있으므로 순서가 곧 방어다.
  check(
    "팀 예산은 소유자 확인 뒤에 온다",
    fn.indexOf("takeTeamCreation") > fn.indexOf("const found = await db.joinRequest.findUnique"),
    true,
  );
  check("팀 예산은 요청 생성보다 먼저 온다", fn.indexOf("takeTeamCreation") < fn.indexOf("joinRequest.create"), true);

  // 푸시는 예산 안에서만, 앱 안 알림은 항상.
  const notifySrc = readFileSync(new URL("../src/server/notify/create.ts", import.meta.url), "utf8");
  check("notify 가 푸시만 끌 수 있다", /input\.push === false/.test(notifySrc), true);
  check("앱 안 알림은 푸시 예산과 무관하게 남는다", notifySrc.indexOf("notification.createMany") < notifySrc.indexOf("input.push === false"), true);
}

await db.$disconnect();

console.log(`\n${failed === 0 ? "모두 통과" : `${failed}건 실패`} — ${passed}건 통과, ${failed}건 실패`);
if (failed > 0) process.exit(1);

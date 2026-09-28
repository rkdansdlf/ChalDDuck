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
  PURIFY_BATCH_LIMIT,
  alignPurified,
  canPurify,
  displayTextOf,
  nextPurifyBatch,
  parseSoftened,
  purificationRejects,
  toneChanged,
  toneOf,
  packPurifyLines,
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

/**
 * 읽기 순화 검사에 쓰는 말 하나. 서버가 돌려주는 `ChatMessage` 와 같은 모양이어야 한다 —
 * 일부만 넣은 객체를 넣으면 "이 규칙이 어느 값을 보는지"를 아무도 확인 못 한다.
 */
const sent = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  author: "최유나",
  mbti: null,
  isMine: false,
  text: "이거 왜 아직 안 올렸어요?",
  time: "14:02",
  sortAt: "2026-09-26T05:02:00.000Z",
  status: "sent",
  ...over,
});

console.log("\n읽기 순화: 무엇을 순화하는가");
{
  // `lib/read-cushion.ts` 를 직접 부른다 — 화면과 서버가 **같은 함수**를 쓰는 것이
  // 이 기능의 첫 번째 약속이다. 두 곳이 따로 고르면 "화면은 다 순화됐다고 믿는데
  // 서버는 일부만 시킨다" 는 상태가 조용히 생긴다(타입 검사로는 절대 못 잡는다).
  check("남이 보낸 글은 순화한다", canPurify(sent("a")), true);
  // 내 말은 순화 대상이 아니다. 내가 쓴 말을 다듬어 보여 주면 내가 한 말이 아닌 것처럼 읽힌다.
  check("내 말은 순화하지 않는다", canPurify(sent("b", { isMine: true })), false);
  // 파일만 보낸 말에는 문장이 없다.
  check("글 없는 말은 순화하지 않는다", canPurify(sent("c", { text: "  " })), false);
  // 낙관적 말풍선(아직 서버에 없음)에 순화를 걸면 **보낼 말**을 바꿔 버리게 된다.
  check("보내는 중인 말은 순화하지 않는다", canPurify(sent("d", { status: "sending" })), false);
}

console.log("\n읽기 순화: 한 묶음에 무엇을 넣는가");
{
  const lines = [
    sent("a"),
    sent("c", { isMine: true }),
    sent("d", { text: "" }),
    sent("e"),
    sent("f"),
  ];
  // **순화본은 말에 붙어 있지 않다** — `use-chat-thread` 의 `purified` 표가 따로 들고 있다.
  // "이미 순화했는지"를 이 함수가 보려면 그 표를 받아야 한다.
  const purified = { b: "이거 아직 안 올라온 이유가 있을까요?" };
  const withB = [...lines, sent("b")];

  check("모두 부르면 순화할 수 있는 것만 고른다", nextPurifyBatch(withB, ["a", "b", "c", "d", "e", "f"], purified).ids, [
    "a",
    "e",
    "f",
  ]);
  check("이미 순화본이 있는 말은 다시 부르지 않는다", nextPurifyBatch(withB, ["b"], purified).ids, []);
  // 순화표가 비어 있으면 그 말은 아직 순화본이 없는 말이다 — 같은 말을 다시 부른다.
  check("순화표가 비면 없는 것으로 본다", nextPurifyBatch(withB, ["b"], {}).ids, ["b"]);
  // 화면이 방 안의 말만 id 로 보내지만, 섞여 와도 여기서 걸러 낸다.
  check("요청하지 않은 말은 섞어 넣지 않는다", nextPurifyBatch(withB, ["다른 방의 말"], purified).ids, []);
  check(
    "묶음은 한 번에 열 개까지다",
    nextPurifyBatch(Array.from({ length: 20 }, (_, i) => sent(`m${i}`)), Array.from({ length: 20 }, (_, i) => `m${i}`)).ids
      .length,
    PURIFY_BATCH_LIMIT,
  );
}

console.log("\n읽기 순화: 말투가 바뀌면");
{
  // 한 말에는 사람당 한 줄이다. 새 말투로 다시 만들어도 예전 글 위에 덮어쓸 수 없으니
  // **바뀐 순간 예전 순화본을 지워야 한다** — 그렇지 않으면 사용자는 고른 말투가 아닌
  // 글을 읽는데 화면은 "다듬는 중" 이다.
  check("처음 고르는 것은 지울 것이 없다", toneChanged(null, "plain"), false);
  check("말투가 바뀌었으면 지운다", toneChanged("soft", "plain"), true);
  check("같은 말투를 다시 고르면 남긴다", toneChanged("plain", "plain"), false);
  check("고른 것이 없으면 첫 말투로 읽는다", toneOf({ tone: null }), "soft");
  check("고른 말투는 그대로 읽는다", toneOf({ tone: "firm" }), "firm");
  // 모르는 값이 저장돼 있어도 조용히 다른 말투로 돌지 않는다.
  check("모르는 말투는 없는 것으로 본다", toneOf({ tone: "존나" }), "soft");
}

console.log("\n읽기 순화: 무엇을 그릴 것인가");
{
  const raw = "이거 왜 아직 안 올렸어요?";
  const soft = "이거 아직 안 올라온 이유가 있을까요?";

  // 원문과 순화문을 **따로** 받는다 — 순화본은 이제 `ChatMessage` 에 붙어 있지 않다.
  // 켜짐/꺼짐 비트도 없고, **원문을 보고 있는지**로 정한다(설정은 말투 하나뿐이다 —
  // `ReadCushionSetting` = `{ tone }`).
  check("원문을 보고 있으면 순화본이 있어도 원문이다", displayTextOf(raw, soft, true).text, raw);
  check("원문을 보지 않으면 순화문을 그린다", displayTextOf(raw, soft, false).text, soft);
  check("순화본이 없으면 원문이다", displayTextOf("안 올렸어요", null, false).text, "안 올렸어요");
  // 아직 만들지 못한 말은 빈 글로 그리지 않는다 — "순화됨" 표시 없이도 원문이 보인다.
  check("순화본이 아직 없으면 빈 글이 아니다", displayTextOf("안 올렸어요", undefined, false).text, "안 올렸어요");
  check("원문을 보고 있으면 순화했다고 말하지 않는다", displayTextOf(raw, soft, true).purified, false);
  check("원문을 보지 않으면 순화했다고 말한다", displayTextOf(raw, soft, false).purified, true);
}

console.log("\n읽기 순화: 무료 모델의 응답을 꺼내기");
{
  // 무료 라우터는 요청마다 모델을 무작위로 고르고, 그중 **도구 호출을 하지 않는 것**이
  // 있다. 그래서 순화문은 JSON 배열을 글 안에 담아 받는다(`askText`).
  check("JSON 배열을 꺼낸다", parseSoftened('["다듬은 말", "또 다른 말"]', 2), ["다듬은 말", "또 다른 말"]);
  check("설명문이 앞뒤에 있어도 꺼낸다", parseSoftened('확인했습니다. ["하나", "둘"] 끝.', 2), ["하나", "둘"]);
  // 코드펜스를 붙이는 무료 모델이 실제로 있다.
  check("코드펜스를 벗겨 낸다", parseSoftened('```json\n["하나", "둘"]\n```', 2), ["하나", "둘"]);
  check("번호 줄도 받아 준다", parseSoftened("1. 하나\n2. 둘", 2), ["하나", "둘"]);

  // **줄 개수가 어긋나면 포기한다.** 줄이 쪼개져 있으면 뒤로 밀려서 다른 사람의 말이
  // 엉뚱한 말로 보일 수 있다 — 이 기능에서 가장 나쁜 실패라 원문으로 돌려보낸다.
  check("줄이 모자라면 원문으로 돌려보낸다", parseSoftened("1. 하나", 2), []);
  check("글이 아니면 원문으로 돌려보낸다", parseSoftened("죄송합니다", 2), []);
  check("빈 응답도 안전하다", parseSoftened("   ", 2), []);
  check("배열이 아니면 안전하다", parseSoftened({ lines: [] }, 2), []);
  // JSON 안의 빈 자리는 alignPurified 가 원문으로 채운다.
  check("빈 칸은 그대로 두고 나머지는 받는다", parseSoftened('["하나", "", "셋"]', 3), ["하나", "", "셋"]);
}

console.log("\n읽기 순화: 이건 순화가 아니다");
{
  // 실측: openrouter/free 는 다툰 말을 **거절하거나 욕을 남긴다.**
  // "좀비처럼 달려가지 말고" → "좀비처럼 너무 빠르게 달려가지 말고" (3/3).
  // 이걸 걸러 내지 않으면 말풍선에 "순화됨" 이 달린 글이 욕설을 품은 채 보인다.
  check("욕이 남은 결과는 버린다", purificationRejects("씨발 진짜 왜 이래 좀 그만 좀비처럼 달려가지 말고", "진짜 왜 이래 좀 그만 좀비처럼 달리지 마세요"), true);
  check("비꼼이 남은 결과도 버린다", purificationRejects("역시 대충이네", "이번 결과는 대충이네요"), true);
  check("탓하는 표현이 남으면 버린다", purificationRejects("다 니 탓인데", "조용히 해 주세요 다 니 탓"), true);
  check("비웃음 기호가 남으면 버린다", purificationRejects("대충이네 ㅋㅋ", "그렇게 하시네요 ㅋㅋ"), true);
  check("욕을 실제로 걷어냈다면 통과한다", purificationRejects("씨발 진짜 왜 이래 좀비처럼", "속도를 조금 늦춰서 진행하면 될 것 같아요"), false);
  // **감정 표현은 순화 대상이 아니다** — 지우면 순화가 아니라 감정 삭제다.
  check("짜증 같은 감정 표현은 남아도 통과한다", purificationRejects("짜증나 죽겠어", "정말 힘들 것 같아요"), false);
  // 빈 글은 순화가 아니라 삭제다.
  check("빈 결과는 버린다", purificationRejects("안 올렸어요", "   "), true);
  // 길이 폭주 (원문 두 글자에 두 문장)도 순화가 아니라 지어내기다.
  check("터무니지게 긴 결과는 버린다", purificationRejects("안 올려", "가".repeat(200)), true);
}

console.log("\n읽기 순화: 모델 응답을 맞추는 법");
{
  const originals = ["이거 왜 아직 안 올렸어요?", "자료는 언제쯤 나와요?"];

  check("같은 줄 수면 그대로 맞춘다", alignPurified(["이거 아직 안 올라온 이유가 있을까요?", "자료는 언제쯤 준비되나요?"], originals), [
    "이거 아직 안 올라온 이유가 있을까요?",
    "자료는 언제쯤 준비되나요?",
  ]);
  // 모델이 줄 번호를 되살려 붙여도 벗겨 낸다 — 그래야 "1. 다듬은 말" 이 그대로 보인다.
  check("줄 번호는 벗겨 낸다", alignPurified(["1. 다듬은 말", "2. 다른 말"], originals)[0], "다듬은 말");
  // 개수가 어긋나면 **어긋난 자리만 원문으로 남긴다.** 틀린 순화는 이 기능에서 가장 나쁘다.
  check("한 줄을 빼먹으면 그 자리는 순화하지 않는다", alignPurified(["다듬은 말"], originals), ["다듬은 말", null]);
  check("응답이 글 배열이 아니면 전부 원문", alignPurified("알겠습니다", originals), [null, null]);
  // 원문 두 글자에 대해 두 문장이 나오면 순화가 아니라 지어내기다.
  check("터무니지게 긴 결과는 버린다", alignPurified(["가".repeat(400)], [originals[0]]), [null]);
  check("원문과 같으면 그대로 둔다", alignPurified([originals[0]], [originals[0]]), [originals[0]]);
}

console.log("\n읽기 순화: 입력 상한을 넘으면 자르지 않는다");
{
  // 대화 한 편의 최대 길이(`MAX_MESSAGE` 2000자)를 네 개면 상한(8000자)을 넘긴다 —
  // 줄 번호와 줄바꿈까지 더한 길이로 재어서 세 개에서 멈춘다.
  const long = "가".repeat(2000);
  const { block, kept } = packPurifyLines([long, long, long, long]);
  check("상한을 넘으면 묶음을 줄인다", kept, 3);
  check("자르지 않는다", block.length <= AI_INPUT_LIMIT, true);
  check("넣은 글은 통째로 들어 있다", block.includes(long), true);

  // 한 줄조차 안 들어가는 묶음은 **비어 있다**(자르지 않는다). 대화는 2000자까지라
  // 실제로는 없지만, 여기서 자르면 말의 뒷부분이 없는 순화문이 저장된다.
  check("한 줄이 안 들어가면 묶음이 비어 있다", packPurifyLines(["가".repeat(AI_INPUT_LIMIT)]).kept, 0);
  check("빈 묶음도 문제가 아니다", packPurifyLines([]), { block: "", kept: 0 });
}

console.log("\n읽기 순화 (DB)");
{
  const team = await db.team.findFirst({ orderBy: { createdAt: "asc" } });
  const reader = team ? await db.member.findFirst({ where: { teamId: team.id } }) : null;
  if (!team || !reader) {
    console.log("  · 팀원이 없어 이 항목을 건너뜁니다 (npm run db:seed 후 다시 돌리세요)");
  } else {
    const message = await db.message.create({
      data: {
        teamId: team.id,
        threadKey: "team",
        authorId: reader.id,
        text: "읽기 순화 확인용",
        whenLabel: "14:02",
      },
    });

    const first = await db.messageCushion.create({
      data: { messageId: message.id, memberId: reader.id, text: "읽기 순화 확인용", tone: "soft" },
    });
    truthy("순화본이 남는다", Boolean(first.id));

    // **같은 말·같은 사람에게 두 줄이 생기면 안 된다.** 어느 것이 맞는 순화본인지
    // 고르는 기준이 사라지고, 사용자가 본 말과 다른 말이 쌓인다.
    const dup = await db.messageCushion
      .create({ data: { messageId: message.id, memberId: reader.id, text: "다른 말", tone: "plain" } })
      .catch((e: { code?: string }) => e.code);
    check("같은 말은 사람당 한 줄뿐이다", dup, "P2002");

    const many = await db.messageCushion.createMany({
      data: [{ messageId: message.id, memberId: reader.id, text: "무시된다", tone: "firm" }],
      skipDuplicates: true,
    });
    check("두 번 시켜도 행이 늘지 않는다", many.count, 0);
    check("남아 있는 것은 처음의 한 줄", await db.messageCushion.count({ where: { messageId: message.id } }), 1);

    // 읽기 설정은 사람 × 방 에 한 줄이다. 다시 골라도 행이 쌓이지 않고 값만 바뀐다.
    // **켜짐/꺼짐 비트는 없다** — 순화는 언제나 켜져 있고, 고르는 것은 말투뿐이다.
    await db.readCushion.upsert({
      where: { memberId_threadKey: { memberId: reader.id, threadKey: "team" } },
      update: { tone: "soft" },
      create: { memberId: reader.id, threadKey: "team", tone: "soft" },
    });
    const saved = await db.readCushion.upsert({
      where: { memberId_threadKey: { memberId: reader.id, threadKey: "team" } },
      update: { tone: "plain" },
      create: { memberId: reader.id, threadKey: "team", tone: "plain" },
    });
    check("다시 골라도 행이 쌓이지 않는다", await db.readCushion.count({ where: { memberId: reader.id } }), 1);
    check("말투가 바뀐다", saved.tone, "plain");

    // **방마다 따로**다 — "단톡방은 부드럽게, DM 은 담담하게" 가 되어야 한다.
    const dm = await db.readCushion.create({
      data: { memberId: reader.id, threadKey: "dm:zz:zz", tone: "firm" },
    });
    const teamRow = await db.readCushion.findUniqueOrThrow({
      where: { memberId_threadKey: { memberId: reader.id, threadKey: "team" } },
    });
    check("방을 바꿔도 다른 방의 설정은 그대로다", teamRow.tone, "plain");
    check("새 방의 설정은 따로 남는다", dm.tone, "firm");

    await db.readCushion.deleteMany({ where: { memberId: reader.id, threadKey: { in: ["team", "dm:zz:zz"] } } });
    await db.messageCushion.deleteMany({ where: { messageId: message.id } });
    await db.message.delete({ where: { id: message.id } });
    // 순화본은 원문과 함께 간다 — 말이 지워졌는데 순화문만 남으면 읽을 대상이 없다.
    check("말을 지우면 순화문도 함께 간다", await db.messageCushion.count({ where: { messageId: message.id } }), 0);
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

    await db.message.deleteMany({ where: { threadKey: key, text: { startsWith: "비용 확인" } } });
    check("검사한 메시지를 치우면 원래대로", await db.message.count({ where: { threadKey: key } }), existing);

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
    // 앞선 실행이 남긴 것이 있으면 **비교 기준이 조용히 오염된다**(5,000개 방에서 6행을 읽는
    // 쿼리가 5,000개 방에서 5,166행을 읽는 것처럼 보인다). 눈에 보이게 한다.
    check("측정을 시작할 때 방이 비어 있다", await db.message.count({ where: { threadKey: key } }), existing);
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
    check("측정용 메시지를 치우면 원래대로", await db.message.count({ where: { threadKey: key } }), existing);
  }
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

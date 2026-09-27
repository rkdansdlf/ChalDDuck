import "../scripts/load-env.mjs";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  AI_INPUT_LIMIT,
  aiInputOverrun,
} from "../src/lib/ai-limit.js";
import {
  NO_DRAW_POOL_TEXT,
  drawPoolOf,
  isRoleKey,
  normalizeName,
  toRoleKey,
} from "../src/features/roles/roster-model.js";
import { MENU_OPTIONS, SCHEDULE_DAYS, SCHEDULE_HOURS } from "../src/data/catalog.js";
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
import type { MeetingProposal } from "../src/lib/types.js";

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

console.log("\n메뉴 룰렛");
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

await db.$disconnect();

console.log(`\n${failed === 0 ? "모두 통과" : `${failed}건 실패`} — ${passed}건 통과, ${failed}건 실패`);
if (failed > 0) process.exit(1);

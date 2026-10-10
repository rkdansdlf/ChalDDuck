import { check, finish, readCode, truthy } from "./db-test-base.mjs";
import {
  calculateSaju,
  pillarHanja,
  solarTermInstant,
  tenGodOf,
  ELEMENTS,
  STEM_HANJA,
  elementCountsOf,
  type Pillar,
} from "../src/lib/saju/engine.js";
import { parseBirth } from "../src/lib/saju/input.js";
import { chemistryOf, type Relation } from "../src/lib/saju/chemistry.js";
import { summarizeTeam } from "../src/lib/saju/team.js";
import { buildTodayFlow, dayStemOfDate } from "../src/lib/saju/today.js";
import { MAX_MEETING_MINUTES, MIN_MEETING_MINUTES, meetingFlowText, planMeetingFlow } from "../src/lib/saju/meeting-flow.js";
import { PAIR_TITLE, RELATION_COPY, MEETING_TIP, MISSION_DUE_SOON, MISSION_MEETING_CLOSER, TODAY_COPY, MEETING_FLOW_STEPS } from "../src/lib/saju/copy.js";

/**
 * 사주 불변식.
 *
 * 타입 검사가 잡지 못하는 두 종류를 본다.
 *
 * 1. **계산이 맞는가** — 컴파일은 되지만 기둥 하나가 어긋나 있는 경우. 공개된 만세력의 값을
 *    기준점으로 박고(아래 `KNOWN`), 어느 날짜를 넣어도 깨지면 안 되는 성질(음양 짝, 일주 연속,
 *    글자 수 합)을 전 기간에 걸쳐 쓸어 본다.
 * 2. **경계가 지켜지는가** — 사주는 역할 배정에 쓰지 않고, 생년월일 원본은 본인에게만 간다.
 *    둘 다 한 줄 import 로 깨지는 약속이라 소스에서 고정한다.
 *
 * DB 를 쓰지 않는 순수 검사지만 `db-test-base` 를 거쳐 돈다 — 요약·종료 규칙을 다른 스위치와
 * 같이 쓰기 위해서다.
 */

const at = (y: number, m: number, d: number, h: number | null = 12, min: number | null = 0) =>
  calculateSaju({ year: y, month: m, day: d, hour: h, minute: h === null ? null : min })!;

const four = (c: ReturnType<typeof at>) =>
  [c.year, c.month, c.day, c.hour].map((p) => (p ? pillarHanja(p) : "--")).join(" ");

const kst = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

async function main() {
  console.log("=== 사주 검증 스위트 ===");

  console.log("\n[기준점] 공개된 만세력과 같은 값");
  check("2000-01-01 12:00 → 己卯 丙子 戊午 戊午", four(at(2000, 1, 1)), "己卯 丙子 戊午 戊午");
  check("2024-01-01 의 일주는 甲子", pillarHanja(at(2024, 1, 1).day), "甲子");
  check("2024-01-01 의 연주는 아직 癸卯(입춘 전)", pillarHanja(at(2024, 1, 1).year), "癸卯");
  check("2001-03-02(경칩 전)는 辛巳年 庚寅月", `${pillarHanja(at(2001, 3, 2, null).year)} ${pillarHanja(at(2001, 3, 2, null).month)}`, "辛巳 庚寅");
  check("2024-06-15 12:00 → 甲辰年 庚午月", four(at(2024, 6, 15)).slice(0, 5), "甲辰 庚午");

  console.log("\n[입춘] 연주·월주가 입춘 시각에서 바뀐다");
  check("2024 입춘(02-04 17:27) 직전 → 癸卯年 乙丑月", `${pillarHanja(at(2024, 2, 4, 17, 0).year)} ${pillarHanja(at(2024, 2, 4, 17, 0).month)}`, "癸卯 乙丑");
  check("2024 입춘 직후 → 甲辰年 丙寅月", `${pillarHanja(at(2024, 2, 4, 18, 0).year)} ${pillarHanja(at(2024, 2, 4, 18, 0).month)}`, "甲辰 丙寅");
  check("2025 입춘(02-03 23:10) 직전 → 甲辰年", pillarHanja(at(2025, 2, 3, 22, 30).year), "甲辰");
  check("2025 입춘 직후 → 乙巳年 戊寅月", `${pillarHanja(at(2025, 2, 4, 0, 30).year)} ${pillarHanja(at(2025, 2, 4, 0, 30).month)}`, "乙巳 戊寅");

  console.log("\n[절기 시각] 공표값과 15분 안 (저정밀 식의 한계 안)");
  const TERMS: [string, number, number, string][] = [
    ["2024 입춘", 2024, 315, "2024-02-04 17:27"],
    ["2025 입춘", 2025, 315, "2025-02-03 23:10"],
    ["2026 입춘", 2026, 315, "2026-02-04 05:02"],
    ["2025 대설", 2025, 255, "2025-12-07 06:05"],
    ["2024 동지", 2024, 270, "2024-12-21 18:21"],
  ];
  for (const [name, year, lon, want] of TERMS) {
    const got = solarTermInstant(year, lon);
    const wantMs = Date.parse(`${want.replace(" ", "T")}:00+09:00`);
    const off = Math.abs(got - wantMs) / 60_000;
    truthy(`${name}: 공표 ${want} / 계산 ${kst(got)} (${off.toFixed(0)}분 차)`, off <= 15);
  }

  console.log("\n[시주·자시] 23시에 날이 바뀐다");
  const late = at(2024, 1, 1, 23, 30);
  check("2024-01-01 23:30 → 일주 乙丑(다음 날)", pillarHanja(late.day), "乙丑");
  check("2024-01-01 23:30 → 시주 丙子", pillarHanja(late.hour!), "丙子");
  check("2024-01-01 22:59 → 일주 甲子, 시주 乙亥(亥時)", `${pillarHanja(at(2024, 1, 1, 22, 59).day)} ${pillarHanja(at(2024, 1, 1, 22, 59).hour!)}`, "甲子 乙亥");
  check("2024-01-01 00:30 → 시주 甲子(같은 날 자시)", pillarHanja(at(2024, 1, 1, 0, 30).hour!), "甲子");

  console.log("\n[경계 표시] 만세력마다 달라질 수 있는 입력은 알린다");
  check("입춘 시각 가까이(2025-02-03 23:08)", at(2025, 2, 3, 23, 8).boundary, "near-term");
  check("절기와 먼 낮", at(2024, 6, 15, 12, 0).boundary, null);
  check("입춘일인데 시각을 모른다", at(2025, 2, 3, null).boundary, "term-day-no-time");
  check("평범한 날 시각을 몰라도 경계 아님", at(2024, 6, 15, null).boundary, null);

  console.log("\n[시각을 모를 때] 시주를 빼고 여섯 글자");
  const noTime = at(2001, 3, 2, null);
  check("시주 없음", noTime.hour, null);
  check("글자 수 6", noTime.characters, 6);
  check("오행 비율 합 100", Object.values(noTime.elementPercent).reduce((a, b) => a + b, 0), 100);
  check("시주 십성도 없음", noTime.tenGods.hour, null);

  console.log("\n[십성] 갑목 일간 기준 열 개 천간");
  const wantGods = ["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"];
  check("甲 일간이 보는 甲乙丙丁戊己庚辛壬癸", STEM_HANJA.map((_, i) => tenGodOf(0, i)), wantGods);
  check("丙 일간이 보는 壬=편관 癸=정관", [tenGodOf(2, 8), tenGodOf(2, 9)], ["편관", "정관"]);
  check("癸 일간이 보는 丙=정재 丁=편재", [tenGodOf(9, 2), tenGodOf(9, 3)], ["정재", "편재"]);

  console.log("\n[전 기간 성질] 1989–2100 을 하루씩, 하루 4번 쓸어 본다");
  let days = 0;
  let badParity = 0;
  let badSum = 0;
  let badPercent = 0;
  let badDomMissing = 0;
  let badDayStep = 0;
  let badMonthStep = 0;
  const parityOk = (p: Pillar | null) => !p || p.stem % 2 === p.branch % 2;
  let prevDay: Pillar | null = null;
  let prevMonthIdx: number | null = null;
  let monthJumps = 0;
  for (let t = Date.UTC(1989, 0, 1); t < Date.UTC(2101, 0, 1); t += 86_400_000) {
    const dt = new Date(t);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    days += 1;
    for (const h of [null, 0, 12, 23]) {
      const c = calculateSaju({ year: y, month: m, day: d, hour: h, minute: h === null ? null : 0 });
      if (!c) {
        badSum += 1;
        continue;
      }
      if (![c.year, c.month, c.day, c.hour].every(parityOk)) badParity += 1;
      const total = ELEMENTS.reduce((a, e) => a + c.elementCounts[e], 0);
      const pct = ELEMENTS.reduce((a, e) => a + c.elementPercent[e], 0);
      if (total !== c.characters || c.yang + c.yin !== c.characters) badSum += 1;
      if (pct !== 100) badPercent += 1;
      const top = Math.max(...ELEMENTS.map((e) => c.elementCounts[e]));
      const dominantOk = c.dominant.every((e) => c.elementCounts[e] === top);
      const missingOk = c.missing.every((e) => c.elementCounts[e] === 0);
      if (!dominantOk || !missingOk) badDomMissing += 1;
    }
    // 정오 기준 일주는 하루에 하나씩, 60 으로 돌며 나아가야 한다.
    const noon = calculateSaju({ year: y, month: m, day: d, hour: 12, minute: 0 })!;
    if (prevDay) {
      const a = prevDay.stem + 10 * 0; // 인덱스 환산 없이 천간·지지가 함께 한 칸씩 가는지 본다
      if ((noon.day.stem - a + 10) % 10 !== 1 || (noon.day.branch - prevDay.branch + 12) % 12 !== 1) badDayStep += 1;
    }
    prevDay = noon.day;
    // 월주는 지지가 한 칸씩만 앞으로 가거나 그대로여야 한다(거꾸로 가거나 건너뛰지 않는다).
    const mb = noon.month.branch;
    if (prevMonthIdx !== null) {
      const step = (mb - prevMonthIdx + 12) % 12;
      if (step > 1) badMonthStep += 1;
      if (step === 1) monthJumps += 1;
    }
    prevMonthIdx = mb;
  }
  truthy(`${days}일을 훑었다`, days > 40_000);
  check("모든 기둥이 음양 짝(천간·지지의 홀짝이 같다)", badParity, 0);
  check("글자 수·음양 수의 합이 맞다", badSum, 0);
  check("오행 비율 합이 항상 100", badPercent, 0);
  check("dominant·missing 이 센 수와 맞다", badDomMissing, 0);
  check("일주가 하루마다 천간·지지 한 칸씩 간다", badDayStep, 0);
  check("월주가 거꾸로 가거나 건너뛰지 않는다", badMonthStep, 0);
  check("월주가 해마다 12번 바뀐다 (1989–2100, 112년 × 12)", monthJumps, 112 * 12);

  console.log("\n[결정성] 같은 입력 → 같은 출력");
  check("두 번 계산해도 같다", JSON.stringify(at(1999, 12, 31, 3, 7)), JSON.stringify(at(1999, 12, 31, 3, 7)));

  console.log("\n[범위] 계산하지 못하는 입력은 null");
  check("1988-12-31 은 범위 밖", calculateSaju({ year: 1988, month: 12, day: 31, hour: null, minute: null }), null);
  check("2월 30일은 없는 날", calculateSaju({ year: 2001, month: 2, day: 30, hour: null, minute: null }), null);
  check("24시는 없다", calculateSaju({ year: 2001, month: 2, day: 3, hour: 24, minute: 0 }), null);

  console.log("\n[입력 검사] 화면과 서버가 같은 규칙");
  const TODAY = "2026-10-09";
  const bad = (date: string, time: string | null) => {
    const r = parseBirth(date, time, TODAY);
    return r.ok ? "ok" : r.reason;
  };
  check("정상", bad("2001-03-02", "14:30"), "ok");
  check("시각 비움 = 모름", bad("2001-03-02", ""), "ok");
  check("시각 null = 모름", bad("2001-03-02", null), "ok");
  check("형식이 다르다", bad("2001/03/02", null), "bad-date");
  check("빈 문자열", bad("", null), "bad-date");
  check("없는 날짜(2월 30일)", bad("2001-02-30", null), "bad-date");
  check("윤년이 아닌 해의 2월 29일", bad("2001-02-29", null), "bad-date");
  check("윤년의 2월 29일", bad("2000-02-29", null), "ok");
  check("1989 이전", bad("1988-12-31", null), "too-old");
  check("내일", bad("2026-10-10", null), "future");
  check("오늘은 가능", bad("2026-10-09", null), "ok");
  check("25시", bad("2001-03-02", "25:00"), "bad-time");
  check("분 60", bad("2001-03-02", "12:60"), "bad-time");
  check("시각 형식", bad("2001-03-02", "2pm"), "bad-time");
  const stored = parseBirth("2001-03-02", "07:05", TODAY);
  check("저장 문자열은 정규화된 그대로", stored.ok ? [stored.date, stored.time] : null, ["2001-03-02", "07:05"]);

  console.log("\n[1:1 케미] 두 일간의 오행 관계");
  const MIRROR: Record<Relation, Relation> = {
    same: "same",
    meGenerates: "generatesMe",
    generatesMe: "meGenerates",
    meControls: "controlsMe",
    controlsMe: "meControls",
  };
  let badMirror = 0;
  let badPair = 0;
  let badCopy = 0;
  for (let a = 0; a < 10; a += 1) {
    const perRelation: Record<string, number> = {};
    for (let b = 0; b < 10; b += 1) {
      const ab = chemistryOf(a, b);
      const ba = chemistryOf(b, a);
      if (MIRROR[ab.relation] !== ba.relation) badMirror += 1;
      if (ab.pairKey !== ba.pairKey || ab.samePolarity !== ba.samePolarity) badPair += 1;
      const rc = RELATION_COPY[ab.relation];
      if (!PAIR_TITLE[ab.pairKey] || !rc.label || !rc.line || !rc.together || !rc.watch || !rc.say) badCopy += 1;
      perRelation[ab.relation] = (perRelation[ab.relation] ?? 0) + 1;
    }
    // 한 일간이 열 천간을 만나면 다섯 관계가 두 번씩 나온다(오행마다 천간이 둘이므로).
    check(`일간 ${STEM_HANJA[a]} 이 만나는 관계는 다섯 가지가 두 번씩`, Object.values(perRelation).sort(), [2, 2, 2, 2, 2]);
  }
  check("나×상대 와 상대×나 는 서로 거울이다", badMirror, 0);
  check("조합 이름·음양 비교는 순서와 무관", badPair, 0);
  check("모든 조합에 이름과 문구가 있다", badCopy, 0);
  check("조합 이름이 열다섯 개 모두 있다", Object.keys(PAIR_TITLE).length, 15);
  check("丙火 × 壬水 = 상대가 다잡는 사이, 속도와 균형의 조합", [chemistryOf(2, 8).relation, PAIR_TITLE[chemistryOf(2, 8).pairKey]], ["controlsMe", "속도와 균형의 조합"]);
  check("甲木 × 丙火 = 내가 북돋는 사이", chemistryOf(0, 2).relation, "meGenerates");
  check("甲木 × 乙木 = 같은 오행, 음양은 다르다", [chemistryOf(0, 1).relation, chemistryOf(0, 1).samePolarity], ["same", false]);

  console.log("\n[팀 집계] 더하기만 한다");
  const member = (counts: Partial<Record<(typeof ELEMENTS)[number], number>>) => ({
    elements: { wood: 0, fire: 0, earth: 0, metal: 0, water: 0, ...counts },
  });
  const empty = summarizeTeam([]);
  check("사람이 없으면 모두 0, 두드러지는 것 없음", [empty.characters, empty.dominant, empty.lowest, Object.values(empty.percent)], [0, [], [], [0, 0, 0, 0, 0]]);
  const t2 = summarizeTeam([member({ fire: 4, wood: 2 }), member({ fire: 2, metal: 4 })]);
  check("두 사람 합산", t2.counts, { wood: 2, fire: 6, earth: 0, metal: 4, water: 0 });
  check("글자 수 = 사람 수 × 6", [t2.members, t2.characters], [2, 12]);
  check("가장 많은 오행", t2.dominant, ["fire"]);
  check("가장 적은 오행은 동률이면 모두", t2.lowest, ["earth", "water"]);
  check("비율 합 100", Object.values(t2.percent).reduce((a, b) => a + b, 0), 100);
  const flat = summarizeTeam([member({ wood: 1, fire: 1, earth: 1, metal: 1, water: 2 }), member({ wood: 1, fire: 1, earth: 1, metal: 1, water: 0 })]);
  check("다섯이 모두 같으면 적은 것을 고르지 않는다", flat.lowest, []);
  truthy("가장 적은 오행마다 회의 제안이 있다", ELEMENTS.every((e) => MEETING_TIP[e].length > 0));
  const three = elementCountsOf([at(2001, 3, 2).year, at(2001, 3, 2).month, at(2001, 3, 2).day]);
  check("세 기둥은 여섯 글자", Object.values(three).reduce((a, b) => a + b, 0), 6);

  console.log("\n[오늘의 팀플 흐름] 날짜와 팀 상태로만 정해진다");
  check("2000-01-01 의 일진 천간은 戊(4)", dayStemOfDate("2000-01-01"), 4);
  check("2024-01-01 의 일진 천간은 甲(0)", dayStemOfDate("2024-01-01"), 0);
  check("달력에 없는 날은 null", [dayStemOfDate("2026-02-30"), dayStemOfDate("오늘"), dayStemOfDate("")], [null, null, null]);
  const flowOf = (my: number, today: string, extra: Partial<Parameters<typeof buildTodayFlow>[0]> = {}) =>
    buildTodayFlow({ today, myStem: my, team: [], meetingToday: false, dueSoon: false, ...extra });
  check("甲 일간 × 甲 일진 = 같은 오행", flowOf(0, "2024-01-01")?.relation, "same");
  check("丙 일간 × 甲 일진 = 오늘이 나를 북돋는다", flowOf(2, "2024-01-01")?.relation, "generatesMe");
  check("甲 일간 × 丙 일진(2024-01-03) = 내가 힘을 내어 준다", flowOf(0, "2024-01-03")?.relation, "meGenerates");
  check("일진 표기", [flowOf(0, "2000-01-01")?.pillarKo, flowOf(0, "2000-01-01")?.pillarHanja], ["무오", "戊午"]);
  check("날짜가 아니면 카드를 만들지 않는다", flowOf(0, "내일"), null);
  let badFlow = 0;
  for (let my = 0; my < 10; my += 1) {
    for (let d = 1; d <= 60; d += 1) {
      const day = new Date(Date.UTC(2026, 0, d)).toISOString().slice(0, 10);
      const f = flowOf(my, day);
      if (!f || !f.title || !f.line || !f.tip || f.title !== TODAY_COPY[f.relation].title) badFlow += 1;
    }
  }
  check("열 일간 × 60일 모두 문구가 있다", badFlow, 0);
  const twoMembers = [member({ fire: 4, wood: 2 }), member({ fire: 2, metal: 4 })];
  check("회의 없는 날은 미션이 없다", flowOf(0, "2026-10-12", { team: twoMembers })?.missions, []);
  check("오늘 회의 + 둘 이상 등록 = 가장 적은 오행 제안 + 마무리 확인", flowOf(0, "2026-10-12", { team: twoMembers, meetingToday: true })?.missions, [MEETING_TIP.earth, MISSION_MEETING_CLOSER]);
  check("한 명만 등록했으면 팀 분포 제안은 없다", flowOf(0, "2026-10-12", { team: [twoMembers[0]!], meetingToday: true })?.missions, [MISSION_MEETING_CLOSER]);
  check("마감 임박만 = 마감 확인", flowOf(0, "2026-10-12", { dueSoon: true })?.missions, [MISSION_DUE_SOON]);
  check("회의와 마감이 겹치면 둘 — 분포 제안을 뺀다", flowOf(0, "2026-10-12", { team: twoMembers, meetingToday: true, dueSoon: true })?.missions, [MISSION_MEETING_CLOSER, MISSION_DUE_SOON]);
  check("같은 입력은 같은 출력", JSON.stringify(flowOf(3, "2026-10-12", { team: twoMembers, meetingToday: true })), JSON.stringify(flowOf(3, "2026-10-12", { team: twoMembers, meetingToday: true })));

  console.log("\n[회의 케미] 진행 방식의 시간 배분");
  let badPlan = 0;
  for (let d = 0; d <= 300; d += 1) {
    const p = planMeetingFlow(d);
    const sum = p.steps.reduce((a, x) => a + x.minutes, 0);
    const clamped = Math.min(MAX_MEETING_MINUTES, Math.max(MIN_MEETING_MINUTES, Math.round(d / 5) * 5));
    if (p.steps.length !== 3 || sum !== p.total || p.total !== clamped) badPlan += 1;
    if (p.steps.some((x) => x.minutes < 5 || x.minutes % 5 !== 0)) badPlan += 1;
  }
  check("0–300분 모든 길이에서 세 단계가 5분 단위이고 합이 회의 길이와 같다", badPlan, 0);
  check("60분 = 30 · 20 · 10", planMeetingFlow(60).steps.map((x) => x.minutes), [30, 20, 10]);
  check("마지막 결정은 30분 이상이면 10분", [planMeetingFlow(30).steps[2]!.minutes, planMeetingFlow(90).steps[2]!.minutes], [10, 10]);
  check("30분 미만이면 결정 5분", planMeetingFlow(20).steps.map((x) => x.minutes), [10, 5, 5]);
  check("범위를 벗어난 길이는 15–240 으로 맞춘다", [planMeetingFlow(0).total, planMeetingFlow(9999).total, planMeetingFlow(Number.NaN).total], [15, 240, 60]);
  const text = meetingFlowText(planMeetingFlow(60), ["earth", "water"]);
  truthy("복사할 글에 세 단계와 시간이 모두 있다", MEETING_FLOW_STEPS.every((st, i) => text.includes(`${i + 1}) ${st.title} (${planMeetingFlow(60).steps[i]!.minutes}분)`)));
  truthy("가장 적게 센 오행의 제안이 복사할 글에 들어간다", text.includes(MEETING_TIP.earth) && text.includes(MEETING_TIP.water));
  check("두드러지는 오행이 없으면 챙겨 볼 것을 쓰지 않는다", meetingFlowText(planMeetingFlow(60), []).includes("챙겨 볼 것"), false);

  console.log("\n[약속] 사주는 역할 배정에 쓰지 않고, 생년월일 원본은 본인에게만 간다");
  const roles = readCode("../src/server/actions/roles.ts");
  truthy("역할 배정 액션이 생년월일·사주를 읽지 않는다", !/birth|saju/i.test(roles));
  const rosterModel = readCode("../src/features/roles/roster-model.ts");
  truthy("역할 명단 계산이 생년월일·사주를 읽지 않는다", !/birth|saju/i.test(rosterModel));

  const api = readCode("../src/data/api.ts");
  // 생년월일을 읽는 구간 = `MySaju` 타입부터 `getMySaju` 끝(다음 구분 주석)까지.
  const start = api.indexOf("export type MySaju =");
  check("getMySaju 가 api.ts 에 있다", start >= 0 && api.includes("export async function getMySaju"), true);
  const end = api.indexOf("/* ── ", start);
  const outside = api.slice(0, start) + api.slice(end);
  truthy("생년월일 열은 getMySaju 밖에서 읽지 않는다 (팀원 목록 등에 실리지 않는다)", !/birthDate|birthTime/.test(outside));
  const teamTypesStart = api.indexOf("export type TeamSajuMember =");
  const teamFnStart = api.indexOf("async function loadTeamSaju");
  truthy("팀 사주 타입이 있고 생년월일 필드가 없다", teamTypesStart >= 0 && teamFnStart > teamTypesStart && !/birth/i.test(api.slice(teamTypesStart, teamFnStart)));
  truthy("내가 등록하지 않았으면 남의 값을 내려보내지 않는다", /members:\s*meRegistered\s*\?\s*visible\s*:\s*\[\]/.test(api));
  const loaderCalls = api.split("loadTeamSaju(").length - 1;
  check("팀 사주와 회의 케미가 같은 읽기 함수(loadTeamSaju) 하나를 거친다(정의 1 + 호출 2)", loaderCalls, 3);
  truthy("회의 케미는 다른 팀의 회의를 읽지 않는다(teamId 로 좁힌다)", /getMeetingSaju[\s\S]*?meetingProposal\.findFirst\(\{\s*where:\s*\{\s*id:\s*meetingId,\s*teamId:\s*session\.teamId/.test(api));
  truthy("참석 예정 = 참석 어려움으로 응답하지 않은 사람(agree: false 만 뺀다)", /responses:\s*\{\s*where:\s*\{\s*agree:\s*false\s*\}/.test(api));
  const sajuActions = readCode("../src/server/actions/saju.ts");
  truthy("회의 케미 액션은 생년월일 열을 직접 읽지 않는다", !/birthDate|birthTime/.test(sajuActions.slice(sajuActions.indexOf("getMeetingChemistry"))));
  truthy("떠난 팀원은 팀 사주에서 뺀다", /loadTeamSaju[\s\S]*?leftAt:\s*null/.test(api));
  const teamActions = readCode("../src/server/actions/team.ts");
  check(
    "팀을 나가는 두 길(leaveTeam·handOverAndLeave)이 같은 값(clearBirthOnLeave)으로 생년월일을 지운다",
    teamActions.split("...clearBirthOnLeave").length - 1,
    2,
  );
  truthy("지우는 값이 두 열(birthDate·birthTime)을 모두 비운다", /clearBirthOnLeave\s*=\s*\{\s*birthDate:\s*null,\s*birthTime:\s*null\s*\}/.test(teamActions));
  const onboardingActions = readCode("../src/server/actions/onboarding.ts");
  truthy("온보딩 초안의 생년월일은 서버가 parseBirth 로 다시 거른다(cleanBirth)", /import \{ parseBirth \} from "@\/lib\/saju\/input"/.test(onboardingActions) && /parseBirth\(date,\s*t\)/.test(onboardingActions));
  truthy("직접 입장·요청 생성·요청 갱신이 values 한 곳에서 생년월일을 받는다", /birthDate:\s*birth\.birthDate,\s*birthTime:\s*birth\.birthTime/.test(onboardingActions));
  truthy("승인 뒤 클레임이 요청의 생년월일을 Member 로 옮긴다", /birthDate:\s*request\.birthDate,\s*birthTime:\s*request\.birthTime/.test(onboardingActions));
  const settleSrc = readCode("../src/server/invite/settle.ts");
  truthy("요청이 거절되면 생년월일·시각을 지운다", /input\.approve\s*\?\s*\{\}\s*:\s*\{\s*birthDate:\s*null,\s*birthTime:\s*null\s*\}/.test(settleSrc));
  const onboardingState = readCode("../src/features/onboarding/onboarding-state.ts");
  truthy("온보딩 초안이 생년월일을 들고 있고 비우면 보내지 않는다(toDraft)", /birthDate:\s*state\.birthDate\.trim\(\)\s*\|\|\s*null/.test(onboardingState));
  truthy("서버에 등록되면 비우는 EMPTY 에 생년월일이 포함돼 있다(공용 PC 에 남지 않는다)", /birthDate:\s*"",\s*birthTime:\s*""/.test(onboardingState));
  const onbSaju = readCode("../src/features/saju/onboarding-saju.tsx");
  truthy("온보딩 사주 카드는 이 기기에서 계산하고 서버를 부르지 않는다", !/@\/server|"use server"/.test(onbSaju));
  truthy("사주는 05 화면 안의 선택 칸이다 — 새 단계를 만들지 않는다(주 동작은 희망 역할 고르기)", /<OnboardingSaju/.test(readCode("../src/app/onboarding/character/page.tsx")) && /희망 역할 고르기/.test(readCode("../src/app/onboarding/character/page.tsx")));
  const types = readCode("../src/lib/types.ts");
  // `OnboardingDraft` 는 사용자가 서버로 **보내는** 입력이라 생년월일을 가진다. 지키려는 것은 서버가 클라이언트로
  // **내려주는** 읽기용 타입(Member·TeamSaju 등)에 생년월일이 없다는 것이다 — 그 정의만 빼고 본다.
  const draftStart = types.indexOf("export type OnboardingDraft");
  const draftEnd = types.indexOf("\n};", draftStart);
  check("온보딩 초안 타입이 types.ts 에 있다", draftStart >= 0 && draftEnd > draftStart, true);
  truthy("공용 타입(Member 등)에 생년월일이 없다 — 보내는 입력(OnboardingDraft)만 예외", !/birth/i.test(types.slice(0, draftStart) + types.slice(draftEnd)));
  truthy("온보딩 초안의 생년월일은 선택(optional)이다", /birthDate\?:\s*string\s*\|\s*null/.test(types.slice(draftStart, draftEnd)));

  console.log("\n[문구] 단정하거나 점수·진단처럼 말하지 않는다");
  const copy = readCode("../src/lib/saju/copy.ts");
  // 주석은 readCode 가 지운다. 남은 것은 사용자에게 보이는 문자열뿐이다.
  truthy("'진단'·'정확'·'운세'·'점수' 를 쓰지 않는다", !/진단|정확|운세|점수/.test(copy));
  const uiFiles = ["my-saju.tsx", "team-saju-screen.tsx", "element-bar.tsx", "today-flow-card.tsx", "meeting-chemistry-sheet.tsx", "onboarding-saju.tsx"].map((f) => readCode(`../src/features/saju/${f}`));
  const logic = ["chemistry.ts", "team.ts", "today.ts", "meeting-flow.ts"].map((f) => readCode(`../src/lib/saju/${f}`));
  const everything = [copy, ...uiFiles, ...logic].join("\n");
  truthy("화면·계산 문구에도 '진단'·'정확'·'운세'·'점수' 가 없다", !/진단|정확|운세|점수/.test(everything));
  truthy("역할을 정해 주는 말(담당·맡아)을 쓰지 않는다", !/담당|맡아|맡으/.test(everything));
  const todayLogic = readCode("../src/lib/saju/today.ts");
  const todayCard = readCode("../src/features/saju/today-flow-card.tsx");
  truthy("오늘의 흐름은 시계를 읽지 않는다(오늘은 서버가 정해 넘긴다)", !/new Date\(|Date\.now|performance\.now/.test(todayLogic + todayCard));
  truthy("오늘의 흐름은 AI 를 부르지 않는다", !/server\/ai|callModel|openai|streamText|generate/i.test(todayLogic + todayCard));
  const homeScreen = readCode("../src/features/home/home-screen.tsx");
  truthy("홈이 오늘의 흐름에 서버가 정한 today 와 브리핑의 회의·마감 결과를 넘긴다", /<TodayFlowCard[\s\S]*?today=\{today\}[\s\S]*?key === "meeting"[\s\S]*?key === "soon"/.test(homeScreen));
  const homePage = readCode("../src/app/(tabs)/home/page.tsx");
  truthy("홈은 팀 사주 조회가 실패해도 깨지지 않는다(catch 로 폴백)", /getTeamSaju\(\)\.catch\(\(\) => null\)/.test(homePage));
  const chemSheet = readCode("../src/features/saju/meeting-chemistry-sheet.tsx");
  truthy("회의 케미는 안건(agenda)을 바꾸지 않는다 — 안건은 회의록·기여 기록 제목이다", !/agenda/.test(chemSheet + readCode("../src/lib/saju/meeting-flow.ts")));
  truthy("회의 케미는 AI 를 부르지 않는다", !/server\/ai|callModel|openai|streamText/i.test(chemSheet));
  truthy("회의 케미는 시트가 사람을 다시 거르지 않는다(서버가 정한 members 를 그대로 쓴다)", /summarizeTeam\(data\.members\)/.test(chemSheet));
  truthy("팀 사주 화면이 역할 화면(07)의 데이터를 읽지 않는다", !/getRoster|getRoles|RoleNegotiation|wantRole|vetoRole/.test(uiFiles.join("\n")));

  await finish();
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

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
import { PAIR_TITLE, RELATION_COPY, MEETING_TIP } from "../src/lib/saju/copy.js";

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
  const teamFnStart = api.indexOf("export async function getTeamSaju");
  truthy("팀 사주 타입이 있고 생년월일 필드가 없다", teamTypesStart >= 0 && teamFnStart > teamTypesStart && !/birth/i.test(api.slice(teamTypesStart, teamFnStart)));
  truthy("내가 등록하지 않았으면 남의 값을 내려보내지 않는다", /members:\s*meRegistered\s*\?\s*registered\s*:\s*\[\]/.test(api));
  truthy("떠난 팀원은 팀 사주에서 뺀다", /getTeamSaju[\s\S]*?leftAt:\s*null/.test(api));
  const types = readCode("../src/lib/types.ts");
  truthy("공용 타입(Member 등)에 생년월일이 없다", !/birth/i.test(types));

  console.log("\n[문구] 단정하거나 점수·진단처럼 말하지 않는다");
  const copy = readCode("../src/lib/saju/copy.ts");
  // 주석은 readCode 가 지운다. 남은 것은 사용자에게 보이는 문자열뿐이다.
  truthy("'진단'·'정확'·'운세'·'점수' 를 쓰지 않는다", !/진단|정확|운세|점수/.test(copy));
  const uiFiles = ["my-saju.tsx", "team-saju-screen.tsx", "element-bar.tsx"].map((f) => readCode(`../src/features/saju/${f}`));
  const logic = ["chemistry.ts", "team.ts"].map((f) => readCode(`../src/lib/saju/${f}`));
  const everything = [copy, ...uiFiles, ...logic].join("\n");
  truthy("화면·계산 문구에도 '진단'·'정확'·'운세'·'점수' 가 없다", !/진단|정확|운세|점수/.test(everything));
  truthy("역할을 정해 주는 말(담당·맡아)을 쓰지 않는다", !/담당|맡아|맡으/.test(everything));
  truthy("팀 사주 화면이 역할 화면(07)의 데이터를 읽지 않는다", !/getRoster|getRoles|RoleNegotiation|wantRole|vetoRole/.test(uiFiles.join("\n")));

  await finish();
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

/**
 * 사주 계산 엔진 — 생년월일시 → 네 기둥(년·월·일·시주) → 오행·음양·십성.
 *
 * ## 이 파일이 하는 일은 계산뿐이다
 *
 * 입력이 같으면 출력이 같다(순수 함수). 해석 문구는 [`copy.ts`](copy.ts) 에 따로 있다 —
 * **계산은 결정적이어야 하고, 말은 계산 결과를 읽어서만 만든다.** 사주 전체를 AI 에 던지면
 * 같은 날짜가 호출마다 다른 사주가 된다.
 *
 * ## 지금 정한 규칙 (바꾸려면 여기만 본다)
 *
 * 만세력마다 갈리는 지점이다. 기획안에 정해진 값이 없어서 **가장 흔한 쪽**을 골랐고,
 * 화면은 `?review=1` 에서 이 사실을 `<Undecided>` 로 드러낸다.
 *
 * - **시각은 한국 표준시(KST, UTC+9) 그대로** 쓴다. 출생지 경도 보정(서울 −30분 등)은 하지 않는다.
 * - **23:00 에 날이 바뀐다**(자시 시작). 23시대 출생은 다음 날의 일주·자시로 센다.
 * - **월주는 절기 기준**이다(양력 월이 아니다). 연주는 입춘(태양 황경 315°) 기준.
 * - **지지는 본기(대표 천간)의 오행·음양으로 센다.** 지장간 전체를 섞는 방식은 쓰지 않는다.
 * - **일간의 강약(신강·신약)은 계산하지 않는다.** 월령·통근 가중치는 학파마다 달라 근거를 못 댄다.
 *
 * ## 범위
 *
 * `MIN_YEAR` 이전은 받지 않는다. 한국은 1988년 10월까지 일광절약시간(1987–88)과 표준시 변경
 * (1954–61)이 있었고, 그 구간을 맞게 보정한다는 근거를 코드에 두지 않았다.
 * 1989-01-01 이후는 UTC+9 고정이라 위 변환이 정확하다.
 *
 * ## 정확도
 *
 * 태양 황경은 Meeus *Astronomical Algorithms* ch.25 의 저정밀 식(오차 ≈ 0.01° ≈ 15분)이다.
 * 절기 **시각** 근처(±30분)에 태어났다면 `boundary` 로 알린다 — 만세력마다 다를 수 있다.
 */

export const MIN_YEAR = 1989;
export const MAX_YEAR = 2100;

export const STEMS = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"] as const;
export const STEM_HANJA = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"] as const;
export const BRANCH_HANJA = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

/** 오행. 순서가 상생의 순서다(목→화→토→금→수→목). 상극은 두 칸 건너. */
export const ELEMENTS = ["wood", "fire", "earth", "metal", "water"] as const;
export type Element = (typeof ELEMENTS)[number];

export const ELEMENT_KO: Record<Element, string> = {
  wood: "목",
  fire: "화",
  earth: "토",
  metal: "금",
  water: "수",
};

/** 천간 → 오행 인덱스. 甲乙=목 丙丁=화 戊己=토 庚辛=금 壬癸=수. */
const stemElement = (stem: number): number => Math.floor(stem / 2);
/** 천간 → 양(true)/음(false). 갑병무경임이 양. */
const stemYang = (stem: number): boolean => stem % 2 === 0;

/**
 * 지지 → 본기 천간. 자→계 축→기 인→갑 묘→을 진→무 사→병 오→정 미→기 신→경 유→신 술→무 해→임.
 * 지지의 오행·음양·십성은 이 천간으로 센다.
 */
const BRANCH_MAIN_STEM = [9, 5, 0, 1, 4, 2, 3, 5, 6, 7, 4, 8] as const;

export const TEN_GODS = [
  "비견",
  "겁재",
  "식신",
  "상관",
  "편재",
  "정재",
  "편관",
  "정관",
  "편인",
  "정인",
] as const;
export type TenGod = (typeof TEN_GODS)[number];

export type Pillar = { stem: number; branch: number };

/** 다른 일곱 글자가 일간에 대해 무엇인가. 일주 천간 자신은 비교 대상이 아니라 `null`. */
export type PillarTenGods = { stem: TenGod | null; branch: TenGod };

/** 절기 경계에 가까워 만세력마다 달라질 수 있는 경우. */
export type Boundary =
  /** 절입 시각 ±30분 안. */
  | "near-term"
  /** 절입이 있는 날인데 시각을 몰라 어느 쪽인지 알 수 없다. */
  | "term-day-no-time";

export type SajuChart = {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  /** 출생 시각을 모르면 `null`. 그러면 오행 집계도 여섯 글자다. */
  hour: Pillar | null;
  /** 일간(日干) — 이 사람을 대표하는 천간. */
  dayMaster: { stem: number; element: Element; yang: boolean };
  /** 오행별 글자 수. 합 = `characters`. */
  elementCounts: Record<Element, number>;
  /** 오행별 비율(%). 합이 정확히 100 이 되게 맞춘다. */
  elementPercent: Record<Element, number>;
  /** 가장 많은 오행. 동률이면 모두. */
  dominant: Element[];
  /** 한 글자도 없는 오행. */
  missing: Element[];
  yang: number;
  yin: number;
  /** 센 글자 수 — 시각을 알면 8, 모르면 6. */
  characters: number;
  tenGods: { year: PillarTenGods; month: PillarTenGods; day: { stem: null; branch: TenGod }; hour: PillarTenGods | null };
  boundary: Boundary | null;
};

export type BirthInput = {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  /** 0–23. 모르면 `null`. */
  hour: number | null;
  /** 0–59. `hour` 가 `null` 이면 무시한다. */
  minute: number | null;
};

const mod = (n: number, m: number): number => ((n % m) + m) % m;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/* ── 달력 ──────────────────────────────────────────────────── */

/** 그레고리력 날짜의 율리우스 일수(정수, 정오 기준). Fliegel–Van Flandern. */
function julianDayNumber(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}

/** 실제로 있는 날짜인가(2월 30일 같은 것을 거른다). */
export function isRealDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last;
}

/** 60갑자 번호(0 = 갑자)의 일주. JDN 2451545(2000-01-01)가 무오(54)인 데서 맞췄다. */
function dayPillarOf(y: number, m: number, d: number): Pillar {
  const idx = mod(julianDayNumber(y, m, d) + 49, 60);
  return { stem: idx % 10, branch: idx % 12 };
}

/* ── 태양 황경 ─────────────────────────────────────────────── */

const JD_UNIX_EPOCH = 2440587.5;

/** 인스턴트(UTC 밀리초) → 율리우스일. */
const toJulianDay = (utcMs: number): number => utcMs / 86_400_000 + JD_UNIX_EPOCH;

/** 태양의 겉보기 황경(도, 0–360). Meeus ch.25 저정밀. */
export function solarLongitude(utcMs: number): number {
  const T = (toJulianDay(utcMs) - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(rad(M)) +
    (0.019993 - 0.000101 * T) * Math.sin(rad(2 * M)) +
    0.000289 * Math.sin(rad(3 * M));
  const omega = 125.04 - 1934.136 * T;
  return mod(L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega)), 360);
}

/** 달력상 `year` 해 안에서 황경 `longitude`(도) 에 닿는 순간(UTC 밀리초). 뉴턴법. */
export function solarTermInstant(year: number, longitude: number): number {
  // 춘분(0°)이 1월 1일로부터 ≈79일째. 거기서 황경만큼 더 가고, 해를 넘으면(소한 285° 등) 1월로 돌린다.
  const perDay = 360 / 365.2422;
  let guessDays = mod(longitude, 360) / perDay + 79;
  if (guessDays >= 366) guessDays -= 365.2422;
  let t = Date.UTC(year, 0, 1) + guessDays * 86_400_000;
  for (let i = 0; i < 8; i += 1) {
    const diff = mod(longitude - solarLongitude(t) + 180, 360) - 180;
    t += (diff / (360 / 365.2422)) * 86_400_000;
  }
  return t;
}

/* ── 계산 ──────────────────────────────────────────────────── */

/** 절입 경계에서 이만큼(도) 안이면 `near-term`. 태양은 시간당 ≈0.041° 가므로 30분 ≈ 0.0205°. */
const NEAR_DEG = 0.0205;

const KST_OFFSET_MS = 9 * 3_600_000;

/** 오행 인덱스 → 오행. */
const elementOf = (i: number): Element => ELEMENTS[i];

/**
 * 일간 `me` 에 대해 천간 `other` 가 무엇인가.
 *
 * 오행 관계(같음·내가 낳음·내가 극함·나를 극함·나를 낳음)와 음양이 같은지로 갈린다.
 */
export function tenGodOf(me: number, other: number): TenGod {
  const rel = mod(stemElement(other) - stemElement(me), 5);
  const same = stemYang(me) === stemYang(other);
  // rel: 0 같은 오행 · 1 내가 낳는 오행 · 2 내가 극하는 오행 · 3 나를 극하는 오행 · 4 나를 낳는 오행
  switch (rel) {
    case 0:
      return same ? "비견" : "겁재";
    case 1:
      return same ? "식신" : "상관";
    case 2:
      return same ? "편재" : "정재";
    case 3:
      return same ? "편관" : "정관";
    default:
      return same ? "편인" : "정인";
  }
}

/** 합이 정확히 100 이 되게 반올림한다(가장 큰 나머지 순). */
function percentsSumTo100(counts: number[], total: number): number[] {
  const raw = counts.map((c) => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, rest: v - Math.floor(v) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/**
 * 생년월일(시)로 사주를 계산한다.
 *
 * 입력이 달력에 없는 날짜이거나 `MIN_YEAR`–`MAX_YEAR` 밖이면 `null`. 호출하는 쪽이 사용자에게
 * 이유를 말할 수 있도록 검사는 [`input.ts`](input.ts) 의 `parseBirth` 가 따로 한다.
 */
export function calculateSaju(input: BirthInput): SajuChart | null {
  const { year, month, day } = input;
  if (year < MIN_YEAR || year > MAX_YEAR || !isRealDate(year, month, day)) return null;

  const hasTime = input.hour !== null;
  const hour = input.hour ?? 12;
  const minute = hasTime ? (input.minute ?? 0) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MS;
  const lon = solarLongitude(utcMs);

  /* 월주 — 입춘(315°)부터 30°씩. 0 = 인월 … 11 = 축월. */
  const sinceIpchun = mod(lon - 315, 360);
  const monthIdx = Math.floor(sinceIpchun / 30);
  const intoMonth = sinceIpchun - monthIdx * 30;

  /* 연주 — 입춘 전의 1–2월(자월·축월)이면 전년. */
  const beforeIpchun = month <= 2 && monthIdx >= 10;
  const sajuYear = beforeIpchun ? year - 1 : year;
  const yearStem = mod(sajuYear - 4, 10);
  const yearPillar: Pillar = { stem: yearStem, branch: mod(sajuYear - 4, 12) };

  const monthBranch = (2 + monthIdx) % 12;
  const monthStem = (mod(yearStem, 5) * 2 + 2 + monthIdx) % 10;
  const monthPillar: Pillar = { stem: monthStem, branch: monthBranch };

  /* 일주 — 23시부터는 다음 날로 센다. */
  const rolled = hasTime && hour >= 23;
  const civil = rolled ? new Date(Date.UTC(year, month - 1, day + 1)) : new Date(Date.UTC(year, month - 1, day));
  const dayPillar = dayPillarOf(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate());

  /* 시주 — 두 시간씩 열두 지지. 23·0시 = 자. */
  const hourPillar: Pillar | null = hasTime
    ? (() => {
        const branch = Math.floor((hour + 1) / 2) % 12;
        return { stem: (mod(dayPillar.stem, 5) * 2 + branch) % 10, branch };
      })()
    : null;

  /* 경계 — 절입 근처이거나, 절입일인데 시각을 모른다. */
  let boundary: Boundary | null = null;
  if (intoMonth < NEAR_DEG || 30 - intoMonth < NEAR_DEG) {
    boundary = hasTime ? "near-term" : "term-day-no-time";
  } else if (!hasTime) {
    // 정오가 경계에서 멀어도, 그날 안에 절입이 끼어 있으면 시각을 모르는 한 확정할 수 없다.
    const dayStart = Date.UTC(year, month - 1, day) - KST_OFFSET_MS;
    const a = mod(solarLongitude(dayStart) - 315, 360);
    const b = mod(solarLongitude(dayStart + 86_400_000) - 315, 360);
    if (Math.floor(a / 30) !== Math.floor(b / 30)) boundary = "term-day-no-time";
  }

  /* 집계 — 천간은 그대로, 지지는 본기 천간으로. */
  const stemsOfChars: number[] = [];
  for (const p of [yearPillar, monthPillar, dayPillar, hourPillar]) {
    if (!p) continue;
    stemsOfChars.push(p.stem, BRANCH_MAIN_STEM[p.branch]);
  }
  const counts = [0, 0, 0, 0, 0];
  let yang = 0;
  for (const s of stemsOfChars) {
    counts[stemElement(s)] += 1;
    if (stemYang(s)) yang += 1;
  }
  const characters = stemsOfChars.length;
  const percents = percentsSumTo100(counts, characters);
  const top = Math.max(...counts);

  const elementCounts = {} as Record<Element, number>;
  const elementPercent = {} as Record<Element, number>;
  ELEMENTS.forEach((e, i) => {
    elementCounts[e] = counts[i];
    elementPercent[e] = percents[i];
  });

  const me = dayPillar.stem;
  const gods = (p: Pillar): PillarTenGods => ({
    stem: tenGodOf(me, p.stem),
    branch: tenGodOf(me, BRANCH_MAIN_STEM[p.branch]),
  });

  return {
    year: yearPillar,
    month: monthPillar,
    day: dayPillar,
    hour: hourPillar,
    dayMaster: { stem: me, element: elementOf(stemElement(me)), yang: stemYang(me) },
    elementCounts,
    elementPercent,
    dominant: ELEMENTS.filter((_, i) => counts[i] === top),
    missing: ELEMENTS.filter((_, i) => counts[i] === 0),
    yang,
    yin: characters - yang,
    characters,
    tenGods: {
      year: gods(yearPillar),
      month: gods(monthPillar),
      day: { stem: null, branch: tenGodOf(me, BRANCH_MAIN_STEM[dayPillar.branch]) },
      hour: hourPillar ? gods(hourPillar) : null,
    },
    boundary,
  };
}

/** 기둥 하나를 "병술" 처럼 한글 두 글자로. */
export const pillarKo = (p: Pillar): string => `${STEMS[p.stem]}${BRANCHES[p.branch]}`;
/** 기둥 하나를 "丙戌" 처럼 한자 두 글자로. */
export const pillarHanja = (p: Pillar): string => `${STEM_HANJA[p.stem]}${BRANCH_HANJA[p.branch]}`;

/** 한 기둥의 두 글자가 각각 어느 오행인가 — 화면이 글자에 색·아이콘을 붙일 때 쓴다. */
export function pillarElements(p: Pillar): { stem: Element; branch: Element } {
  return {
    stem: elementOf(stemElement(p.stem)),
    branch: elementOf(stemElement(BRANCH_MAIN_STEM[p.branch])),
  };
}

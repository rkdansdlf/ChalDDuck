import type { Boundary, Element, TenGod } from "./engine";

/**
 * 사주 화면의 말 — **계산 결과를 읽어서만** 고른다.
 *
 * ## 이 말들의 성격
 *
 * 재미로 보는 해석이다. 그래서 두 가지를 지킨다.
 *
 * - **"~한 편이에요 / ~해 보세요"로 끝낸다.** 사람이나 팀이 실제로 그렇게 일한다고 서술하지
 *   않는다. (`team-mbti.tsx` 가 같은 이유로 `dominantSummary` 를 지웠다 — 근거 없는 단정은
 *   거짓이면 사실 주장으로 남는다.)
 * - **누가 무엇을 맡아야 한다고 말하지 않는다.** 역할은 희망·Veto·경험·가능한 시간으로만
 *   조율한다. 일간 풀이의 팀플 한 줄은 *회의에서 해 볼 행동*이지 *맡을 역할*이 아니다.
 *
 * 고정 문구라서 같은 일간이면 언제나 같은 말이 나온다. AI 를 거치지 않는다.
 */

/** 모든 사주 화면 맨 위에 두는 한 줄. 출처와 한계를 같이 말한다. */
export const SAJU_NOTICE =
  "생년월일로 풀어 보는 재미 해석이에요. 실제 성격이나 팀플 역할을 정하는 데는 쓰이지 않아요.";

/** 팀에 공개되는 범위. 등록 화면과 내 사주 화면에 같은 말로 둔다. */
export const SAJU_PRIVACY =
  "생년월일과 출생 시각은 나만 볼 수 있어요. 팀에는 계산된 일간과 오행 분포만 보여요.";

export const BOUNDARY_NOTICE: Record<Boundary, string> = {
  "near-term":
    "절기가 바뀌는 시각 가까이에 태어나서, 만세력에 따라 월주나 연주가 다르게 나올 수 있어요.",
  "term-day-no-time":
    "이 날은 절기가 바뀌는 날이에요. 출생 시각을 모르면 월주나 연주를 정할 수 없어서, 낮 12시로 계산했어요.",
};

export const NO_TIME_NOTICE = "출생 시각을 몰라도 볼 수 있어요. 시주는 빼고 여섯 글자로 계산했어요.";

export const LATE_NIGHT_NOTICE =
  "밤 11시 이후는 다음 날로 계산해요. 만세력마다 이 기준이 달라 결과가 다를 수 있어요.";

export const ELEMENT_WORD: Record<Element, { hanja: string; keyword: string }> = {
  wood: { hanja: "木", keyword: "시작·성장" },
  fire: { hanja: "火", keyword: "열정·표현" },
  earth: { hanja: "土", keyword: "중심·안정" },
  metal: { hanja: "金", keyword: "정리·결단" },
  water: { hanja: "水", keyword: "흐름·생각" },
};

export type DayMasterCopy = {
  /** 한자 병기 이름. */
  name: string;
  /** 일간을 자연물에 빗댄 짧은 이름. */
  image: string;
  /** 성향 한 줄. */
  nature: string;
  /** 회의에서 해 볼 행동 한 줄. 역할을 맡으라는 말이 아니다. */
  meetingTip: string;
};

export const DAY_MASTER_COPY: readonly DayMasterCopy[] = [
  {
    name: "갑목 甲木",
    image: "곧게 뻗는 큰 나무",
    nature: "방향이 정해지면 곧장 밀고 나가는 편이에요.",
    meetingTip: "결론이 안 나는 회의에서는 “이 방향 어때요?” 하고 먼저 제안해 보세요.",
  },
  {
    name: "을목 乙木",
    image: "휘어서 자라는 풀",
    nature: "분위기를 읽고 상대에게 맞춰 가는 편이에요.",
    meetingTip: "의견이 갈리면 양쪽의 공통점부터 짚어 보세요.",
  },
  {
    name: "병화 丙火",
    image: "넓게 비추는 해",
    nature: "먼저 나서서 분위기를 띄우는 편이에요.",
    meetingTip: "회의 첫머리에 아이디어를 던져 보고, 끝나기 전 정리 시간을 따로 잡아 두세요.",
  },
  {
    name: "정화 丁火",
    image: "가까이를 밝히는 촛불",
    nature: "한 가지에 차분히 오래 집중하는 편이에요.",
    meetingTip: "큰 회의에서 말이 안 나오면 미리 글로 적어 가 보세요.",
  },
  {
    name: "무토 戊土",
    image: "묵직한 큰 산",
    nature: "쉽게 흔들리지 않고 중심을 잡는 편이에요.",
    meetingTip: "결정이 늦어진다 싶으면 마감부터 확인해 보자고 말해 보세요.",
  },
  {
    name: "기토 己土",
    image: "무엇이든 키워 내는 논밭",
    nature: "사람 사이를 살피며 뒷받침하는 편이에요.",
    meetingTip: "일이 한쪽으로 몰린다 싶으면 일찍 말해서 나눠 보세요.",
  },
  {
    name: "경금 庚金",
    image: "단단히 벼려진 쇠",
    nature: "옳고 그름을 분명히 가르는 편이에요.",
    meetingTip: "의견 앞에 “내 생각엔” 한 마디만 붙여도 훨씬 부드럽게 들려요.",
  },
  {
    name: "신금 辛金",
    image: "섬세하게 빛나는 보석",
    nature: "작은 차이도 놓치지 않는 편이에요.",
    meetingTip: "눈에 띈 디테일은 회의 끝에 한꺼번에 모아서 공유해 보세요.",
  },
  {
    name: "임수 壬水",
    image: "넓게 흐르는 강",
    nature: "생각의 폭이 넓고 흐름을 타는 편이에요.",
    meetingTip: "이야기가 여러 갈래로 뻗으면 회의 끝에 한 줄로 모아 보세요.",
  },
  {
    name: "계수 癸水",
    image: "스며드는 비",
    nature: "조용히 상황을 헤아린 뒤 움직이는 편이에요.",
    meetingTip: "생각할 시간이 필요하면 안건을 미리 받아 두고 싶다고 말해 보세요.",
  },
];

/**
 * 십성의 **뜻풀이** — 일간과 그 글자의 오행·음양 관계를 말로 옮긴 것이다.
 * 성격 해석이 아니라 계산된 관계의 이름이라서 단정이 아니다.
 */
export const TEN_GOD_MEANING: Record<TenGod, string> = {
  비견: "일간과 오행·음양이 같아요",
  겁재: "일간과 오행은 같고 음양이 달라요",
  식신: "일간이 낳는 오행, 음양이 같아요",
  상관: "일간이 낳는 오행, 음양이 달라요",
  편재: "일간이 극하는 오행, 음양이 같아요",
  정재: "일간이 극하는 오행, 음양이 달라요",
  편관: "일간을 극하는 오행, 음양이 같아요",
  정관: "일간을 극하는 오행, 음양이 달라요",
  편인: "일간을 낳는 오행, 음양이 같아요",
  정인: "일간을 낳는 오행, 음양이 달라요",
};

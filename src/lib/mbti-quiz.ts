/**
 * 04 성향 체크 — 문항 저장고와 계산.
 *
 * 문항 저장은 `src/data/catalog.ts` 가 아니라 **여기** 있다. 계산(`picksToMbti`)이
 * 문항 목록을 알아야 하는데, 화면이 받는 문항은 서버 컴포넌트가 `getQuiz()` 로 넘겨주는
 * **비동기** 값이다. 계산은 `onboarding-state` 라는 동기 스토어에서 일어나므로 같은 배열이
 * 양쪽에서 보여야 한다. `getQuiz()` 는 여기서 바로 읽는다 — 화면 입구는 그대로다.
 *
 * ⚠️ **정식 검사가 아니다.** 문항이 늘었다고 정확도가 검증된 것은 아니다. 계측 정보가
 * 없으므로 화면에서 "진단"·"정확한 결과"라고 부르지 않는다(`CLAUDE.md`).
 */

import { MBTI_AXES, isMbtiType, type MbtiAxis, type MbtiType } from "./mbti";

/** 축의 앞 글자(E·S·T·J) 쪽 / 뒤 글자(I·N·F·P) 쪽. */
export type MbtiSide = "first" | "second";

/** 04 화면 한 문항. */
export type QuizQuestion = {
  /** 저장 키. 문항 순서가 바뀌어도 답이 섞이지 않게 고정한다. */
  id: string;
  axis: MbtiAxis;
  /** 상황 문장 — "나는 사람 만나는 걸 좋아한다" 가 아니라 **무엇을 하는지** 묻는다. */
  label: string;
  /** 화면에 먼저(위) 보여줄 선택지. */
  a: string;
  /** 화면에 나중(아래) 보여줄 선택지. */
  b: string;
  /**
   * `a` 가 어느 쪽인지. **문항마다 뒤집는다.**
   *
   * "a 는 항상 E/S/T/J" 이면 순서 앞의 선택지를 고르는 사람만 약간 더 많은 결과가 되고,
   * 그게 성향 차이가 아니라 위치 차이가 되어 버린다. 축 안에서 번갈아 뒤집어 이 편향을 깬다.
   */
  aSide: MbtiSide;
  /**
   * 이 문항의 판별 가중치. **지금은 전부 1.0** — 사용자 응답 데이터가 없어 조정 근거가 없다.
   * 응답이 쌓이면 실제로 축을 안정적으로 가르는 문항의 값만 올리는 자리로 쓴다.
   */
  weight: number;
};

/**
 * 문항 저장고 — 축마다 5문항, 총 20문항.
 *
 * 규칙 두 가지.
 * - **축마다 홀수**다. 짝수면 4:4 로 동률이 나는데, 동률 축은 어느 글자로 확정해도
 *   답이 아니라 세는 순서 때문에 정해진다. 홀수로 두면 동률이 나지 않는다.
 * - **축 안에서 서로 다른 행동 특성**을 잰다. "사람이 좋다" 류를 5번 물으면 한 질문을
 *   다섯 번 한 셈이다. 그래서 회식·에너지·발화·첫 만남처럼 겹치지 않는 상황을 고른다.
 */
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // ── E / I ──────────────────────────────────────────────
  {
    id: "ei-first-room",
    axis: "EI",
    label: "처음 보는 팀원 5명과 프로젝트를 시작한다면",
    a: "먼저 말을 걸고 분위기를 만든다",
    b: "다른 사람들의 대화를 파악한 뒤에 참여한다",
    aSide: "first",
    weight: 1,
  },
  {
    id: "ei-idea-live",
    axis: "EI",
    label: "팀 회의에서 아이디어가 떠오르면",
    a: "생각을 정리한 뒤 순서대로 이야기한다",
    b: "말하면서 생각을 정리한다",
    aSide: "second",
    weight: 1,
  },
  {
    id: "ei-energy",
    axis: "EI",
    label: "팀플이 길어져 지친 저녁에는",
    a: "혼자 조용히 쉬면서 회복한다",
    b: "동료와 대화하면서 에너지를 되찾는다",
    aSide: "second",
    weight: 1,
  },
  {
    id: "ei-disagree",
    axis: "EI",
    label: "온라인 회의에서 내 생각이 다를 때",
    a: "메시지로 남기고 천천히 조율한다",
    b: "그 자리에서 반박하고 대화를 이어 간다",
    aSide: "second",
    weight: 1,
  },
  {
    id: "ei-new-team",
    axis: "EI",
    label: "처음 만난 외부 팀과 합류하는 첫 회의",
    a: "먼저 자기소개하고 분위기를 띄운다",
    b: "자리를 익히고 조용히 따라간다",
    aSide: "first",
    weight: 1,
  },

  // ── S / N ──────────────────────────────────────────────
  {
    id: "sn-topic",
    axis: "SN",
    label: "새 과제의 주제를 정할 때",
    a: "검증된 사례와 기존 자료로 방향을 잡는다",
    b: "아직 없지만 가능해 보이는 것을 상상한다",
    aSide: "first",
    weight: 1,
  },
  {
    id: "sn-share",
    axis: "SN",
    label: "조사 결과를 팀에 공유할 때",
    a: "핵심 흐름과 그림 중심으로 정리한다",
    b: "수치와 근거를 빠짐없이 담는다",
    aSide: "second",
    weight: 1,
  },
  {
    id: "sn-mistake",
    axis: "SN",
    label: "일정이 예상대로 풀리지 않을 때",
    a: "앞으로 어떻게 될지 먼저 상상한다",
    b: "지금 무엇이 틀렸는지 원인부터 본다",
    aSide: "second",
    weight: 1,
  },
  {
    id: "sn-tool",
    axis: "SN",
    label: "처음 써보는 도구를 배울 때",
    a: "개념을 이해하고 직접 실험해 본다",
    b: "설명서를 순서대로 따라한다",
    aSide: "second",
    weight: 1,
  },
  {
    id: "sn-plan",
    axis: "SN",
    label: "기획안에서 무엇이 중요하다고 판단할 때",
    a: "구체적인 비용과 일정 숫자를 본다",
    b: "큰 그림과 장기 방향을 본다",
    aSide: "first",
    weight: 1,
  },

  // ── T / F ──────────────────────────────────────────────
  {
    id: "tf-priority",
    axis: "TF",
    label: "역할의 우선순위를 정할 때",
    a: "효율과 결과로 판단한다",
    b: "서로의 상황과 감정을 먼저 살핀다",
    aSide: "first",
    weight: 1,
  },
  {
    id: "tf-missed",
    axis: "TF",
    label: "팀원이 마감에 못 맞춘 걸 봤을 때",
    a: "괜찮다고 안심시켜 준다",
    b: "무슨 일이 있었는지 이유를 묻는다",
    aSide: "second",
    weight: 1,
  },
  {
    id: "tf-rejected",
    axis: "TF",
    label: "내 아이디어가 기각됐을 때",
    a: "근거를 다시 정리해 설득한다",
    b: "팀의 결정을 받아들이고 넘어간다",
    aSide: "first",
    weight: 1,
  },
  {
    id: "tf-criterion",
    axis: "TF",
    label: "팀 평가 기준을 정할 때",
    a: "다 같이 수긍할 수 있는 기준이어야 한다",
    b: "누구에게나 같은 기준이 적용되면 된다",
    aSide: "second",
    weight: 1,
  },
  {
    id: "tf-rule",
    axis: "TF",
    label: "규칙이 불편한 상황을 만들었을 때",
    a: "상황에 맞게 유연하게 우회한다",
    b: "원칙을 지켜야 한다고 본다",
    aSide: "second",
    weight: 1,
  },

  // ── J / P ──────────────────────────────────────────────
  {
    id: "jp-backlog",
    axis: "JP",
    label: "해야 할 일이 자꾸 쌓일 때",
    a: "일정부터 잡고 순서대로 한다",
    b: "떠오르는 것부터 하고 나중에 정리한다",
    aSide: "first",
    weight: 1,
  },
  {
    id: "jp-deadline",
    axis: "JP",
    label: "마감이 이틀 남았을 때",
    a: "여유 있게 미리 끝내 둔다",
    b: "마감 직전에 몰아서 한다",
    aSide: "first",
    weight: 1,
  },
  {
    id: "jp-change",
    axis: "JP",
    label: "회의에서 일정이 갑자기 바뀌면",
    a: "바뀐 일정으로 다시 정리한다",
    b: "그대로 이어서 진행한다",
    aSide: "first",
    weight: 1,
  },
  {
    id: "jp-trip",
    axis: "JP",
    label: "오랜만의 여행을 준비할 때",
    a: "예약과 동선을 미리 정해 둔다",
    b: "대충 정하고 가서 맞춰 본다",
    aSide: "first",
    weight: 1,
  },
  {
    id: "jp-decision",
    axis: "JP",
    label: "결정을 내려야 하는 순간에는",
    a: "일단 시작해 보면서 정한다",
    b: "충분히 정보를 모은 뒤에 정한다",
    aSide: "second",
    weight: 1,
  },
];

/** 04 화면에서 고르는 답 — 문항 id 기준. */
export type QuizPick = "a" | "b" | null;
export type QuizPicks = Record<string, QuizPick>;

export const EMPTY_PICKS: QuizPicks = {};

/** 축의 두 글자. `MBTI_AXES` 와 짝을 이루는 표 — 문자열 인덱스로 꺼내면 타입이 뭉개진다. */
const AXIS_LETTERS: Record<MbtiAxis, readonly [string, string]> = {
  EI: ["E", "I"],
  SN: ["S", "N"],
  TF: ["T", "F"],
  JP: ["J", "P"],
};

/** `side` 가 이 축의 어느 글자인지. */
export function sideLetter(axis: MbtiAxis, side: MbtiSide): string {
  return AXIS_LETTERS[axis][side === "first" ? 0 : 1];
}

/** 이 문항에서 고른 쪽이 축의 어느 글자인지. */
export function pickSide(question: QuizQuestion, pick: QuizPick): MbtiSide | null {
  if (pick === null) return null;
  return pick === "a" ? question.aSide : question.aSide === "first" ? "second" : "first";
}

export type AxisScore = {
  axis: MbtiAxis;
  /** 앞 글자(E·S·T·J) 쪽 가중 합. */
  first: number;
  /** 뒤 글자(I·N·F·P) 쪽 가중 합. */
  second: number;
  /** 이 축을 몇 문항으로 잰 값인지. */
  answered: number;
  total: number;
};

/** 축별 가중 득점. 아직 답하지 않은 문항은 양쪽 다 0 이라 채점되지 않는다. */
export function scoreAxes(picks: QuizPicks): AxisScore[] {
  const score = new Map<MbtiAxis, AxisScore>(
    MBTI_AXES.map((axis) => [axis, { axis, first: 0, second: 0, answered: 0, total: 0 }]),
  );
  for (const question of QUIZ_QUESTIONS) {
    const row = score.get(question.axis);
    if (!row) continue;
    row.total += 1;
    if (picks[question.id] === null || picks[question.id] === undefined) continue;
    row.answered += 1;
    if (pickSide(question, picks[question.id]) === "first") row.first += question.weight;
    else row.second += question.weight;
  }
  return MBTI_AXES.map((axis) => score.get(axis)!);
}

/**
 * 답을 16유형으로 환산한다. **한 문항이라도 비어 있으면 `null`.**
 *
 * 문항을 늘렸다고 계측이 정확해진 건 아니다 — 가중치는 전부 1.0 이고 검증 데이터가 없다.
 * 다만 축마다 서로 다른 상황을 재고 합산하므로, 4문항이 한 번에 네 축을 감쨌던 것보다
 * 한 축 안에 반복되는 문제가 줄었다. 그래도 화면에서 "진단"이라고 부르지는 않는다.
 */
export function picksToMbti(picks: QuizPicks): MbtiType | null {
  const rows = scoreAxes(picks);
  if (rows.some((row) => row.answered < row.total || row.total === 0)) return null;
  const type = rows
    .map((row) => sideLetter(row.axis, row.first > row.second ? "first" : "second"))
    .join("");
  return isMbtiType(type) ? type : null;
}

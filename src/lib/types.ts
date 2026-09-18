import type { MbtiType } from "./mbti";

/**
 * 도메인 타입.
 *
 * 프로토타입의 `data.js` 는 화면을 그리기 위한 하드코딩 값이었다. 여기서는 그 모양을
 * **실제 API 응답으로 삼을 수 있는 형태**로 다시 정의한다. 서버가 붙을 때 이 타입이
 * 계약(contract)이 되고, `src/data/` 의 목 구현만 교체하면 된다.
 */

/** 역할 식별자 — 드라이브 제출함·기여도 기록이 모두 이 키로 묶인다. */
export type RoleKey = "research" | "deck" | "script" | "present" | "manage";

export type Role = {
  key: RoleKey;
  name: string;
  note: string;
};

export type Team = {
  id: string;
  name: string;
  course: string;
  /** 초대 코드 — 로그인 없이 이 코드 + 이름으로 기록을 잇는다. */
  code: string;
  memberCount: number;
  /** "중간발표 D-12" 같은 표시 문자열. 서버가 날짜를 주면 화면에서 계산하도록 바꿀 것. */
  dday: string | null;
};

export type Member = {
  id: string;
  name: string;
  /** 지금 보고 있는 사용자 본인인지. */
  isMe: boolean;
  mbti: MbtiType | null;
  /** 1순위 희망 역할. */
  want: RoleKey | null;
  /** 이번엔 피하고 싶은 역할. */
  veto: RoleKey | null;
};

/** 시간표를 막는 사유. 기획안에 적힌 세 종류뿐이다. */
export type BusyKindKey = "class" | "work" | "exam";

export type BusyKind = {
  key: BusyKindKey;
  name: string;
  /** CSS 변수 참조(`var(--busy-class)`). 화면 코드에 hex 를 적지 않기 위한 것. */
  color: string;
};

/**
 * 안 되는 시간 한 칸.
 *
 * 기획안의 시간표는 "안 되는 시간만 표시"한다 — 표시하지 않은 시간은 가능한 시간이다.
 * 사유(`kind`)는 본인에게만 보이고, 팀원에게는 가능/불가만 공유된다.
 */
export type BusyBlock = {
  id: string;
  /** `SCHEDULE_DAYS` 의 인덱스(0 = 월). */
  day: number;
  /** `SCHEDULE_HOURS` 의 인덱스. */
  startHour: number;
  /** 몇 시간짜리인지. */
  hours: number;
  kind: BusyKindKey;
};

/** 회의 시간 후보. 적합도 점수는 만들지 않는다 — 몇 명이 되는지와 사유만 보여 준다. */
export type MeetingSlot = {
  id: string;
  /** 요일 한 글자("수"). */
  day: string;
  /** "16:00 – 18:00" */
  time: string;
  /** 참석 가능 인원. */
  available: number;
  /** 팀 전체 인원. */
  total: number;
  /** 못 오는 사람과 사유("박지호 · 아르바이트"). 전원 가능하면 `null`. */
  blockedBy: string | null;
};

/** 한 주의 회의 시간 후보와 그 주의 상황. */
export type MeetingWeek = {
  slots: MeetingSlot[];
  /** 전원이 가능한 후보가 하나라도 있는지. false 면 10번 화면 흐름으로 간다. */
  hasFullAvailability: boolean;
  /** 시간표를 낸 인원. */
  submitted: number;
  total: number;
};

/**
 * 추첨 도구 — 협의가 안 될 때 역할을 뽑는 방법.
 * 결과가 달라 보일 뿐 다 같은 무작위 추첨이다. 고르는 재미를 위한 표시.
 */
export type RandomTool = {
  key: string;
  name: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
};

/** 30초 컷 한 문항. `a` 를 고르면 축의 앞 글자, `b` 면 뒷 글자가 된다. */
export type QuizQuestion = {
  axis: string;
  label: string;
  a: string;
  b: string;
};

/** 온보딩에서 사용자가 입력한 값 — 마지막 단계에서 한 번에 서버로 보낸다. */
export type OnboardingDraft = {
  name: string;
  mbti: MbtiType | null;
  /** MBTI 를 직접 고르지 않고 30초 컷으로 얻었는지. 결과 화면 문구가 달라진다. */
  mbtiFromQuiz: boolean;
  want: RoleKey | null;
  veto: RoleKey | null;
};

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

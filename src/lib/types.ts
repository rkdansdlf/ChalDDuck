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

/* ── 11 홈 ─────────────────────────────────────────────────── */

/** AI 도구 목록. 14번 허브와 홈의 바로가기가 같은 목록을 쓴다. */
export type AiTool = {
  key: string;
  name: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
  note: string;
  /** 아직 열지 않은 도구는 false. */
  ready: boolean;
};

/** 홈의 "최근 자료·업무" 한 줄. */
export type RecentItem = {
  id: string;
  title: string;
  note: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
  /** 눌렀을 때 갈 곳. 아직 없는 화면이면 null 이고 화면이 안내만 한다. */
  href: string | null;
};

/* ── 12 / 13 / 22 드라이브 ──────────────────────────────────── */

/** 팀 드라이브 이용 제한. 아직 확정되지 않은 정책(2GB 가 충분한지 팀 확인 필요). */
export type DriveLimits = {
  capGB: number;
  usedGB: number;
  /** 허용 파일 형식 표시용("문서"·"이미지"·"PPT"·"PDF"). */
  types: string[];
};

/**
 * 역할별 제출함.
 *
 * 마감이 지나도 제출함을 **잠그지 않는다** — 늦게라도 내는 편이 안 내는 것보다 낫고,
 * 대신 마감을 지난 파일에 "마감 후 제출" 라벨이 자동으로 붙는다.
 */
export type SubmissionBox = {
  id: string;
  role: RoleKey;
  name: string;
  /** 이 칸을 맡은 사람. */
  owner: string;
  /** 제출함을 열었을 때 보여 줄 대표 파일 이름. */
  fileName: string;
  fileCount: number;
  /** "9/15" 같은 표시 문자열. 서버가 날짜를 주면 화면에서 계산하도록 바꿀 것. */
  due: string;
  /** 마감을 지나 올라온 파일이 있는지. */
  hasLate: boolean;
};

/** 실제로 열리는 형식과 안내만 하는 형식을 구분하기 위한 종류. */
export type FileKind = "pptx" | "docx" | "pdf" | "image";

/**
 * 파일 버전 하나.
 *
 * 같은 이름으로 다시 올리면 **덮어쓰지 않고 새 버전이 쌓인다** — 이전 버전을 언제든
 * 되찾을 수 있어야 작업이 사라지지 않는다. 복원도 지우는 게 아니라 새 버전을 더한다.
 *
 * 최신 버전은 별도 플래그 대신 **목록의 첫 항목**으로 정한다.
 * 플래그를 들고 다니면 복원 뒤에 두 개가 최신이 되는 일이 생긴다.
 */
export type FileVersion = {
  id: string;
  /** "v4" 처럼 화면에 그대로 보이는 이름. */
  label: string;
  author: string;
  when: string;
  note: string;
  size: string;
  kind: FileKind;
  /** 실제로 열리는 형식만 미리보기 주소를 갖는다. 그 외는 다운로드 안내만. */
  previewUrl: string | null;
};

/* ── 19 / 30 / 31 / 32 채팅 ─────────────────────────────────── */

/** 스레드 식별자. 팀 단톡방은 하나뿐이라 고정값을 쓴다. */
export const TEAM_THREAD_ID = "team";

/** 메시지에 붙은 반응. 지금은 표시만 하고 누를 수는 없다. */
export type MessageReaction = {
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
  count: number;
};

/**
 * 채팅 메시지 하나. 단톡방(19)과 DM(31)이 같은 말풍선 규격을 쓴다.
 */
export type ChatMessage = {
  id: string;
  author: string;
  mbti: MbtiType | null;
  /** 내가 보낸 말인지 — 말풍선이 오른쪽에 붙고 색이 달라진다. */
  isMine: boolean;
  text: string;
  /** 보낸 시각 표시. 아직 못 보낸 메시지는 null. */
  time: string | null;
  status: "sent" | "failed";
  /**
   * 쿠션 번역기로 다듬어 보낸 말.
   * **표시가 남는다** — 다듬었다는 사실을 숨기지 않는다.
   */
  viaCushion?: boolean;
  reactions?: MessageReaction[];
};

/** 1:1 대화 목록의 한 줄. 팀원 한 명당 하나씩 열린다. */
export type DmThread = {
  /** 상대 팀원의 id. 그대로 스레드 id 로 쓴다. */
  id: string;
  name: string;
  mbti: MbtiType | null;
  lastMessage: string;
  time: string;
  unread: number;
};

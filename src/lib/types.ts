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

/**
 * 지금 올라와 있는 회의 제안.
 *
 * 확정 규칙: **특정 한 사람이 단독으로 확정하지 않는다.** 응답 마감까지 반대가 없어야
 * 확정되고, 누구든 반대하면 확정되지 않는다.
 *
 * `idle` 은 제안이 아직 없는 상태다.
 */
export type MeetingProposal = {
  stage: "idle" | "proposed" | "confirmed" | "carried";
  slot: MeetingSlot | null;
  agreed: number;
  /** 아직 응답하지 않은 사람 수. */
  pending: number;
  against: number;
  /** "9/20 15:00" 같은 표시 문자열. 제안이 없으면 null. */
  respondBy: string | null;
  /** 내가 이미 응답했는지 — 같은 사람이 두 번 누르지 않게 한다. */
  myResponse: "agree" | "against" | null;
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

/* ── 알림 ───────────────────────────────────────────────────── */

/** 앱 안 알림 한 줄. 푸시는 아직 없다. */
export type AppNotification = {
  id: string;
  kind: "poke" | "meeting" | "contrib-dispute" | "contrib-confirm" | "join-request" | "rejoin-request";
  title: string;
  body: string;
  href: string | null;
  when: string;
  read: boolean;
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
  /** 도구 화면 경로. 아직 없으면 null. */
  href: string | null;
};

/**
 * AI 이용·보관 정책.
 *
 * 숫자 셋 다 기획안에 없어 임시로 정한 값이다(핸드오프 "확정되지 않은 정책" 표).
 * 화면이 `<Undecided>` 로 그 사실을 적고 있다.
 */
export type AiPolicy = {
  /** 사용 기록(횟수)을 남겨 두는 기간. 입력한 글과 결과는 애초에 저장하지 않는다. */
  retentionDays: number;
  /** 한 팀이 하루에 부를 수 있는 횟수. */
  perTeamPerDay: number;
  /** 한 사람이 하루에 부를 수 있는 횟수. 한 사람이 팀 몫을 다 쓰지 못하게 한다. */
  perMemberPerDay: number;
};

/**
 * AI 도구의 결과.
 *
 * 실패를 **던지지 않고 돌려준다.** 운영 빌드의 Next 는 서버에서 던진 오류의 문구를 지우고
 * `digest` 만 클라이언트로 보낸다 — 즉 `throw new Error("오늘 한도를 다 썼습니다")` 는
 * 사용자에게 절대 닿지 않는다. 돌려주는 값은 그냥 데이터라서 그대로 도착한다.
 */
export type AiResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** 쿠션 번역기의 말투. 요구 내용은 그대로 두고 말투만 바꾼다. */
export type CushionTone = { key: string; name: string };

/** 27 상황별 문장 변환의 모드. 쿠션 번역기(말투)와는 다른 기능이다. */
export type SentenceMode = {
  key: string;
  name: string;
  desc: string;
};

/** AI 서기가 회의 메모에서 뽑은 할 일 후보. **초안일 뿐 그대로 반영되지 않는다.** */
export type ClerkCandidate = {
  id: string;
  title: string;
  /** AI 가 추측한 담당자. 회의에서 정해지지 않았으면 null 이고 사람이 정해야 한다. */
  assignee: string | null;
  /** 왜 이 사람을 넣었는지 — 근거 없이 배정하지 않는다. */
  basis: string;
  due: string;
};

export type ClerkDraft = {
  summary: string;
  candidates: ClerkCandidate[];
};

/** 리서처 결과. **출처가 없는 결과는 보여주지 않는다.** 적합도 점수는 만들지 않는다. */
export type ResearchResult = {
  id: string;
  title: string;
  source: string;
  snippet: string;
  /**
   * 열어 볼 수 있는 주소. 열 수 없는 출처는 확인할 수 없는 출처다.
   *
   * 샘플 결과에는 없어서 `null` 이 될 수 있다 — 화면은 그때 링크를 만들지 않는다.
   */
  url: string | null;
};

/** 발표 지원 결과 — 표현만 다듬고 내용을 새로 지어내지 않는다. */
export type PresentDraft = {
  refined: string;
  questions: string[];
};

/**
 * "최근 자료·업무"의 할 일 줄 식별자.
 *
 * 이 줄의 설명("3건 남음")만 홈이 실제 목록에서 세어 채운다. 양쪽이 문자열을 따로 적으면
 * 한쪽만 바뀌었을 때 건수가 조용히 사라진다 — 실제로 그렇게 사라져 있었다.
 */
export const TASKS_RECENT_ID = "tasks";

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
  /** 이 칸을 맡은 사람. 역할이 정해지기 전에는 null. */
  owner: string | null;
  /** 안에 들어 있는 파일 수. */
  fileCount: number;
  /** "9/15" 같은 표시 문자열. 서버가 날짜를 주면 화면에서 계산하도록 바꿀 것. */
  due: string;
  /** 마감을 지나 올라온 파일이 있는지. */
  hasLate: boolean;
};

/** 실제로 열리는 형식과 안내만 하는 형식을 구분하기 위한 종류. */
export type FileKind = "pptx" | "docx" | "pdf" | "image";

/**
 * 제출함 안의 파일 하나.
 *
 * 제출함과 버전 사이에 이 단계가 있다 — 한 제출함에 파일이 여러 개일 수 있고
 * (발표자료.pptx 와 대본.docx), 버전은 **그 파일 하나**의 역사이기 때문이다.
 */
export type SubmittedFile = {
  id: string;
  name: string;
  kind: FileKind;
  versionCount: number;
  /** 최신 버전 정보. 아직 아무것도 올라오지 않았으면 전부 null. */
  latestLabel: string | null;
  latestBy: string | null;
  latestWhen: string | null;
  size: string | null;
  /** 마감을 지나 올라온 버전이 있는지. */
  hasLate: boolean;
};

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
  /** `sending` 은 서버 응답을 기다리는 중인 낙관적 말풍선. */
  status: "sent" | "sending" | "failed";
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

/* ── 16 / 17 / 18 / 23 기여도 ───────────────────────────────── */

/**
 * 기여 기록의 종류.
 *
 * ⚠️ 이 목록이 곧 "무엇을 기여로 보는가"의 정의다.
 * **MBTI·채팅량·친목은 들어 있지 않고, 들어가서도 안 된다.**
 */
export type ContribKindKey = "task" | "file" | "meet" | "help" | "due";

export type ContribKind = {
  key: ContribKindKey;
  name: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
};

/**
 * 내 기여 기록 한 줄.
 *
 * `auto` 는 앱이 드라이브 버전 기록·회의 참석 등에서 모은 것이고,
 * `self` 는 앱 밖에서 한 일을 본인이 직접 넣은 것이다.
 * 직접 넣은 기록은 **팀원 확인을 거치기 전까지 `pending` 으로 남는다** —
 * 본인 말만으로 확정되면 기록의 의미가 없어진다.
 */
export type ContribRecord = {
  id: string;
  kind: ContribKindKey;
  title: string;
  detail: string;
  when: string;
  source: "auto" | "self";
  state: "ok" | "pending";
};

/**
 * 팀원이 확인해야 하는 기록.
 *
 * `disputed` 는 누군가 사실과 다르다고 적은 항목이다.
 * **한쪽 말로 덮지 않고 둘 다 남긴다.**
 */
export type TeamCheckRecord = {
  id: string;
  who: string;
  title: string;
  state: "ok" | "pending" | "disputed";
  /** 내 기록인지. 자기 기록은 확인하거나 정정을 적을 수 없다. */
  isMine: boolean;
  /** 지금까지 확인해 준 팀원 수. */
  confirms: number;
  /** 내가 이미 확인했는지. */
  iConfirmed: boolean;
  /** 확인 상태를 사람 말로 적은 것("3명 확인", "이서연 확인 대기"). */
  by: string;
  /** 의견 차이가 적힌 경우 그 내용. 정리된 뒤에도 지우지 않는다. */
  dispute: string | null;
  /**
   * 정정에 어떻게 답했는지. 이 값이 있으면 의견 차이는 정리된 것이다.
   *
   * `dispute` 와 **함께** 남는다 — 적힌 의견을 지우고 결론만 남기면
   * 한쪽 말로 덮는 것이 되어 정정을 요구한 사람이 기록을 믿을 수 없게 된다.
   */
  resolution: string | null;
};

/**
 * 리포트 한 줄.
 *
 * 세 수치 모두 **같은 표를 서버가 센다** — 16·17 화면과 어긋날 수 없다.
 * 점수도 순위도 없고, 미확인·의견 차이를 감추지도 않는다.
 */
export type ContribReportRow = {
  memberId: string;
  who: string;
  /** 합의한 역할 이름. */
  role: string;
  confirmed: number;
  pending: number;
  disputed: number;
};

/* ── 21 / 24 할 일 · 콕 찌르기 ──────────────────────────────── */

/** 할 일의 종류. 팀 업무와 개인 학습을 한 목록에서 구분하기 위한 것. */
export type TaskKindKey = "team" | "study" | "check";

export type TaskKind = {
  key: TaskKindKey;
  name: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
};

/** 할 일 하나. 상태는 `STATUS` 어휘를 공유한다(할 일 → 진행 중 → 완료). */
export type Task = {
  id: string;
  title: string;
  kind: TaskKindKey;
  /** 담당자. 아직 정해지지 않았으면 null — 비워 두는 것이 임의 배정보다 낫다. */
  assignee: string | null;
  mbti: MbtiType | null;
  due: string;
  status: "todo" | "doing" | "done";
  /** AI 서기가 만든 항목인지 사람이 직접 넣은 것인지. 화면에 배지로 남는다. */
  source: "clerk" | "manual";
};

/* ── 28 / 29 팀 친목 ────────────────────────────────────────── */

export type IceGame = {
  key: string;
  name: string;
  /** `IconName` 과 같은 kebab-case 어휘. */
  icon: string;
  desc: string;
  /** 실행까지 연결된 게임인지. false 면 설명만 볼 수 있다. */
  playable: boolean;
  /**
   * 같이 하려고 팀원에게 보낼 게임 주소. 기획안에 없어 아직 `null` 이다.
   * `null` 이면 공유 링크를 만들지 않는다 — 가짜 주소를 복사해 주면 받은 사람이 열 수 없다.
   */
  url: string | null;
};

/* ── 07 역할 조율 ───────────────────────────────────────────── */

/**
 * 한 역할의 추첨 결과. `accepted` 가 true 여야 최종 확정이다.
 *
 * 조율 순서: 선호 확인 → 협의 → (필요하면) 추첨 → 당사자 수락 → 최종 확정.
 * 거절은 오류가 아니라 남은 후보끼리 다시 추첨하는 정상 절차다.
 */
export type RoleDrawResult = {
  /** 어떤 도구로 뽑았는지 — "룰렛" 처럼 화면에 그대로 보인다. */
  tool: string;
  winner: string;
  accepted: boolean;
};

/** 팀의 역할 조율 현황. */
export type RoleNegotiation = {
  draws: Partial<Record<RoleKey, RoleDrawResult>>;
  /** 역할별로 거절해서 다음 추첨에서 빠지는 사람들. */
  rejected: Partial<Record<RoleKey, string[]>>;
};

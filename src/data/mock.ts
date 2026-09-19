import type {
  AiTool,
  BusyBlock,
  ChatMessage,
  DmThread,
  BusyKind,
  DriveLimits,
  FileVersion,
  Member,
  MeetingSlot,
  QuizQuestion,
  RandomTool,
  RecentItem,
  Role,
  SubmissionBox,
  Team,
} from "@/lib/types";

/**
 * 데모 데이터.
 *
 * 핸드오프 `data.js` 를 그대로 옮긴 것으로, **전부 가짜 값**이다(이름·날짜·과목).
 * 서버가 붙으면 `src/data/api.ts` 의 구현만 바꾸고 이 파일은 지운다.
 *
 * 원칙: 기획안에 없는 값은 지어내지 않고 `null` 로 둔다.
 */

export const MOCK_TEAM: Team = {
  id: "team_demo",
  name: "디지털콘텐츠기획 3조",
  course: "디지털콘텐츠기획",
  code: "CD3-7F2Q",
  memberCount: 4,
  dday: "중간발표 D-12",
};

/** 역할 후보 — 기획안의 "역할별 제출함"(자료조사·PPT 템플릿·발표 대본)에서 가져왔다. */
export const ROLES: Role[] = [
  { key: "research", name: "자료조사", note: "논문·기사·통계 수집과 정리" },
  { key: "deck", name: "PPT 제작", note: "템플릿 구성과 슬라이드 작업" },
  { key: "script", name: "발표 대본", note: "대본 작성과 발표 연습" },
  { key: "present", name: "발표", note: "청중 앞 발표와 질의 응답" },
  { key: "manage", name: "일정 관리", note: "마감 관리와 회의 소집" },
];

/**
 * 팀원 목록. 희망/Veto 는 각자 본인이 직접 고른 값이다.
 * 캐릭터 고유 이름은 기획안에 없어 만들지 않는다 — MBTI 유형명을 그대로 쓴다.
 */
export const MOCK_ROSTER: Member[] = [
  { id: "m1", name: "김민준", isMe: true, mbti: "INFJ", want: "research", veto: "present" },
  { id: "m2", name: "이서연", isMe: false, mbti: "ENFP", want: "deck", veto: "manage" },
  { id: "m3", name: "박지호", isMe: false, mbti: "ISTJ", want: "manage", veto: "present" },
  { id: "m4", name: "최유나", isMe: false, mbti: null, want: "research", veto: null },
];

/* ── 08 내 가능한 시간 ─────────────────────────────────────── */

/** 시간표를 막는 사유 — 기획안에 적힌 세 종류. */
export const BUSY_KINDS: BusyKind[] = [
  { key: "class", name: "수업", color: "var(--busy-class)" },
  { key: "work", name: "아르바이트", color: "var(--busy-work)" },
  { key: "exam", name: "시험 기간", color: "var(--busy-exam)" },
];

/** 주중만 다룬다. 주말 회의는 기획안에 없다. */
export const SCHEDULE_DAYS = ["월", "화", "수", "목", "금"];

/** 9시~18시. 09시 시작, 마지막 칸은 18~19시. */
export const SCHEDULE_HOURS = ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];

/** 내 시간표 초기값(데모). 서버가 붙으면 내가 저장해 둔 값을 읽어 온다. */
export const MY_BUSY_BLOCKS: BusyBlock[] = [
  { id: "b1", day: 0, startHour: 1, hours: 3, kind: "class" },
  { id: "b2", day: 0, startHour: 6, hours: 2, kind: "work" },
  { id: "b3", day: 1, startHour: 0, hours: 2, kind: "class" },
  { id: "b4", day: 2, startHour: 3, hours: 2, kind: "class" },
  { id: "b5", day: 2, startHour: 7, hours: 3, kind: "work" },
  { id: "b6", day: 3, startHour: 1, hours: 2, kind: "class" },
  { id: "b7", day: 4, startHour: 2, hours: 2, kind: "class" },
  { id: "b8", day: 4, startHour: 6, hours: 2, kind: "work" },
];

/* ── 09 / 10 회의 시간 ─────────────────────────────────────── */

/** 전원 가능한 후보가 있는 보통의 주. */
export const MEETING_SLOTS: MeetingSlot[] = [
  { id: "s1", day: "수", time: "16:00 – 18:00", available: 4, total: 4, blockedBy: null },
  { id: "s2", day: "화", time: "13:00 – 15:00", available: 4, total: 4, blockedBy: null },
  { id: "s3", day: "목", time: "15:00 – 17:00", available: 3, total: 4, blockedBy: "박지호 · 아르바이트" },
  { id: "s4", day: "월", time: "14:00 – 16:00", available: 3, total: 4, blockedBy: "이서연 · 수업" },
];

/** 전원 가능한 시간이 없는 주 — 최다 인원 후보만 남는다. */
export const MEETING_SLOTS_PARTIAL: MeetingSlot[] = [
  { id: "p1", day: "금", time: "17:00 – 19:00", available: 3, total: 4, blockedBy: "최유나 · 시험 기간" },
  { id: "p2", day: "토", time: "11:00 – 13:00", available: 3, total: 4, blockedBy: "박지호 · 아르바이트" },
];

/** 추첨 도구 4종. 29번 "메뉴 룰렛" 화면도 같은 목록을 재사용한다. */
export const RANDOM_TOOLS: RandomTool[] = [
  { key: "roulette", name: "룰렛", icon: "disc-3" },
  { key: "dice", name: "주사위", icon: "dices" },
  { key: "draw", name: "제비뽑기", icon: "ticket" },
  { key: "ladder", name: "사다리타기", icon: "git-fork" },
];

/**
 * 30초 컷 4문항 — 기획안에 적힌 문항 그대로.
 * 정확도·검증 결과는 기획안에 없으므로 화면에서 "진단"이라고 부르지 않는다.
 */
export const QUIZ: QuizQuestion[] = [
  {
    axis: "E / I",
    label: "첫 만남과 소통",
    a: "먼저 말을 걸고 대면·음성으로 친해지기",
    b: "분위기를 살피며 필요한 내용을 텍스트로 소통하기",
  },
  {
    axis: "S / N",
    label: "과제 주제와 기획",
    a: "검증된 사례·통계·기존 자료 활용하기",
    b: "새롭고 독창적인 아이디어 시도하기",
  },
  {
    axis: "T / F",
    label: "피드백과 의견 조율",
    a: "완성도와 논리 중심으로 직접 지적하기",
    b: "팀 분위기를 고려해 부드럽게 전달하기",
  },
  {
    axis: "J / P",
    label: "일정과 마감",
    a: "먼저 일정을 정하고 미리 완성하기",
    b: "유연하게 진행하며 마감에 집중하기",
  },
];

/* ── 11 홈 / 14 AI 도구 ─────────────────────────────────────── */

export const AI_TOOLS: AiTool[] = [
  {
    key: "cushion",
    name: "쿠션 번역기",
    icon: "message-square-heart",
    note: "하고 싶은 말의 말투만 부드럽게 바꿔 줍니다",
    ready: true,
  },
  {
    key: "clerk",
    name: "AI 서기",
    icon: "notebook-pen",
    note: "회의 내용을 할 일 카드로 정리합니다",
    ready: true,
  },
  { key: "research", name: "AI 리서처", icon: "search", note: "자료 출처와 함께 찾아 줍니다", ready: true },
  {
    key: "present",
    name: "발표 지원",
    icon: "presentation",
    note: "대본 다듬기와 예상 질문 정리",
    ready: true,
  },
  {
    key: "sentence",
    name: "상황별 문장 변환",
    icon: "file-output",
    note: "핵심 요약·교수님 질문 메일 모드",
    ready: true,
  },
];

/** 홈의 "최근 자료·업무". 13·21번 화면이 없어 아직 갈 곳이 없는 항목은 href 가 null 이다. */
export const RECENT_ITEMS: RecentItem[] = [
  { id: "r1", title: "발표자료 v4", note: "어제 수정 · 이서연", icon: "file-check-2", href: "/drive" },
  { id: "r2", title: "할 일 · 체크리스트", note: "3건 남음", icon: "list-checks", href: null },
];

/* ── 12 / 13 / 22 드라이브 ──────────────────────────────────── */

export const DRIVE_LIMITS: DriveLimits = {
  capGB: 2,
  usedGB: 1.3,
  types: ["문서", "이미지", "PPT", "PDF"],
};

export const SUBMISSION_BOXES: SubmissionBox[] = [
  {
    id: "box-research",
    role: "research",
    name: "자료조사 제출함",
    owner: "김민준",
    fileName: "자료조사 정리.docx",
    fileCount: 3,
    due: "9/15",
    hasLate: true,
  },
  {
    id: "box-deck",
    role: "deck",
    name: "PPT 템플릿 제출함",
    owner: "이서연",
    fileName: "발표 자료.pptx",
    fileCount: 2,
    due: "9/20",
    hasLate: false,
  },
  {
    id: "box-script",
    role: "script",
    name: "발표 대본 제출함",
    owner: "최유나",
    fileName: "발표 대본.docx",
    fileCount: 0,
    due: "9/22",
    hasLate: false,
  },
];

/**
 * 버전 기록 — 누가 언제 무엇을 바꿨는지. **맨 앞이 최신**이다.
 *
 * `img1` 은 같은 작업에서 내보낸 이미지라 형식이 다르다. 22번 화면에서
 * "실제로 열리는 형식"과 "안내만 하는 형식"이 어떻게 다른지 보여 주는 예시이기도 하다.
 */
const DECK_VERSIONS: FileVersion[] = [
  {
    id: "v4",
    label: "v4",
    author: "이서연",
    when: "어제 21:14",
    note: "표지·간지 레이아웃 교체",
    size: "8.4MB",
    kind: "pptx",
    previewUrl: null,
  },
  {
    id: "v3",
    label: "v3",
    author: "김민준",
    when: "9/13 16:02",
    note: "설문 결과 그래프 3개 추가",
    size: "7.9MB",
    kind: "pptx",
    previewUrl: null,
  },
  {
    id: "img1",
    label: "img1",
    author: "김민준",
    when: "9/13 15:40",
    note: "설문 결과 그래프 (이미지 내보내기)",
    size: "1.1MB",
    kind: "image",
    previewUrl: "/assets/logo-app-icon.png",
  },
  {
    id: "v2",
    label: "v2",
    author: "이서연",
    when: "9/12 23:40",
    note: "본문 폰트 통일",
    size: "7.1MB",
    kind: "pptx",
    previewUrl: null,
  },
  {
    id: "v1",
    label: "v1",
    author: "이서연",
    when: "9/11 14:20",
    note: "템플릿 최초 업로드",
    size: "6.8MB",
    kind: "pptx",
    previewUrl: null,
  },
];

const RESEARCH_VERSIONS: FileVersion[] = [
  {
    id: "r2",
    label: "v2",
    author: "김민준",
    when: "9/16 09:12",
    note: "통계청 자료 표 추가",
    size: "1.4MB",
    kind: "docx",
    previewUrl: null,
  },
  {
    id: "r1",
    label: "v1",
    author: "김민준",
    when: "9/14 22:05",
    note: "논문 5편 요약 정리",
    size: "1.1MB",
    kind: "docx",
    previewUrl: null,
  },
];

/** 제출함별 버전 기록. 아직 아무것도 올라오지 않은 칸은 빈 배열이다. */
export const BOX_VERSIONS: Record<string, FileVersion[]> = {
  "box-deck": DECK_VERSIONS,
  "box-research": RESEARCH_VERSIONS,
  "box-script": [],
};

/* ── 19 / 30 / 31 / 32 채팅 ─────────────────────────────────── */

/** 팀 전체가 보는 단톡방. 기획안에 채널을 여러 개 두는 규칙이 없어 하나만 둔다. */
export const TEAM_MESSAGES: ChatMessage[] = [
  {
    id: "t1",
    author: "이서연",
    mbti: "ENFP",
    isMine: false,
    text: "내일 회의 몇 시로 할까요? 저는 오후 다 됩니다",
    time: "14:02",
    status: "sent",
  },
  {
    id: "t2",
    author: "박지호",
    mbti: "ISTJ",
    isMine: false,
    text: "저는 3시 이후로 부탁드려요, 알바 있어서",
    time: "14:03",
    status: "sent",
    reactions: [{ icon: "thumbs-up", count: 2 }],
  },
  {
    id: "t3",
    author: "최유나",
    mbti: null,
    isMine: false,
    text: "네 저도 3시 이후 괜찮아요",
    time: "14:04",
    status: "sent",
  },
  {
    id: "t4",
    author: "김민준",
    mbti: "INFJ",
    isMine: true,
    text: "혹시 자료 올리는 데 어려운 점이 있을까요? 내일이 마감이라 지금 상황만 알려주시면 제가 맞춰서 준비해 볼게요.",
    time: "14:05",
    status: "sent",
    viaCushion: true,
    reactions: [{ icon: "check", count: 1 }],
  },
];

/** 1:1 대화 목록 — 김민준(나) 기준. id 는 팀원 id 와 같다. */
export const DM_THREADS: DmThread[] = [
  {
    id: "m2",
    name: "이서연",
    mbti: "ENFP",
    lastMessage: "표지 시안 오늘 밤까지 올릴게요!",
    time: "13:20",
    unread: 1,
  },
  { id: "m3", name: "박지호", mbti: "ISTJ", lastMessage: "네, 확인했습니다", time: "어제", unread: 0 },
  {
    id: "m4",
    name: "최유나",
    mbti: null,
    lastMessage: "대본 초안 부분은 저도 같이 썼는데요",
    time: "9/14",
    unread: 2,
  },
];

export const DM_MESSAGES: Record<string, ChatMessage[]> = {
  m2: [
    {
      id: "m2-1",
      author: "이서연",
      mbti: "ENFP",
      isMine: false,
      text: "표지 시안 3개 중에 어떤 게 나아요?",
      time: "13:15",
      status: "sent",
    },
    {
      id: "m2-2",
      author: "김민준",
      mbti: "INFJ",
      isMine: true,
      text: "노란 톤이 팀 캐릭터랑도 잘 어울려서 저는 그게 좋아요",
      time: "13:18",
      status: "sent",
    },
    {
      id: "m2-3",
      author: "이서연",
      mbti: "ENFP",
      isMine: false,
      text: "표지 시안 오늘 밤까지 올릴게요!",
      time: "13:20",
      status: "sent",
    },
  ],
  m3: [
    {
      id: "m3-1",
      author: "김민준",
      mbti: "INFJ",
      isMine: true,
      text: "목요일 회의 시간 3시로 확정해도 될까요?",
      time: "어제 20:40",
      status: "sent",
    },
    {
      id: "m3-2",
      author: "박지호",
      mbti: "ISTJ",
      isMine: false,
      text: "네, 확인했습니다",
      time: "어제 20:41",
      status: "sent",
    },
  ],
  m4: [
    {
      id: "m4-1",
      author: "김민준",
      mbti: "INFJ",
      isMine: true,
      text: "대본 초안 기록에 박지호님이 의견을 남겼어요. 한번 봐주실 수 있을까요?",
      time: "9/14 22:01",
      status: "sent",
    },
    {
      id: "m4-2",
      author: "최유나",
      mbti: null,
      isMine: false,
      text: "대본 초안 부분은 저도 같이 썼는데요",
      time: "9/14 22:05",
      status: "sent",
    },
    {
      id: "m4-3",
      author: "최유나",
      mbti: null,
      isMine: false,
      text: "기여도 화면에서 정정 요청 넣어볼게요",
      time: "9/14 22:06",
      status: "sent",
    },
  ],
};

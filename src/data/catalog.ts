import type {
  AiPolicy,
  AiTool,
  BusyKind,
  ClerkDraft,
  ContribKind,
  CushionTone,
  IceGame,
  PresentDraft,
  RandomTool,
  QuizQuestion,
  ResearchResult,
  Role,
  SentenceMode,
  TaskKind,
} from "@/lib/types";

/**
 * 제품 설정값.
 *
 * 팀마다 달라지지 않는 것들 — 역할 후보, 30초 컷 문항, 기여·할 일의 종류, AI 도구 목록.
 * 데이터베이스에 넣지 않는 이유는 **팀이 고칠 수 있는 값이 아니기 때문**이다.
 * 바뀌면 화면 문구와 계산도 함께 바뀌어야 하므로 코드와 같이 배포되는 편이 안전하다.
 *
 * 팀의 실제 데이터(팀원·기록·메시지 …)는 데이터베이스에 있고 `api.ts` 로 읽는다.
 *
 * ⚠️ `*_SAMPLE_*` 은 **AI 가 아직 연결되지 않아** 쓰는 임시 응답이다. 모델을 붙이면
 * `api.ts` 의 해당 함수와 함께 사라진다.
 */

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

export const BUSY_KINDS: BusyKind[] = [
  { key: "class", name: "수업", color: "var(--busy-class)" },
  { key: "work", name: "아르바이트", color: "var(--busy-work)" },
  { key: "exam", name: "시험 기간", color: "var(--busy-exam)" },
];

export const SCHEDULE_DAYS = ["월", "화", "수", "목", "금"];

export const SCHEDULE_HOURS = ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];

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

export const AI_TOOLS: AiTool[] = [
  {
    key: "cushion",
    name: "쿠션 번역기",
    icon: "message-square-heart",
    note: "하고 싶은 말의 말투만 부드럽게 바꿔 줍니다",
    ready: true,
    href: "/tools/cushion",
  },
  {
    key: "clerk",
    name: "AI 서기",
    icon: "notebook-pen",
    note: "회의 내용을 할 일 카드로 정리합니다",
    ready: true,
    href: "/tools/clerk",
  },
  {
    key: "research",
    name: "AI 리서처",
    icon: "search",
    note: "자료 출처와 함께 찾아 줍니다",
    ready: true,
    href: "/tools/researcher",
  },
  {
    key: "present",
    name: "발표 지원",
    icon: "presentation",
    note: "대본 다듬기와 예상 질문 정리",
    ready: true,
    href: "/tools/present",
  },
  {
    key: "sentence",
    name: "상황별 문장 변환",
    icon: "file-output",
    note: "핵심 요약·교수님 질문 메일 모드",
    ready: true,
    href: "/tools/sentence",
  },
];

/**
 * AI 이용·보관 정책.
 *
 * **세 숫자 모두 기획안에 없다** — 핸드오프의 "확정되지 않은 정책" 표에 "사용량 한도 없음"
 * 으로 적혀 있던 자리다. 한도를 아예 두지 않으면 호출마다 비용이 드는 도구에 문이 없는
 * 것이라, 정해질 때까지 **평범하게 쓰면 닿지 않을 만큼 넉넉한** 값을 둔다.
 * 허브 화면이 `<Undecided>` 로 임시값이라는 것을 적고 있다.
 *
 * 하루의 기준은 한국 날짜다(콕 찌르기와 같다).
 */
export const AI_POLICY: AiPolicy = {
  retentionDays: 90,
  perTeamPerDay: 200,
  perMemberPerDay: 60,
};

/**
 * 쿠션 번역기 말투 3종.
 * 개수와 이름이 기획안에 없어 임시로 정한 값이다.
 */

export const CUSHION_TONES: CushionTone[] = [
  { key: "soft", name: "부드럽게" },
  { key: "plain", name: "담담하게" },
  { key: "firm", name: "분명하게" },
];

export const CUSHION_SAMPLE_INPUT = "이거 왜 아직 안 올렸어요? 내일이 마감인데요";

export const CUSHION_SAMPLE_OUTPUT: Record<string, string> = {
  soft: "혹시 자료 올리는 데 어려운 점이 있을까요? 내일이 마감이라 지금 상황만 알려주시면 제가 맞춰서 준비해 볼게요.",
  plain: "내일이 마감인데 자료가 아직 올라오지 않았습니다. 언제쯤 가능한지 알려주시면 일정을 맞추겠습니다.",
  firm: "내일 마감이라 오늘 안에는 자료가 필요합니다. 어려우시면 지금 말씀해 주세요. 범위를 줄이거나 나눠서 진행하겠습니다.",
};

export const CLERK_SAMPLE_INPUT =
  "오늘 회의: 발표 자료 표지 3개 시안 필요하다고 이서연이 얘기함. 설문 응답 분석 표는 아직 담당 안 정함. 발표 대본 초안은 최유나가 9/22까지 쓰기로 했음. 다음 회의는 목요일 15시.";

export const CLERK_SAMPLE_DRAFT: ClerkDraft = {
  summary: "표지 시안, 설문 분석 표, 발표 대본 초안이 논의됐고 다음 회의는 목요일 15시입니다.",
  candidates: [
    {
      id: "c1",
      title: "발표 자료 표지 시안 3개",
      assignee: "이서연",
      basis: "회의에서 직접 맡겠다고 말함",
      due: "9/19",
    },
    {
      id: "c2",
      title: "설문 응답 분석 표 정리",
      assignee: null,
      basis: "담당 의견 없음 — 직접 정해 주세요",
      due: "9/20",
    },
    {
      id: "c3",
      title: "발표 대본 초안",
      assignee: "최유나",
      basis: "회의에서 직접 맡겠다고 말함",
      due: "9/22",
    },
  ],
};

export const RESEARCH_SAMPLE_QUERY = "MBTI와 팀 프로젝트 만족도 관련 자료 있어?";

export const RESEARCH_SAMPLE_RESULTS: ResearchResult[] = [
  {
    id: "r1",
    title: "MBTI 유형과 팀 협업 만족도의 관계",
    source: "한국심리학회지 · 2021",
    snippet:
      "MBTI 유형보다 역할 명확성이 팀 협업 만족도에 더 큰 영향을 보였다는 연구 결과입니다.",
    url: null,
  },
  {
    id: "r2",
    title: "대학생 팀 프로젝트의 역할 분담 전략",
    source: "교육공학연구 · 2019",
    snippet: "자발적 희망 기반 역할 분담이 배정식보다 만족도가 높게 나타났습니다.",
    url: null,
  },
  {
    id: "r3",
    title: "비대면 팀 프로젝트 커뮤니케이션 실태",
    source: "한국콘텐츠학회논문지 · 2022",
    snippet: "채팅 중심 소통에서 발생하는 오해 사례와 완화 방법을 다룹니다.",
    url: null,
  },
];

export const PRESENT_SAMPLE_INPUT =
  "이 발표는 저희 팀이 3주 동안 조사한 내용을 정리한 것입니다. 먼저 배경을 설명하고, 다음으로 조사 방법, 마지막으로 결론을 말씀드리겠습니다.";

export const PRESENT_SAMPLE_DRAFT: PresentDraft = {
  refined: "오늘은 3주간 조사한 내용을 배경, 조사 방법, 결론 순서로 말씀드리겠습니다.",
  questions: [
    "조사 대상을 이렇게 정한 근거는 무엇인가요?",
    "표본 수가 적은데 결과를 일반화할 수 있나요?",
    "다음 연구에서 보완하고 싶은 점은 무엇인가요?",
  ],
};

export const SENTENCE_MODES: SentenceMode[] = [
  { key: "summary", name: "핵심 요약 모드", desc: "긴 글을 짧게 줄입니다" },
  { key: "email", name: "교수님 질문 메일 모드", desc: "질문을 격식 있는 메일로 바꿉니다" },
];

export const SENTENCE_SAMPLE_INPUT: Record<string, string> = {
  summary:
    "회의에서는 표지 시안 3개, 설문 분석 표, 발표 대본 초안 담당을 정했고 다음 회의는 목요일 15시로 잡았습니다. 자료조사 마감은 이미 지켰습니다.",
  email: "교수님 저희 조 발표 순서 언제 정해지나요?",
};

export const SENTENCE_SAMPLE_OUTPUT: Record<string, string> = {
  summary: "표지·설문표·대본 담당 확정, 다음 회의 목 15시.",
  email:
    "교수님, 안녕하세요. 디지털콘텐츠기획 3조 김민준입니다. 발표 순서가 언제 공지되는지 여쭙고자 메일 드립니다. 바쁘신 중에 확인 부탁드립니다.",
};

export const CONTRIB_KINDS: ContribKind[] = [
  { key: "task", name: "담당 업무", icon: "clipboard-check" },
  { key: "file", name: "결과물 제작·수정", icon: "file-pen" },
  { key: "meet", name: "회의 참여", icon: "users-round" },
  { key: "help", name: "협업 지원", icon: "handshake" },
  { key: "due", name: "마감 이행", icon: "calendar-check" },
];

export const TASK_KINDS: TaskKind[] = [
  { key: "team", name: "팀 업무", icon: "users-round" },
  { key: "study", name: "개인 학습", icon: "book-open" },
  { key: "check", name: "점검", icon: "list-checks" },
];

export const ICE_GAMES: IceGame[] = [
  {
    key: "apple",
    name: "사과게임",
    icon: "link",
    desc: "숫자 칸을 지워 합을 맞추는 게임 — 링크로 공유해 같이 합니다",
    playable: true,
    // 어느 주소로 연결할지 정해지지 않았다(화면의 <Undecided> 참고).
    url: null,
  },
  { key: "liar", name: "라이어 게임", icon: "drama", desc: "제시어를 모르는 한 명을 찾는 게임", playable: false, url: null },
  {
    key: "gartic",
    name: "갈틱폰",
    icon: "pencil-ruler",
    desc: "그림과 설명을 돌려가며 잇는 게임",
    playable: false,
    url: null,
  },
];

export const MENU_OPTIONS = ["국밥", "마라탕", "돈까스", "김밥천국", "파스타", "떡볶이", "라멘"];

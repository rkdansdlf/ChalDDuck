import type {
  AiPolicy,
  AiTool,
  BusyKind,
  ClerkDraft,
  ContribKind,
  CushionLevel,
  CushionLevelKey,
  CushionTone,
  IceGame,
  PresentDraft,
  RandomTool,
  ResearchResult,
  Role,
  SentenceMode,
  TaskKind,
} from "@/lib/types";
import { MAFIA_MAX_PLAYERS, MAFIA_MIN_PLAYERS } from "@/lib/mafia-rules";

/**
 * 제품 설정값.
 *
 * 팀마다 달라지지 않는 것들 — 역할 후보, 기여·할 일의 종류, AI 도구 목록.
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

/**
 * 직접 입력한 사유. 칩 줄에는 본인이 붙인 이름으로 보이고, 이 `name` 은 이름을 밝히지 않는
 * 자리(09 회의 후보의 "못 오는 사람 · 사유")에서만 쓴다 — "병원" 같은 이름이 팀에 새지 않게.
 */
export const CUSTOM_BUSY_KIND: BusyKind = {
  key: "custom",
  name: "개인 일정",
  color: "var(--busy-custom)",
};

export const SCHEDULE_DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export const SCHEDULE_HOURS = ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];

export const RANDOM_TOOLS: RandomTool[] = [
  { key: "roulette", name: "룰렛", icon: "disc-3" },
  { key: "dice", name: "주사위", icon: "dices" },
  { key: "draw", name: "제비뽑기", icon: "ticket" },
  { key: "ladder", name: "사다리타기", icon: "git-fork" },
];

export const AI_TOOLS: AiTool[] = [
  {
    key: "cushion",
    name: "쿠션 번역기",
    icon: "message-square-heart",
    note: "하고 싶은 말의 말투만 부드럽게 바꿔 줍니다",
    href: "/tools/cushion",
  },
  {
    key: "clerk",
    name: "AI 서기",
    icon: "notebook-pen",
    note: "회의 내용을 할 일 카드로 정리합니다",
    href: "/tools/clerk",
  },
  {
    key: "research",
    name: "AI 리서처",
    icon: "search",
    note: "자료 출처와 함께 찾아 줍니다",
    href: "/tools/researcher",
  },
  {
    key: "present",
    name: "발표 지원",
    icon: "presentation",
    note: "대본 다듬기와 예상 질문 정리",
    href: "/tools/present",
  },
  {
    key: "sentence",
    name: "상황별 문장 변환",
    icon: "file-output",
    note: "핵심 요약·교수님 질문 메일 모드",
    href: "/tools/sentence",
  },
];

/**
 * 한도·내역에 적는 **도구 이름**.
 *
 * `AI_TOOLS`(허브에 보이는 5종)만으로는 부족하다 — 읽기 도움(19·31)는 도구 화면이
 * 아니라 읽기 설정이라 허브에 카드가 없는데, 한도와 사용 내역에는 남아야 한다
 * ("누가 AI 를 언제 썼나" 를 수업에 낼 때 그 행도 빠지지 않게).
 *
 * 그래서 **허브 목록과 이름표를 분리한다.** 카드를 늘리지 않고 이름만 보탠다.
 */
export const AI_TOOL_NAMES: Record<string, string> = {
  ...Object.fromEntries(AI_TOOLS.map((tool) => [tool.key, tool.name])),
  "read-cushion": "읽기 도움",
};

/**
 * AI 이용·보관 정책.
 *
 * ## 하루 사용량은 **더 이상 한도가 아니다** (2026-09-28)
 *
 * 핸드오프의 "확정되지 않은 정책" 표는 "사용량 한도 없음" 이었다. 우리는 거기에 **넉넉한
 * 숫자**(200·60)를 임시로 두었고, 그것을 14일 뒤 **측량해서 지웠다.**
 *
 * - 운영 14일의 최고 하루가 도구 **18회**(한도의 9%), 읽기 도움 **1회**였다. 닿은 날이 없다.
 * - 무료 라우터가 속도 한도로 막은 적도 없다(실패는 안전 필터 거절 2건과 60초 타임아웃 1건).
 * - 그러니 그 숫자는 사용자에게 "하루 200회" 로 보이면서 **아무 일도 하지 않았다.**
 *
 * 숫자를 근거 없이 남기는 것보다 **지우는 쪽이 정직했다.** 남은 것은 읽기 도움 폭주 차단 하나이고
 * 그것은 사용자에게 한도로 말하지 않는다(아래 `cushionRunawayCapPerTeamPerDay`).
 *
 * ## 남는 것 두 가지
 *
 * 1. **보관 기간(90일).** 입력한 글과 결과는 애초에 저장하지 않고, 횟수만 남긴다.
 * 2. **읽기 도움 폭주 차단.** 사람이 누르지 않아도 도는 유일한 기능이라 방어선이 필요하다.
 *
 * 하루의 기준은 한국 날짜다(콕 찌르기와 같다).
 */
export const AI_POLICY: AiPolicy = {
  retentionDays: 90,

  /**
   * 읽기 도움 **폭주 차단**(하루·팀). 사용자에게 보이는 한도가 아니다.
   *
   * ## 왜 이것만 남았는가 (2026-09-28, 측정으로 결정)
   *
   * 도구 한도(팀 200 · 1인 60)와 읽기 도움 한도(400 · 120)는 **삭제했다.** 근거는 다음과 같다 —
   *
   * - 운영 14일 기록의 최고 하루가 도구 **18회**(200 의 9%), 읽기 도움 **1회**(400 의 0.25%)였다.
   *   **한도에 닿은 날이 한 번도 없었고**, 거절된 날도 없었다.
   * - 무료 라우터가 **속도 한도로** 막은 적도 없다. 남은 실패는 `MODEL_REFUSAL` 2건(안전 필터가
   *   내용을 거절)과 60초 타임아웃 1건 — **한도와 무관**하다.
   *
   * 14일간 아무 일도 하지 않은 숫자를 사용자에게 "하루 200회" 로 보여 주는 것은 한도가 아니라
   * **거짓말**이었다. 지운다.
   *
   * ## 남긴 것은 하나 — 읽기 도움만 자동으로 돈다
   *
   * 도구는 사람이 누른다. 아무도 안 누르면 아무 일도 없다. **읽기 도움만 메시지마다 자동으로**
   * 도므로, 여기만 무제한이 가능한 형태의 사고다. 순환 자체는 이미 `MAX_ATTEMPTS` 2회와
   * `FAILURE_BACKOFF_MS` 30분이 묶어 두므로 여기는 **마지막 방어선**이고, 사람 눈에는 보이지
   * 않는다(사용자에게 한도로 말하지 않는다).
   *
   * 실제 읽기 도움 사용량은 하루 1회였다. 5,000 은 폭주만 잡기 위한 숫자지 한도가 아니다 — 관측치를
   * 500배 한다.
   */
  cushionRunawayCapPerTeamPerDay: 5000,
};

/**
 * 쿠션 번역기 말투 3종.
 * 개수와 이름이 기획안에 없어 임시로 정한 값이다.
 */

/**
 * 읽기 도움의 **강도** 3단계.
 *
 * 예전에는 "끄거나 켜는 것"만 있었다. 그랬더니 두 사람이 같은 대화를 봤는데 한 사람에게는
 * 이미 다듬어지어 보이고 다른 사람에게는 원문이 보여 차이를 알 수 없었다(표시는 남아 있지만
 * **얼마나** 읽기 도움했는지는 달랐다). 그래서 "몇까지 세게" 를 고를 수 있게 한다.
 *
 * 단계는 **세 곳**을 바꾼다 — 모델에게 주는 지시, 결과를 검사하는 기준, 규칙 가림의 범위.
 * 하나만 바꾸면 "약하게 다듬으라 고 했는데 검사는 엄격하게 한다" 같은 어긋남이 생긴다.
 * 세 곳은 [`lib/read-cushion.ts`](src/lib/read-cushion.ts) 의 `LEVEL_PROFILES` 한 곳에 있다.
 *
 * 개수와 이름은 기획안에 없어 세 단계로 두었다(15 번 말투와 같은 사정).
 */
export const CUSHION_LEVELS: CushionLevel[] = [
  {
    key: "LIGHT",
    name: "욕설만",
    desc: "욕설과 비속어만 가립니다. 말의 뜻은 그대로 둡니다.",
  },
  {
    key: "NORMAL",
    name: "보통",
    desc: "욕설에 더해 비꼼과 탓하는 말을 완화합니다.",
  },
  {
    key: "STRONG",
    name: "강하게",
    desc: "책임 추궁·조롱까지 완화합니다. 원문은 언제든 보입니다.",
  },
];

/** 처음 읽는 강도. 전원이 같은 기본을 갖는다 — 하나만 세게 읽히면 대화의 공기가 갈린다. */
export const CUSHION_DEFAULT_MODE: CushionLevelKey = "NORMAL";

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

/**
 * 리서처 초기 진입 시 보여 주는 대학생 팀플 핵심 추천 검색어.
 */
export type ResearchCuratedSuggestion = {
  tag: string;
  query: string;
};

export const RESEARCH_CURATED_SUGGESTIONS: ResearchCuratedSuggestion[] = [
  {
    tag: "역할 분담 연구",
    query: "팀 프로젝트 역할 분담과 협업 만족도 실증 연구",
  },
  {
    tag: "무임승차 완화",
    query: "대학생 팀 프로젝트 무임승차(free rider) 완화 전략",
  },
  {
    tag: "청년 주거 통계",
    query: "통계청 20대 청년 1인 가구 주거 및 생활 실태 조사 보고서",
  },
  {
    tag: "발표 슬라이드 원칙",
    query: "멀티미디어 학습 원리와 프레젠테이션 슬라이드 디자인 연구",
  },
];

export const RESEARCH_SAMPLE_RESULTS: ResearchResult[] = [
  {
    id: "r1",
    title: "MBTI 유형과 팀 협업 만족도의 관계",
    source: "한국심리학회지",
    snippet:
      "MBTI 유형보다 역할 명확성이 팀 협업 만족도에 더 큰 영향을 보였다는 연구 결과입니다.",
    url: null,
    year: "2021",
    kind: "academic",
    citation: '김민수 외 (2021). "MBTI 유형과 팀 협업 만족도의 관계", 한국심리학회지.',
    relatedQueries: [
      "MBTI와 팀 커뮤니케이션 스타일 비교 연구",
      "대학생 협동학습 갈등 해결 전략",
      "팀 성과와 역할 명확성 실증 분석",
    ],
  },
  {
    id: "r2",
    title: "대학생 팀 프로젝트의 역할 분담 전략",
    source: "교육공학연구",
    snippet: "자발적 희망 기반 역할 분담이 배정식보다 만족도가 높게 나타났습니다.",
    url: null,
    year: "2019",
    kind: "academic",
    citation: '이진아 (2019). "대학생 팀 프로젝트의 역할 분담 전략", 교육공학연구.',
  },
  {
    id: "r3",
    title: "비대면 팀 프로젝트 커뮤니케이션 실태",
    source: "한국콘텐츠학회논문지",
    snippet: "채팅 중심 소통에서 발생하는 오해 사례와 완화 방법을 다룹니다.",
    url: null,
    year: "2022",
    kind: "academic",
    citation: '박서현 외 (2022). "비대면 팀 프로젝트 커뮤니케이션 실태", 한국콘텐츠학회논문지.',
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
  structuredQuestions: [
    {
      id: "q-sample-1",
      question: "조사 대상을 이렇게 정한 근거는 무엇인가요?",
      category: "method",
      intent: "조사 대상 선정의 타당성 및 방법론 검증",
    },
    {
      id: "q-sample-2",
      question: "표본 수가 적은데 결과를 일반화할 수 있나요?",
      category: "data",
      intent: "표본 크기의 통계적 신뢰도와 일반화 한계 검토",
    },
    {
      id: "q-sample-3",
      question: "다음 연구에서 보완하고 싶은 점은 무엇인가요?",
      category: "practical",
      intent: "프로젝트 한계점 인식 및 향후 발전 가능성",
    },
  ],
  estimatedSeconds: 8,
  mode: "academic",
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

/**
 * 28 아이스브레이킹 게임.
 *
 * 둘 다 **각자 자기 폰으로 자기 카드만 보고, 대화는 회의 자리나 단톡방에서** 하는 게임이다.
 * 앱은 비밀을 나누고, 투표를 받고, 결과를 공개하는 일만 한다.
 *
 * 최소 인원은 기획안에 없어 임시로 정했다(화면의 <Undecided>). 서버도 이 값으로 막는다.
 */
export const ICE_GAMES: IceGame[] = [
  {
    key: "liar",
    name: "라이어 게임",
    icon: "drama",
    desc: "제시어를 모르는 한 명을 찾는 게임",
    howTo: [
      "이번 판에 앉을 사람을 먼저 고릅니다.",
      "모두 같은 제시어를 받고, 라이어 한 명만 주제만 받습니다.",
      "설명 순서대로 돌아가며 제시어를 한 문장씩 설명합니다. 너무 뻔하면 라이어가 알아챕니다.",
      "설명이 끝나면 사회자가 투표를 엽니다. 라이어라고 생각하는 사람에게 투표합니다.",
      "라이어가 가장 많이 뽑히면, 라이어가 제시어를 맞힐 마지막 기회를 얻습니다.",
      "시민이 뽑히면 라이어의 승리입니다.",
    ],
    minPlayers: 3,
  },
  {
    key: "mafia",
    name: "마피아",
    icon: "moon",
    desc: "시민 사이에 숨은 마피아를 찾는 게임",
    howTo: [
      "각자 역할 카드(마피아·경찰·의사·시민)를 받습니다. 마피아끼리는 서로를 압니다.",
      "밤에는 사회자가 진행합니다 — 모두 눈을 감고, 사회자가 부르는 역할만 눈을 떠 손짓으로 고릅니다.",
      "낮에는 이야기를 나누고 탈락시킬 사람에게 투표합니다.",
      "마피아가 모두 탈락하면 시민 승리, 마피아 수가 나머지와 같아지면 마피아 승리입니다.",
      `${MAFIA_MIN_PLAYERS}명부터 ${MAFIA_MAX_PLAYERS}명까지 열 수 있습니다. 7명부터 마피아 2명, 10명부터 마피아 3명입니다.`,
    ],
    // 3~4명은 밤과 투표 한 번으로 끝나고 라이어 게임이 어울린다(`mafia-rules.ts`).
    // ⚠️ 상한이 없다면 15명 판도 마피아 3명이다 — 밤이 수십 번 반복돼 아이스브레이킹이
    //    판이 된다. 더 많은 사람이 하고 싶으면 두 판을 한다.
    minPlayers: MAFIA_MIN_PLAYERS,
    maxPlayers: MAFIA_MAX_PLAYERS,
  },
];

/*
 * 라이어 제시어는 여기서 뺐다 — `data/liar-prompts.ts`.
 *
 * `LIAR_TOPICS` 는 { topic, words } 형태라 라이어의 최종 추측을 관대하게 판정할
 * `aliases` 를 담을 수 없었고, 같은 단어를 두 번 쓰면 "설명하면 두 정답이 맞는다"가
 * 되어 판정이 뒤집힌다. 제시어만 있는 표가 그 문제를 같이 품고 있어서, 데이터도 그쪽으로
 * 옮겼다(`rules.ts` 의 `deal` 이 여기서 읽는다).
 */
export const MENU_OPTIONS = ["국밥", "마라탕", "돈까스", "김밥천국", "파스타", "떡볶이", "라멘"];

/* 이번 기획안(찰떡 UI.txt 정리본)에 적힌 내용만 데이터로 옮겼다.
   문서에 없는 값은 만들지 않고 null 또는 "미정"으로 둔다. */
window.CD3 = {
  team: { name: "디지털콘텐츠기획 3조", course: "디지털콘텐츠기획", members: 4, dday: "중간발표 D-12", code: "CD3-7F2Q" },
  me: { name: "", mbti: null, want: null, veto: null },

  /* 문서에 적힌 4문항 그대로. 정확도·검증 결과는 문서에 없다. */
  quiz: [
    { axis: "E / I", label: "첫 만남과 소통",
      a: "먼저 말을 걸고 대면·음성으로 친해지기", b: "분위기를 살피며 필요한 내용을 텍스트로 소통하기" },
    { axis: "S / N", label: "과제 주제와 기획",
      a: "검증된 사례·통계·기존 자료 활용하기", b: "새롭고 독창적인 아이디어 시도하기" },
    { axis: "T / F", label: "피드백과 의견 조율",
      a: "완성도와 논리 중심으로 직접 지적하기", b: "팀 분위기를 고려해 부드럽게 전달하기" },
    { axis: "J / P", label: "일정과 마감",
      a: "먼저 일정을 정하고 미리 완성하기", b: "유연하게 진행하며 마감에 집중하기" },
  ],

  mbtiGrid: [
    ["ISTJ", "ISFJ", "INFJ", "INTJ"],
    ["ISTP", "ISFP", "INFP", "INTP"],
    ["ESTP", "ESFP", "ENFP", "ENTP"],
    ["ESTJ", "ESFJ", "ENFJ", "ENTJ"],
  ],

  /* 역할 후보 이름은 기획안의 역할별 제출함(자료조사·PPT 템플릿·발표 대본)에서 가져왔다. */
  roles: [
    { key: "research", name: "자료조사", note: "논문·기사·통계 수집과 정리" },
    { key: "deck", name: "PPT 제작", note: "템플릿 구성과 슬라이드 작업" },
    { key: "script", name: "발표 대본", note: "대본 작성과 발표 연습" },
    { key: "present", name: "발표", note: "청중 앞 발표와 질의 응답" },
    { key: "manage", name: "일정 관리", note: "마감 관리와 회의 소집" },
  ],

  /* 팀원의 희망/Veto는 각자 본인이 직접 고른 값이다.
     캐릭터는 MBTI로 assets/characters/에서 매칭되고, 캐릭터 고유 이름은 기획안에 없어 만들지 않는다. */
  roster: [
    { name: "김민준", me: true, mbti: "INFJ", want: "research", veto: "present" },
    { name: "이서연", mbti: "ENFP", want: "deck", veto: "manage" },
    { name: "박지호", mbti: "ISTJ", want: "manage", veto: "present" },
    { name: "최유나", mbti: null, want: "research", veto: null },
  ],

  randomTools: [
    { key: "roulette", name: "룰렛", icon: "disc-3" },
    { key: "dice", name: "주사위", icon: "dices" },
    { key: "draw", name: "제비뽑기", icon: "ticket" },
    { key: "ladder", name: "사다리타기", icon: "git-fork" },
  ],

  /* 가능한 시간을 막는 사유 — 기획안에 적힌 세 종류 */
  blockKinds: [
    { key: "class", name: "수업", color: "#8C7C68" },
    { key: "work", name: "아르바이트", color: "#D2624A" },
    { key: "exam", name: "시험 기간", color: "#84621E" },
  ],
  days: ["월", "화", "수", "목", "금"],
  hours: ["9", "10", "11", "12", "13", "14", "15", "16", "17", "18"],
  /* 내 시간표: [요일index, 시작 hour index, 길이, 종류] */
  myBlocks: [[0, 1, 3, "class"], [0, 6, 2, "work"], [1, 0, 2, "class"], [2, 3, 2, "class"],
             [2, 7, 3, "work"], [3, 1, 2, "class"], [4, 2, 2, "class"], [4, 6, 2, "work"]],

  /* 추천 후보 — 몇 명이 가능한지와 막는 사유만 표시한다. 적합도 점수는 만들지 않는다. */
  slots: [
    { day: "수", time: "16:00 – 18:00", ok: 4, of: 4, why: null },
    { day: "화", time: "13:00 – 15:00", ok: 4, of: 4, why: null },
    { day: "목", time: "15:00 – 17:00", ok: 3, of: 4, why: "박지호 · 아르바이트" },
    { day: "월", time: "14:00 – 16:00", ok: 3, of: 4, why: "이서연 · 수업" },
  ],
  /* 전원 가능한 시간이 없을 때 — 기획안에 처리 방식이 없어 화면에서 규칙을 만들지 않는다. */
  noSlotAlt: [
    { day: "금", time: "17:00 – 19:00", ok: 3, of: 4, why: "최유나 · 시험 기간" },
    { day: "토", time: "11:00 – 13:00", ok: 3, of: 4, why: "박지호 · 아르바이트" },
  ],

  /* ── 드라이브 — 기획안의 "역할별 제출함"과 "버전 기록" ──
     P0 제안안 확정: 팀당 2GB, 문서·이미지·PPT·PDF만 허용, 마감 후에도 제출함은 잠그지 않고 라벨만 붙인다. */
  driveLimits: { capGB: 2, usedGB: 1.3, types: ["문서", "이미지", "PPT", "PDF"] },
  boxes: [
    { role: "research", name: "자료조사 제출함", owner: "김민준", files: 3, due: "9/15", state: "ing", late: true },
    { role: "deck", name: "PPT 템플릿 제출함", owner: "이서연", files: 2, due: "9/20", state: "ing", late: false },
    { role: "script", name: "발표 대본 제출함", owner: "최유나", files: 0, due: "9/22", state: "empty", late: false },
  ],
  /* 버전 기록 — 누가 언제 무엇을 올렸는지. 문서에 적힌 "파일 버전 기록" 그대로. */
  versions: [
    { v: "v4", who: "이서연", when: "어제 21:14", note: "표지·간지 레이아웃 교체", size: "8.4MB", latest: true, late: false, type: "pptx" },
    { v: "v3", who: "김민준", when: "9/13 16:02", note: "설문 결과 그래프 3개 추가", size: "7.9MB", late: false, type: "pptx" },
    { v: "v2", who: "이서연", when: "9/12 23:40", note: "본문 폰트 통일", size: "7.1MB", late: false, type: "pptx" },
    { v: "v1", who: "이서연", when: "9/11 14:20", note: "템플릿 최초 업로드", size: "6.8MB", late: false, type: "pptx" },
    { v: "img1", who: "김민준", when: "9/13 15:40", note: "설문 결과 그래프 (이미지 내보내기)", size: "1.1MB", late: false, type: "image", url: "../../assets/logo-app-icon.png" },
  ],

  /* ── AI 도구 — 기획안에 이름이 적힌 네 개만. P0 제안안 확정: 90일 보관 후 자동 삭제, 사용량 한도 없음 ── */
  aiPolicy: { retentionDays: 90 },
  aiTools: [
    { key: "cushion", name: "쿠션 번역기", icon: "message-square-heart", note: "하고 싶은 말의 말투만 부드럽게 바꿔 줍니다", ready: true },
    { key: "clerk", name: "AI 서기", icon: "notebook-pen", note: "회의 내용을 할 일 카드로 정리합니다", ready: true },
    { key: "research", name: "AI 리서처", icon: "search", note: "자료 출처와 함께 찾아 줍니다", ready: true },
    { key: "present", name: "발표 지원", icon: "presentation", note: "대본 다듬기와 예상 질문 정리", ready: true },
    { key: "sentence", name: "상황별 문장 변환", icon: "file-output", note: "핵심 요약·교수님 질문 메일 모드", ready: true },
  ],
  /* 쿠션 번역기 예시 — 말투만 바꾸고 요구 내용은 그대로 둔다는 것을 보이기 위한 문장 */
  cushionDemo: {
    raw: "이거 왜 아직 안 올렸어요? 내일이 마감인데요",
    tones: [
      { key: "soft", name: "부드럽게", out: "혹시 자료 올리는 데 어려운 점이 있을까요? 내일이 마감이라 지금 상황만 알려주시면 제가 맞춰서 준비해 볼게요." },
      { key: "plain", name: "담담하게", out: "내일이 마감인데 자료가 아직 올라오지 않았습니다. 언제쯤 가능한지 알려주시면 일정을 맞추겠습니다." },
      { key: "firm", name: "분명하게", out: "내일 마감이라 오늘 안에는 자료가 필요합니다. 어려우시면 지금 말씀해 주세요. 범위를 줄이거나 나눠서 진행하겠습니다." },
    ],
  },

  /* ── 기여도 리포트 ──
     사용자가 정한 기준: 서열화하지 않고, 합의한 역할과 실제 수행 내역을 근거로 보여준다.
     자동 수집 → 본인 확인·누락 보완 → 팀원 확인·정정 → 1장 PDF.
     종합 점수·순위는 만들지 않고, MBTI·채팅량·친목은 반영하지 않는다. */
  contribKinds: [
    { key: "task", name: "담당 업무", icon: "clipboard-check" },
    { key: "file", name: "결과물 제작·수정", icon: "file-pen" },
    { key: "meet", name: "회의 참여", icon: "users-round" },
    { key: "help", name: "협업 지원", icon: "handshake" },
    { key: "due", name: "마감 이행", icon: "calendar-check" },
  ],
  /* src: auto = 앱이 자동 수집 / self = 본인이 추가한 누락분(공동·오프라인 작업) */
  myContrib: [
    { kind: "task", title: "설문 문항 설계와 배포", detail: "합의한 역할: 자료조사", when: "9/8 – 9/12", src: "auto", state: "ok" },
    { kind: "file", title: "발표 자료 v3 — 그래프 3개 추가", detail: "드라이브 버전 기록", when: "9/13 16:02", src: "auto", state: "ok" },
    { kind: "meet", title: "팀 회의 3회 참여", detail: "9/5 · 9/9 · 9/13", when: "9월", src: "auto", state: "ok" },
    { kind: "due", title: "자료조사 마감 이행", detail: "약속 9/12 → 제출 9/12", when: "9/12", src: "auto", state: "ok" },
    { kind: "help", title: "이서연님 PPT 오류 수정 도움", detail: "오프라인 작업 — 내가 직접 추가", when: "9/14", src: "self", state: "pending" },
  ],
  /* 팀원이 확인해야 하는 항목. disputed = 의견 차이가 적힌 항목 */
  teamCheck: [
    { who: "이서연", title: "PPT 템플릿 제작과 4회 수정", state: "ok", by: "3명 확인" },
    { who: "박지호", title: "회의 일정 조율과 마감 알림", state: "ok", by: "3명 확인" },
    { who: "김민준", title: "이서연님 PPT 오류 수정 도움", state: "pending", by: "이서연 확인 대기" },
    { who: "최유나", title: "발표 대본 초안 작성", state: "disputed", by: "박지호 · 의견 차이 1건",
      dispute: "초안은 공동 작성이었고 분량 절반은 제가 썼습니다." },
  ],

  /* ── 팀플 단톡방 — 이번 PDF엔 화면이 없어 새로 설계. 채널 여러 개를 둘지, 팀당 하나만 둘지가
     기획안에 없어 팀당 단일 채팅방 하나로만 구성했다. */
  chat: {
    messages: [
      { who: "이서연", mbti: "ENFP", text: "내일 회의 몇 시로 할까요? 저는 오후 다 됩니다", time: "14:02" },
      { who: "박지호", mbti: "ISTJ", text: "저는 3시 이후로 부탁드려요, 알바 있어서", time: "14:03",
        reactions: [{ icon: "thumbs-up", count: 2 }] },
      { who: "최유나", mbti: null, text: "네 저도 3시 이후 괜찮아요", time: "14:04" },
      { who: "김민준", me: true, mbti: "INFJ",
        text: "혹시 자료 올리는 데 어려운 점이 있을까요? 내일이 마감이라 지금 상황만 알려주시면 제가 맞춰서 준비해 볼게요.",
        time: "14:05", viaCushion: true, reactions: [{ icon: "check", count: 1 }] },
    ],
  },

  /* ── 1:1 DM — 단톡방과 별도로, 팀원마다 하나씩 개설. 김민준(나) 기준 목록·대화. */
  dmThreads: [
    { name: "이서연", mbti: "ENFP", lastMsg: "표지 시안 오늘 밤까지 올릴게요!", time: "13:20", unread: 1 },
    { name: "박지호", mbti: "ISTJ", lastMsg: "네, 확인했습니다", time: "어제", unread: 0 },
    { name: "최유나", mbti: null, lastMsg: "대본 초안 부분은 저도 같이 썼는데요", time: "9/14", unread: 2 },
  ],
  dmMessages: {
    "이서연": [
      { who: "이서연", mbti: "ENFP", text: "표지 시안 3개 중에 어떤 게 나아요?", time: "13:15" },
      { who: "김민준", me: true, mbti: "INFJ", text: "노란 톤이 팀 캐릭터랑도 잘 어울려서 저는 그게 좋아요", time: "13:18" },
      { who: "이서연", mbti: "ENFP", text: "표지 시안 오늘 밤까지 올릴게요!", time: "13:20" },
    ],
    "박지호": [
      { who: "김민준", me: true, mbti: "INFJ", text: "목요일 회의 시간 3시로 확정해도 될까요?", time: "어제 20:40" },
      { who: "박지호", mbti: "ISTJ", text: "네, 확인했습니다", time: "어제 20:41" },
    ],
    "최유나": [
      { who: "김민준", me: true, mbti: "INFJ", text: "대본 초안 기록에 박지호님이 의견을 남겼어요. 한번 봐주실 수 있을까요?", time: "9/14 22:01" },
      { who: "최유나", mbti: null, text: "대본 초안 부분은 저도 같이 썼는데요", time: "9/14 22:05" },
      { who: "최유나", mbti: null, text: "기여도 화면에서 정정 요청 넣어볼게요", time: "9/14 22:06" },
    ],
  },

  /* ── AI 서기 — 회의 내용을 넣으면 요약과 할 일 후보를 만든다.
     AI는 초안만 만들고, 담당자·기한 확정과 실제 반영은 사람이 누른다(제품 원칙 1). */
  aiClerk: {
    raw: "오늘 회의: 발표 자료 표지 3개 시안 필요하다고 이서연이 얘기함. 설문 응답 분석 표는 아직 담당 안 정함. 발표 대본 초안은 최유나가 9/22까지 쓰기로 했음. 다음 회의는 목요일 15시.",
    summary: "표지 시안, 설문 분석 표, 발표 대본 초안이 논의됐고 다음 회의는 목요일 15시입니다.",
    candidates: [
      { title: "발표 자료 표지 시안 3개", who: "이서연", basis: "회의에서 직접 맡겠다고 말함", due: "9/19" },
      { title: "설문 응답 분석 표 정리", who: null, basis: "담당 의견 없음 — 직접 정해 주세요", due: "9/20" },
      { title: "발표 대본 초안", who: "최유나", basis: "회의에서 직접 맡겠다고 말함", due: "9/22" },
    ],
  },

  /* ── 할 일 · 체크리스트 — 팀 업무 / 개인 학습 / 점검을 한 목록에서 구분한다(사용자 지정). */
  taskKinds: [
    { key: "team", name: "팀 업무", icon: "users-round" },
    { key: "study", name: "개인 학습", icon: "book-open" },
    { key: "check", name: "점검", icon: "list-checks" },
  ],
  tasks: [
    { title: "발표 자료 표지 시안 3개", kind: "team", who: "이서연", mbti: "ENFP", due: "9/19", status: "doing", source: "clerk" },
    { title: "설문 응답 분석 표 정리", kind: "team", who: null, mbti: null, due: "9/20", status: "todo", source: "clerk" },
    { title: "발표 대본 초안", kind: "team", who: "최유나", mbti: null, due: "9/22", status: "todo", source: "clerk" },
    { title: "자료조사 마감 확인", kind: "check", who: "김민준", mbti: "INFJ", due: "9/18", status: "done", source: "manual" },
    { title: "발표 연습 개인 대본 외우기", kind: "study", who: "김민준", mbti: "INFJ", due: "9/24", status: "todo", source: "manual" },
  ],

  /* ── AI 리서처 — 자료와 출처를 함께 보여준다. 판정·추천 근거 문구는 만들지 않는다. */
  researcherDemo: {
    query: "MBTI와 팀 프로젝트 만족도 관련 자료 있어?",
    results: [
      { title: "MBTI 유형과 팀 협업 만족도의 관계", source: "한국심리학회지 · 2021", snippet: "MBTI 유형보다 역할 명확성이 팀 협업 만족도에 더 큰 영향을 보였다는 연구 결과입니다." },
      { title: "대학생 팀 프로젝트의 역할 분담 전략", source: "교육공학연구 · 2019", snippet: "자발적 희망 기반 역할 분담이 배정식보다 만족도가 높게 나타났습니다." },
      { title: "비대면 팀 프로젝트 커뮤니케이션 실태", source: "한국콘텐츠학회논문지 · 2022", snippet: "채팅 중심 소통에서 발생하는 오해 사례와 완화 방법을 다룹니다." },
    ],
  },

  /* ── 발표 지원 — 대본 다듬기 + 예상 질문. 내용을 새로 지어내지 않고 표현만 다듬는다. */
  presentDemo: {
    raw: "이 발표는 저희 팀이 3주 동안 조사한 내용을 정리한 것입니다. 먼저 배경을 설명하고, 다음으로 조사 방법, 마지막으로 결론을 말씀드리겠습니다.",
    refined: "오늘은 3주간 조사한 내용을 배경, 조사 방법, 결론 순서로 말씀드리겠습니다.",
    questions: [
      "조사 대상을 이렇게 정한 근거는 무엇인가요?",
      "표본 수가 적은데 결과를 일반화할 수 있나요?",
      "다음 연구에서 보완하고 싶은 점은 무엇인가요?",
    ],
  },

  /* ── 상황별 문장 변환 — 쿠션 번역기(말투 3종)와 별도로, 원안의 두 모드를 둔다. */
  sentenceModes: [
    { key: "summary", name: "핵심 요약 모드", desc: "긴 글을 짧게 줄입니다", demoIn: "회의에서는 표지 시안 3개, 설문 분석 표, 발표 대본 초안 담당을 정했고 다음 회의는 목요일 15시로 잡았습니다. 자료조사 마감은 이미 지켰습니다.", demoOut: "표지·설문표·대본 담당 확정, 다음 회의 목 15시." },
    { key: "email", name: "교수님 질문 메일 모드", desc: "질문을 격식 있는 메일로 바꿉니다", demoIn: "교수님 저희 조 발표 순서 언제 정해지나요?", demoOut: "교수님, 안녕하세요. 디지털콘텐츠기획 3조 김민준입니다. 발표 순서가 언제 공지되는지 여쭙고자 메일 드립니다. 바쁘신 중에 확인 부탁드립니다." },
  ],

  /* ── 친목 — 원안의 친목·보상 기능 중 우선 선정: 메뉴 룰렛(부담 적고 팀 조율 도구 재사용 가능). */
  menuOptions: ["국밥", "마라탕", "돈까스", "김밥천국", "파스타", "떡볶이", "라멘"],

  /* ── 아이스브레이킹 — 원안 세 가지 중 사과게임(공유 링크형)을 먼저 연결. */
  iceGames: [
    { key: "apple", name: "사과게임", icon: "link", desc: "숫자 칸을 지워 합을 맞추는 게임 — 링크로 공유해 같이 합니다" },
    { key: "liar", name: "라이어 게임", icon: "drama", desc: "제시어를 모르는 한 명을 찾는 게임" },
    { key: "gartic", name: "갈틱폰", icon: "pencil-ruler", desc: "그림과 설명을 돌려가며 잇는 게임" },
  ],
};

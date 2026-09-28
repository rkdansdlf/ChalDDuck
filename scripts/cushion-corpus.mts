/**
 * 읽기 순화의 **회귀 코퍼스**.
 *
 * ## 왜 코퍼스가 먼저인가
 *
 * 실측이 이랬다: 협조적 말 3/3, 심한 욕설 **0/3**(안전 필터 거절), 거절하지 않는 무료 모델을
 * 직접 골라도 **욕을 그대로 남겼다**(3/3). 여기서 "유료 모델로 바꾸면 되나" 를 **느낌으로** 답하면
 * 안 된다. "이 말들을 나쁘게 만들지 않는가" 라는 기준이 먼저 있어야 나란히 비교할 수 있다.
 *
 * ## 기대를 **문장**이 아니라 **성질**로 적는다
 *
 * 순화본 문장을 그대로 적어 두면 모델이 바뀔 때마다 코퍼스 전체가 깨진다(그래서 아무도
 * 고치지 않는다). 여기서는 두 가지만 약속한다.
 *
 * - `keep` — **반드시 살아남아야 하는 것**(요구·마감·시각·이름·수치). 사라지면 순화가 아니라 삭제다.
 * - `drop` — 이 단계에서 **반드시 없어야 하는 것**(욕설·비꼼·조롱·"니 탓").
 *
 * 그 사이 말투는 자유다. 그게 이 코퍼스가 오래 사는 이유다.
 *
 * ## 목표 규모
 *
 * 단계별 100개씩(협조적·비꼼·책임 추궁·욕설·강한 공격) — 지금은 25개로 시작한다.
 * **늘리는 방법은 "실제로 헷갈린 말을 하나씩 넣는 것"** 이다(측정 중 생긴 반례를 그대로).
 */

/** 한 단계의 묶음. */
export type CorpusCase = {
  id: string;
  /** 이 말을 어느 세기로 읽는지. */
  level: "LIGHT" | "NORMAL" | "STRONG";
  /** 실제 팀플 대화에서 나올 법한 말. */
  text: string;
  /** 반드시 살아남아야 하는 것. */
  keep: string[];
  /** 이 단계에서 반드시 없어야 하는 것. */
  drop: string[];
  /**
   * 규칙 가림만으로 충분한 말인가.
   *
   * `false` 인 말(조용히 비꼬는 말처럼 욕설이 없는 것)은 **AI 가 반드시 일을 해야** 한다 —
   * 가림으로 커버되지 않으므로, 순화가 실패하면 원문이 그대로 보인다.
   */
  maskable: boolean;
};

export const CUSHION_CORPUS: CorpusCase[] = [
  /* ── 협조적: 건드리면 안 되는 말 ───────────────────────────── */
  { id: "ok-1", level: "NORMAL", text: "내일 회의 몇 시로 할까요? 저는 오후 다 됩니다", keep: ["내일", "회의"], drop: [], maskable: true },
  { id: "ok-2", level: "NORMAL", text: "자료는 오늘 중으로 올릴게", keep: ["자료", "오늘"], drop: [], maskable: true },
  { id: "ok-3", level: "STRONG", text: "저는 3시 이후로 부탁드려요, 알바 있어서", keep: ["3시"], drop: [], maskable: true },
  { id: "ok-4", level: "NORMAL", text: "PPT 초안은 제가 오늘 밤에 정리할게요", keep: ["PPT"], drop: [], maskable: true },
  { id: "ok-5", level: "STRONG", text: "회의록은 내가 정리할 테니까 다들，各自 파트만 확인해줘", keep: ["회의록"], drop: [], maskable: true },
  { id: "ok-6", level: "NORMAL", text: "오늘 difficulties 많았는데 내일은 좀 나을 것 같아", keep: ["오늘", "내일"], drop: [], maskable: true },

  /* ── 짜증: 감정 표현은 남겨도 된다 ─────────────────────────── */
  { id: "mad-1", level: "NORMAL", text: "나 진짜 이거 혼자 다 하면 짜증나 죽겠어", keep: ["짜증"], drop: [], maskable: true },
  { id: "mad-2", level: "STRONG", text: "솔직히 지금 이 속도면 마감 못 맞춰", keep: ["마감"], drop: [], maskable: true },
  { id: "mad-3", level: "NORMAL", text: "진짜 이해가 안 돼, 왜 그렇게 되는지", keep: [], drop: [], maskable: true },

  /* ── 비꼼: 욕설은 없지만 조롱이 있다 ───────────────────────── */
  { id: "sar-1", level: "NORMAL", text: "역시 대충이네 ㅋㅋ 처음부터 다 버려라", keep: [], drop: ["ㅋㅋ", "대충이네", "버려라"], maskable: true },
  { id: "sar-2", level: "NORMAL", text: "우리 팀 분위기 진짜 좋다 ㅋㅋ", keep: [], drop: ["ㅋㅋ"], maskable: true },
  { id: "sar-3", level: "STRONG", text: "역시 대충이네 기대 안 한다 진짜", keep: [], drop: ["대충이네", "기대 안 된다"], maskable: true },

  /* ── 책임 추궁: 상대에게 미는 말 ───────────────────────────── */
  { id: "bl-1", level: "NORMAL", text: "다 니 탓인데 자료는 언제까지야", keep: ["자료"], drop: ["니 탓"], maskable: true },
  { id: "bl-2", level: "STRONG", text: "너 때문에 일이 다 꼬였잖아 나만 손해야", keep: [], drop: ["너 때문에"], maskable: true },
  { id: "bl-3", level: "NORMAL", text: "다 네가 한 거잖아 왜 나한테 물어봐", keep: [], drop: ["다 네가", "네가 한 거"], maskable: true },

  /* ── 욕설: AI 가 가장 자주 거절한다 ───────────────────────── */
  { id: "pr-1", level: "NORMAL", text: "야 씨발 진짜 왜 이래 좀비처럼", keep: [], drop: ["씨발", "좀비"], maskable: true },
  { id: "pr-2", level: "LIGHT", text: "씨발 이것도 안 했어?", keep: ["이것도"], drop: ["씨발"], maskable: true },
  { id: "pr-3", level: "NORMAL", text: "야 바보같이 그걸 왜 아직 안 올려", keep: [], drop: ["바보"], maskable: true },
  { id: "pr-4", level: "NORMAL", text: "씨발암호를 이거 모를 것 같아?", keep: ["암호"], drop: ["씨발", "씨박"], maskable: true },

  /* ── 강한 공격: 사람이 상처받는 자리 ───────────────────────── */
  { id: "hv-1", level: "STRONG", text: "너 진짜 바보같이 말하네 ㅋㅋ 내일 자료는 니가 알아서 해", keep: ["내일", "자료"], drop: ["바보", "ㅋㅋ"], maskable: true },
  { id: "hv-2", level: "STRONG", text: "닫아라 닫아라 다 니 탓이야 진짜 한 명만 빼고 다 바보 같아", keep: [], drop: ["니 탓", "바보"], maskable: true },
  { id: "hv-3", level: "NORMAL", text: "진짜 한심해, 너네가 뭘 한 건지도 모르겠어", keep: [], drop: ["한심"], maskable: true },
  { id: "hv-4", level: "STRONG", text: "조용히 해 닥쳐, 네가 말할 자격이 있어?", keep: [], drop: ["닥쳐", "조용히 해"], maskable: true },

  /* ── 가림으로 덮이지 않는 조용한 공격 ────────────────────────
     욕설이 없어 **규칙 가림이 걸리지 않는다**(`maskable: false`). 순화가 실패하면
     원문이 그대로 보인다 — 그래서 AI 가 일을 해야 하는 자리다. */
  { id: "qm-1", level: "NORMAL", text: "그냥 네가 알아서 해, 나는 더 이상 신경 안 써", keep: [], drop: [], maskable: false },
  { id: "qm-2", level: "STRONG", text: "네 마음대로 해, 어차피 맘대로일 테니까", keep: [], drop: [], maskable: false },
  { id: "qm-3", level: "NORMAL", text: "진짜 되긴 하겠어? 되겠지 ㅋ", keep: [], drop: [], maskable: false },
];

/** 코퍼스 안의 특정 단계만. */
export function corpusFor(level?: CorpusCase["level"]): CorpusCase[] {
  return level ? CUSHION_CORPUS.filter((c) => c.level === level) : CUSHION_CORPUS;
}

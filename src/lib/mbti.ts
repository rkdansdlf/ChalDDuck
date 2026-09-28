/** MBTI 4축과 16유형 — 온보딩 03·04 화면이 공유하는 정의. */

export const MBTI_AXES = ["EI", "SN", "TF", "JP"] as const;

/** `MBTI_AXES` 의 원소 타입. 문항이 어느 축인지 나타낼 때 쓴다. */
export type MbtiAxis = (typeof MBTI_AXES)[number];

/** 4×4 그리드 배열 그대로. 03 화면의 표시 순서이기도 하다. */
export const MBTI_GRID = [
  ["ISTJ", "ISFJ", "INFJ", "INTJ"],
  ["ISTP", "ISFP", "INFP", "INTP"],
  ["ESTP", "ESFP", "ENFP", "ENTP"],
  ["ESTJ", "ESFJ", "ENFJ", "ENTJ"],
] as const;

export const MBTI_TYPES = MBTI_GRID.flat();
export type MbtiType = (typeof MBTI_TYPES)[number];

export function isMbtiType(value: unknown): value is MbtiType {
  return typeof value === "string" && (MBTI_TYPES as readonly string[]).includes(value);
}

/** 캐릭터 이미지 경로 — 16종은 `public/assets/characters/` 에 유형명으로 들어 있다. */
export function characterImage(mbti: MbtiType): string {
  return `/assets/characters/${mbti}.png`;
}

/** 16종 MBTI별 캐릭터 메타데이터 및 팀플 성향 정의 */
export type MbtiMeta = {
  type: MbtiType;
  /** 캐릭터 고유 이름 */
  characterName: string;
  /** 한 줄 수식어 */
  shortDesc: string;
  /** 팀플 대표 키워드 3개 */
  keywords: [string, string, string];
  /** 팀플에서의 강점 및 스타일 */
  teamplayStyle: string;
  /** 함께 일할 때 소통 꿀팁 */
  communicationTip: {
    good: string;
    caution: string;
  };
};

export const MBTI_METAS: Record<MbtiType, MbtiMeta> = {
  ISTJ: {
    type: "ISTJ",
    characterName: "신중한 계획러 찰떡이",
    shortDesc: "일정과 마감을 빈틈없이 지키는 꼼꼼한 정리왕",
    keywords: ["마감 엄수", "자료 체계화", "신뢰성"],
    teamplayStyle: "정해진 일정과 양식을 정확히 지키며, 맡은 파트를 묵묵하고 완벽하게 완수합니다.",
    communicationTip: {
      good: "회의 안건과 일정을 명확하고 구체적인 수치로 공유해 주세요.",
      caution: "갑작스러운 계획 변경이나 모호한 역할 분담은 스트레스가 될 수 있어요.",
    },
  },
  ISFJ: {
    type: "ISFJ",
    characterName: "든든한 서포터 찰떡이",
    shortDesc: "팀원들을 묵묵히 챙겨주는 세심한 배려왕",
    keywords: ["세심한 배려", "책임감", "화합"],
    teamplayStyle: "팀 전체가 놓칠 수 있는 디테일을 챙기고, 보이지 않는 곳에서 팀원을 돕습니다.",
    communicationTip: {
      good: "고마운 마음을 말로 표현해 주시고, 편안한 톤으로 피드백을 나눠주세요.",
      caution: "부탁을 쉽게 거절하지 못하니 업무량이 몰리지 않도록 신경 써주세요.",
    },
  },
  INFJ: {
    type: "INFJ",
    characterName: "통찰력 있는 조언가 찰떡이",
    shortDesc: "팀의 의미와 방향을 밝혀주는 지혜로운 나침반",
    keywords: ["본질 탐구", "경청과 통찰", "진정성"],
    teamplayStyle: "과제의 본질적인 목적과 팀의 장기적 방향성을 깊이 고민하고 길을 제시합니다.",
    communicationTip: {
      good: "의견을 낼 때 충분히 생각할 시간을 주시고, 아이디어의 깊이를 인정해 주세요.",
      caution: "갈등 상황에서 겉으로 내색하지 않고 혼자 삭힐 수 있으니 먼저 말을 건네보세요.",
    },
  },
  INTJ: {
    type: "INTJ",
    characterName: "전략적인 설계자 찰떡이",
    shortDesc: "최적의 경로와 로드맵을 그려내는 브레인",
    keywords: ["전략 로드맵", "효율 극대화", "논리 분석"],
    teamplayStyle: "비효율을 제거하고 목표 달성을 위한 최선의 전략과 체계를 설계합니다.",
    communicationTip: {
      good: "주장의 근거와 논리를 명확히 제시하고 결론부터 간결하게 전달해 주세요.",
      caution: "감정적인 호소나 근거 없는 비판보다는 객관적 팩트로 대화해 주세요.",
    },
  },
  ISTP: {
    type: "ISTP",
    characterName: "실용적인 해결사 찰떡이",
    shortDesc: "문제가 터지면 침착하게 풀어내는 만능 열쇠",
    keywords: ["위기 해결", "군더더기 없는 실무", "침착함"],
    teamplayStyle: "불필요한 군더더기 없이 실질적인 결과물을 효율적으로 빠르게 만들어냅니다.",
    communicationTip: {
      good: "핵심만 간결하게 이야기하고, 개인 집중 작업을 방해하지 않는 것이 좋아요.",
      caution: "형식적인 긴 회의나 감정 섞인 긴 텍스트는 집중력을 흐릴 수 있어요.",
    },
  },
  ISFP: {
    type: "ISFP",
    characterName: "따뜻한 조화주의자 찰떡이",
    shortDesc: "팀 분위기를 부드럽게 감싸주는 센스쟁이",
    keywords: ["유연한 감각", "따뜻한 공감", "미적 감각"],
    teamplayStyle: "자신의 역할에 정성을 다하며, 시각 자료나 발표물에 세련된 센스를 발휘합니다.",
    communicationTip: {
      good: "칭찬과 부드러운 말투로 다가가고, 자율적인 작업 방식을 존중해 주세요.",
      caution: "직설적이거나 공격적인 피드백에는 크게 위축될 수 있어요.",
    },
  },
  INFP: {
    type: "INFP",
    characterName: "열정적인 아이디어뱅크 찰떡이",
    shortDesc: "팀에 영감과 독창성을 불어넣는 따스한 영혼",
    keywords: ["창의적 발상", "진심 어린 공감", "가치 지향"],
    teamplayStyle: "남들이 생각지 못한 참신한 관점을 제시하고, 팀의 따뜻한 유대감을 중시합니다.",
    communicationTip: {
      good: "아이디어를 긍정적으로 수용해 주시고, 가치와 노력을 진심으로 알아봐 주세요.",
      caution: "지나치게 딱딱한 규격이나 차가운 비판은 의욕을 떨어뜨릴 수 있어요.",
    },
  },
  INTP: {
    type: "INTP",
    characterName: "호기심 많은 분석가 찰떡이",
    shortDesc: "오류를 찾아내고 원리를 파고드는 지식 탐험가",
    keywords: ["심층 분석", "논리적 검증", "독창적 통찰"],
    teamplayStyle: "논리적 빈틈을 예리하게 검증하고, 복잡한 이론이나 배경 조사를 깊이 있게 파고듭니다.",
    communicationTip: {
      good: "논리적인 반론을 즐기니 지적 토론으로 다가가고, 충분한 탐구 시간을 보장해 주세요.",
      caution: "상투적이거나 규정만을 앞세운 설명은 설득하기 어려워요.",
    },
  },
  ESTP: {
    type: "ESTP",
    characterName: "활동적인 행동대장 찰떡이",
    shortDesc: "고민보다 빠른 실행으로 팀을 전진시키는 엔진",
    keywords: ["즉각적 실행", "순발력", "유쾌한 에너지"],
    teamplayStyle: "복잡한 회의보다 직접 부딪혀 실행하며, 막힌 문제를 시원시원하게 뚫어냅니다.",
    communicationTip: {
      good: "핵심 요점만 빠르게 전달하고, 실천 가능한 구체적 행동으로 이야기해 주세요.",
      caution: "장황한 이론 설명이나 늘어지는 회의는 지루해할 수 있어요.",
    },
  },
  ESFP: {
    type: "ESFP",
    characterName: "분위기 메이커 찰떡이",
    shortDesc: "지친 팀에 유쾌한 활력과 웃음을 주는 비타민",
    keywords: ["친화력", "긍정적 활력", "순발력"],
    teamplayStyle: "친근한 분위기로 팀의 사기를 높이고, 협업 과정 자체를 즐겁게 만듭니다.",
    communicationTip: {
      good: "적극적으로 리액션해 주시고, 칭찬과 활기찬 소통으로 함께해 주세요.",
      caution: "혼자만의 무거운 부담을 지우기보다 함께 으쌰으쌰하는 환경이 필요해요.",
    },
  },
  ENFP: {
    type: "ENFP",
    characterName: "반짝이는 스파크 찰떡이",
    shortDesc: "지치지 않는 열정으로 새 가능성을 여는 탐험가",
    keywords: ["폭발적 아이디어", "열정적 동기", "새로운 시도"],
    teamplayStyle: "팀의 브레인스토밍을 이끌며, 신선한 기획과 열정으로 팀에 활력을 줍니다.",
    communicationTip: {
      good: "새로운 발상을 적극 환영해 주시고, 마감과 세부 일정은 중간중간 부드럽게 점검해 주세요.",
      caution: "틀에 박힌 규칙이나 일방적인 통보는 창의성을 꺾을 수 있어요.",
    },
  },
  ENTP: {
    type: "ENTP",
    characterName: "창의적인 변론가 찰떡이",
    shortDesc: "색다른 관점과 유쾌한 질문으로 혁신을 만드는 전략가",
    keywords: ["도전적 발상", "다각도 시각", "토론의 달인"],
    teamplayStyle: "기존의 틀을 깨는 차별화된 아이디어를 던지고, 팀의 논리를 더욱 견고하게 단련시킵니다.",
    communicationTip: {
      good: "흥미로운 토론이나 색다른 시도를 열린 마음으로 받아들여 주세요.",
      caution: "논쟁 그 자체를 즐길 뿐 악의가 없으니 감정적으로 받아들이지 마세요.",
    },
  },
  ESTJ: {
    type: "ESTJ",
    characterName: "빈틈없는 리더 찰떡이",
    shortDesc: "명확한 추진력으로 목표까지 직진하는 총괄 사령탑",
    keywords: ["명확한 목표", "추진력", "체계적 관리"],
    teamplayStyle: "역할과 마감을 명확히 분배하고 일정을 단단하게 관리하여 목표를 완수합니다.",
    communicationTip: {
      good: "진행 상황을 투명하게 정기적으로 공유하고, 약속한 마감을 꼭 지켜주세요.",
      caution: "변명이나 모호한 진행 상황 보고는 신뢰를 떨어뜨릴 수 있어요.",
    },
  },
  ESFJ: {
    type: "ESFJ",
    characterName: "다정한 친선도모 찰떡이",
    shortDesc: "모두가 하나 되도록 따뜻하게 이끄는 팀의 중심",
    keywords: ["화합과 협동", "적극적 소통", "다정한 챙김"],
    teamplayStyle: "팀원 간 소통을 매끄럽게 연결하고, 모두가 소외되지 않도록 세심하게 돕습니다.",
    communicationTip: {
      good: "다정한 감사 표현과 격려를 아끼지 마시고, 소통에 적극적으로 응답해 주세요.",
      caution: "팀 내 불화나 냉랭한 반응에 크게 마음을 다칠 수 있으니 존중을 보여주세요.",
    },
  },
  ENFJ: {
    type: "ENFJ",
    characterName: "열정적인 동기부여가 찰떡이",
    shortDesc: "팀원의 잠재력을 끌어내고 사기를 북돋우는 캡틴",
    keywords: ["동기부여", "팀 시너지", "공감 리더십"],
    teamplayStyle: "팀원들의 의견을 조화롭게 모으고, 모두가 보람을 느끼도록 이끌어냅니다.",
    communicationTip: {
      good: "팀을 위한 헌신을 인정해 주시고, 긍정적인 피드백으로 힘을 실어주세요.",
      caution: "타인을 챙기느라 정작 자신의 피로를 놓칠 수 있으니 먼저 휴식을 권해주세요.",
    },
  },
  ENTJ: {
    type: "ENTJ",
    characterName: "대담한 전략가 찰떡이",
    shortDesc: "거침없는 결단과 비전으로 최상의 결과를 이끄는 지휘관",
    keywords: ["과감한 결단", "비전 제시", "탁월한 완성도"],
    teamplayStyle: "큰 그림을 보며 과감하게 결단을 내리고, 팀의 완성도를 최상으로 끌어올립니다.",
    communicationTip: {
      good: "명확한 결과물과 전략적 대안을 중심으로 대화하고, 피드백을 직설적으로 나눠도 좋아요.",
      caution: "비효율이나 불필요한 지연에는 단호하므로 사전 조율이 중요해요.",
    },
  },
};

/** 특정 MBTI의 메타데이터 조회 */
export function getMbtiMeta(mbti: MbtiType | null | undefined): MbtiMeta | null {
  if (!mbti || !isMbtiType(mbti)) return null;
  return MBTI_METAS[mbti];
}

/** 팀 MBTI 4축 분포 통계 */
export type TeamMbtiStats = {
  total: number;
  withMbti: number;
  withoutMbti: number;
  axes: {
    ei: { e: number; i: number; ratioE: number };
    sn: { s: number; n: number; ratioS: number };
    tf: { t: number; f: number; ratioT: number };
    jp: { j: number; p: number; ratioJ: number };
  };
  dominantSummary: string;
  collaborationTips: string[];
};

/** 팀원 목록을 기반으로 MBTI 축별 통계 및 소통 조언 산출 */
export function calculateTeamMbtiStats(mbtiList: (MbtiType | null | undefined)[]): TeamMbtiStats {
  const valid = mbtiList.filter((m): m is MbtiType => isMbtiType(m));
  const total = mbtiList.length;
  const count = valid.length;

  let e = 0, i = 0;
  let s = 0, n = 0;
  let t = 0, f = 0;
  let j = 0, p = 0;

  for (const item of valid) {
    if (item[0] === "E") e++; else i++;
    if (item[1] === "S") s++; else n++;
    if (item[2] === "T") t++; else f++;
    if (item[3] === "J") j++; else p++;
  }

  const ratioE = count > 0 ? Math.round((e / count) * 100) : 50;
  const ratioI = 100 - ratioE;
  const ratioS = count > 0 ? Math.round((s / count) * 100) : 50;
  /// 아래 `summaryParts` 의 S/N 구절이 **이 값부터** 본다 — E/I 도 `ratioI` 를 먼저 보므로
  /// 짝을 이룬다. 여기를 지우면 S/N 은(summary 문장에서) 조용히 사라진다.
  const ratioN = 100 - ratioS;
  const ratioT = count > 0 ? Math.round((t / count) * 100) : 50;
  const ratioF = 100 - ratioT;
  const ratioJ = count > 0 ? Math.round((j / count) * 100) : 50;
  const ratioP = 100 - ratioJ;

  // 팀 분위기 요약 산출
  const dominantAxes: string[] = [];
  if (count > 0) {
    dominantAxes.push(ratioE >= 55 ? "활발한 외향(E)" : ratioE <= 45 ? "차분한 내향(I)" : "균형 잡힌 소통(E/I)");
    dominantAxes.push(ratioS >= 55 ? "현실적 팩트(S)" : ratioS <= 45 ? "아이디어 탐구(N)" : "현실과 창의 조화(S/N)");
    dominantAxes.push(ratioT >= 55 ? "논리적 완성도(T)" : ratioT <= 45 ? "공감과 유대(F)" : "논리와 배려 균형(T/F)");
    dominantAxes.push(ratioJ >= 55 ? "철저한 계획형(J)" : ratioJ <= 45 ? "유연한 실행형(P)" : "계획과 유연성 조화(J/P)");
  }

  let dominantSummary = "아직 MBTI를 등록한 팀원이 적어 성향 분석을 모으는 중입니다.";
  const collaborationTips: string[] = [];

  if (count > 0) {
    const summaryParts: string[] = [];
    if (ratioI > 55) {
      summaryParts.push("차분하게 텍스트로 생각을 정리하는 분위기");
      collaborationTips.push("회의 전 안건을 미리 공유해 충분히 생각할 시간을 주면 좋은 의견이 많이 나와요.");
    } else if (ratioE > 55) {
      summaryParts.push("대화와 아이디어 교환이 빠르고 활기찬 분위기");
      collaborationTips.push("대화로 나온 다양한 의견 중 핵심 액션 아이템을 바로 서기로 기록해 두세요.");
    } else {
      summaryParts.push("대면 소통과 텍스트 소통의 균형이 좋은 분위기");
    }

    if (ratioN > 55) {
      summaryParts.push("가능성을 먼저 펼쳐 보고 새 아이디어를 탐구하는 분위기");
      collaborationTips.push("안건마다 '왜'와 '대안은 무엇인지'를 한 줄 먼저 적어 주면 아이디어가 더 쉽게 나와요.");
    } else if (ratioS > 55) {
      summaryParts.push("검증된 근거를 하나씩 확인하며 나아가는 분위기");
      collaborationTips.push("안건마다 참고할 사례나 숫자를 미리 붙여 주면 판단이 훨씬 빨라져요.");
    }

    if (ratioJ > 55) {
      summaryParts.push("마감 일정과 순서를 중시하는 팀");
      collaborationTips.push("마감 2~3일 전 중간 점검 일정을 두면 팀 전체가 편안하게 작업할 수 있어요.");
    } else if (ratioP > 55) {
      summaryParts.push("상황에 따라 유연하게 결과물을 발전시키는 팀");
      collaborationTips.push("최종 제출 마감 시각만 확실하게 약속하고 중간 단계는 유연하게 진행해 보세요.");
    }

    if (ratioT > 55) {
      collaborationTips.push("피드백 시 논리적 근거를 바탕으로 하되, 쿠션어를 곁들이면 완성도가 더 높아져요.");
    } else if (ratioF > 55) {
      collaborationTips.push("서로 칭찬과 리액션을 아끼지 않을 때 시너지가 배가되는 팀이에요.");
    }

    dominantSummary = summaryParts.join(", ") + "입니다.";
  }

  return {
    total,
    withMbti: count,
    withoutMbti: total - count,
    axes: {
      ei: { e, i, ratioE },
      sn: { s, n, ratioS },
      tf: { t, f, ratioT },
      jp: { j, p, ratioJ },
    },
    dominantSummary,
    collaborationTips: collaborationTips.length > 0 ? collaborationTips : ["팀원들과 대화를 나누며 서로의 협업 스타일을 맞춰가 보세요."],
  };
}

/** 두 MBTI 사이의 소통 시너지 및 협업 팁 */
export type MbtiSynergy = {
  score: number; // 3~5
  title: string;
  tip: string;
};

export function getMbtiSynergy(a: MbtiType | null | undefined, b: MbtiType | null | undefined): MbtiSynergy {
  if (!a || !b || !isMbtiType(a) || !isMbtiType(b)) {
    return {
      score: 3,
      title: "서로 알아가는 중",
      tip: "대화를 나누며 나만의 소통 방식을 편안하게 공유해 보세요.",
    };
  }

  if (a === b) {
    return {
      score: 5,
      title: "척하면 척! 찰떡 동반자",
      tip: "일하는 방식과 소통 리듬이 매우 비슷해 별다른 설명 없이도 편하게 협업할 수 있어요.",
    };
  }

  // 상호보완 분석
  const diffs = [a[0] !== b[0], a[1] !== b[1], a[2] !== b[2], a[3] !== b[3]].filter(Boolean).length;
  
  if (diffs === 1) {
    return {
      score: 5,
      title: "최상의 호흡과 시너지",
      tip: "기본적인 파장이 잘 맞으면서도 한 축의 차이가 서로의 사각지대를 완벽히 보완해 줍니다.",
    };
  } else if (diffs === 2) {
    return {
      score: 4,
      title: "든든한 상호보완 콤비",
      tip: "각자의 강점이 뚜렷해 역할을 나누어 작업하면 매우 높은 퀄리티의 결과물을 낼 수 있어요.",
    };
  } else if (diffs === 3) {
    return {
      score: 4,
      title: "새로운 시야를 여는 파트너",
      tip: "서로 다른 관점으로 접근하기 때문에 회의할 때 신선한 아이디어가 많이 발굴됩니다.",
    };
  } else {
    // 4축 모두 반대 (예: INTJ vs ESFP)
    return {
      score: 4,
      title: "극과 극의 완벽한 조화",
      tip: "완전히 다른 렌즈로 과제를 바라보므로, 역할을 확실히 나누어 협력하면 무적의 팀이 됩니다.",
    };
  }
}

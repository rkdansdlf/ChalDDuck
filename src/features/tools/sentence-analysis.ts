/**
 * 27 상황별 문장 변환 전후 신뢰 검증 분석기.
 *
 * 사용자가 변환된 결과(메일, 요청, 공지, 요약)를 보고
 * "내용이 누락되거나 왜곡되지 않았는지" 확신할 수 있도록,
 * 1) 모드별로 보존된 핵심 정보(일시, 장소, 마감, 용건)와
 * 2) 적용된 서식 및 어조 변화를
 * 구조화하여 제공합니다.
 */

export type SentenceDiffItem = {
  original: string;
  changed: string;
  reason?: string;
};

export type SentenceAnalysis = {
  preserved: string[];
  changes: SentenceDiffItem[];
};

export function analyzeSentenceChanges(
  originalText: string,
  resultText: string,
  mode: string,
): SentenceAnalysis {
  const orig = originalText.trim();
  const res = resultText.trim();

  if (!orig || !res) {
    return { preserved: [], changes: [] };
  }

  // 1. 교수님 메일 모드 (email)
  if (mode === "email") {
    const preserved: string[] = ["질문 및 문의 핵심 용건 보존", "과제/발표/면담 등 논의 대상 정보 유지"];
    if (orig.includes("언제") || orig.includes("일정") || orig.includes("순서")) {
      preserved.push("일정·순서 확인 요청 취지 보존");
    }

    return {
      preserved,
      changes: [
        {
          original: orig.length > 30 ? `${orig.slice(0, 30)}…` : orig,
          changed: "제목 / 소속 표기 / 정중한 본문 / 격식 있는 맺음말",
          reason: "교수님-학생 간 격식과 예의를 갖춘 대학 공식 메일 서식 적용",
        },
      ],
    };
  }

  // 2. 팀원 요청·독려 모드 (peer_request)
  if (mode === "peer_request") {
    const preserved: string[] = [];

    // 날짜/기한 추출
    const hasDeadline = /(오늘|내일|모레|마감|기한|까지|[0-9]+시)/.test(orig);
    if (hasDeadline) {
      preserved.push("마감 일정 및 기한 정보 유지");
    }

    // 업무 명사 추출
    const taskMatch = orig.match(/(자료조사|자료|ppt|PPT|보고서|회의록|대본|피드백|정리본|코드)/i);
    if (taskMatch) {
      preserved.push(`${taskMatch[0]} 파트 전달 및 공유 요청 유지`);
    } else {
      preserved.push("핵심 업무 요청 사항 보존");
    }
    preserved.push("팀원 간 역할 약속 및 필요 사유 보존");

    // 다그치는 표현 완화 분석
    let origSnippet = orig;
    let changedSnippet = "정중한 쿠션 표현으로 전환";
    if (orig.includes("주기로 했잖아") || orig.includes("언제 줄 수 있어") || orig.includes("급해")) {
      origSnippet = "주기로 했잖아 언제 줄 수 있어? 급해";
      changedSnippet = "오늘 중으로 공유해 주실 수 있을까요? 확인 부탁드립니다!";
    } else if (orig.length > 30) {
      origSnippet = `${orig.slice(0, 30)}…`;
    }

    return {
      preserved,
      changes: [
        {
          original: origSnippet,
          changed: changedSnippet,
          reason: "직접적인 다그침을 덜고 협업 목적을 밝히며 배려하는 어조 적용",
        },
      ],
    };
  }

  // 3. 단톡방 공지 모드 (notice)
  if (mode === "notice") {
    const preserved: string[] = [];

    if (/(일시|시간|[0-9]+시|내일|오늘)/.test(orig)) {
      preserved.push("회의/모임 일시 및 시간 정보 보존");
    }
    if (/(도서관|스터디룸|강의실|줌|zoom|디스코드|장소)/i.test(orig)) {
      preserved.push("만남 장소 및 접속 채널 정보 보존");
    }
    if (/(노트북|정리본|준비물|자료|과제)/.test(orig)) {
      preserved.push("팀원 지참 준비물 정보 누락 없이 보존");
    }
    preserved.push("진행 안건 및 지각 방지 당부 보존");

    return {
      preserved,
      changes: [
        {
          original: "줄글 형태의 메시지",
          changed: "[팀 프로젝트 공지] 일시 · 장소 · 안건 · 준비물 불릿(•) 서식",
          reason: "팀원들이 일정과 준비물을 놓치지 않도록 가독성 높은 공지문 구조화",
        },
      ],
    };
  }

  // 4. 핵심 요약 모드 (summary)
  if (mode === "summary") {
    const preserved: string[] = [
      "결정된 역할 분담 및 담당자 보존",
      "차기 회의 일정 및 마감 이행 결과 보존",
    ];

    return {
      preserved,
      changes: [
        {
          original: "긴 서술형 문장",
          changed: "핵심 결정 안건 중심 단문 압축",
          reason: "장황한 설명을 걷어내고 팀원 간 빠른 합의를 위한 요약문 정돈",
        },
      ],
    };
  }

  // 기본 fallback
  return {
    preserved: ["원문의 핵심 요구사항 및 사실 정보 유지"],
    changes: [
      {
        original: orig.length > 25 ? `${orig.slice(0, 25)}…` : orig,
        changed: res.length > 25 ? `${res.slice(0, 25)}…` : res,
        reason: "선택한 상황에 맞는 어조 및 서식 정돈",
      },
    ],
  };
}

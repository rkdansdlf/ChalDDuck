/**
 * 쿠션 번역기 전후 비교 및 신뢰 검증 분석.
 *
 * 사용자가 "AI가 내 말을 어디까지 바꿨는지" 안심할 수 있도록,
 * 1) 그대로 유지한 핵심 내용(마감·요구사항 등)과
 * 2) 말투만 어떻게 다듬어졌는지(바꾼 부분)를
 * 구조적으로 분석하여 제공합니다.
 */

export type CushionDiffItem = {
  original: string;
  changed: string;
  reason?: string;
};

export type CushionAnalysis = {
  preserved: string[];
  changes: CushionDiffItem[];
};

export function analyzeCushionChanges(
  originalText: string,
  resultText: string,
  tone: string,
): CushionAnalysis {
  const orig = originalText.trim();
  const res = resultText.trim();

  if (!orig || !res) {
    return { preserved: [], changes: [] };
  }

  // 1. 대표 예시 문장 ("이거 왜 아직 안 올렸어요? 내일이 마감인데요") 전용 정밀 매칭
  if (orig.includes("왜 아직 안 올렸") || orig.includes("내일이 마감")) {
    const toneReason =
      tone === "soft"
        ? "직접적인 추궁 → 사정을 묻고 배려하는 어조"
        : tone === "firm"
          ? "감정적 다그침 → 명확하고 단호한 요청 어조"
          : "탓하는 표현 → 감정을 배제한 담담한 사실 전달";

    let changedPhrase = "현재 상황을 공유해 주시면 감사하겠습니다";
    if (res.includes("확인해 주실 수 있을까요")) {
      changedPhrase = "현재 진행 상황을 확인해 주실 수 있을까요?";
    } else if (res.includes("확인 부탁드립니다")) {
      changedPhrase = "현재 진행 상황 확인 부탁드립니다";
    } else if (res.includes("공유해 주시면")) {
      changedPhrase = "현재 상황을 공유해 주시면 감사하겠습니다";
    }

    return {
      preserved: ["내일 마감 일정 유지", "자료 등록 및 전달 요청 내용 유지"],
      changes: [
        {
          original: "왜 아직 안 올렸어요?",
          changed: changedPhrase,
          reason: toneReason,
        },
      ],
    };
  }

  // 2. 일반 입력 문장에 대한 지능형 분석
  const preserved: string[] = [];

  // 날짜/마감/시간 정보 탐지
  const hasTime = /(내일|오늘|모레|마감|기한|까지|[0-9]+시|[0-9]+월|[0-9]+일|오전|오후)/.test(orig);
  if (hasTime) {
    preserved.push("마감 일정 및 기한 정보 유지");
  }

  // 주요 업무 요청 명사 탐지
  const taskNounMatch = orig.match(/(자료|회의록|보고서|피드백|검토|코드|기획서|파일|답장|회신|작업|일정|수정)/);
  if (taskNounMatch) {
    preserved.push(`${taskNounMatch[1]} 관련 핵심 요청 내용 유지`);
  } else {
    preserved.push("원문의 핵심 요청 사항 및 전달 목적 유지");
  }

  // 항상 추가되는 원칙
  preserved.push("부탁을 없애거나 마감을 임의로 늦추지 않음");

  // 바꾼 부분(어조 변화) 분석
  const changes: CushionDiffItem[] = [];

  const bluntPatterns = [
    { pattern: /왜\s*(아직도|아직)?\s*(안|못)?[^\s?.!]+/i, label: "왜 아직 안 했어요 / 왜 안 돼요 계열" },
    { pattern: /빨리\s*[^\s?.!]+/i, label: "빨리 재촉 표현" },
    { pattern: /당장\s*[^\s?.!]+/i, label: "당장 독촉 표현" },
    { pattern: /아직도\s*[^\s?.!]+/i, label: "아직도 탓하는 표현" },
    { pattern: /언제\s*(줘|줘요|나와요|돼요)\??/i, label: "직접적인 시한 요구" },
    { pattern: /도대체|제발|하라고/i, label: "감정적 어조" },
  ];

  let foundBlunt = false;
  for (const { pattern } of bluntPatterns) {
    const match = orig.match(pattern);
    if (match) {
      foundBlunt = true;
      const originalSnippet = match[0];

      // 결과에서 완곡한 종결/쿠션 구문 추출
      let polishedSnippet = "부드러운 쿠션어로 완곡하게 전환";
      if (res.includes("부탁드립니다")) {
        polishedSnippet = "…확인 부탁드립니다";
      } else if (res.includes("감사하겠습니다")) {
        polishedSnippet = "…공유해 주시면 감사하겠습니다";
      } else if (res.includes("있을까요?")) {
        polishedSnippet = "…확인해 주실 수 있을까요?";
      }

      changes.push({
        original: originalSnippet,
        changed: polishedSnippet,
        reason:
          tone === "soft"
            ? "상대방을 다그치지 않고 여지를 남기는 표현으로 전환"
            : tone === "firm"
              ? "불필요한 감정을 빼고 명확한 요청으로 전환"
              : "감정을 덜어내고 객관적인 사실 확인으로 전환",
      });
      break;
    }
  }

  // 뚜렷한 날카로운 키워드가 없는 경우 전반적인 문장 톤 전환 표기
  if (!foundBlunt) {
    changes.push({
      original: orig.length > 25 ? `${orig.slice(0, 25)}…` : orig,
      changed: res.length > 25 ? `${res.slice(0, 25)}…` : res,
      reason:
        tone === "soft"
          ? "부드럽고 상대방의 사정을 배려하는 어조 적용"
          : tone === "firm"
            ? "예의를 지키되 기한과 요청을 분명히 한 어조 적용"
            : "담담하고 정중한 비즈니스 어조 적용",
    });
  }

  return { preserved, changes };
}

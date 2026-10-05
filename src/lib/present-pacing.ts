/**
 * 26 발표 지원 — 발표 소요 시간 및 페이싱(Pacing) 유틸리티.
 *
 * 대학생 발표의 가장 큰 페인포인트 중 하나는 "제한 시간 초과로 인한 감점"입니다.
 * 한국어 성인의 프레젠테이션 발화 속도(분당 320~350음절, 초당 약 5.5음절)를 기준으로
 * 대본의 예상 발표 소요 시간을 실시간 계산합니다.
 */

/** 초당 평균 발화 음절 수 (공백 제외 기준 약 330음절/분) */
export const SYLLABLES_PER_SECOND = 5.5;

/**
 * 대본의 예상 발화 소요 시간을 초 단위로 계산합니다.
 */
export function estimateSpeechSeconds(text: string): number {
  if (!text || !text.trim()) return 0;
  // 공백 및 줄바꿈을 제외한 실제 발화 글자(음절) 수 계산
  const syllableCount = text.replace(/\s+/g, "").length;
  if (syllableCount === 0) return 0;

  const seconds = Math.round(syllableCount / SYLLABLES_PER_SECOND);
  return Math.max(1, seconds);
}

/**
 * 초 단위 시간을 "약 3분 40초" 또는 "약 25초" 형태의 읽기 쉬운 문자열로 변환합니다.
 */
export function formatSpeechSeconds(seconds: number): string {
  if (seconds <= 0) return "0초";

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (mins === 0) {
    return `약 ${secs}초`;
  }
  if (secs === 0) {
    return `약 ${mins}분`;
  }
  return `약 ${mins}분 ${secs}초`;
}

/**
 * 대본의 글자 수(공백 포함), 음절 수(공백 제외), 예상 소요 시간 및 포맷팅된 문자열을 한 번에 반환합니다.
 */
export function getSpeechPacingInfo(text: string): {
  chars: number;
  syllables: number;
  seconds: number;
  formatted: string;
} {
  const trimmed = text.trim();
  const chars = text.length;
  const syllables = text.replace(/\s+/g, "").length;
  const seconds = estimateSpeechSeconds(trimmed);
  const formatted = formatSpeechSeconds(seconds);

  return {
    chars,
    syllables,
    seconds,
    formatted,
  };
}

/**
 * 채팅 메시지 표시용 욕설 순화.
 *
 * 원문은 그대로 저장·전달되고, 말풍선에 그릴 때만 이 함수를 거친다
 * (`src/features/chat/message-bubble.tsx`). 단어 목록 매칭이라 우회는
 * 쉽지만, 지연·비용 없이 가장 흔한 표현만 가려 준다.
 */

const PROFANITY_WORDS = [
  "씨발",
  "시발",
  "씨팔",
  "개새끼",
  "개새",
  "병신",
  "존나",
  "졸라",
  "지랄",
  "닥쳐",
  "꺼져",
  "미친놈",
  "미친년",
  "새끼",
  "썅",
];

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function softenProfanity(text: string): { text: string; masked: boolean } {
  let masked = false;
  let result = text;

  for (const word of PROFANITY_WORDS) {
    const pattern = new RegExp(escapeRegExp(word), "gi");
    if (pattern.test(result)) {
      masked = true;
      result = result.replace(pattern, (match) => "*".repeat(match.length));
    }
  }

  return { text: result, masked };
}

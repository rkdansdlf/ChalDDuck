/**
 * 채팅 메시지 표시용 욕설 순화.
 *
 * 원문은 그대로 저장·전달되고, 말풍선에 그릴 때만 이 함수를 거친다
 * (`src/features/chat/message-bubble.tsx`). 단어 목록 매칭이라 우회는
 * 쉽지만, 지연·비용 없이 가장 흔한 표현만 가려 준다.
 *
 * 한국어는 같은 글자가 욕도 되고 아니기도 한다 — "강아지 새끼", "시발점",
 * "허리띠를 졸라매다", "불이 꺼져 있다". 그래서 단어만 보지 않고 **앞뒤를 함께**
 * 본다. 애매하면 가리지 않는 쪽으로 둔다: 멀쩡한 말이 별표로 바뀌면 무슨 말을
 * 했는지 아예 읽을 수 없게 되지만, 욕 하나가 지나가는 것은 사람이 읽으면 된다.
 */

type Rule = {
  word: string;
  /** 앞이 이러면 욕이 아니다. 단어 **앞쪽 글자들**의 끝에 맞춰 본다. */
  benignBefore?: RegExp;
  /** 뒤가 이러면 욕이 아니다. 단어 **뒤쪽 글자들**의 처음에 맞춰 본다. */
  benignAfter?: RegExp;
};

/** 동물의 새끼는 욕이 아니다. 조사와 띄어쓰기는 건너뛴다. */
const ANIMAL =
  /(강아지|고양이|개|호랑이|사자|늑대|곰|돼지|소|말|새|오리|병아리|토끼|여우|고라니|펭귄|물고기)(의|가|는|이|을|를)?\s*$/;

/** 불·전원이 "꺼져" 있는 것은 욕이 아니다. */
const SWITCHED_OFF = /(불|불빛|전원|등|가로등|촛불|화면|라이트|모니터)(이|은|도|가|을|를)?\s*$/;

const RULES: Rule[] = [
  { word: "씨발" },
  { word: "씨팔" },
  // 시발점·시발역·시발지 — 출발한다는 뜻의 멀쩡한 말이다.
  { word: "시발", benignAfter: /^(점|역|지|탄|차)/ },
  { word: "개새끼" },
  { word: "개새" },
  { word: "병신" },
  { word: "존나" },
  // 허리띠를 졸라매다 / 졸라맨.
  { word: "졸라", benignAfter: /^(매|맨|맬|맵)/ },
  { word: "지랄" },
  // 닥쳐온 위기 / 곧 닥쳐올 마감.
  { word: "닥쳐", benignAfter: /^(온|올|오|와|왔)/ },
  { word: "꺼져", benignBefore: SWITCHED_OFF, benignAfter: /^\s*(있|버렸|버려|가고)/ },
  { word: "미친놈" },
  { word: "미친년" },
  { word: "새끼", benignBefore: ANIMAL },
  { word: "썅" },
];

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function softenProfanity(text: string): { text: string; masked: boolean } {
  const hits: Array<[start: number, end: number]> = [];

  for (const rule of RULES) {
    const pattern = new RegExp(escapeRegExp(rule.word), "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (rule.benignBefore?.test(text.slice(0, start))) continue;
      if (rule.benignAfter?.test(text.slice(end))) continue;
      hits.push([start, end]);
    }
  }

  if (hits.length === 0) return { text, masked: false };

  // 규칙끼리 겹친다("개새끼" 안에 "개새"와 "새끼"가 들어 있다). 겹친 구간을 합쳐
  // 한 번에 가려야 글자 수가 어긋나지 않는다.
  hits.sort((a, b) => a[0] - b[0]);

  let out = "";
  let cursor = 0;
  for (const [start, end] of hits) {
    if (end <= cursor) continue;
    const from = Math.max(start, cursor);
    out += text.slice(cursor, from) + "*".repeat(end - from);
    cursor = end;
  }

  return { text: out + text.slice(cursor), masked: true };
}

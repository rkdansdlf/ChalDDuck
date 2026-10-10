import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";

/**
 * AI 리서처 결과를 제출함에 넣을 PDF 로 만든다.
 *
 * ## 왜 글꼴을 넣는가
 *
 * PDF 의 표준 글꼴(Helvetica 등)은 라틴 문자만 갖고 있다. 한글을 그 글꼴로 적으면 바이트가
 * 그대로 다른 글자로 읽혀 `º·· Œ‚ ºfl‚„º` 처럼 깨진다 — 리서치 결과는 대부분 한국어라
 * 저장된 참고자료가 읽히지 않았다. 그래서 한글 글꼴을 **PDF 안에 서브셋으로 넣는다**(쓴 글자의
 * 글리프만 남긴다). 뷰어에 한글 글꼴이 없어도, 휴대폰 사파리의 내장 뷰어에서도 같게 보인다.
 *
 * 글꼴과 라이선스는 `./fonts/README.md`. 파일 하나(5.3MB)가 함수에 같이 실린다 —
 * `next.config.ts` 의 `outputFileTracingIncludes` 가 그것을 보장한다.
 *
 * ## 순수 함수로 둔 이유
 *
 * 저장소·DB·세션을 모른다. 하네스가 이 함수를 직접 불러 **파일 바이트를 읽어 보려고**다
 * (`scripts/harness/drive-save.mts`).
 */

export type ResearchDocInput = {
  title: string;
  source: string;
  snippet: string;
  url?: string | null;
  year?: string | null;
  citation?: string | null;
};

const FONT_FILE = "NotoSansKR-Regular-ko.ttf";

/**
 * 필드마다 상한. **정상 결과가 잘리지 않을 만큼 넉넉하게** 잡고, 서버 액션 입력이 비정상적으로
 * 커서 PDF 가 수백 쪽이 되는 것만 막는다. 넘으면 끝에 `…` 를 붙인다.
 */
const LIMITS = { title: 300, source: 300, citation: 2_000, url: 2_000, snippet: 30_000 } as const;

/* ── 쪽 구성 ───────────────────────────────────────────────── */

const PAGE_W = 595; // A4, pt
const PAGE_H = 842;
const MARGIN_X = 56;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 64;
const MEASURE = PAGE_W - MARGIN_X * 2;

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.38, 0.38, 0.42);
const RULE = rgb(0.82, 0.82, 0.85);

/* ── 글꼴 ──────────────────────────────────────────────────── */

let fontBytes: Promise<Buffer> | null = null;
let covered: Promise<Set<number>> | null = null;

/** 글꼴 파일은 인스턴스당 한 번만 읽는다(5MB). */
function loadFontBytes(): Promise<Buffer> {
  // 배포본에서도 프로젝트 루트가 cwd 다. 파일이 함수에 실리는지는 next.config.ts 가 보장한다.
  fontBytes ??= readFile(path.join(process.cwd(), "src/server/drive/fonts", FONT_FILE));
  return fontBytes;
}

/** 이 글꼴이 그릴 수 있는 글자. 없는 글자를 그대로 넘기면 빈 칸(.notdef)이 된다. */
function loadCovered(): Promise<Set<number>> {
  covered ??= loadFontBytes().then((bytes) => {
    const font = fontkit.create(bytes);
    return new Set<number>(font.characterSet);
  });
  return covered;
}

/* ── 글자 다듬기 ───────────────────────────────────────────── */

/**
 * 그릴 수 있는 글자만 남긴다.
 *
 * - NFC 로 합친다 — 글꼴에는 완성형 음절만 있고, 자모로 풀린(NFD) 한글은 낱자로 흩어진다.
 * - 줄바꿈 종류를 `\n` 하나로 맞추고, 탭은 공백으로, 제어·서식 문자는 지운다.
 * - 글꼴에 없는 글자(이모지 등)는 `?` 로 바꾼다 — 빈 칸으로 사라지면 내용이 없어진 줄 모른다.
 */
function clean(text: string, has: Set<number>, limit: number): string {
  let out = text
    .normalize("NFC")
    .replace(/\r\n?|\u2028|\u2029|\u0085/g, "\n")
    .replace(/\t/g, "    ")
    // 제어 문자, 폭 없는 서식 문자, 방향 제어, BOM
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, "");
  if (out.length > limit) out = `${out.slice(0, limit - 1)}…`;

  let safe = "";
  for (const ch of out) {
    const cp = ch.codePointAt(0)!;
    safe += ch === "\n" || has.has(cp) ? ch : "?";
  }
  return safe;
}

/* ── 줄바꿈 ────────────────────────────────────────────────── */

/**
 * `text` 를 `maxWidth` 안에 들어오게 줄로 나눈다. 문단 구분(`\n`)은 지킨다.
 *
 * 공백에서 먼저 끊는다(한국어도 어절 단위로 읽히는 쪽이 낫다). 한 어절이 한 줄보다 길면 —
 * URL 이 그렇다 — 글자 단위로 자른다. **어느 경우에도 글자를 버리지 않는다.**
 */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const width = (s: string) => font.widthOfTextAtSize(s, size);
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      if (word === "") continue;
      const candidate = line === "" ? word : `${line} ${word}`;
      if (width(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== "") {
        lines.push(line);
        line = "";
      }
      // 어절 하나가 한 줄보다 길다 — 글자 단위로 채운다.
      if (width(word) <= maxWidth) {
        line = word;
        continue;
      }
      for (const ch of word) {
        if (line !== "" && width(line + ch) > maxWidth) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

/* ── 본체 ──────────────────────────────────────────────────── */

type Block = {
  text: string;
  size: number;
  leading: number;
  color: ReturnType<typeof rgb>;
  gapBefore: number;
  /** 이 블록 앞에 가는 선을 긋는다. */
  rule?: boolean;
};

/**
 * 리서치 결과 하나를 PDF 바이트로 만든다.
 *
 * 순서는 제목 → 출처(연도) → 참고문헌 인용 → 요약 → 원문 링크. 값이 없는 칸은 건너뛴다.
 * 길면 여러 줄·여러 쪽이 된다.
 */
export async function makeResearchPdf(input: ResearchDocInput): Promise<Buffer> {
  const has = await loadCovered();
  const title = clean(input.title, has, LIMITS.title).replace(/\n+/g, " ").trim() || "자료";
  const source = clean(input.source, has, LIMITS.source).replace(/\n+/g, " ").trim();
  const year = input.year ? clean(String(input.year), has, 20).replace(/\n+/g, " ").trim() : "";
  const citation = input.citation ? clean(input.citation, has, LIMITS.citation).trim() : "";
  const snippet = clean(input.snippet ?? "", has, LIMITS.snippet).trim();
  const url = input.url ? clean(input.url, has, LIMITS.url).replace(/\s+/g, "").trim() : "";

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // subset: 쓴 글자의 글리프만 남긴다(5.3MB → 수십 KB).
  const font = await pdf.embedFont(await loadFontBytes(), { subset: true });

  pdf.setTitle(title);
  pdf.setLanguage("ko-KR");
  pdf.setProducer("찰떡");
  pdf.setCreator("찰떡 AI 리서처");

  const blocks: Block[] = [{ text: title, size: 18, leading: 27, color: INK, gapBefore: 0 }];
  if (source) {
    blocks.push({
      text: `출처  ${source}${year ? ` (${year})` : ""}`,
      size: 11,
      leading: 17,
      color: MUTED,
      gapBefore: 8,
    });
  } else if (year) {
    blocks.push({ text: `발행  ${year}`, size: 11, leading: 17, color: MUTED, gapBefore: 8 });
  }
  if (citation) {
    blocks.push({ text: `참고문헌 인용  ${citation}`, size: 11, leading: 17, color: MUTED, gapBefore: 4 });
  }
  if (snippet) blocks.push({ text: snippet, size: 12, leading: 20, color: INK, gapBefore: 26, rule: true });
  if (url) blocks.push({ text: `원문 링크\n${url}`, size: 10.5, leading: 16, color: MUTED, gapBefore: 26 });

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP;

  for (const block of blocks) {
    const lines = wrap(block.text, font, block.size, MEASURE);

    // 머리(제목·출처·인용)와 요약 사이에 가는 선 — 요약이 본문이라는 것만 구분해 준다.
    if (block.rule) {
      y -= block.gapBefore / 2;
      page.drawLine({
        start: { x: MARGIN_X, y },
        end: { x: PAGE_W - MARGIN_X, y },
        thickness: 0.6,
        color: RULE,
      });
      y -= block.gapBefore / 2;
    } else {
      y -= block.gapBefore;
    }

    for (const line of lines) {
      if (y - block.leading < MARGIN_BOTTOM) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN_TOP;
      }
      y -= block.leading;
      if (line !== "") page.drawText(line, { x: MARGIN_X, y, size: block.size, font, color: block.color });
    }
  }

  return Buffer.from(await pdf.save());
}

import "server-only";

import { inflateRawSync } from "node:zlib";

/**
 * 드라이브에 올라온 발표 자료(PPTX)·대본(DOCX)에서 **글자만** 꺼낸다.
 *
 * ## 왜 라이브러리를 안 쓰는가
 *
 * `mammoth`·`officeparser` 같은 것이 있지만 이 저장소는 파싱 의존성이 하나도 없다. 필요한
 * 계약이 좁아서다 — 우리가 원하는 것은 **글자뿐**이고, PPTX/DOCX 는 둘 다 **평범한 deflate
 * ZIP + XML** 이다. 이 저장소가 `due` 파싱을 직접 쓰고 이유를 적어 둔 것과 같은 판단이다:
 * 좁은 계약을 위해 의존성을 늘리면, 그 의존성이 틀렸을 때 **우리 계약을 우리가 못 고친다.**
 *
 * ## 정직하게 못 하는 것 (여기 적지 않으면 다음 사람이 또 시도한다)
 *
 * - **이미지·도형·차트 안의 글자**는 꺼내지 못한다. 스캔한 PDF 를 이미지로 붙인 슬라이드는
 *   **빈 슬라이드로 보인다.** 그래서 빈 슬라이드 수를 **세어서 돌려준다** — 조용히 빈 대본을
 *   넘기면 AI 가 없는 내용을 상상하게 된다.
 * - **PDF 는 다루지 않는다.** 텍스트 레이어 유무·인코딩·폰트 임베딩에 따라 결과가 달라지고,
 *   잘못 꺼내면 **깨진 글자를 대본이라고** 넘기게 된다. 부르는 쪽에서 종류로 거른다.
 * - **각주·머리글·각주**는 넣지 않는다(본문만). PPTX 는 슬라이드 본문 + 발표자 노트.
 * - **ZIP64·암호화 ZIP 은 거절한다.** Office 파일은 보통 해당 없음이지만, 해당되면
 *   **엉뚱한 글자를 꺼내는 대신 이유를 말하고 실패한다.**
 *
 * ## 순서가 왜 중요한가
 *
 * PPTX 슬라이드의 파일 이름(`slide2.xml`)은 **발표 순서가 아니다.** 순서는
 * `ppt/presentation.xml` 의 `p:sldIdLst` 가 정한다. 이름순으로 읽으면 발표 순서가 뒤집힌
 * 대본이 나오고, 그 대본을 다듬으면 **PPT 와 순서가 다른 발표**가 된다.
 */

/** 잘못된 파일·지원하지 않는 형식일 때. 부르는 쪽이 사용자 문구로 바꾼다. */
export class OfficeTextError extends Error {}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

type ZipEntry = {
  name: string;
  /** 압축 방식. 0=저장, 8=deflate. */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  /** ZIP 헤더가 들고 있는 원본 체크섬. **풀린 글자가 맞는지**를 이걸로 본다. */
  crc: number;
};

let crcTable: Uint32Array | null = null;

/**
 * ZIP 의 CRC-32.
 *
 * ⚠️ **deflate 에는 체크섬이 없다.** 압축을 풀면 "성공" 하는데 글자는 이미 깨져 있을 수
 * 있고, 그 깨진 글자가 **대본이 되어 AI 로 간다.** ZIP 헤더의 CRC 를 직접 확인해야
 * "읽었다" 와 "맞다" 가 같은 말이 된다. 검사에서 바이트 하나를 뒤집어 이 자리를 고정한다.
 */
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP 중앙 디렉터리를 읽고 원하는 항목만 풀어 준다. */
class ZipReader {
  private readonly entries = new Map<string, ZipEntry>();

  constructor(private readonly data: Buffer) {
    this.readCentralDirectory();
  }

  private readCentralDirectory(): void {
    const eocd = this.findEocd();
    const count = this.data.readUInt16LE(eocd + 10);
    let offset = this.data.readUInt32LE(eocd + 16);

    for (let i = 0; i < count; i++) {
      if (offset + 46 > this.data.length || this.data.readUInt32LE(offset) !== SIG_CENTRAL) {
        throw new OfficeTextError("ZIP 중앙 디렉터리를 읽을 수 없습니다(파일이 손상됐을 수 있습니다).");
      }
      const method = this.data.readUInt16LE(offset + 10);
      const crc = this.data.readUInt32LE(offset + 16);
      const compressedSize = this.data.readUInt32LE(offset + 20);
      const uncompressedSize = this.data.readUInt32LE(offset + 24);
      const nameLength = this.data.readUInt16LE(offset + 28);
      const extraLength = this.data.readUInt16LE(offset + 30);
      const commentLength = this.data.readUInt16LE(offset + 32);
      const localOffset = this.data.readUInt32LE(offset + 42);
      const name = this.data.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

      // ZIP64 는 크기·오프셋을 4바이트에 담지 못해 0xFFFFFFFF 를 쓴다. 그대로 읽으면
      // **음수가 되어 엉뚱한 곳을 자른다.** 추측하지 않고 거절한다.
      if (
        compressedSize === 0xffffffff ||
        uncompressedSize === 0xffffffff ||
        localOffset === 0xffffffff
      ) {
        throw new OfficeTextError("ZIP64 형식은 아직 지원하지 않습니다.");
      }

      this.entries.set(name, { name, method, compressedSize, uncompressedSize, localOffset, crc });
      offset += 46 + nameLength + extraLength + commentLength;
    }
  }

  private findEocd(): number {
    const min = Math.max(0, this.data.length - 65557);
    for (let i = this.data.length - 22; i >= min; i--) {
      if (this.data.readUInt32LE(i) === SIG_EOCD) return i;
    }
    throw new OfficeTextError("ZIP 파일이 아닙니다.");
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  /** 항목 하나를 풀어 돌려준다. 없으면 `null`. */
  read(name: string): Buffer | null {
    const entry = this.entries.get(name);
    if (!entry) return null;
    if (entry.method !== 0 && entry.method !== 8) {
      throw new OfficeTextError(`지원하지 않는 압축 방식입니다(${entry.method}).`);
    }
    const at = entry.localOffset;
    if (at + 30 > this.data.length || this.data.readUInt32LE(at) !== SIG_LOCAL) {
      throw new OfficeTextError("ZIP 항목 헤더가 손상됐습니다.");
    }
    const nameLength = this.data.readUInt16LE(at + 26);
    const extraLength = this.data.readUInt16LE(at + 28);
    const start = at + 30 + nameLength + extraLength;
    const end = start + entry.compressedSize;
    if (end > this.data.length) {
      throw new OfficeTextError("ZIP 항목이 파일 끝을 넘습니다(손상됐을 수 있습니다).");
    }
    const raw = this.data.subarray(start, end);
    let out: Buffer;
    if (entry.method === 0) {
      out = Buffer.from(raw);
    } else {
      try {
        out = inflateRawSync(raw);
      } catch {
        // 압축이 깨진 파일은 **이유를 말해야** 한다. 그대로 던지면 운영 빌드의 Next 가
        // 메시지를 가려 사용자는 "가져오지 못했습니다" 만 본다.
        throw new OfficeTextError("압축을 풀 수 없습니다(파일이 손상됐을 수 있습니다).");
      }
    }
    // ⚠️ **풀렸다고 읽은 것이 아니다.** CRC 가 다르면 지금 손에 든 글자는 원본이 아니다 —
    // 돌려주면 손상된 파일이 **조용히 대본이 된다.**
    if (crc32(out) !== entry.crc) {
      throw new OfficeTextError("내용이 손상됐습니다(체크섬이 맞지 않습니다).");
    }
    return out;
  }

  /** `prefix` 로 시작하는 이름들. */
  under(prefix: string): string[] {
    return this.names().filter((n) => n.startsWith(prefix));
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * XML 엔티티를 편다.
 *
 * `&amp;` 를 안 펴면 대본에 `&amp;` 가 그대로 남는다 — 사용자는 자기가 안 쓴 글자를 보게
 * 되고, AI 는 그것을 그대로 다듬어 **원문에 없는 문자열**을 만든다.
 */
export function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/**
 * 문단 단위 XML 을 한 덩어리 글자로 만든다.
 *
 * `paragraphTag` 로 문단을 자르고, 그 안에서 `textTag` 글자·줄바꿈·탭을 모은다.
 * 빈 문단은 **빈 줄로 남긴다** — 대본의 문단 나눔이 사라지면 발표 호흡이 바뀐다.
 */
function paragraphsToText(xml: string, paragraphTag: string, textTag: string): string {
  const out: string[] = [];
  const paraRe = new RegExp(`<${paragraphTag}(\\s[^>]*)?>([\\s\\S]*?)</${paragraphTag}>`, "g");
  for (const match of xml.matchAll(paraRe)) {
    const body = match[2];
    let line = "";
    // 글자·줄바꿈·탭을 **나온 순서대로** 처리한다. 한 번에 태그를 지우고 글자만 모으면
    // `안녕<br/>하세요` 가 `안녕하세요` 가 된다.
    const tokenRe = new RegExp(
      `<${textTag}(\\s[^>]*)?>([\\s\\S]*?)</${textTag}>|<w:tab\\s*/>|<w:br\\s*/>|<w:cr\\s*/>|<a:br(\\s[^>]*)?/>|<a:fld[\\s\\S]*?</a:fld>`,
      "g",
    );
    for (const token of body.matchAll(tokenRe)) {
      const whole = token[0];
      // ⚠️ `whole.startsWith("<w:t")` 로 판정하면 **`<w:tab/>` 이 글자 노드로 잡힌다** —
      // 그래서 "어느 갈래가 매치됐는가" 는 그룹의 존재로 판정한다.
      if (token[2] !== undefined) {
        line += decodeXmlEntities(token[2]);
      } else if (whole.startsWith("<w:tab")) {
        // 탭은 탭이다. 줄바꿈으로 바꾸면 문단 안의 정렬이 문단 나눔처럼 보인다.
        line += "\t";
      } else if (whole.startsWith("<a:fld")) {
        // 자동 필드(슬라이드 번호 등)는 글자가 아니라 표시 장치다.
        continue;
      } else {
        line += "\n";
      }
    }
    out.push(line.trimEnd());
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/* ── ZIP 밖에서 쓰는 부품들 ──────────────────────────────────────── */

/** `ppt/_rels/presentation.xml.rels` 같은 관계 파일을 rId → 대상 경로로 만든다. */
function relationshipMap(xml: string, baseDir: string, typeSuffix?: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<Relationship\s[^>]*>/g;
  for (const match of xml.matchAll(re)) {
    const tag = match[0];
    const id = /Id="([^"]+)"/.exec(tag)?.[1];
    const target = /Target="([^"]+)"/.exec(tag)?.[1];
    const type = /Type="([^"]+)"/.exec(tag)?.[1] ?? "";
    if (!id || !target) continue;
    if (typeSuffix && !type.endsWith(typeSuffix)) continue;
    map.set(id, joinZipPath(baseDir, target));
  }
  return map;
}

/** ZIP 안의 상대 경로(`../notesSlides/notesSlide1.xml`)를 절대 경로로 바꾼다. */
export function joinZipPath(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = [...baseDir.split("/").filter(Boolean), ...target.split("/")];
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/* ── 공개 API ────────────────────────────────────────────────────── */

export type OfficeText = {
  text: string;
  kind: "pptx" | "docx";
  /** PPTX 만: 슬라이드 장수. */
  slideCount?: number;
  /** PPTX 만: 본문 글자가 **하나도 없는** 슬라이드 수. 이미지로만 만든 슬라이드가 여기 들어간다. */
  emptySlideCount?: number;
  /** PPTX 만: 발표자 노트가 있는 슬라이드 수. */
  notesSlideCount?: number;
};

/** DOCX — `word/document.xml` 의 문단들. 표 안의 문단도 문단이다. */
export function extractDocxText(data: Buffer): OfficeText {
  const zip = new ZipReader(data);
  const document = zip.read("word/document.xml");
  if (!document) {
    throw new OfficeTextError("DOCX 안에서 본문(document.xml)을 찾지 못했습니다.");
  }
  const text = paragraphsToText(document.toString("utf8"), "w:p", "w:t");
  return { text, kind: "docx" };
}

/**
 * PPTX — 발표 순서대로 슬라이드 글자, 그리고 발표자 노트.
 *
 * 슬라이드마다 `[본문]` `[노트]` 같은 표시를 **넣지 않는다.** 그 표시는 대본에 없던
 * 글자이고, AI 가 다듬은 결과에 그대로 남을 수 있다. 대신 **두 덩어리를 빈 줄로** 잇는다 —
 * 노트가 있으면 본문 다음에 이어지고, 없으면 본문만 남는다. 화면은 몇 장에 노트가 있었는지를
 * 따로 말해 준다(`notesSlideCount`).
 */
export function extractPptxText(data: Buffer): OfficeText {
  const zip = new ZipReader(data);
  const presentation = zip.read("ppt/presentation.xml");
  const rels = zip.read("ppt/_rels/presentation.xml.rels");

  /** 발표 순서대로 슬라이드 경로를 정한다. */
  const ordered: string[] = [];
  if (presentation && rels) {
    const relMap = relationshipMap(rels.toString("utf8"), "ppt", "slide");
    const listXml = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(presentation.toString("utf8"))?.[1] ?? "";
    for (const match of listXml.matchAll(/<p:sldId\s[^>]*r:id="([^"]+)"[^>]*\/?>/g)) {
      const path = relMap.get(match[1]);
      if (path && zip.has(path)) ordered.push(path);
    }
  }
  if (ordered.length === 0) {
    // 순서 정보가 없으면 이름의 숫자 순으로라도 읽는다. **이때만** 이름순이고, 그 사실을
    // 숨기지 않기 위해 이 경로로 왔다는 것을 반환값에 남기지는 않는다 — 화면이 슬라이드
    // 장수를 말하므로 순서가 어긋나면 사용자가 눈으로 잡는다. 대신 파일이 깨진 것이므로
    // 빈 슬라이드가 섞이면 그대로 드러난다.
    ordered.push(
      ...zip
        .under("ppt/slides/")
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => slideNumber(a) - slideNumber(b)),
    );
  }
  if (ordered.length === 0) {
    throw new OfficeTextError("PPTX 안에서 슬라이드를 찾지 못했습니다.");
  }

  const slides: string[] = [];
  let emptySlideCount = 0;
  let notesSlideCount = 0;

  for (const slidePath of ordered) {
    const slideXml = zip.read(slidePath)?.toString("utf8") ?? "";
    const body = paragraphsToText(slideXml, "a:p", "a:t").trim();
    if (body === "") emptySlideCount++;

    // 발표자 노트 — 슬라이드의 관계 파일에서 `notesSlide` 관계를 찾는다.
    const slideName = slidePath.split("/").pop() ?? "";
    const slideRels = zip.read(`ppt/slides/_rels/${slideName}.rels`);
    let notes = "";
    if (slideRels) {
      const notesPath = relationshipMap(slideRels.toString("utf8"), "ppt/slides", "notesSlide").values().next().value;
      if (notesPath && zip.has(notesPath)) {
        const notesXml = zip.read(notesPath)?.toString("utf8") ?? "";
        // 노트 슬라이드에는 슬라이드 번호 자리 표시자가 늘 있다. 자동 필드는 뺀다.
        notes = paragraphsToText(notesXml, "a:p", "a:t").trim();
        if (notes !== "") notesSlideCount++;
      }
    }

    slides.push([body, notes].filter(Boolean).join("\n\n"));
  }

  // 슬라이드 사이는 빈 줄 하나. 노트가 없는 빈 슬라이드는 빈 문자열이 되므로, 그대로 이으면
  // **앞뒤 슬라이드의 글자가 붙는다.** 빈 슬라이드도 한 칸으로 남긴다.
  const text = slides.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, kind: "pptx", slideCount: ordered.length, emptySlideCount, notesSlideCount };
}

function slideNumber(path: string): number {
  return Number.parseInt(/slide(\d+)\.xml$/.exec(path)?.[1] ?? "0", 10);
}

/** 파일 종류에 맞는 추출기. 지원하지 않는 종류는 `null`. */
export function extractOfficeText(data: Buffer, kind: string): OfficeText | null {
  if (kind === "docx") return extractDocxText(data);
  if (kind === "pptx") return extractPptxText(data);
  return null;
}

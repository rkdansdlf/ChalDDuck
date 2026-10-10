/**
 * 검사용 오피스 파일(PPTX·DOCX)을 **실제 ZIP 컨테이너로** 만든다.
 *
 * 가짜 문자열을 넣고 추출기를 속이는 대신, 진짜 컨테이너를 만든다 — 추출기는 ZIP 을 풀고
 * XML 을 읽는 것이 일이고, 그 일을 하지 않는 검사는 아무것도 지키지 않는다. 저장(0)과
 * deflate(8) 두 방식을 다 만들 수 있어야 **압축 경로가 실제로 돌았는지**를 볼 수 있다.
 *
 * (이 파일은 검사 전용이다. 제품 코드는 이 모듈을 모른다.)
 */
import { deflateRawSync } from "node:zlib";

let crcTable = null;
function crc32(buf) {
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

/** 항목들을 담은 ZIP 버퍼를 만든다. `method: "deflate" | "store"`. */
export function makeZip(entries, { method = "deflate" } = {}) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const useDeflate = (entry.method ?? method) === "deflate";
    const data = useDeflate ? deflateRawSync(raw) : raw;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 이름
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt32LE(0, 10); // time/date — 검사는 읽지 않는다. 고정값으로 결정적으로 만든다.
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(useDeflate ? 8 : 0, 10);
    dir.writeUInt32LE(0, 12);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += local.length + name.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

export function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CONTENT_TYPES_DOCX = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS_DOCX = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/** 문단 목록으로 DOCX 를 만든다. `\t` 는 `w:tab`, `\n` 은 `w:br` 로 들어간다. */
export function makeDocx(paragraphs) {
  const body = paragraphs
    .map((paragraph) => {
      if (paragraph === "") return "<w:p/>";
      const runs = paragraph
        .split(/(\t|\n)/)
        .filter((part) => part !== "")
        .map((part) => {
          if (part === "\t") return "<w:r><w:tab/></w:r>";
          if (part === "\n") return "<w:r><w:br/></w:r>";
          return `<w:r><w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`;
        })
        .join("");
      return `<w:p>${runs}</w:p>`;
    })
    .join("");
  const document = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  return makeZip([
    { name: "[Content_Types].xml", data: CONTENT_TYPES_DOCX },
    { name: "_rels/.rels", data: ROOT_RELS_DOCX },
    { name: "word/document.xml", data: document },
  ]);
}

const CONTENT_TYPES_PPTX = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>`;

const ROOT_RELS_PPTX = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

function slideXml(paragraphs) {
  const body = paragraphs
    .map((paragraph) => {
      const runs = paragraph
        .split(/(\t|\n)/)
        .filter((part) => part !== "")
        .map((part) => {
          if (part === "\t") return "<a:r><a:t> </a:t></a:r>";
          if (part === "\n") return "<a:br/>";
          return `<a:r><a:t>${escapeXml(part)}</a:t></a:r>`;
        })
        .join("");
      return `<a:p>${runs}</a:p>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
}

function notesXml(notes, slideNumberLabel) {
  const body = notes
    .map((paragraph) => `<a:p><a:r><a:t>${escapeXml(paragraph)}</a:t></a:r></a:p>`)
    .join("");
  // 실제 노트 슬라이드에는 **번호 자리 표시자가 늘 있다.** 추출기가 이것을 빼는지 보려고 넣는다.
  const number = `<a:p><a:fld id="{00000000-0000-0000-0000-000000000000}" type="slidenum"><a:t>${slideNumberLabel}</a:t></a:fld></a:p>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${number}${body}</p:spTree></p:cSld></p:notes>`;
}

/**
 * 슬라이드 목록으로 PPTX 를 만든다.
 *
 * `order` 로 **발표 순서를 파일 번호와 다르게** 만들 수 있다(1부터). 순서를 이름순으로
 * 읽는 버그를 잡으려면 이 능력이 꼭 필요하다 — 순서가 우연히 같으면 아무것도 못 본다.
 */
export function makePptx(slides, { order } = {}) {
  const entries = [];
  const seq = order ?? slides.map((_, i) => i + 1);

  const slideRels = [];
  for (let i = 1; i <= slides.length; i++) {
    const notes = slides[i - 1].notes;
    const rels = [
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`,
    ];
    if (notes && notes.length > 0) {
      entries.push({ name: `ppt/notesSlides/notesSlide${i}.xml`, data: notesXml(notes, String(i)) });
      rels.push(
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${i}.xml"/>`,
      );
    }
    slideRels.push({
      name: `ppt/slides/_rels/slide${i}.xml.rels`,
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`,
    });
  }

  const sldIdLst = seq
    .map((n, index) => `<p:sldId id="${256 + index}" r:id="rId${n}"/>`)
    .join("");
  const presentation = `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${sldIdLst}</p:sldIdLst></p:presentation>`;

  const presentationRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
    )
    .join("")}</Relationships>`;

  for (let i = 1; i <= slides.length; i++) {
    entries.push({ name: `ppt/slides/slide${i}.xml`, data: slideXml(slides[i - 1].text) });
  }

  return makeZip([
    { name: "[Content_Types].xml", data: CONTENT_TYPES_PPTX },
    { name: "_rels/.rels", data: ROOT_RELS_PPTX },
    { name: "ppt/presentation.xml", data: presentation },
    { name: "ppt/_rels/presentation.xml.rels", data: presentationRels },
    ...entries,
    ...slideRels,
  ]);
}

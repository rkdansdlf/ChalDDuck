import type { BusyBlock } from "@/lib/types";

/**
 * 안 되는 시간 블록을 다루는 규칙.
 *
 * 격자(드래그·탭)와 추가·편집 시트가 **같은 결과**를 내야 한다. 각자 배열을 고치면
 * 격자에서는 한 덩어리로 보이는데 목록에는 세 줄로 남는 식으로 어긋난다.
 *
 * 규칙은 두 개다.
 * 1. 새로 놓은 블록이 이긴다 — 겹치는 기존 블록은 그 구간만큼 잘려 나간다.
 * 2. 같은 요일·같은 사유로 맞닿은 블록은 하나로 합친다 — 10시, 11시를 차례로 누르면
 *    "10시~12시" 한 건이 된다. 직접 입력한 사유는 **이름까지** 같아야 같은 사유다
 *    ("동아리"와 "통학"이 붙어 있어도 합치지 않는다).
 */

/** 직접 입력한 사유 이름의 최대 길이. 격자 칸(좁은 화면 약 55px)의 이름표에 두 줄로 들어가는 정도. */
export const BUSY_LABEL_MAX = 10;

/**
 * 직접 입력한 사유 이름을 다듬는다. 쓸 수 없는 이름이면 null.
 *
 * 화면(입력 칸)과 서버 액션(저장)이 같은 규칙을 써야 한다 — 화면에서 통과한 이름이
 * 저장할 때 거절되면 사용자는 이유를 알 수 없다.
 */
export function normalizeBusyLabel(raw: string): string | null {
  const label = raw.replace(/\s+/g, " ").trim();
  if (label.length === 0 || [...label].length > BUSY_LABEL_MAX) return null;
  return label;
}

/** 사유를 가리키는 키. 기본 사유는 `class`, 직접 입력은 `custom:동아리`. */
export type ReasonKey = string;

export function reasonKey(b: { kind: string; label: string | null }): ReasonKey {
  return b.kind === "custom" ? `custom:${b.label ?? ""}` : b.kind;
}

/** 내가 쓴 직접 입력 사유 이름들. 처음 나온 순서대로, 겹치지 않게. */
export function customLabels(blocks: BusyBlock[]): string[] {
  const seen = new Set<string>();
  for (const b of blocks) if (b.kind === "custom" && b.label) seen.add(b.label);
  return [...seen];
}

let blockSeq = 0;
export const nextBlockId = () => `local-${(blockSeq += 1)}`;

/** 요일·시간대 좌표를 덮고 있는 블록. */
export function blockAt(blocks: BusyBlock[], day: number, hour: number): BusyBlock | undefined {
  return blocks.find((b) => b.day === day && hour >= b.startHour && hour < b.startHour + b.hours);
}

/** `block` 에서 [from, to) 구간을 빼고 남는 조각들. */
function subtract(block: BusyBlock, from: number, to: number): BusyBlock[] {
  const end = block.startHour + block.hours;
  if (to <= block.startHour || from >= end) return [block];

  const pieces: BusyBlock[] = [];
  if (block.startHour < from) {
    pieces.push({ ...block, hours: from - block.startHour });
  }
  if (end > to) {
    // 가운데가 잘려 둘로 나뉘면 뒤 조각은 새 블록이다 — id 가 겹치면 지울 때 둘이 같이 사라진다.
    pieces.push({
      ...block,
      id: pieces.length ? nextBlockId() : block.id,
      startHour: to,
      hours: end - to,
    });
  }
  return pieces;
}

/** 같은 요일·같은 사유로 맞닿거나 겹친 블록을 합친다. */
function merge(blocks: BusyBlock[]): BusyBlock[] {
  const sorted = [...blocks].sort(
    (a, b) =>
      a.day - b.day || reasonKey(a).localeCompare(reasonKey(b)) || a.startHour - b.startHour,
  );
  const out: BusyBlock[] = [];
  for (const b of sorted) {
    const last = out.at(-1);
    if (
      last &&
      last.day === b.day &&
      reasonKey(last) === reasonKey(b) &&
      b.startHour <= last.startHour + last.hours
    ) {
      const end = Math.max(last.startHour + last.hours, b.startHour + b.hours);
      out[out.length - 1] = { ...last, hours: end - last.startHour };
    } else {
      out.push(b);
    }
  }
  return out;
}

/** 블록 하나를 놓는다. 겹친 기존 블록은 잘리고, 맞닿은 같은 사유는 합쳐진다. */
export function placeBlock(blocks: BusyBlock[], next: BusyBlock): BusyBlock[] {
  const from = next.startHour;
  const to = next.startHour + next.hours;
  const rest = blocks
    .filter((b) => b.id !== next.id)
    .flatMap((b) => (b.day === next.day ? subtract(b, from, to) : [b]));
  return merge([...rest, next]);
}

/** 요일 → 시작 시간 순. 등록 순서는 의미가 없다. */
export function sortBlocks(blocks: BusyBlock[]): BusyBlock[] {
  return [...blocks].sort((a, b) => a.day - b.day || a.startHour - b.startHour);
}

/** 블록 모양만 담은 문자열. id 는 합치고 쪼갤 때마다 바뀌어 "바뀌었나" 비교에 쓸 수 없다. */
export function blocksShape(blocks: BusyBlock[]): string {
  return sortBlocks(blocks)
    .map((b) => `${b.day}:${b.startHour}:${b.hours}:${reasonKey(b)}`)
    .join(",");
}

import { BUSY_KINDS, SCHEDULE_DAYS, SCHEDULE_HOURS } from "@/data/catalog";

/**
 * 시간표에서 회의 시간 후보를 만드는 규칙.
 *
 * `meeting-model.ts` 의 확정 규칙과 같은 이유로 순수 함수로 떼어 둔다 — 서버 액션과
 * 시드가 같은 계산을 해야 하고, 둘이 각자 계산하면 데모 팀과 실제 팀의 후보가 서로
 * 다른 규칙으로 만들어진다.
 */

/** 사유는 시간표 화면과 같은 말로 보여 준다 — 화면마다 다른 어휘를 만들지 않는다. */
const BUSY_LABEL = new Map<string, string>(BUSY_KINDS.map((k) => [k.key, k.name]));

/** 아무도 못 오는 시간을 후보라고 부르지 않는다. 둘은 모여야 회의다. */
export const MIN_ATTENDEES = 2;

/** 한 화면에 보여 줄 후보 수. 너무 많이 늘어놓으면 고르지 못한다. */
export const MAX_CANDIDATES = 5;

/**
 * 한 요일에서 고를 후보 수.
 *
 * 없으면 월요일이 비어 있는 팀의 후보가 전부 월요일로 몰린다 — 고를 것이 다섯 개라도
 * 고를 수 있는 날은 하루뿐이라 사실상 선택지가 없다.
 */
const MAX_PER_DAY = 2;

export type SlotSource = {
  name: string;
  busyBlocks: Array<{ day: number; startHour: number; hours: number; kind: string }>;
};

export type ComputedSlot = {
  day: string;
  time: string;
  available: number;
  total: number;
  /** 못 오는 사람과 사유. 전원 가능하면 null. */
  blockedBy: string | null;
};

export function computeMeetingSlots(members: SlotSource[]): ComputedSlot[] {
  if (members.length < MIN_ATTENDEES) return [];

  /** 칸(`요일:시간대`) 마다 그 시간에 못 오는 사람들. */
  const blockedAt = new Map<string, Array<{ name: string; kind: string }>>();
  for (const m of members) {
    for (const b of m.busyBlocks) {
      for (let h = b.startHour; h < b.startHour + b.hours; h += 1) {
        const key = `${b.day}:${h}`;
        const at = blockedAt.get(key) ?? [];
        // 같은 사람이 겹쳐 적었어도 한 번만 센다.
        if (!at.some((x) => x.name === m.name)) at.push({ name: m.name, kind: b.kind });
        blockedAt.set(key, at);
      }
    }
  }

  const total = members.length;
  const found: Array<ComputedSlot & { order: number }> = [];

  for (let day = 0; day < SCHEDULE_DAYS.length; day += 1) {
    // 기본 회의 길이가 60분이라 시간표 한 칸이 곧 후보 하나다.
    for (let hour = 0; hour < SCHEDULE_HOURS.length; hour += 1) {
      const blocked = blockedAt.get(`${day}:${hour}`) ?? [];
      const available = total - blocked.length;
      if (available < MIN_ATTENDEES) continue;

      // "9:00" 이 아니라 "09:00" — 목록에서 자릿수가 흔들리면 줄이 들쭉날쭉해 보인다.
      const at = (h: number) => `${String(h).padStart(2, "0")}:00`;
      const start = Number(SCHEDULE_HOURS[hour]);
      found.push({
        day: SCHEDULE_DAYS[day],
        time: `${at(start)} – ${at(start + 1)}`,
        available,
        total,
        blockedBy: blocked.length
          ? blocked.map((x) => `${x.name} · ${BUSY_LABEL.get(x.kind) ?? x.kind}`).join(", ")
          : null,
        // 주 초반·이른 시간이 먼저 오도록 하는 정렬용 값. 표에는 넣지 않는다.
        order: day * SCHEDULE_HOURS.length + hour,
      });
    }
  }

  // 많이 되는 시간 먼저, 같으면 이른 시간 먼저.
  found.sort((a, b) => b.available - a.available || a.order - b.order);

  const perDay = new Map<string, number>();
  const picked: ComputedSlot[] = [];
  for (const { order: _order, ...slot } of found) {
    if (picked.length >= MAX_CANDIDATES) break;
    const used = perDay.get(slot.day) ?? 0;
    if (used >= MAX_PER_DAY) continue;
    perDay.set(slot.day, used + 1);
    picked.push(slot);
  }

  return picked;
}

/**
 * 후보 한 칸에 못 오는 사람들.
 *
 * 후보 행에는 못 오는 사람이 문장으로만 남아 있어(`blockedBy`) 사람을 가리킬 수 없다.
 * 알림처럼 **누구에게** 보낼지가 필요할 때는 시간표에서 다시 센다 — `computeMeetingSlots`
 * 와 같은 규칙(요일·시간대 칸 하나에 걸친 안 되는 시간)이다.
 */
export function membersBlockedAt<M extends SlotSource>(members: M[], day: string, time: string): M[] {
  const dayIndex = SCHEDULE_DAYS.indexOf(day);
  // "09:00 – 10:00" 의 시작 시각. 시간표의 칸 번호로 바꿔 busyBlocks 와 견준다.
  const hourIndex = SCHEDULE_HOURS.findIndex((h) => Number(h) === Number(time.slice(0, 2)));
  if (dayIndex < 0 || hourIndex < 0) return [];

  return members.filter((m) =>
    m.busyBlocks.some(
      (b) => b.day === dayIndex && hourIndex >= b.startHour && hourIndex < b.startHour + b.hours,
    ),
  );
}

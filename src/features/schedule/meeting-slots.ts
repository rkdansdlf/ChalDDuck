import { BUSY_KINDS, CUSTOM_BUSY_KIND, SCHEDULE_DAYS, SCHEDULE_HOURS } from "@/data/catalog";
import type { CandidateDate, WeekKey } from "./week";

/**
 * 시간표에서 회의 시간 후보를 만드는 규칙.
 *
 * `meeting-model.ts` 의 확정 규칙과 같은 이유로 순수 함수로 떼어 둔다 — 서버 액션과
 * 시드가 같은 계산을 해야 하고, 둘이 각자 계산하면 데모 팀과 실제 팀의 후보가 서로
 * 다른 규칙으로 만들어진다.
 *
 * 후보는 **오늘부터 7일**(`candidateDates`)에서 찾는다. 날마다 그 날이 속한 주의
 * 시간표(매주 + 그 주에만)로 센다 — 7일이 두 주에 걸치면 날마다 다른 "이 주만" 블록이 걸린다.
 */

/**
 * 사유는 시간표 화면과 같은 말로 보여 준다 — 화면마다 다른 어휘를 만들지 않는다.
 *
 * 직접 입력한 사유는 본인이 붙인 이름("병원")이 아니라 "개인 일정"으로만 나간다. 여기서 만든
 * 문구는 팀 전원이 보는 09 화면에 그대로 뜬다. 이름은 애초에 이 계산에 들어오지도 않는다
 * (`SlotSource` 에 label 이 없다).
 */
const BUSY_LABEL = new Map<string, string>(
  [...BUSY_KINDS, CUSTOM_BUSY_KIND].map((k) => [k.key, k.name]),
);

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
  busyBlocks: Array<{
    day: number;
    startHour: number;
    hours: number;
    kind: string;
    /** null = 매주, 값 = 그 주에만. */
    weekOf: string | null;
  }>;
};

export type ComputedSlot = {
  day: string;
  time: string;
  available: number;
  total: number;
  /** 못 오는 사람과 사유. 전원 가능하면 null. */
  blockedBy: string | null;
};

/** 한 주의 칸(`요일:시간대`) 마다 그 시간에 못 오는 사람들. */
function blockedMap(members: SlotSource[], week: WeekKey) {
  const blockedAt = new Map<string, Array<{ name: string; kind: string }>>();
  for (const m of members) {
    for (const b of m.busyBlocks) {
      // 매주 반복하는 것과 이 주에만 있는 것.
      if (b.weekOf !== null && b.weekOf !== week) continue;
      for (let h = b.startHour; h < b.startHour + b.hours; h += 1) {
        const key = `${b.day}:${h}`;
        const at = blockedAt.get(key) ?? [];
        // 같은 사람이 겹쳐 적었어도 한 번만 센다.
        if (!at.some((x) => x.name === m.name)) at.push({ name: m.name, kind: b.kind });
        blockedAt.set(key, at);
      }
    }
  }
  return blockedAt;
}

/** 칸 하나를 후보 모양으로. 목록 후보와 팀 겹쳐보기에서 직접 고른 칸이 같은 모양이어야 한다. */
function toSlot(day: number, hour: number, total: number, blocked: Array<{ name: string; kind: string }>) {
  // "9:00" 이 아니라 "09:00" — 목록에서 자릿수가 흔들리면 줄이 들쭉날쭉해 보인다.
  const at = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const start = Number(SCHEDULE_HOURS[hour]);
  return {
    day: SCHEDULE_DAYS[day],
    time: `${at(start)} – ${at(start + 1)}`,
    available: total - blocked.length,
    total,
    blockedBy: blocked.length
      ? blocked.map((x) => `${x.name} · ${BUSY_LABEL.get(x.kind) ?? x.kind}`).join(", ")
      : null,
  };
}

/** 한 주의 요일·시간대 칸 하나의 후보. 팀 겹쳐보기에서 칸을 골라 제안할 때 쓴다. */
export function slotAt(members: SlotSource[], week: WeekKey, day: number, hour: number): ComputedSlot {
  return toSlot(day, hour, members.length, blockedMap(members, week).get(`${day}:${hour}`) ?? []);
}

export function computeMeetingSlots(members: SlotSource[], dates: CandidateDate[]): ComputedSlot[] {
  if (members.length < MIN_ATTENDEES) return [];

  const byWeek = new Map<WeekKey, ReturnType<typeof blockedMap>>();
  const total = members.length;
  const found: Array<ComputedSlot & { order: number }> = [];

  dates.forEach(({ week, day }, index) => {
    const blockedAt = byWeek.get(week) ?? blockedMap(members, week);
    byWeek.set(week, blockedAt);
    // 기본 회의 길이가 60분이라 시간표 한 칸이 곧 후보 하나다.
    for (let hour = 0; hour < SCHEDULE_HOURS.length; hour += 1) {
      const blocked = blockedAt.get(`${day}:${hour}`) ?? [];
      if (total - blocked.length < MIN_ATTENDEES) continue;

      found.push({
        ...toSlot(day, hour, total, blocked),
        // 가까운 날·이른 시간이 먼저 오도록 하는 정렬용 값. 표에는 넣지 않는다.
        order: index * SCHEDULE_HOURS.length + hour,
      });
    }
  });

  // 많이 되는 시간 먼저, 같으면 가까운 시간 먼저.
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
 * 와 같은 규칙(그 주의 요일·시간대 칸 하나에 걸친 안 되는 시간)이다.
 */
export function membersBlockedAt<M extends SlotSource>(
  members: M[],
  day: string,
  time: string,
  week: WeekKey,
): M[] {
  const dayIndex = SCHEDULE_DAYS.indexOf(day);
  // "09:00 – 10:00" 의 시작 시각. 시간표의 칸 번호로 바꿔 busyBlocks 와 견준다.
  const hourIndex = SCHEDULE_HOURS.findIndex((h) => Number(h) === Number(time.slice(0, 2)));
  if (dayIndex < 0 || hourIndex < 0) return [];

  return members.filter((m) =>
    m.busyBlocks.some(
      (b) =>
        (b.weekOf === null || b.weekOf === week) &&
        b.day === dayIndex &&
        hourIndex >= b.startHour &&
        hourIndex < b.startHour + b.hours,
    ),
  );
}

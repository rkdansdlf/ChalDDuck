import "server-only";

import { db } from "@/server/db";

/**
 * 팀 겹쳐보기의 "시간표 부탁하기".
 *
 * 콕 찌르기(`pokeTask`)와 같은 원칙이다 — 보낸 사람을 밝히고, **받는 사람당 하루 한 번**으로
 * 막는다. 따로 표를 두지 않고 이미 남긴 알림으로 센다. 알림이 곧 보낸 기록이라 둘이 어긋날 일이 없다.
 *
 * 화면(버튼을 "오늘 보냄"으로 바꾸기)과 액션(두 번째 요청 막기)이 같은 판단을 해야 해서 여기에 둔다.
 */

export const SCHEDULE_ASK_KIND = "schedule-ask";

/** 한국 날짜 기준 오늘 0시. 서버가 어디서 돌든 같은 하루여야 한다. */
function startOfTodayInSeoul(): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return new Date(`${day}T00:00:00+09:00`);
}

/** 오늘 `senderId` 가 시간표를 부탁한 사람들. */
export async function askedTodayBy(senderId: string, to?: string): Promise<Set<string>> {
  const rows = await db.notification.findMany({
    where: {
      kind: SCHEDULE_ASK_KIND,
      actorId: senderId,
      createdAt: { gte: startOfTodayInSeoul() },
      ...(to ? { memberId: to } : {}),
    },
    select: { memberId: true },
  });
  return new Set(rows.map((r) => r.memberId));
}

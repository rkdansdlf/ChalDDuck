import "server-only";

import { todayInSeoul } from "@/features/schedule/week";
import { db } from "@/server/db";

/**
 * 팀 겹쳐보기의 "시간표 부탁하기".
 *
 * 콕 찌르기(`pokeTask`)와 같은 원칙이다 — 보낸 사람을 밝히고, **받는 사람당 하루 한 번**으로
 * 막는다. 막는 것은 `ScheduleAsk` 의 유일 키이고, 화면의 "오늘 보냄" 도 같은 표를 읽는다.
 *
 * 예전에는 이미 남긴 알림을 세어 막았다. 알림이 곧 보낸 기록이라 어긋날 일이 없다는 이유였지만,
 * 읽고 쓰는 사이가 벌어져 **동시에 두 번 누르면 둘 다 통과**했다. 유일 키는 두 번째를 DB 가
 * 막는다. 알림은 이제 전달 수단일 뿐 기록이 아니다.
 *
 * 화면(버튼을 "오늘 보냄"으로 바꾸기)과 액션(두 번째 요청 막기)이 같은 판단을 해야 해서 여기에 둔다.
 */

export const SCHEDULE_ASK_KIND = "schedule-ask";

/** 오늘 `senderId` 가 시간표를 부탁한 사람들. 날은 한국 날짜 기준이다. */
export async function askedTodayBy(senderId: string, to?: string): Promise<Set<string>> {
  const rows = await db.scheduleAsk.findMany({
    where: { senderId, sentOn: todayInSeoul(), ...(to ? { targetId: to } : {}) },
    select: { targetId: true },
  });
  return new Set(rows.map((r) => r.targetId));
}

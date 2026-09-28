import "server-only";

import { db } from "@/server/db";

/**
 * 고정 창(fixed window) 횟수표.
 *
 * **`RejoinAttempt` 표를 쓴다.** 이 표는 `key`·`count`·`until` 세 칸뿐이고 어떤 행에도
 * 묶이지 않는다(`memberId` 도 `rejoinCode` 도 없다). 그래서 재입장 tries 말고 다른 횟수
 * 제한이 같은 표를 그대로 쓴다 — 횟수를 세는 곳이 한 군데여야 제한이 제한이고(서버리스는
 * 인스턴스마다 따로 세면 안 된다 — `auth/attempts.ts` 머리말 참조), 표를 늘리면 그 원리가
 * 다시 흐려진다.
 *
 * 키를 만들 때 **접두사로 범위를 분리한다.** 재입장 키는 `sha256("<코드>:<이름>")` 이고
 * 여기서는 `sha256("join:<scope>:<값>")` 이다. 해시가 다르면 우연히 같은 칸을 쓰는 일은
 * 없지만, **같은 칸을 의도적으로 공유하는 일**이 없음을 코드로 남긴다.
 *
 * 창은 **첫 시도 때 정해지고 늘어나지 않는다.** 시도할 때마다 뒤로 밀면, 막힌 사람이 계속
 * 눌러 보는 동안 영영 안 풀린다.
 */

/** 지금 이 창의 횟수. 창이 지난 기록은 0으로 본다. */
export async function readWindow(key: string): Promise<number> {
  const row = await db.rejoinAttempt.findUnique({ where: { key } });
  if (!row) return 0;
  if (row.until.getTime() <= Date.now()) return 0;
  return row.count;
}

/** 한 번 찍었다고 세고, **그 뒤의 횟수**를 돌려준다. 제한 판정은 이 값으로 한다. */
export async function hitWindow(key: string, windowMs: number): Promise<number> {
  const now = Date.now();
  const row = await db.rejoinAttempt.findUnique({ where: { key } });

  if (!row || row.until.getTime() <= now) {
    const until = new Date(now + windowMs);
    await db.rejoinAttempt.upsert({
      where: { key },
      create: { key, count: 1, until },
      update: { count: 1, until },
    });
    return 1;
  }

  const { count } = await db.rejoinAttempt.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
  return count;
}

/** 맞혔으면 기록을 지운다 — 다음에 한 번만 해도 곧바로 잠기지 않게. */
export async function clearWindow(key: string): Promise<void> {
  await db.rejoinAttempt.deleteMany({ where: { key } });
}

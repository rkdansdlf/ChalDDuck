import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/server/db";

/**
 * 재입장 코드를 틀린 횟수.
 *
 * ⚠️ **프로세스 메모리에 두면 안 된다.** 예전에는 모듈 안의 `Map` 이었는데, 서버리스에서는
 * 요청마다 다른 인스턴스가 받을 수 있어서 시도 횟수가 인스턴스마다 따로 셌다 —
 * 인스턴스가 다섯 개면 5회 제한이 25회가 된다. 세는 곳이 한 군데여야 제한이 제한이다.
 *
 * 재입장 코드는 32^12 라 찍어서 맞힐 수 없지만, 제한이 없으면 그 크기를 믿는 근거가
 * 코드 길이 하나뿐이 된다. 표 하나로 근거를 하나 더 둔다.
 */

/** 창 안에서 이만큼 틀리면 잠긴다. */
const MAX_ATTEMPTS = 5;

/** 첫 실패부터 이만큼이 한 창이다. 창이 지나면 처음부터 다시 센다. */
const LOCK_MS = 10 * 60 * 1000;

/**
 * 세는 단위를 하나로 맞춘다.
 *
 * 예전 키는 사용자가 적은 문자열 그대로였다 — `abc123:민수` 와 `ABC123:민수` 가 다른
 * 칸으로 세어져서, 대소문자만 바꿔 가며 찍으면 제한을 그냥 지나갔다. 서버가 코드를
 * 찾을 때 쓰는 모양(`trim().toUpperCase()`)과 같게 맞춘다.
 *
 * 해시로 저장하는 이유는 두 가지다 — 키 길이가 이름 길이에 끌려다니지 않고,
 * 이 표만 새어도 어느 팀에 누가 있는지 훑을 수 없다.
 */
export function attemptKey(teamCode: string, name: string): string {
  const normalized = `${teamCode.trim().toUpperCase()}:${name.trim()}`;
  return createHash("sha256").update(normalized).digest("hex");
}

/** 지금 잠겨 있는지. 창이 지난 기록은 잠긴 것으로 보지 않는다. */
export async function isLocked(key: string): Promise<boolean> {
  const row = await db.rejoinAttempt.findUnique({ where: { key } });
  if (!row) return false;
  if (row.until.getTime() <= Date.now()) return false;
  return row.count >= MAX_ATTEMPTS;
}

/**
 * 한 번 틀렸다고 센다.
 *
 * 창은 **첫 실패 때 정해지고 늘어나지 않는다.** 틀릴 때마다 뒤로 밀면 잠긴 사람이
 * 계속 눌러 보는 동안 영영 안 풀린다.
 */
export async function countFailure(key: string): Promise<void> {
  const now = Date.now();
  const row = await db.rejoinAttempt.findUnique({ where: { key } });

  if (!row || row.until.getTime() <= now) {
    const until = new Date(now + LOCK_MS);
    await db.rejoinAttempt.upsert({
      where: { key },
      create: { key, count: 1, until },
      update: { count: 1, until },
    });
    return;
  }

  await db.rejoinAttempt.update({ where: { key }, data: { count: { increment: 1 } } });
}

/** 맞혔으면 기록을 지운다 — 다음에 한 번 틀렸다고 곧바로 잠기면 안 된다. */
export async function clearAttempts(key: string): Promise<void> {
  await db.rejoinAttempt.deleteMany({ where: { key } });
}

/** 창이 지난 행을 치운다. 예약 작업이 부른다 — 남겨 둬도 틀리지는 않고 쌓이기만 한다. */
export async function sweepAttempts(): Promise<number> {
  const { count } = await db.rejoinAttempt.deleteMany({ where: { until: { lt: new Date() } } });
  return count;
}

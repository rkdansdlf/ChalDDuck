import "server-only";

import { createHash } from "node:crypto";
import { normalizeName } from "@/features/roles/roster-model";
import { db } from "@/server/db";
import { clearWindow, hitWindow, readWindow } from "@/server/rate-limit/window";

/**
 * 재입장 코드를 틀린 횟수.
 *
 * ⚠️ **프로세스 메모리에 두면 안 된다.** 예전에는 모듈 안의 `Map` 이었는데, 서버리스에서는
 * 요청마다 다른 인스턴스가 받을 수 있어서 시도 횟수가 인스턴스마다 따로 셌다 —
 * 인스턴스가 다섯 개면 5회 제한이 25회가 된다. 세는 곳이 한 군데여야 제한이 제한이다.
 *
 * 재입장 코드는 32^12 라 찍어서 맞힐 수 없지만, 제한이 없으면 그 크기를 믿는 근거는
 * 코드 길이 하나뿐이 된다. 표 하나로 근거를 하나 더 둔다.
 *
 * **횟수표는 `rate-limit/window.ts` 가 들고 있다.** `RejoinAttempt` 표는 재입장 전용이
 * 아니라 범용이라 세는 로직을 저기 한 곳에 뒀다 — 서버리스에서 인스턴스마다 따로 세면
 * 제한이 제한이 아니게 되는 것(위 문단)이 두 번 생기면 곤란하다. 여기서는 **무엇을 세는지**
 * 만 정한다.
 *
 * ## 남는 위험 (알고 있는 채로 둔다)
 *
 * 키가 `(팀 코드, 이름)` 이므로 **그 쌍을 아는 사람은 남의 쌍을 잠글 수 있다.** 잠그는 쪽은
 * 정작 코드를 아는 본인이므로, 이건 브루트포스 방어와 상충한다. 브루트포스를 막으려면 키를
 * 기기 정보까지 넓혀야 하는데, 그러면 공격자가 값을 바꿔 가며 무한히 찍을 수 있어 브루트포스
 * 방어 자체가 사라진다. **키를 넓히는 쪽은 고르지 않았다** — 지킬 것이 정해져 있지 않기
 * 때문이다.
 *
 * 대신 두 가지를 한다.
 * 1. **맞힐 코드가 없는 쌍(그런 이름이 아님)은 실패로 세지 않는다.** 대충 아무 것이나 찍는
 *    것과 같고, 이 경로가 있어야 팀에 있지도 않은 사람이 임의의 쌍을 잠글 수 있었다.
 * 2. **잠겨도 막다른 길이 아니다.** 팀장 승인 경로는 잠금과 무관하게 계속 열린다
 *    (`actions/rejoin.ts` 의 `requestRejoinApproval` 은 이 표를 보지 않는다). 그래서 진짜
 *    안전망은 코드 길이가 아니라 팀장이다 — 화면도 그쪽으로 안내해야 한다.
 *
 * 이 앱이 코드 길이를 안전 근거로 삼을 수 있는 것은 팀장이 요청을 확인하고 승인한다는
 * 사실 때문이다(핸드오프 정책표: 재입장·기기 변경 시 기록 복구).
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
  const normalized = `${teamCode.trim().toUpperCase()}:${normalizeName(name)}`;
  return createHash("sha256").update(normalized).digest("hex");
}

/** 지금 잠겨 있는지. 창이 지난 기록은 잠긴 것으로 보지 않는다. */
export async function isLocked(key: string): Promise<boolean> {
  return (await readWindow(key)) >= MAX_ATTEMPTS;
}

/**
 * 한 번 틀렸다고 센다.
 *
 * 창은 **첫 실패 때 정해지고 늘어나지 않는다.** 틀릴 때마다 뒤로 밀면 잠긴 사람이
 * 계속 눌러 보는 동안 영영 안 풀린다.
 */
export async function countFailure(key: string): Promise<void> {
  await hitWindow(key, LOCK_MS);
}

/** 맞혔으면 기록을 지운다 — 다음에 한 번 틀렸다고 곧바로 잠기면 안 된다. */
export async function clearAttempts(key: string): Promise<void> {
  await clearWindow(key);
}

/** 창이 지난 행을 치운다. 예약 작업이 부른다 — 남겨 둬도 틀리지는 않고 쌓이기만 한다. */
export async function sweepAttempts(): Promise<number> {
  const { count } = await db.rejoinAttempt.deleteMany({ where: { until: { lt: new Date() } } });
  return count;
}

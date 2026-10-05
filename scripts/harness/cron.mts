/**
 * 예약 작업 검사 진입점 — 드라이브·AI·가입·기여 와 **같은 하네스**를 쓴다.
 *
 * `next/cache` 스텁이 여기서 결정적이다. cron 주소는 요청 밖에서 부르면 `revalidatePath` 가
 * `Invariant: static generation store missing` 로 던진다 — 그래서 그 주소를 **직접 부르는 것
 * 자체가 불가능**했다. 스텁은 재검증 호출을 기록만 하고 통과시키므로, **경계 안에서 도는 것과
 * 같은 코드가** 돌아가고 무엇을 알렸는지도 볼 수 있다.
 */
import "../load-env.mjs";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly } from "./safety.mjs";

assertLocalOnly();

installRequestContext();

const { run } = await import("./cron.integration.mjs");

const okAll = await run({ session });
process.exit(okAll ? 0 : 1);

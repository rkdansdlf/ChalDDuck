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
export async function readWindow(key) {
    const row = await db.rejoinAttempt.findUnique({ where: { key } });
    if (!row)
        return 0;
    if (row.until.getTime() <= Date.now())
        return 0;
    return row.count;
}
/** 한 번 찍었다고 세고, **그 뒤의 횟수**를 돌려준다. 제한 판정은 이 값으로 한다. */
export async function hitWindow(key, windowMs) {
    const now = new Date();
    const until = new Date(now.getTime() + windowMs);
    // **읽고 → 판단하고 → 쓰는 세 단계를 한 문장에 넣는다.**
    //
    // 예전에는 `findUnique` 로 읽고, 창이 지났으면 `upsert`, 아니면 `increment` 로 썼다.
    // 그 사이가 비어 있어서 두 요청이 동시에 들어오면 **둘 다 0 을 읽고 둘 다 1 을 적는다** —
    // 2 번 찍은 것이 1 로 보인다. 횟수 제한이 남자를 못 막는 방향으로 어긋나므로, 손해 쪽이
    // 보안이다(5 회가 3 회로 새는 것은 통째로 통과하는 것보다 나쁘지 않지만, 어긋난 한도라는
    // 사실 자체가 "몇 번까지 되는지" 를 신뢰할 수 없게 만든다).
    //
    // PostgreSQL 의 `INSERT … ON CONFLICT DO UPDATE` 는 **행 단위로 직렬화**된다. 둘째 요청은
    // 첫째가 반영된 값을 읽고 자기 몫을 더하므로, 몇 개를 동시에 때려도 합이 정확하다.
    // `RETURNING` 으로 그 값을 그대로 받아 오므로 읽기와 쓰기 사이에 다른 말이 끼어들 틈도 없다.
    //
    // 창이 지난 경우와 살아 있는 경우의 차이도 **같은 문장 안에서** 갈린다.
    // - 지났으면 `count = 1` 로 새로 연다(`until` 도 지금부터 다시).
    // - 살아 있으면 `count` 를 1 올리고 `until` 은 **건드리지 않는다** — 창은 첫 시도 때
    //   정해지고 늘어나지 않는다(위 머리말). 늘리면 막힌 사람이 계속 눌러 보는 동안 영영 안 풀린다.
    const rows = await db.$queryRaw `
    INSERT INTO "RejoinAttempt" ("key", "count", "until")
    VALUES (${key}, 1, ${until})
    ON CONFLICT ("key") DO UPDATE
      SET "count" = CASE
            WHEN "RejoinAttempt"."until" <= ${now} THEN 1
            ELSE "RejoinAttempt"."count" + 1
          END,
          "until" = CASE
            WHEN "RejoinAttempt"."until" <= ${now} THEN ${until}
            ELSE "RejoinAttempt"."until"
          END
    RETURNING "count"
  `;
    return rows[0].count;
}
/** 맞혔으면 기록을 지운다 — 다음에 한 번만 해도 곧바로 잠기지 않게. */
export async function clearWindow(key) {
    await db.rejoinAttempt.deleteMany({ where: { key } });
}

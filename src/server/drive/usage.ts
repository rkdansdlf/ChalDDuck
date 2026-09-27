import "server-only";

import { db } from "@/server/db";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * 팀이 쓰고 있는 저장 용량(바이트).
 *
 * 드라이브 화면의 "N GB / 2GB" 와, 올리기 전에 한도를 넘는지 보는 곳이 **같은 계산**을
 * 쓴다. 둘이 다르면 화면에는 여유가 있다는데 올리기는 막히는 일이 생긴다.
 *
 * - 복원 버전은 세지 않는다 — 원본과 같은 저장소 객체를 가리킨다. 예전에는 복원할
 *   때마다 용량이 늘어났다.
 * - 시드 데이터는 바이트 수가 없어 "8.4MB" 같은 표시 문자열에서 대략을 읽는다.
 *
 * `tx` 를 넘기면 **그 트랜잭션 안에서** 센다. 한도를 지킬 때는 잠금 밖에서 부르면 안 된다 —
 * 아래 두 번 부르는 곳이 그랬다.
 */
export async function teamUsedBytes(teamId: string, tx?: Tx): Promise<number> {
  const client = tx ?? db;
  const versions = await client.fileVersion.findMany({
    where: { file: { box: { teamId } }, restoredFromId: null },
    select: { size: true, bytes: true },
  });

  return versions.reduce(
    (sum, v) => sum + (v.bytes ?? (Number.parseFloat(v.size) || 0) * 1024 * 1024),
    0,
  );
}

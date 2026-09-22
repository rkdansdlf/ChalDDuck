import "server-only";

import { createRejoinCode, hashRejoinCode } from "./rejoin-code";
import { db } from "@/server/db";
import type { PrismaClient } from "@/generated/prisma";

/**
 * 첫 입장 때 재입장 코드를 만들어 붙인다. **평문은 여기서 한 번만 나간다.**
 *
 * ⚠️ 서버 액션 파일에 두면 안 된다. `"use server"` 안에 있으면 누구나 남의 `memberId` 로
 * 이 함수를 POST 해 **그 사람의 재입장 코드를 받아 갈 수 있다** — 그 코드로 그 사람이 된다.
 * 부르는 쪽(온보딩·재발급)이 누구인지 먼저 확인한 뒤에만 불러야 한다.
 *
 * `client` 를 받는 것은 `db.$transaction` 안의 `tx` 를 넘기기 위해서다 — 멤버를 만드는
 * 것과 코드를 붙이는 것이 한쪽만 성공하면, 그 사람은 이름은 있는데 재입장 코드도 없고
 * (승인해 줄 팀장이 자신뿐이면) 팀장 승인도 못 받는 상태로 남는다.
 */
export async function issueRejoinCode(
  memberId: string,
  client: Pick<PrismaClient, "member"> = db,
): Promise<string> {
  const code = createRejoinCode();
  await client.member.update({
    where: { id: memberId },
    data: { rejoinCodeHash: hashRejoinCode(code) },
  });
  return code;
}

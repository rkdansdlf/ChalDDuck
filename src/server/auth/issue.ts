import "server-only";

import { createRejoinCode, hashRejoinCode } from "./rejoin-code";
import { db } from "@/server/db";

/**
 * 첫 입장 때 재입장 코드를 만들어 붙인다. **평문은 여기서 한 번만 나간다.**
 *
 * ⚠️ 서버 액션 파일에 두면 안 된다. `"use server"` 안에 있으면 누구나 남의 `memberId` 로
 * 이 함수를 POST 해 **그 사람의 재입장 코드를 받아 갈 수 있다** — 그 코드로 그 사람이 된다.
 * 부르는 쪽(온보딩·재발급)이 누구인지 먼저 확인한 뒤에만 불러야 한다.
 */
export async function issueRejoinCode(memberId: string): Promise<string> {
  const code = createRejoinCode();
  await db.member.update({
    where: { id: memberId },
    data: { rejoinCodeHash: hashRejoinCode(code) },
  });
  return code;
}

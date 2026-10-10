"use server";

import { revalidatePath } from "next/cache";
import { isBalanceChoice, isBalanceQuestion } from "@/lib/saju/balance";
import { db } from "@/server/db";
import { getSessionMember } from "@/server/session";

/**
 * 사주 밸런스 게임 투표.
 *
 * 서버 액션은 화면을 거치지 않고 POST 로 바로 불릴 수 있어서 **질문 번호와 선택을 여기서 다시 본다.**
 * 실패는 던지지 않고 돌려준다(운영 빌드는 던진 오류의 문구를 지운다). 팀은 세션에서 정한다 — 클라이언트가
 * 팀 번호를 보내지 않는다.
 *
 * 한 사람이 한 질문에 한 표다. 다시 누르면 바뀐다(`upsert`).
 */
export async function voteBalance(questionId: string, choice: string): Promise<"ok" | "invalid"> {
  const session = await getSessionMember();
  if (!session) return "invalid";
  if (!isBalanceQuestion(questionId) || !isBalanceChoice(choice)) return "invalid";

  await db.sajuBalanceVote.upsert({
    where: { memberId_questionId: { memberId: session.id, questionId } },
    create: { teamId: session.teamId, memberId: session.id, questionId, choice },
    update: { choice },
  });

  revalidatePath("/team/saju/play");
  return "ok";
}

import { revalidatePath } from "next/cache";
import { sweepAttempts } from "@/server/auth/attempts";
import { describePurification, purificationStats } from "@/server/ai/purify-stats";
import { db } from "@/server/db";
import { sweepAiUsage } from "@/server/ai/limit";
import { confirmDueMeetings } from "@/server/meetings/confirm-due";

/**
 * 회의 응답 마감을 실제로 재는 예약 작업.
 *
 * 마감은 시각이 지나면 저절로 오는 일이라, 아무도 앱을 열지 않아도 지나간다.
 * 이 주소를 주기적으로 불러 마감이 지난 제안을 확정으로 바꾼다
 * (`vercel.json` 의 crons 참고. 다른 데 올린다면 어떤 스케줄러로든 이 주소만 부르면 된다).
 *
 * 화면은 `effectiveStage()` 로 이미 확정된 것처럼 보여 주므로, 이 작업이 조금 늦게
 * 돌아도 사용자가 잘못된 상태를 보지는 않는다. 여기서 하는 일은 표를 맞추는 것이다.
 *
 * 그래서 **하루 한 번으로 충분하다.** Vercel Hobby 는 하루 한 번만 허용하고, 더 잦은
 * 주기를 적으면 배포 자체가 실패한다. 더 촘촘히 돌리고 싶으면(Pro 이상) `vercel.json`
 * 의 schedule 만 바꾸면 된다.
 */
export const dynamic = "force-dynamic";

/**
 * 스케줄러가 맞는지 확인한다.
 *
 * `CRON_SECRET` 이 없으면 **거절한다.** 없을 때 통과시키면, 설정을 깜빡한 배포에서
 * 아무나 부를 수 있는 주소가 열린 채로 돌아간다 — 조용히 열려 있는 쪽이 더 나쁘다.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "권한이 없습니다." }, { status: 401 });
  }

  const confirmed = await confirmDueMeetings();

  // **요청의 경계에서 화면을 다시 그리게 한다.** `confirmDueMeetings` 는 평범한 모듈이라
  // 경계 밖에서 부를 수 있는데, `revalidatePath` 는 그 안에서 부르면 던진다
  // (`Invariant: static generation store missing` — 그 모듈 머리말 참고). 캐시를 지우는
  // 책임은 요청을 받은 이 자리로 모았다.
  revalidatePath("/schedule", "layout");
  revalidatePath("/home");

  // 같이 치우는 두 가지. 둘 다 "하루 한 번이면 충분하고, 안 해도 틀리지는 않는" 일이라
  // 예약 작업이 이미 있는 이 자리에 붙인다. 회의 확정이 실패하면 여기까지 오지 않지만,
  // 그때는 치우는 일이 하루 밀리는 것뿐이다.
  const [attempts, aiUsage] = await Promise.all([
    // 창이 지난 재입장 시도 기록.
    sweepAttempts(),
    // 보관 기간이 지난 AI 사용 기록 — 화면이 "N일 뒤 삭제"라고 적고 있으므로 실제로 지운다.
    sweepAiUsage(),
  ]);

  /**
   * 읽기 순화의 하루 지표.
   *
   * 예약 작업에는 세션이 없으니 **모든 팀**을 돈다. 순화 기록은 팀 안에만 있으므로 팀별로
   * 나눠 세고, 응답에는 사람에게 읽히는 총계만 보낸다.
   *
   * **화면을 만들지 않는다.** 이 기능은 느낌으로 튜닝하면 안 되고(실측으로 이미
   * "협조적인 말은 되고 싸운 말은 안 된다" 가 나왔으므로) 판단 근거가 되는 숫자가
   * 있으면 된다. 그 숫자를 매일 로그와 응답에 남긴다 — 모델을 바꿀지 결정할 때 본다.
   */
  const byTeam = await db.team.findMany({ select: { id: true, name: true } });
  const purifications = [];
  for (const team of byTeam) {
    const stats = await purificationStats(team.id);
    if (stats.rows === 0) continue;
    console.log(`[${team.name}] ${describePurification(stats)}`);
    purifications.push({ team: team.name, ...stats });
  }

  return Response.json({ confirmed, swept: { attempts, aiUsage }, purification: purifications });
}

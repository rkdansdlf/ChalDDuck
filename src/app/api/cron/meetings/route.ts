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
  return Response.json({ confirmed });
}

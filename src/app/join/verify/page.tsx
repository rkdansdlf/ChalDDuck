import { redirect } from "next/navigation";
import { verifyEmailMagicToken } from "@/server/actions/email-auth";
import { AppFrame, Body, Btn, Panel } from "@/components/ui";
import Link from "next/link";

export default async function MagicVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    redirect("/join");
  }

  const result = await verifyEmailMagicToken(token);

  if (result.status === "ok") {
    redirect("/home");
  }

  return (
    <AppFrame label="이메일 로그인">
      <Body pad={20} className="flex flex-col justify-center">
        {result.status === "multiple" ? (
          <Panel s="cream" pad={18}>
            <h2 className="t-h2 mb-2 text-txt-strong">참여 중인 팀을 선택해 주세요</h2>
            <p className="t-note mb-4 text-txt-muted">
              여러 팀에 참여 중입니다. 아래에서 들어갈 팀을 선택해 주세요.
            </p>
            <div className="flex flex-col gap-2">
              {result.members.map((m) => (
                <Link
                  key={m.memberId}
                  href={`/join/switch?memberId=${m.memberId}`}
                  className="box-border flex min-h-[52px] w-full items-center justify-between rounded-control border border-line bg-card px-4 py-3 text-left no-underline text-txt-strong hover:bg-fill"
                >
                  <div>
                    <div className="font-bold text-[15px]">{m.teamName}</div>
                    <div className="text-[13px] text-txt-muted">{m.course} · {m.memberName}</div>
                  </div>
                  <span className="text-[13px] font-semibold text-link">입장 &rarr;</span>
                </Link>
              ))}
            </div>
          </Panel>
        ) : result.status === "no-teams" ? (
          <Panel s="cream" pad={18} className="text-center">
            <h2 className="t-h2 mb-2 text-txt-strong">참여 중인 팀이 없습니다</h2>
            <p className="t-note mb-4 text-txt-muted">
              이 이메일({result.email})로 등록된 팀 기록을 찾을 수 없습니다. 초대 링크를 통해 먼저 팀에 참여해 주세요.
            </p>
            <Btn full size="lg" onClick={() => redirect("/join")}>
              초대 코드로 참여하기
            </Btn>
          </Panel>
        ) : (
          <Panel s="cream" pad={18} className="text-center">
            <h2 className="t-h2 mb-2 text-txt-strong">인증 링크가 만료되었습니다</h2>
            <p className="t-note mb-4 text-txt-muted">
              링크의 유효 시간(10분)이 지났거나 이미 사용된 링크입니다. 다시 로그인해 주세요.
            </p>
            <Link href="/join" className="inline-block w-full">
              <Btn full size="lg">
                로그인 화면으로 돌아가기
              </Btn>
            </Link>
          </Panel>
        )}
      </Body>
    </AppFrame>
  );
}

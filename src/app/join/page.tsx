import { getDemoTeam, getTeamByCode } from "@/data/api";
import { JoinScreen } from "@/features/onboarding/join-screen";

/**
 * 01 초대 링크 입장.
 *
 * 초대 링크는 `/join?code=CD3-7F2Q` 형태다. 코드가 없거나 맞지 않으면
 * 데모 팀을 보여 준다 — 서버가 붙으면 "없는 초대 코드" 화면으로 바꿔야 한다.
 */
export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { code } = await searchParams;
  const requested = typeof code === "string" ? code : null;
  const team = (requested ? await getTeamByCode(requested) : null) ?? (await getDemoTeam());

  return <JoinScreen team={team} />;
}

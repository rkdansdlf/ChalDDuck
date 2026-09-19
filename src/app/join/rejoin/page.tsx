import { redirect } from "next/navigation";
import { getTeamByCode } from "@/data/api";
import { RejoinScreen } from "@/features/onboarding/rejoin-screen";

/**
 * 재입장 — 이미 있는 이름으로 새 기기에서 들어오는 길.
 *
 * 초대 코드와 이름을 **주소로** 받는다. 온보딩 스토어(sessionStorage)에서 읽으면
 * 복원되기 전에 첫 렌더가 돌아 "값이 없다"고 판단해 되돌려 보내는 경합이 생긴다
 * (실제로 그렇게 튕겼다). 주소로 받으면 새로고침해도 그대로 남는다.
 */
export default async function RejoinPage({ searchParams }: PageProps<"/join/rejoin">) {
  const { code, name } = await searchParams;
  const teamCode = typeof code === "string" ? code : "";
  const who = typeof name === "string" ? name.trim() : "";

  // 없는 코드나 빈 이름으로 직접 들어와도 여기서 할 수 있는 일이 없다.
  if (!teamCode || who.length < 2 || !(await getTeamByCode(teamCode))) redirect("/join");

  return <RejoinScreen teamCode={teamCode} name={who} />;
}

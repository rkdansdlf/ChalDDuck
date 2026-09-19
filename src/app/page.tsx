import { redirect } from "next/navigation";
import { getSessionMember } from "@/server/session";

/**
 * 진입점.
 *
 * 찰떡은 가입·로그인이 없고 초대 링크로 들어오는 앱이라, 루트는 보여 줄 화면이 따로 없다.
 * 이미 팀에 들어가 있으면 홈으로, 아니면 초대 입장 화면으로 보낸다.
 */
export default async function RootPage() {
  const member = await getSessionMember();
  redirect(member ? "/home" : "/join");
}

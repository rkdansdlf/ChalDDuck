import { redirect } from "next/navigation";
import { selectEmailTeamMember } from "@/server/actions/email-auth";

export default async function SwitchTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ memberId?: string }>;
}) {
  const { memberId } = await searchParams;

  if (memberId) {
    const res = await selectEmailTeamMember(memberId);
    if (res.ok) {
      redirect("/home");
    }
  }

  redirect("/join");
}

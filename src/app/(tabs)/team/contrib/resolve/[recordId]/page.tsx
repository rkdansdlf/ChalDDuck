import { notFound } from "next/navigation";
import { getDemoTeam, getTeamCheck } from "@/data/api";
import { ContribResolveScreen } from "@/features/contrib/contrib-resolve-screen";

/** 23 기여 기록 정정 응답. */
export default async function ContribResolvePage({
  params,
}: PageProps<"/team/contrib/resolve/[recordId]">) {
  const { recordId } = await params;
  const team = await getDemoTeam();
  const records = await getTeamCheck(team.id);
  const record = records.find((r) => r.id === recordId);
  if (!record || !record.dispute) notFound();

  return <ContribResolveScreen record={record} />;
}

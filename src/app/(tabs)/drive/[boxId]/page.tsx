import { notFound } from "next/navigation";
import { getCurrentTeam, getFileVersions, getSubmissionBox } from "@/data/api";
import { VersionsScreen } from "@/features/drive/versions-screen";

/** 13 파일 버전 기록. */
export default async function VersionsPage({ params }: PageProps<"/drive/[boxId]">) {
  const { boxId } = await params;
  const team = await getCurrentTeam();
  const box = await getSubmissionBox(team.id, boxId);
  if (!box) notFound();

  const versions = await getFileVersions(team.id, boxId);
  return <VersionsScreen box={box} versions={versions} />;
}

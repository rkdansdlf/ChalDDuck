import { notFound } from "next/navigation";
import { getCurrentTeam, getFileVersions, getSubmissionBox, getSubmittedFile } from "@/data/api";
import { VersionsScreen } from "@/features/drive/versions-screen";

/** 13 파일 버전 기록. */
export default async function VersionsPage({ params }: PageProps<"/drive/[boxId]/[fileId]">) {
  const { boxId, fileId } = await params;
  const team = await getCurrentTeam();
  const [box, file] = await Promise.all([
    getSubmissionBox(team.id, boxId),
    getSubmittedFile(team.id, fileId),
  ]);
  if (!box || !file) notFound();

  const versions = await getFileVersions(team.id, fileId);
  return <VersionsScreen box={box} file={file} versions={versions} />;
}

import { notFound } from "next/navigation";
import { getCurrentTeam, getFileVersions, getFileViewContext } from "@/data/api";
import { VersionsScreen } from "@/features/drive/versions-screen";

/** 13 파일 버전 기록. */
export default async function VersionsPage({ params }: PageProps<"/drive/[boxId]/[fileId]">) {
  const { boxId, fileId } = await params;
  const team = await getCurrentTeam();
  // 제출함과 파일을 **한 번에** 읽는다 — 따로 읽으면 같은 행을 여러 번 읽는다.
  const context = await getFileViewContext(team.id, boxId, fileId);
  if (!context) notFound();
  const { box, file } = context;

  const versions = await getFileVersions(team.id, fileId);
  return <VersionsScreen box={box} file={file} versions={versions} />;
}

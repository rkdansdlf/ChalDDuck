import { notFound } from "next/navigation";
import { getCurrentTeam, getSubmissionBox, getSubmittedFiles } from "@/data/api";
import { FilesScreen } from "@/features/drive/files-screen";

/**
 * 제출함 안의 파일 목록.
 *
 * 핸드오프에 없던 화면이다 — 프로토타입은 제출함에 파일이 하나뿐이라고 보고 여기서
 * 곧장 버전 기록으로 들어갔는데, 실제로 올릴 수 있게 되면 한 제출함에 여러 개가 들어간다.
 */
export default async function BoxFilesPage({ params, searchParams }: PageProps<"/drive/[boxId]">) {
  const { boxId } = await params;
  // 드라이브 첫 화면에서 올리고 넘어오면 방금 올린 파일 id 가 온다(강조용).
  const { uploaded } = await searchParams;
  const justUploaded = typeof uploaded === "string" ? uploaded.split(",").filter(Boolean) : [];
  const team = await getCurrentTeam();
  const box = await getSubmissionBox(team.id, boxId);
  if (!box) notFound();

  const files = await getSubmittedFiles(team.id, boxId);
  return <FilesScreen box={box} files={files} justUploaded={justUploaded} />;
}

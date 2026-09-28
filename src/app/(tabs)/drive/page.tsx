import { getCurrentTeam, getDriveLimits, getSubmissionBoxes, getSubmittedFiles } from "@/data/api";
import { DriveScreen } from "@/features/drive/drive-screen";
import { getSessionMember } from "@/server/session";

/** 드라이브 탭 — 12 드라이브. */
export default async function DrivePage() {
  const team = await getCurrentTeam();
  const session = await getSessionMember();
  const [boxes, limits] = await Promise.all([getSubmissionBoxes(team.id), getDriveLimits(team.id)]);

  const myBox = (session?.name ? boxes.find((b) => b.owner === session.name) : null) ?? boxes[0] ?? null;
  const myFiles = myBox ? await getSubmittedFiles(team.id, myBox.id) : [];

  return (
    <DriveScreen
      team={team}
      boxes={boxes}
      limits={limits}
      myBoxId={myBox?.id ?? null}
      myLatestFile={myFiles[0] ?? null}
    />
  );
}

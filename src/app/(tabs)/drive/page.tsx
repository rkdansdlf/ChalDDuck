import { getCurrentTeam, getDriveLimits, getSubmissionBoxes } from "@/data/api";
import { DriveScreen } from "@/features/drive/drive-screen";

/** 드라이브 탭 — 12 드라이브. */
export default async function DrivePage() {
  const team = await getCurrentTeam();
  const [boxes, limits] = await Promise.all([getSubmissionBoxes(team.id), getDriveLimits(team.id)]);

  return <DriveScreen team={team} boxes={boxes} limits={limits} />;
}

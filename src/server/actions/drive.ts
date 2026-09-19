"use server";

import { revalidatePath } from "next/cache";
import { nextVersionLabel } from "@/features/drive/version-label";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";

/**
 * 22 파일 복원 서버 액션.
 *
 * 핵심 규칙: **복원은 덮어쓰기가 아니라 새 버전 추가다.** 옛 버전으로 되돌려도 그 사이의
 * 작업이 사라지지 않아야 하고, 되돌린 것 자체도 누가 언제 했는지 기록에 남아야 한다
 * — 이 기록은 기여도 리포트의 근거로도 쓰인다.
 */

/**
 * `versionId` 의 내용을 새 버전으로 맨 위에 추가한다. 기존 버전은 하나도 지우지 않는다.
 *
 * @returns 새로 만들어진 버전 이름("v5"). 화면이 "v5로 추가했습니다"라고 알린다.
 */
export async function restoreFileVersion(boxId: string, versionId: string): Promise<string> {
  const me = await requireSessionMember();

  // 화면이 보낸 제출함이 정말 우리 팀 것인지 서버에서 확인한다.
  const box = await db.submissionBox.findFirst({ where: { id: boxId, teamId: me.teamId } });
  if (!box) throw new Error("제출함을 찾을 수 없습니다.");

  const versions = await db.fileVersion.findMany({ where: { boxId: box.id } });
  const source = versions.find((v) => v.id === versionId);
  if (!source) throw new Error("복원할 버전을 찾을 수 없습니다.");

  const label = nextVersionLabel(versions);

  await db.fileVersion.create({
    data: {
      boxId: box.id,
      label,
      authorId: me.id,
      note: `${source.label} 복원`,
      size: source.size,
      kind: source.kind,
      previewUrl: source.previewUrl,
      // 복원은 마감과 무관한 작업이다 — 원본이 지각 제출이었어도 늦은 제출로 세지 않는다.
      isLate: false,
      whenLabel: "방금",
    },
  });

  revalidatePath("/drive", "layout");
  revalidatePath("/home");
  return label;
}

"use server";

import { revalidatePath } from "next/cache";
import type { ContribKindKey } from "@/lib/types";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";

/**
 * 16 / 17 / 18 / 23 기여 기록 서버 액션.
 *
 * 기록은 **팀 전체가 같은 표를 본다** — 내가 넣은 기록이 내 화면에만 보이면 팀원 확인이라는
 * 절차 자체가 성립하지 않는다.
 */

/** 직접 추가한 기록의 제목 길이 상한. 리포트 한 줄에 들어가야 한다. */
const MAX_TITLE = 120;

/**
 * 앱 밖에서 한 일을 기록에 넣는다.
 *
 * **`pending` 으로 들어간다.** 본인이 넣은 기록이 바로 확정되면 기록이 근거가 되지 못한다 —
 * 팀원 확인을 거쳐야 `ok` 가 된다. 서버가 상태를 정하므로 화면이 우회할 수 없다.
 */
export async function addContribRecord(input: {
  kind: ContribKindKey;
  title: string;
  hasEvidence: boolean;
}): Promise<void> {
  const me = await requireSessionMember();

  const title = input.title.trim().slice(0, MAX_TITLE);
  if (!title) throw new Error("무슨 일을 했는지 적어 주세요.");

  await db.contribRecord.create({
    data: {
      memberId: me.id,
      kind: input.kind,
      title,
      detail: `직접 추가한 기록${input.hasEvidence ? " · 근거 첨부됨" : ""}`,
      whenLabel: "방금",
      source: "self",
      state: "pending",
      byLabel: "팀원 확인 대기",
      hasEvidence: input.hasEvidence,
    },
  });

  revalidatePath("/team", "layout");
  revalidatePath("/home");
}

/**
 * 의견 차이에 응답한다. `way` 가 그대로 확인 문구가 된다.
 *
 * ⚠️ **적힌 의견(`dispute`)은 지우지 않는다.** 결론만 남기고 의견을 지우면 한쪽 말로 덮는
 * 것이 되어, 정정을 요구한 사람이 기록을 믿을 수 없게 된다. 어떻게 정리했는지를
 * `resolution` 에 따로 적고 둘 다 남긴다.
 */
export async function resolveContribDispute(recordId: string, way: string): Promise<void> {
  const me = await requireSessionMember();

  // 우리 팀 기록인지 서버에서 확인한다.
  // 누가 응답할 수 있는지(기록 당사자만인지)는 기획안에 없어 팀원 누구나로 열어 뒀다.
  const record = await db.contribRecord.findFirst({
    where: { id: recordId, member: { teamId: me.teamId } },
  });
  if (!record) throw new Error("기록을 찾을 수 없습니다.");
  if (record.state !== "disputed") return;

  await db.contribRecord.update({
    where: { id: record.id },
    data: { state: "ok", byLabel: way, resolution: way },
  });

  revalidatePath("/team", "layout");
  revalidatePath("/home");
}

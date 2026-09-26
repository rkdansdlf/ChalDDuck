"use server";

import { revalidatePath } from "next/cache";
import type { ContribKindKey } from "@/lib/types";
import { refreshContribState } from "@/server/contrib/state";
import { db } from "@/server/db";
import { notify } from "@/server/notify/create";
import { requireSessionMember } from "@/server/session";
import { signTeamFileUrl, signTeamUpload, verifyTeamUpload } from "@/server/storage/team-upload";
import type { PrepareUploadResult, UploadRejection } from "@/server/actions/drive";

/**
 * 16 / 17 / 18 / 23 기여 기록 서버 액션.
 *
 * 기록은 **팀 전체가 같은 표를 본다** — 내가 넣은 기록이 내 화면에만 보이면 팀원 확인이라는
 * 절차 자체가 성립하지 않는다.
 *
 * 상태(`ok`/`pending`/`disputed`)는 여기서 직접 정하지 않는다. 무엇을 바꾸든 마지막에
 * `refreshContribState()` 를 불러 확인 수와 적힌 의견에서 다시 계산한다.
 */

/** 직접 추가한 기록의 제목 길이 상한. 리포트 한 줄에 들어가야 한다. */
const MAX_TITLE = 120;

/** 적는 의견의 길이 상한. */
const MAX_DISPUTE = 300;

/** 우리 팀 기록인지 확인하고 가져온다. */
async function teamRecord(recordId: string, teamId: string) {
  return db.contribRecord.findFirst({
    where: { id: recordId, member: { teamId } },
  });
}

/**
 * 23 근거 파일 올리기 1단계 — 저장소에 직접 올릴 주소를 발급한다.
 *
 * 드라이브 올리기(`prepareUpload`)와 같은 규칙이다. 파일 본문은 이 서버를 거치지 않고,
 * 크기·형식은 브라우저가 말한 값이라 기록을 만들 때(`addContribRecord`) 저장소에서 다시 본다.
 * 경로는 서버가 정한다 — `{teamId}/evidence/{uuid}`.
 */
export async function prepareEvidenceUpload(meta: {
  name: string;
  size: number;
  type: string;
}): Promise<PrepareUploadResult> {
  const me = await requireSessionMember();
  return signTeamUpload(`${me.teamId}/evidence/`, meta);
}

/**
 * 앱 밖에서 한 일을 기록에 넣는다.
 *
 * **`pending` 으로 들어간다.** 본인이 넣은 기록이 바로 확정되면 기록이 근거가 되지 못한다 —
 * 팀원 확인을 거쳐야 `ok` 가 된다. 서버가 상태를 정하므로 화면이 우회할 수 없다.
 *
 * 근거 파일은 저장소에 **실제로 들어온 객체**로 다시 확인한다. 규칙에 어긋나면 객체를 지우고
 * 기록도 만들지 않는다 — "근거 첨부됨"이 남았는데 열 것이 없던 일(44 커밋)을 되풀이하지 않는다.
 */
export async function addContribRecord(input: {
  kind: ContribKindKey;
  title: string;
  evidence?: { path: string; name: string };
}): Promise<{ status: "ok" } | { status: UploadRejection | "missing" }> {
  const me = await requireSessionMember();

  const title = input.title.trim().slice(0, MAX_TITLE);
  if (!title) throw new Error("무슨 일을 했는지 적어 주세요.");

  let evidence: { evidencePath: string; evidenceName: string; evidenceBytes: number; evidenceMime: string } | null =
    null;
  if (input.evidence) {
    const checked = await verifyTeamUpload(`${me.teamId}/evidence/`, input.evidence);
    if (checked.status !== "ok") return checked;
    evidence = {
      evidencePath: checked.path,
      evidenceName: checked.name,
      evidenceBytes: checked.bytes,
      evidenceMime: checked.mime,
    };
  }

  await db.contribRecord.create({
    data: {
      memberId: me.id,
      kind: input.kind,
      title,
      detail: evidence ? "직접 추가한 기록 · 근거 첨부" : "직접 추가한 기록",
      whenLabel: "방금",
      source: "self",
      state: "pending",
      ...evidence,
    },
  });

  revalidatePath("/team", "layout");
  revalidatePath("/home");
  return { status: "ok" };
}

/**
 * 근거 파일을 여는 주소. 확인하는 팀원이 누른다.
 *
 * 드라이브처럼 짧게 사는 서명 주소를 볼 때마다 새로 만든다. 이미지·PDF 는 브라우저가
 * 바로 보여 주고, 그 밖의 형식은 내려받는다.
 */
export async function getEvidenceUrl(recordId: string): Promise<string | null> {
  const me = await requireSessionMember();
  const record = await teamRecord(recordId, me.teamId);
  if (!record?.evidencePath) return null;
  return signTeamFileUrl(record.evidencePath, record.evidenceName ?? "근거", record.evidenceMime);
}

/**
 * 팀원의 기록을 "맞다"고 확인해 준다.
 *
 * **자기 기록은 확인할 수 없다.** 본인 말만으로 확정되면 기록이 근거가 되지 못한다는 것이
 * 이 기능의 전부다. 의견 차이가 걸린 기록도 확인 대상이 아니다 — 먼저 정리되어야 한다.
 */
export async function confirmContribRecord(
  recordId: string,
): Promise<"ok" | "mine" | "disputed" | "already"> {
  const me = await requireSessionMember();

  const record = await teamRecord(recordId, me.teamId);
  if (!record) throw new Error("기록을 찾을 수 없습니다.");
  if (record.memberId === me.id) return "mine";
  if (record.state === "disputed") return "disputed";

  const existing = await db.contribConfirm.findUnique({
    where: { recordId_memberId: { recordId: record.id, memberId: me.id } },
  });
  if (existing) return "already";

  await db.contribConfirm.create({ data: { recordId: record.id, memberId: me.id } });
  await refreshContribState(record.id);

  await notify({
    to: [record.memberId],
    kind: "contrib-confirm",
    title: `${me.name}님이 기록을 확인해 줬습니다`,
    body: record.title,
    href: "/team/contrib",
    actorId: me.id,
  });

  revalidatePath("/team", "layout");
  revalidatePath("/home");
  return "ok";
}

/**
 * 팀원의 기록이 사실과 다르다고 적는다.
 *
 * 17 화면이 "정정할 권리가 있습니다"라고 약속하는 자리다. 적힌 의견은 지워지지 않고,
 * 정리된 뒤에도 결론과 **함께** 남는다.
 *
 * 자기 기록에는 적을 수 없다 — 자기 기록이 마음에 안 들면 고치거나 지우는 문제이지
 * 의견 차이가 아니다. 이미 의견이 걸린 기록에 덮어쓰지도 않는다.
 */
export async function disputeContribRecord(
  recordId: string,
  reason: string,
): Promise<"ok" | "mine" | "taken"> {
  const me = await requireSessionMember();

  const text = reason.trim().slice(0, MAX_DISPUTE);
  if (!text) throw new Error("무엇이 다른지 적어 주세요.");

  const record = await teamRecord(recordId, me.teamId);
  if (!record) throw new Error("기록을 찾을 수 없습니다.");
  if (record.memberId === me.id) return "mine";
  // 앞선 의견을 덮으면 그 사람의 말이 사라진다.
  if (record.dispute && !record.resolution) return "taken";

  await db.contribRecord.update({
    where: { id: record.id },
    // 본문에 이름을 섞지 않는다 — 나중에 이름을 떼어내려면 본문을 파싱해야 하고, 그러면
    // 콜론이 든 의견에서 엉뚱한 곳이 잘린다.
    data: { dispute: text, disputedById: me.id, resolution: null },
  });
  await refreshContribState(record.id);

  await notify({
    to: [record.memberId],
    kind: "contrib-dispute",
    title: `${me.name}님이 기록에 의견을 남겼습니다`,
    body: record.title,
    href: "/team/contrib/members",
    actorId: me.id,
  });

  revalidatePath("/team", "layout");
  revalidatePath("/home");
  return "ok";
}

/**
 * 의견 차이에 응답한다. `way` 가 그대로 확인 문구가 된다.
 *
 * ⚠️ **적힌 의견(`dispute`)은 지우지 않는다.** 결론만 남기고 의견을 지우면 한쪽 말로 덮는
 * 것이 되어, 정정을 요구한 사람이 기록을 믿을 수 없게 된다. 어떻게 정리했는지를
 * `resolution` 에 따로 적고 둘 다 남긴다.
 */
export async function resolveContribDispute(recordId: string, way: string): Promise<"ok" | "gone"> {
  const me = await requireSessionMember();

  // 우리 팀 기록인지 서버에서 확인한다.
  // 누가 응답할 수 있는지(기록 당사자만인지)는 기획안에 없어 팀원 누구나로 열어 뒀다.
  const record = await teamRecord(recordId, me.teamId);
  if (!record) throw new Error("기록을 찾을 수 없습니다.");
  if (record.state !== "disputed") return "gone";

  await db.contribRecord.update({
    where: { id: record.id },
    data: { resolution: way },
  });
  await refreshContribState(record.id);

  revalidatePath("/team", "layout");
  revalidatePath("/home");
  return "ok";
}

"use server";

import { revalidatePath } from "next/cache";
import { canConfirm, isResolutionWay, RESOLUTION_WAYS } from "@/features/contrib/resolution";
import type { ContribKindKey, TeamCheckRecord } from "@/lib/types";
import {
  canResolveContrib,
  contribState,
  maxConfirmsNeeded,
  refreshContribState,
} from "@/server/contrib/state";
import { teamCheckRecords } from "@/server/contrib/team-check";
import { db } from "@/server/db";
import { notify } from "@/server/notify/create";
import { requireLeader, requireSessionMember } from "@/server/session";
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
      // 시각을 문자열로 저장하지 않는다. 예전에는 "방금" 을 저장해서, 석 달 전에 추가한
      // 기록도 오늘 추가한 것처럼 계속 "방금" 이었다(`lib/when.ts` 가 같은 이유로 파일 쪽은
      // 지킨다). 이 칸은 **사람이 적은 설명**(예: "9/8 – 9/12")을 위한 것이고, 언제 추가했는지는
      // `createdAt` 이 말한다.
      whenLabel: null,
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
): Promise<"ok" | "mine" | "disputed" | "notDisputer" | "already"> {
  const me = await requireSessionMember();

  const record = await teamRecord(recordId, me.teamId);
  if (!record) throw new Error("기록을 찾을 수 없습니다.");
  if (record.state === "disputed") return "disputed";
  // **자기 기록도, 자기 반대한 기록도** 확인하지 못한다 — 화면이 숨기는 것과 같은 함수다.
  if (!canConfirm({
    memberId: record.memberId,
    disputedById: record.disputedById,
    meId: me.id,
  })) {
    return record.memberId === me.id ? "mine" : "notDisputer";
  }

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

  /**
   * **판정과 기록을 한 트랜잭션에서 한다 — 기록 행을 잠근 안에서.**
   *
   * 예전에는 "아직 정리되지 않은 의견이 있으면 기다린다" 는 판단을 읽기만 하고, 6줄 뒤
   * 트랜잭션에서 적었다. 그 사이가 구멍이었다 — **두 사람이 동시에 달라고 하면 둘 다
   * "비어 있다"를 보고 둘 다 적고**, `ContribDispute` 에 유니크 제약이 없어서意见 두 개가
   * 붙는다. 코드가 막으려는 상황이 그대로 열린다. `dispute` 칸에는 뒤 것만 남고,
   * 무엇에 대한 판단인지 흐려진다 — 주석이 경계한 바로 그 일이었다.
   *
   * 락은 기록 하나에만 걸린다(같은 논문의 `server/actions/ice.ts` · `drive.ts` 와 같은 방식).
   * **팀 확인은 락 안에서 다시 한다** — 잠근 뒤에 판정해야 하므로. 남의 팀 기록을 잠그는
   * 것은 잠깐 동안일 뿐이고(커밋과 동시에 풀린다), 아무것도 읽지 않은 채로 되돌아가므로
   * 정보가 새어 나가지 않는다.
   */
  const outcome = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "ContribRecord" WHERE "id" = ${recordId} FOR UPDATE`;

    const record = await tx.contribRecord.findFirst({
      where: { id: recordId, member: { teamId: me.teamId } },
      select: { id: true, memberId: true, title: true, dispute: true, resolution: true },
    });
    if (!record) return { status: "gone" as const };
    if (record.memberId === me.id) return { status: "mine" as const };
    // 아직 정리되지 않은 의견이 있으면 기다린다 — 동시로 두 개의 "다르다"가 붙으면
    // 무엇에 대한 판단인지 흐려진다.
    if (record.dispute && !record.resolution) return { status: "taken" as const };

    // **덮어쓰지 않는다.** 예전에는 이 `update` 하나가 앞선 의견과 이미 합의된 정정 내용까지
    // 함께 지웠다 — 기록의 주인이 그 사이 적어 둔 말이 화면에서 사라졌다. 17 화면이
    // "한쪽 말로 덮지 않고 둘 다 남깁니다"라고 말하고, 스키마 주석도 "`dispute` 는 여기 값이
    // 생겨도 지우지 않는다"고 적어 놓았다. 둘 다 코드와 어긋나 있었다.
    await tx.contribDispute.create({ data: { recordId: record.id, byId: me.id, text } });
    await tx.contribRecord.update({
      where: { id: record.id },
      // 본문에 이름을 섞지 않는다 — 나중에 이름을 떼어내려면 본문을 파싱해야 하고, 그러면
      // 콜론이 든 의견에서 엉뚱한 곳이 잘린다.
      data: { dispute: text, disputedById: me.id, resolution: null },
    });
    // **상태도 같은 안에서 맞춘다.** 밖에서 다시 읽으면 그 사이에 정리되어 opinion 이 사라진
    // 기록을 보고 "의견 차이"로 되돌아갈 수 있다.
    await refreshContribState(record.id, tx);

    return { status: "ok" as const, title: record.title, memberId: record.memberId };
  });

  // 기록이 사라진 것은 **예상하지 못 한 일**이다(화면이 열려 있는 사이에 지워졌다) — 예측 가능한
  // 거절("taken", "mine")과 달리 화면이 준비할 말이 없다. 예전에도 던졌고, 던진 쪽이 문구를
  // 지운다는 규칙(`server/actions/*.ts` 머리말)대로 화면은 일반 실패 문구를 보인다.
  // 반환 값에 넣지 않는다 — 실제로 나올 수 없는 경우를 계약에 적으면 호출부가 대비하게 된다.
  if (outcome.status === "gone") throw new Error("기록을 찾을 수 없습니다.");
  if (outcome.status === "mine") return "mine";
  if (outcome.status === "taken") return "taken";

  await notify({
    to: [outcome.memberId],
    kind: "contrib-dispute",
    title: `${me.name}님이 기록에 의견을 남겼습니다`,
    body: outcome.title,
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
 *
 * **답할 수 있는 사람은 기록 주인과 지금 의견을 적은 사람뿐이다**(`canResolveContrib`).
 * 예전에는 "기획에 없어" 팀원 누구나로 열어 뒀는데, 제3자가 결론을 적으면 두 사람이
 * 정리한 것이 아니라 제3자가 정한 것이 되어 버린다. 화면이 버튼을 감추지만 주소로 바로
 * 들어올 수 있으므로 여기서 다시 확인한다.
 */
export async function resolveContribDispute(
  recordId: string,
  way: string,
): Promise<"ok" | "gone" | "notYours" | "badWay"> {
  const me = await requireSessionMember();

  // **화면이 보낸 결론을 그대로 쓰지 않는다.** 예전에는 문자열이 무엇이든 저장됐다 — 주소로
  // 부르면 임의의 문장이 결론으로 들어가고, 리포트의 "정리되지 않은 의견" 집계는 한국어 문장을
  // 읽어야 했다. 키만 받고 문구는 여기서 만든다.
  if (!isResolutionWay(way)) throw new Error("정결할 수 없는 말입니다.");

  // 우리 팀 기록인지 서버에서 확인한다.
  const record = await teamRecord(recordId, me.teamId);
  if (!record) throw new Error("기록을 찾을 수 없습니다.");
  if (record.state !== "disputed") return "gone";
  if (!canResolveContrib({ memberId: record.memberId, disputedById: record.disputedById, meId: me.id })) {
    return "notYours";
  }

  await db.contribRecord.update({
    where: { id: record.id },
    data: { resolution: RESOLUTION_WAYS[way] },
  });
  await refreshContribState(record.id);

  revalidatePath("/team", "layout");
  revalidatePath("/home");
  return "ok";
}

/**
 * 17 화면(팀원 확인)을 열지 않고도 다시 읽는다.
 *
 * **왜 폴링이 필요한가.** "채팅 목록과 홈이 스스로 따라온다" 는 약속이 있고 실제로 그렇게
 * 동작한다. 17 화면만 아니었다 — 내가 "확인함"을 눌러도 목록은 그대로였고, 동료가 확인하거나
 * 반박해 나타나도 팀원이 화면을 옮기기 전까지는 보이지 않았다. 함께 보고 있는 목록인데
 * 옆 사람이 갱신되지 않는 것은 그 사람이 화면을 넘겨야만 알게 된다는 뜻이다.
 *
 * `usePoll` 이 이미 지켜 주는 것(안 보이는 탭에서는 부르지 않는다·겹치지 않는다)을 그대로
 * 물려받는다 — 주기만 길게 둔다. 확인·반박은 사람이 하는 일이라 4초는 짧다.
 */
export async function pollContribCheck(): Promise<TeamCheckRecord[]> {
  const me = await requireSessionMember();
  return teamCheckRecords(me.teamId, me.id);
}

/**
 * 기록이 확정되려면 몇 명이 확인해야 하는지 — **팀장이 정한다.**
 *
 * 예전에는 `CONFIRMS_NEEDED = 1` 이 코드 상수였다. 기준을 정하려면 코드를 고쳐 배포해야 했고,
 * 기준이 정해지지 않았다는 사실이 17 화면의 검토 안내에만 적혀 있었다.
 *
 * **바꾸면 팀의 기록을 전부 다시 계산한다.** 1명 확인이었던 기록이 2명 기준 아래에서
 * "확정"이라면 그 말 자체가 거짓이다 — 기준을 올린 이상 다시 기다려야 한다. 그래서
 * 저장은 그 전에 **몇 건이 달라지는지 말하고 한 번 더 받는다**(`ok: false` + `affected`).
 *
 * 팀장만 바꾼다(`requireLeader`) — 재입장 승인과 같은 기준이다.
 */
export type ConfirmsNeededResult =
  | { ok: false; /** 이렇게 바꾸면 상태가 달라지는 기록 수. */ affected: number; needed: number }
  | { ok: true; needed: number; affected: number };

export async function setConfirmsNeeded(needed: number, confirm: boolean): Promise<ConfirmsNeededResult> {
  const leader = await requireLeader();
  const teamId = leader.teamId;

  const members = await db.member.count({ where: { teamId, leftAt: null } });
  const max = maxConfirmsNeeded(members);

  if (!Number.isInteger(needed) || needed < 1) throw new Error("확인 인원은 1명 이상이어야 합니다.");
  if (needed > max) {
    throw new Error(
      `확인 인원은 ${max}명까지입니다. 팀이 ${members}명이면 자기 기록의 주인을 빼고 ${max}명만 확인할 수 있습니다.`,
    );
  }

  // 바꿀 게 없으면 화면에 "바뀌는 기록 N건"을 띄우지 않는다 — 0건인 대화를 벌이는 일이다.
  const before = await db.contribRecord.findMany({
    where: { member: { teamId } },
    select: { id: true, state: true, dispute: true, resolution: true, _count: { select: { confirms: true } } },
  });
  const team = await db.team.findUniqueOrThrow({ where: { id: teamId }, select: { confirmsNeeded: true } });

  const changed = before.filter((r) => {
    const after = contribState({
      confirms: r._count.confirms,
      dispute: r.dispute,
      resolution: r.resolution,
      needed,
    });
    return after !== r.state;
  }).length;

  if (team.confirmsNeeded === needed) return { ok: true, needed, affected: 0 };
  if (!confirm) return { ok: false, affected: changed, needed };

  await db.team.update({ where: { id: teamId }, data: { confirmsNeeded: needed } });
  // 표에 저장된 `state` 를 기준에 맞춰 다시 계산한다 — 기준만 바꾸고 상태를 남기면
  // 목록의 "확인됨"이 기준과 어긋난 채 굳는다.
  for (const r of before) await refreshContribState(r.id);

  revalidatePath("/team", "layout");
  revalidatePath("/home");
  return { ok: true, needed, affected: changed };
}

/**
 * 회의 참여 표시를 찍거나 지운다 — **팀장만**(`requireLeader`).
 *
 * 앱이 판정하지 않는다(정책: 입장과 발언을 정확히 아는 쪽이 아니라 자동 판정이 정직하지 않다).
 * 붙는 곳은 **기록 하나**고, 참여자는 그 기록의 주인이다. 공동 작업은 23 화면의 정정 응답이
 * 그 자리를 맡고 있다.
 *
 * **지워도 흔적이 남는다.** 취소는 행을 지우지 않고 `activeKey` 를 비운다 — 누가 · 언제
 * 지웠는지 남지 않으면 "왜 참여 표시가 없나"에 답할 수 없고, 공로 평가처럼 보이는 대로
 * 조작할 수 있게 된다. 같은 자리(`activeKey`)를 다시 쓰는 방식이라 **한 기록에 표시가 두 개**
 * 는 유일 인덱스가 DB 에서 막는다.
 *
 * **기록 상태는 건드리지 않는다.** 참여한다고 기록이 확정되지 않는다(확인은 팀원이 한다).
 * 의견 차이가 떠 있어도 참여 여부는 사실일 수 있다 — 다툼은 기록의 *내용*에 대한 것이고
 * 사람이 그 일을 했는지는 별개다.
 */
export type ParticipationResult = "marked" | "cleared" | "already" | "gone";

export async function setParticipation(
  recordId: string,
  mark: boolean,
): Promise<ParticipationResult> {
  const leader = await requireLeader();

  const record = await db.contribRecord.findFirst({
    where: { id: recordId, member: { teamId: leader.teamId } },
    select: { id: true, memberId: true, title: true },
  });
  if (!record) return "gone";

  // 현재 표시 중인 행. 취소된 행(과거)이 있어도 하나만 고른다 — activeKey 가 그 구분이다.
  const current = await db.contribParticipation.findFirst({
    where: { recordId: record.id, activeKey: record.id },
    select: { id: true },
  });

  if (mark) {
    if (current) return "already";
    // 유일 인덱스가 막지만, 동시로 두 번 눌렀을 때 한쪽이 500 으로 죽지 않게 한다.
    await db.contribParticipation
      .create({ data: { recordId: record.id, activeKey: record.id, shownById: leader.id } })
      .catch((e) => {
        if ((e as { code?: string }).code === "P2002") return null;
        throw e;
      });
    if (!current) {
      await notify({
        to: [record.memberId],
        kind: "contrib-participation",
        title: `${leader.name}님이 참여로 표시했습니다`,
        body: record.title,
        href: "/team/contrib",
        actorId: leader.id,
      });
    }
  } else {
    if (!current) return "already";
    await db.contribParticipation.update({
      where: { id: current.id },
      data: { activeKey: null, clearedById: leader.id, clearedAt: new Date() },
    });
    await notify({
      to: [record.memberId],
      kind: "contrib-participation",
      title: `${leader.name}님이 참여 표시를 취소했습니다`,
      body: record.title,
      href: "/team/contrib",
      actorId: leader.id,
    });
  }

  revalidatePath("/team", "layout");
  revalidatePath("/home");
  return mark ? "marked" : "cleared";
}

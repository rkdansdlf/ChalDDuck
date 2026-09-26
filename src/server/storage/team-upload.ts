import "server-only";

import { randomUUID } from "node:crypto";
import { MAX_BYTES, resolveFileType } from "@/features/drive/file-rules";
import type { PrepareUploadResult, UploadRejection } from "@/server/actions/drive";
import { isStorageConfigured, storage } from "./client";

/**
 * 드라이브 밖에서 파일을 받는 곳(기여 기록의 근거, 단톡방 첨부)이 함께 쓰는 두 단계.
 *
 * 드라이브 올리기와 규칙이 같다 — 파일 본문은 이 서버를 거치지 않고 브라우저가 저장소에
 * 직접 올리며, 서버는 올리기 전(주소 발급)과 올린 뒤(실제 객체 확인) 두 번만 본다.
 * 경로는 늘 서버가 정한다: `{prefix}{uuid}`. `prefix` 는 팀 id 로 시작해야 한다.
 */

/** 1단계 — 브라우저가 올릴 서명 주소. 크기·형식은 브라우저가 말한 값이라 2단계에서 다시 본다. */
export async function signTeamUpload(
  prefix: string,
  meta: { name: string; size: number; type: string },
): Promise<PrepareUploadResult> {
  if (!isStorageConfigured()) return { status: "not-configured" };
  if (meta.size <= 0) return { status: "empty" };
  if (meta.size > MAX_BYTES) return { status: "too-big" };
  const type = resolveFileType(meta.name, meta.type);
  if (!type) return { status: "bad-type" };

  const path = `${prefix}${randomUUID()}`;
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error) {
    console.error("[storage] 올리기 주소 발급 실패:", error);
    throw new Error("저장소가 응답하지 않습니다.");
  }
  return { status: "ok", path, signedUrl: data.signedUrl, contentType: type.contentType };
}

export type VerifiedUpload = { status: "ok"; path: string; name: string; bytes: number; mime: string };

/**
 * 2단계 — 저장소에 **실제로 들어온 객체**를 확인한다. 서명 주소로는 무엇이든 올릴 수 있다.
 *
 * 규칙에 어긋나면 객체를 지운다. 경로가 1단계에서 정해 준 모양이 아니면 던진다 — 다른 팀·다른
 * 자리의 객체를 제 것처럼 붙이려는 요청이라 사람에게 설명할 거절이 아니다.
 */
export async function verifyTeamUpload(
  prefix: string,
  upload: { path: string; name: string },
): Promise<VerifiedUpload | { status: UploadRejection | "missing" }> {
  if (!isStorageConfigured()) return { status: "not-configured" };

  const rest = upload.path.startsWith(prefix) ? upload.path.slice(prefix.length) : "";
  if (!/^[0-9a-f-]{36}$/.test(rest)) throw new Error("올린 파일의 경로가 올바르지 않습니다.");

  const name = upload.name.trim().slice(0, 200);
  const { data: info, error } = await storage().info(upload.path);
  if (error || !info) return { status: "missing" };

  const bytes = info.size ?? 0;
  const type = resolveFileType(name, info.contentType ?? "");
  const rejection: UploadRejection | null =
    !name || bytes <= 0 ? "empty" : bytes > MAX_BYTES ? "too-big" : !type ? "bad-type" : null;
  if (rejection || !type) {
    await storage().remove([upload.path]);
    return { status: rejection ?? "bad-type" };
  }
  return { status: "ok", path: upload.path, name, bytes, mime: type.contentType };
}

/**
 * 여는 주소. 짧게 사는 서명 주소를 볼 때마다 새로 만든다.
 * 이미지·PDF 는 브라우저가 바로 보여 주고, 그 밖의 형식은 원래 이름으로 내려받는다.
 */
export async function signTeamFileUrl(path: string, name: string, mime: string | null): Promise<string | null> {
  if (!isStorageConfigured()) return null;
  const inline = mime === "application/pdf" || mime?.startsWith("image/");
  const { data, error } = await storage().createSignedUrl(path, 10 * 60, inline ? undefined : { download: name });
  if (error) {
    console.error("[storage] 서명 주소 실패:", error);
    return null;
  }
  return data.signedUrl;
}

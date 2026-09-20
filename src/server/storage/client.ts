import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Storage 한 겹.
 *
 * ⚠️ **비밀 키(Secret key)를 쓴다.** 이 앱은 Supabase Auth 를 쓰지 않아서(가입·로그인이
 * 없는 제품이다) 저장소의 RLS 가 판단할 사용자가 없다. 그래서 버킷을 비공개로 두고 **접근
 * 권한은 앱이 직접 확인한다** — 모든 저장소 호출 앞에 `requireSessionMember()` 와
 * "우리 팀 것인지" 확인이 붙는다.
 *
 * 그래서 이 모듈은 서버 전용이다. 이 키가 브라우저로 나가면 저장소 전체가 열린다.
 */

/** 제출 파일이 들어가는 버킷. 비공개이고, 내려받기는 서명된 주소로만 한다. */
export const BUCKET = "submissions";

/** 한 파일의 크기 상한. 팀플 발표 자료 기준이고, 넘으면 올리기 전에 막는다. */
export const MAX_BYTES = 50 * 1024 * 1024;

/**
 * 받을 형식.
 *
 * 화면이 안내하는 것과 같다(문서·이미지·PPT·PDF). 실행 파일이 팀 드라이브를 타고
 * 도는 일을 막으려는 것이기도 하다.
 */
export const ALLOWED_MIME: Record<string, "pptx" | "docx" | "pdf" | "image"> = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "docx",
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
};

/**
 * 저장소에 쓸 비밀 키.
 *
 * Supabase 가 키 이름을 바꿨다 — 새 이름은 **Secret key**(`sb_secret_...`), 예전 이름은
 * `service_role`(JWT, `eyJ...`)이고 2026년 말 폐기 예정이다. 둘 다 받아 두면 지금 발급한
 * 키도, 이미 쓰던 키도 그대로 동작한다.
 */
function secretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function isStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && secretKey());
}

let cached: SupabaseClient | null = null;

export function storage() {
  const url = process.env.SUPABASE_URL;
  const key = secretKey();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SECRET_KEY 가 없습니다. `.env.example` 을 참고하세요.",
    );
  }

  cached ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached.storage.from(BUCKET);
}

/** 사람이 읽을 크기. 표시용이고 계산에는 `bytes` 를 쓴다. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

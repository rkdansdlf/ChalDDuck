import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth 클라이언트.
 *
 * 사용자의 실제 이메일로 6자리 OTP 및 매직 링크를 전송하고 검증하는 데 사용합니다.
 * Supabase 대시보드에 구성된 기본 메일러 또는 연결된 SMTP를 통해 실제 이메일이 발송됩니다.
 */

let cachedAuthClient: SupabaseClient | null = null;

export function getSupabaseAuthClient(): SupabaseClient {
  if (cachedAuthClient) return cachedAuthClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL 또는 SUPABASE_SECRET_KEY가 설정되어 있지 않습니다.");
  }

  cachedAuthClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedAuthClient;
}

/** Supabase Auth를 통해 실제 사용자 이메일로 6자리 인증 OTP 발송 */
export async function sendSupabaseOtp(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabaseAuthClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.warn("[Supabase Auth] signInWithOtp warning:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("[Supabase Auth] sendSupabaseOtp exception:", err);
    return { success: false, error: String(err) };
  }
}

/** Supabase Auth로 사용자가 입력한 6자리 OTP 코드 검증 */
export async function verifySupabaseOtp(email: string, token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabaseAuthClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error || !data.user) {
      return { success: false, error: error?.message ?? "인증 실패" };
    }

    return { success: true };
  } catch (err) {
    console.error("[Supabase Auth] verifySupabaseOtp exception:", err);
    return { success: false, error: String(err) };
  }
}

"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";

const EXPIRE_DAYS = 14;

/**
 * 기여 기록 리포트 공유 링크용 보안 토큰을 생성하거나 기존 유효한 토큰을 반환한다.
 */
export async function createReportShareToken(scope: "professor" | "internal" = "professor"): Promise<{
  token: string;
  url: string;
  expiresAt: string;
}> {
  const me = await requireSessionMember();

  const now = new Date();
  // 기존에 유효한 동일 scope 토큰이 있으면 재사용
  const existing = await db.reportShareToken.findFirst({
    where: {
      teamId: me.teamId,
      scope,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return {
      token: existing.token,
      url: `/report/${existing.token}`,
      expiresAt: existing.expiresAt.toISOString(),
    };
  }

  // 32바이트(256비트) 암호학적 랜덤 토큰 생성
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + EXPIRE_DAYS * 24 * 60 * 60 * 1000);

  const created = await db.reportShareToken.create({
    data: {
      teamId: me.teamId,
      token,
      scope,
      expiresAt,
      createdById: me.id,
    },
  });

  revalidatePath("/team/contrib/report");

  return {
    token: created.token,
    url: `/report/${created.token}`,
    expiresAt: created.expiresAt.toISOString(),
  };
}

/**
 * 특정 공유 토큰을 폐기한다.
 */
export async function revokeReportShareToken(token: string): Promise<void> {
  const me = await requireSessionMember();

  await db.reportShareToken.updateMany({
    where: {
      token,
      teamId: me.teamId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  revalidatePath("/team/contrib/report");
}

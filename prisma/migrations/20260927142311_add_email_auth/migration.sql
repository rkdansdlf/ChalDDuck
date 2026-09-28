-- AlterTable
ALTER TABLE "JoinRequest" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "email" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailAuthToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailAuthToken_token_key" ON "EmailAuthToken"("token");

-- CreateIndex
CREATE INDEX "EmailAuthToken_email_idx" ON "EmailAuthToken"("email");

-- CreateIndex
CREATE INDEX "Member_email_idx" ON "Member"("email");

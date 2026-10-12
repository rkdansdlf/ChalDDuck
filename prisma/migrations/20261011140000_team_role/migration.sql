-- CreateTable
CREATE TABLE "TeamRole" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamRole_teamId_position_idx" ON "TeamRole"("teamId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRole_teamId_key_key" ON "TeamRole"("teamId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRole_teamId_name_key" ON "TeamRole"("teamId", "name");

-- AddForeignKey
ALTER TABLE "TeamRole" ADD CONSTRAINT "TeamRole_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "RoleEstimate" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoleEstimate_teamId_idx" ON "RoleEstimate"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleEstimate_teamId_role_key" ON "RoleEstimate"("teamId", "role");

-- AddForeignKey
ALTER TABLE "RoleEstimate" ADD CONSTRAINT "RoleEstimate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

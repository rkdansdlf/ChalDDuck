-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "menuDetail" TEXT;

-- CreateTable
CREATE TABLE "DrawOption" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DrawOption_teamId_idx" ON "DrawOption"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawOption_teamId_label_key" ON "DrawOption"("teamId", "label");

-- AddForeignKey
ALTER TABLE "DrawOption" ADD CONSTRAINT "DrawOption_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

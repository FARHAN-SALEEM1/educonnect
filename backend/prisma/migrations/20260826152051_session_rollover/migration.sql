-- CreateEnum
CREATE TYPE "PromotionOutcome" AS ENUM ('PROMOTED', 'RETAINED', 'GRADUATED');

-- AlterTable
ALTER TABLE "institutes" ADD COLUMN     "currentSession" TEXT NOT NULL DEFAULT '2026-27';

-- CreateTable
CREATE TABLE "student_promotions" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "fromSession" TEXT NOT NULL,
    "toSession" TEXT NOT NULL,
    "fromGrade" TEXT NOT NULL,
    "fromSection" TEXT NOT NULL,
    "toGrade" TEXT,
    "toSection" TEXT,
    "outcome" "PromotionOutcome" NOT NULL,
    "notes" TEXT,
    "promotedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_promotions_studentId_idx" ON "student_promotions"("studentId");

-- CreateIndex
CREATE INDEX "student_promotions_instituteId_toSession_idx" ON "student_promotions"("instituteId", "toSession");

-- AddForeignKey
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_promotedById_fkey" FOREIGN KEY ("promotedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

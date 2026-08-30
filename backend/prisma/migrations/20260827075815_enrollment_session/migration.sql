-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "academicSessionId" TEXT;

-- CreateIndex
CREATE INDEX "enrollments_academicSessionId_idx" ON "enrollments"("academicSessionId");

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

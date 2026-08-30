-- CreateEnum
CREATE TYPE "AssessmentTerm" AS ENUM ('FIRST', 'MID', 'FINAL');

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "term" "AssessmentTerm";

-- CreateIndex
CREATE INDEX "assessments_enrollmentId_term_idx" ON "assessments"("enrollmentId", "term");

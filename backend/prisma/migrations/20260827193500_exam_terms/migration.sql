-- Examination terms a school names for itself, per academic year.
--
-- Replaces `enum AssessmentTerm { FIRST, MID, FINAL }`, which decided for every
-- school on the platform that a year has exactly three terms with those names.
-- Plenty of Pakistani schools run two — Half Yearly and Annual — and some run
-- four; a school that cannot name its own terms cannot produce its own card.
--
-- Attached to the session rather than the institute for the same reason
-- enrolments are: moving from three terms to two must not lose the terms last
-- year's cards were written in.

-- Guard: this database has no assessment carrying a term, so dropping the
-- column loses nothing. Another one might. Refuse rather than erase.
DO $$
DECLARE carrying INT;
BEGIN
  SELECT count(*) INTO carrying FROM "assessments" WHERE "term" IS NOT NULL;
  IF carrying > 0 THEN
    RAISE EXCEPTION
      '% assessment(s) still carry a term. Create the ExamTerm rows and map them onto examTermId before dropping the column.', carrying;
  END IF;
END $$;

CREATE TABLE "exam_terms" (
    "id" TEXT NOT NULL,
    "academicSessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "weightage" INTEGER,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exam_terms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exam_terms_academicSessionId_idx" ON "exam_terms"("academicSessionId");
CREATE UNIQUE INDEX "exam_terms_academicSessionId_name_key" ON "exam_terms"("academicSessionId", "name");
CREATE UNIQUE INDEX "exam_terms_academicSessionId_sequence_key" ON "exam_terms"("academicSessionId", "sequence");

ALTER TABLE "exam_terms" ADD CONSTRAINT "exam_terms_academicSessionId_fkey"
  FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, not Cascade: deleting a term created by mistake must not take the
-- marks recorded under it.
ALTER TABLE "assessments" ADD COLUMN "examTermId" TEXT;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_examTermId_fkey"
  FOREIGN KEY ("examTermId") REFERENCES "exam_terms"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "assessments_enrollmentId_term_idx";
CREATE INDEX "assessments_enrollmentId_examTermId_idx" ON "assessments"("enrollmentId", "examTermId");
CREATE INDEX "assessments_examTermId_idx" ON "assessments"("examTermId");

ALTER TABLE "assessments" DROP COLUMN "term";
DROP TYPE "AssessmentTerm";

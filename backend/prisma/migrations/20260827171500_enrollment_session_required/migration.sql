-- One enrolment per subject per academic year.
--
-- The old key was (studentId, subjectId), which allowed a student exactly one
-- enrolment in a subject for their whole time at the school. A repeating
-- student takes the same subject again, and a school reusing a subject row
-- across years needs both — so the year joins the key.
--
-- `academicSessionId` becomes required at the same time. It was nullable while
-- existing rows were reconciled from evidence; every row now carries one, and
-- every write path assigns one, so a null would only ever be a bug.

-- Guard: refuse rather than corrupt if anything still has no session.
DO $$
DECLARE orphans INT;
BEGIN
  SELECT count(*) INTO orphans FROM "enrollments" WHERE "academicSessionId" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'a% enrolment(s) still have no academic session — run scripts/backfill-enrollment-sessions.js first', orphans;
  END IF;
END $$;

ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_academicSessionId_fkey";

DROP INDEX "enrollments_studentId_subjectId_key";

ALTER TABLE "enrollments" ALTER COLUMN "academicSessionId" SET NOT NULL;

CREATE UNIQUE INDEX "enrollments_studentId_subjectId_academicSessionId_key"
  ON "enrollments"("studentId", "subjectId", "academicSessionId");

-- Restrict, not Cascade: a year holding results must not be deletable out from
-- under them.
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academicSessionId_fkey"
  FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

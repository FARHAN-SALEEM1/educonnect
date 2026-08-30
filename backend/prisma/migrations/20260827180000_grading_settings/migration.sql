-- A school's own grading policy: letter-grade bands and the pass mark.
-- JSON, like notificationSettings, so a school that never sets one gets the
-- platform defaults and adding a band needs no migration.
ALTER TABLE "institutes" ADD COLUMN "gradingSettings" JSONB;

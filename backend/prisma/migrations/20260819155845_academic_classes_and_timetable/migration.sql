-- AlterTable
ALTER TABLE "timetable_slots" ADD COLUMN     "academicYear" TEXT,
ADD COLUMN     "classId" TEXT;

-- CreateTable
CREATE TABLE "academic_classes" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "room" TEXT,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "classTeacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_classes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_classes_instituteId_isArchived_idx" ON "academic_classes"("instituteId", "isArchived");

-- CreateIndex
CREATE INDEX "academic_classes_classTeacherId_idx" ON "academic_classes"("classTeacherId");

-- CreateIndex
CREATE UNIQUE INDEX "academic_classes_instituteId_academicYear_code_key" ON "academic_classes"("instituteId", "academicYear", "code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_classes_instituteId_academicYear_name_section_key" ON "academic_classes"("instituteId", "academicYear", "name", "section");

-- CreateIndex
CREATE INDEX "timetable_slots_classId_idx" ON "timetable_slots"("classId");

-- AddForeignKey
ALTER TABLE "academic_classes" ADD CONSTRAINT "academic_classes_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_classes" ADD CONSTRAINT "academic_classes_classTeacherId_fkey" FOREIGN KEY ("classTeacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_classId_fkey" FOREIGN KEY ("classId") REFERENCES "academic_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

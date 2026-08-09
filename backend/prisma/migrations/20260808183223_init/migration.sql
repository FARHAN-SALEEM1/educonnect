-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'ADMIN', 'TEACHER', 'PARENT');

-- CreateEnum
CREATE TYPE "InstituteStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'LEAVE');

-- CreateEnum
CREATE TYPE "FeeStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'WAIVED');

-- CreateEnum
CREATE TYPE "NoticeCategory" AS ENUM ('ACADEMIC', 'FINANCE', 'EVENT', 'GENERAL', 'URGENT');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('QUIZ', 'TEST', 'ASSIGNMENT', 'PROJECT', 'LAB', 'EXAM');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('STRENGTH', 'WEAKNESS', 'PREDICTION', 'ATTENDANCE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "maxStudents" INTEGER NOT NULL,
    "features" TEXT[],
    "color" TEXT,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "logo" TEXT,
    "color" TEXT,
    "status" "InstituteStatus" NOT NULL DEFAULT 'PENDING',
    "planId" TEXT NOT NULL,
    "defaultMonthlyFee" INTEGER NOT NULL DEFAULT 0,
    "approxStudents" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "instituteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "designation" TEXT,
    "qualification" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "instituteId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parents" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "relation" TEXT,
    "occupation" TEXT,
    "cnic" TEXT,
    "address" TEXT,
    "instituteId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "rollNo" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "gender" TEXT,
    "bloodGroup" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "photoUrl" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instituteId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "grade" TEXT,
    "color" TEXT,
    "instituteId" TEXT NOT NULL,
    "teacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "currentScore" DOUBLE PRECISION,
    "previousScore" DOUBLE PRECISION,
    "predictedScore" DOUBLE PRECISION,
    "letterGrade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "AssessmentType" NOT NULL DEFAULT 'QUIZ',
    "obtained" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "takenOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "remarks" TEXT,
    "markedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_invoices" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "lateFee" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "FeeStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "paidAmount" INTEGER,
    "method" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "parentId" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "NoticeCategory" NOT NULL DEFAULT 'GENERAL',
    "audience" "Role"[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT,
    "type" "InsightType" NOT NULL,
    "message" TEXT NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "instituteId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institutes_code_key" ON "institutes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "institutes_email_key" ON "institutes"("email");

-- CreateIndex
CREATE INDEX "institutes_status_idx" ON "institutes"("status");

-- CreateIndex
CREATE INDEX "institutes_planId_idx" ON "institutes"("planId");

-- CreateIndex
CREATE INDEX "subscription_invoices_status_idx" ON "subscription_invoices"("status");

-- CreateIndex
CREATE INDEX "subscription_invoices_period_idx" ON "subscription_invoices"("period");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_instituteId_period_key" ON "subscription_invoices"("instituteId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_instituteId_role_idx" ON "users"("instituteId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_userId_key" ON "teachers"("userId");

-- CreateIndex
CREATE INDEX "teachers_instituteId_idx" ON "teachers"("instituteId");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_instituteId_code_key" ON "teachers"("instituteId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "parents_userId_key" ON "parents"("userId");

-- CreateIndex
CREATE INDEX "parents_instituteId_idx" ON "parents"("instituteId");

-- CreateIndex
CREATE UNIQUE INDEX "parents_instituteId_code_key" ON "parents"("instituteId", "code");

-- CreateIndex
CREATE INDEX "students_instituteId_grade_section_idx" ON "students"("instituteId", "grade", "section");

-- CreateIndex
CREATE INDEX "students_parentId_idx" ON "students"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "students_instituteId_code_key" ON "students"("instituteId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "students_instituteId_rollNo_key" ON "students"("instituteId", "rollNo");

-- CreateIndex
CREATE INDEX "subjects_instituteId_idx" ON "subjects"("instituteId");

-- CreateIndex
CREATE INDEX "subjects_teacherId_idx" ON "subjects"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_instituteId_name_grade_key" ON "subjects"("instituteId", "name", "grade");

-- CreateIndex
CREATE INDEX "enrollments_subjectId_idx" ON "enrollments"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_studentId_subjectId_key" ON "enrollments"("studentId", "subjectId");

-- CreateIndex
CREATE INDEX "assessments_enrollmentId_idx" ON "assessments"("enrollmentId");

-- CreateIndex
CREATE INDEX "assessments_takenOn_idx" ON "assessments"("takenOn");

-- CreateIndex
CREATE INDEX "attendance_instituteId_date_idx" ON "attendance"("instituteId", "date");

-- CreateIndex
CREATE INDEX "attendance_status_idx" ON "attendance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_studentId_date_key" ON "attendance"("studentId", "date");

-- CreateIndex
CREATE INDEX "timetable_slots_instituteId_grade_section_idx" ON "timetable_slots"("instituteId", "grade", "section");

-- CreateIndex
CREATE INDEX "timetable_slots_teacherId_idx" ON "timetable_slots"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_instituteId_grade_section_dayOfWeek_period_key" ON "timetable_slots"("instituteId", "grade", "section", "dayOfWeek", "period");

-- CreateIndex
CREATE INDEX "fee_invoices_instituteId_status_idx" ON "fee_invoices"("instituteId", "status");

-- CreateIndex
CREATE INDEX "fee_invoices_period_idx" ON "fee_invoices"("period");

-- CreateIndex
CREATE UNIQUE INDEX "fee_invoices_studentId_period_key" ON "fee_invoices"("studentId", "period");

-- CreateIndex
CREATE INDEX "messages_recipientId_isRead_idx" ON "messages"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "messages_instituteId_idx" ON "messages"("instituteId");

-- CreateIndex
CREATE INDEX "notices_instituteId_publishedAt_idx" ON "notices"("instituteId", "publishedAt");

-- CreateIndex
CREATE INDEX "ai_insights_studentId_idx" ON "ai_insights"("studentId");

-- CreateIndex
CREATE INDEX "audit_logs_instituteId_createdAt_idx" ON "audit_logs"("instituteId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- AddForeignKey
ALTER TABLE "institutes" ADD CONSTRAINT "institutes_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

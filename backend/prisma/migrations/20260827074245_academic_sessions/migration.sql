-- CreateTable
CREATE TABLE "academic_sessions" (
    "id" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_sessions_instituteId_isCurrent_idx" ON "academic_sessions"("instituteId", "isCurrent");

-- CreateIndex
CREATE INDEX "academic_sessions_instituteId_startsOn_idx" ON "academic_sessions"("instituteId", "startsOn");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_instituteId_name_key" ON "academic_sessions"("instituteId", "name");

-- AddForeignKey
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "institutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

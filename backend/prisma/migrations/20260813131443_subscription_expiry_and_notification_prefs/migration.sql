-- AlterEnum
ALTER TYPE "InstituteStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "institutes" ADD COLUMN     "notificationSettings" JSONB;

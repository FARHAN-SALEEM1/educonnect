-- AlterTable
ALTER TABLE "institutes" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "studentLimit" INTEGER,
ADD COLUMN     "subscriptionEndsAt" TIMESTAMP(3);

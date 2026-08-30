-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('NONE', 'MANUAL', 'STRIPE', 'SAFEPAY', 'PAYFAST');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- AlterTable
ALTER TABLE "institutes" ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "lastBillingEventAt" TIMESTAMP(3),
ADD COLUMN     "paymentProvider" "PaymentProvider" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "providerCustomerId" TEXT,
ADD COLUMN     "providerSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "providerPriceIds" JSONB;

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "instituteId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processed_webhook_events_instituteId_idx" ON "processed_webhook_events"("instituteId");

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_events_provider_eventId_key" ON "processed_webhook_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "institutes_paymentProvider_providerCustomerId_key" ON "institutes"("paymentProvider", "providerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "institutes_paymentProvider_providerSubscriptionId_key" ON "institutes"("paymentProvider", "providerSubscriptionId");


-- CreateEnum
CREATE TYPE "FeeHead" AS ENUM ('TUITION', 'ADMISSION', 'ANNUAL', 'EXAMINATION', 'TRANSPORT', 'HOSTEL', 'LIBRARY', 'SPORTS', 'LAB', 'MISCELLANEOUS');

-- CreateTable
CREATE TABLE "fee_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "head" "FeeHead" NOT NULL,
    "label" TEXT,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_items_invoiceId_idx" ON "fee_items"("invoiceId");

-- AddForeignKey
ALTER TABLE "fee_items" ADD CONSTRAINT "fee_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

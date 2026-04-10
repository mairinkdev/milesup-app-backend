-- CreateEnum
CREATE TYPE "MilesPurchaseStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "MilesPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "packageCode" TEXT NOT NULL,
    "amountMiles" INTEGER NOT NULL,
    "bonusMiles" INTEGER NOT NULL DEFAULT 0,
    "totalMiles" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "paymentMethod" TEXT NOT NULL DEFAULT 'CARD',
    "paymentRef" TEXT NOT NULL,
    "status" "MilesPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MilesPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MilesPurchase_paymentRef_key" ON "MilesPurchase"("paymentRef");

-- CreateIndex
CREATE INDEX "MilesPurchase_userId_createdAt_idx" ON "MilesPurchase"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MilesPurchase" ADD CONSTRAINT "MilesPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilesPurchase" ADD CONSTRAINT "MilesPurchase_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

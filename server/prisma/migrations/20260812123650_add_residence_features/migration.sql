-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('PENDING', 'REVIEWING', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "floorPlanUrl" TEXT;

-- CreateTable
CREATE TABLE "BlockImage" (
    "id" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingRequest" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "ListingType" NOT NULL,
    "askingPrice" DOUBLE PRECISION,
    "availableFrom" TIMESTAMP(3),
    "notes" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ListingRequest" ADD CONSTRAINT "ListingRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingRequest" ADD CONSTRAINT "ListingRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

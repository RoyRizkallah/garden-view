-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "ListingRequest" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "ListingPhoto" (
    "id" TEXT NOT NULL,
    "listingRequestId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingPhoto_listingRequestId_idx" ON "ListingPhoto"("listingRequestId");

-- CreateIndex
CREATE INDEX "ListingRequest_status_idx" ON "ListingRequest"("status");

-- CreateIndex
CREATE INDEX "ListingRequest_unitId_idx" ON "ListingRequest"("unitId");

-- AddForeignKey
ALTER TABLE "ListingPhoto" ADD CONSTRAINT "ListingPhoto_listingRequestId_fkey" FOREIGN KEY ("listingRequestId") REFERENCES "ListingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

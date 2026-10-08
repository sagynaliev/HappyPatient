-- Add the fee used by the pricing configuration screen.
ALTER TABLE "Doctor" ADD COLUMN "consultationFee" INTEGER NOT NULL DEFAULT 15000;
ALTER TABLE "Doctor" ALTER COLUMN "consultationFee" DROP DEFAULT;

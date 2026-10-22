-- AlterTable
ALTER TABLE "ScheduleSlot" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "checkedInById" TEXT;

-- CreateIndex
CREATE INDEX "ScheduleSlot_checkedInById_idx" ON "ScheduleSlot"("checkedInById");

-- AddForeignKey
ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

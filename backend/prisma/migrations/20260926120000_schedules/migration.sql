CREATE TYPE "SlotStatus" AS ENUM ('FREE', 'BOOKED', 'OCCUPIED');

CREATE TABLE "ScheduleSlot" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'FREE',
    "visitPurpose" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduleSlot_doctorId_startAt_key" ON "ScheduleSlot"("doctorId", "startAt");
CREATE INDEX "ScheduleSlot_doctorId_startAt_idx" ON "ScheduleSlot"("doctorId", "startAt");
CREATE INDEX "ScheduleSlot_patientId_idx" ON "ScheduleSlot"("patientId");

ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
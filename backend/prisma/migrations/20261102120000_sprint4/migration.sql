CREATE TYPE "MedicalEntryCategory" AS ENUM ('test', 'anamnesis', 'conclusion');
CREATE TABLE "MedicalEntry" (
 "id" TEXT PRIMARY KEY, "patientId" TEXT NOT NULL, "doctorId" TEXT NOT NULL,
 "appointmentId" TEXT, "category" "MedicalEntryCategory" NOT NULL,
 "title" VARCHAR(120) NOT NULL, "body" VARCHAR(5000) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("appointmentId") REFERENCES "ScheduleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "MedicalEntry_patientId_createdAt_id_idx" ON "MedicalEntry"("patientId", "createdAt", "id");
CREATE TABLE "ExpiredAppointment" (
 "id" TEXT PRIMARY KEY, "appointmentId" TEXT NOT NULL, "slotId" TEXT NOT NULL,
 "doctorId" TEXT NOT NULL, "patientId" TEXT, "startAt" TIMESTAMP(3) NOT NULL, "endAt" TIMESTAMP(3) NOT NULL,
 "bookingVersion" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'expired',
 "reason" TEXT NOT NULL DEFAULT 'auto_release_no_checkin', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ExpiredAppointment_slotId_bookingVersion_key" ON "ExpiredAppointment"("slotId", "bookingVersion");

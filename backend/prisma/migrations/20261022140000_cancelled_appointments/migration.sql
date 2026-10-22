-- CreateTable
CREATE TABLE "CancelledAppointment" (
    "id" TEXT NOT NULL,
    "slotId" TEXT,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "visitPurpose" VARCHAR(300),
    "reason" VARCHAR(300) NOT NULL,
    "cancelledById" TEXT,
    "cancelledByRole" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CancelledAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CancelledAppointment_patientId_createdAt_idx" ON "CancelledAppointment"("patientId", "createdAt");
CREATE INDEX "CancelledAppointment_doctorId_createdAt_idx" ON "CancelledAppointment"("doctorId", "createdAt");

-- AddForeignKey
ALTER TABLE "CancelledAppointment" ADD CONSTRAINT "CancelledAppointment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ScheduleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CancelledAppointment" ADD CONSTRAINT "CancelledAppointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CancelledAppointment" ADD CONSTRAINT "CancelledAppointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CancelledAppointment" ADD CONSTRAINT "CancelledAppointment_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

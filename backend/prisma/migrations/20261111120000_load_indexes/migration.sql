-- Indexes for the queries that run most often under load.
-- Free-slot search across doctors, the auto-release job and reminders filter by status and time.
CREATE INDEX "ScheduleSlot_status_startAt_idx" ON "ScheduleSlot"("status", "startAt");
-- A patient's appointment list is read by patient and ordered by time.
CREATE INDEX "ScheduleSlot_patientId_startAt_idx" ON "ScheduleSlot"("patientId", "startAt");
DROP INDEX "ScheduleSlot_patientId_idx";
-- Duplicate of the unique index on the same columns; it only slowed down writes.
DROP INDEX "ScheduleSlot_doctorId_startAt_idx";
-- Notes of one visit, and the "can this doctor edit this note" check.
CREATE INDEX "MedicalEntry_appointmentId_idx" ON "MedicalEntry"("appointmentId");
CREATE INDEX "MedicalEntry_doctorId_idx" ON "MedicalEntry"("doctorId");

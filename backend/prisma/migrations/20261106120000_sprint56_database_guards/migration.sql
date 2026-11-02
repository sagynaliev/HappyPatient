ALTER TABLE "ReminderSent"
  ADD CONSTRAINT "ReminderSent_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "ScheduleSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "protect_medical_entry_chronology"() RETURNS trigger AS $$
DECLARE slot_patient TEXT;
DECLARE slot_doctor TEXT;
DECLARE slot_start TIMESTAMP(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'medical entries cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'medical entry chronology is immutable';
  END IF;
  IF NEW."appointmentId" IS NOT NULL THEN
    SELECT s."patientId",s."doctorId",s."startAt" INTO slot_patient,slot_doctor,slot_start
    FROM "ScheduleSlot" s WHERE s."id"=NEW."appointmentId";
    IF slot_patient IS NULL OR slot_patient<>NEW."patientId" OR slot_doctor<>NEW."doctorId" THEN
      RAISE EXCEPTION 'medical entry appointment ownership mismatch';
    END IF;
    IF NEW."createdAt"<slot_start THEN
      RAISE EXCEPTION 'medical entry cannot precede the visit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Medical entries take their creation time from the app clock when the demo time is shifted,
-- so notes for a visit that has started in app time are not rejected as "before the visit".
CREATE OR REPLACE FUNCTION "protect_medical_entry_chronology"() RETURNS trigger AS $$
DECLARE slot_patient TEXT;
DECLARE slot_doctor TEXT;
DECLARE slot_start TIMESTAMP(3);
DECLARE next_sequence INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'medical entries cannot be deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."patientId", 0));
    SELECT COALESCE(MAX("patientSequence"), 0) + 1 INTO next_sequence FROM "MedicalEntry" WHERE "patientId"=NEW."patientId";
    NEW."patientSequence" := next_sequence;
    -- Columns hold UTC (Prisma convention); convert explicitly so a non-UTC server time zone cannot shift the time.
    -- The API sets app.now (UTC) when an admin has moved the demo clock; otherwise the database clock is used.
    NEW."createdAt" := COALESCE(NULLIF(current_setting('app.now', true), '')::timestamp, (clock_timestamp() AT TIME ZONE 'UTC'));
    -- Prisma sets updatedAt before this trigger runs; keep it equal so a new entry is never "updated before created".
    NEW."updatedAt" := NEW."createdAt";
  ELSE
    IF NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW."patientId" IS DISTINCT FROM OLD."patientId" OR NEW."patientSequence" IS DISTINCT FROM OLD."patientSequence" THEN
      RAISE EXCEPTION 'medical entry chronology is immutable';
    END IF;
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

ALTER TABLE "MedicalEntry" ADD COLUMN "patientSequence" INTEGER;
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "patientId" ORDER BY "createdAt", "id")::integer AS sequence
  FROM "MedicalEntry"
)
UPDATE "MedicalEntry" e SET "patientSequence"=numbered.sequence FROM numbered WHERE e."id"=numbered."id";
ALTER TABLE "MedicalEntry" ALTER COLUMN "patientSequence" SET DEFAULT 0;
ALTER TABLE "MedicalEntry" ALTER COLUMN "patientSequence" SET NOT NULL;
CREATE UNIQUE INDEX "MedicalEntry_patientId_patientSequence_key" ON "MedicalEntry"("patientId","patientSequence");

CREATE TABLE "ReferenceDataAudit" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferenceDataAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ReferenceDataAudit_entity_entityId_createdAt_idx" ON "ReferenceDataAudit"("entity","entityId","createdAt");

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
    NEW."createdAt" := clock_timestamp();
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

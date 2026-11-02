ALTER TABLE "PricingRule"
  ADD COLUMN "consultationType" TEXT,
  ADD COLUMN "serviceCode" TEXT,
  ADD COLUMN "officeId" TEXT,
  ADD COLUMN "versionOfId" TEXT;
ALTER TABLE "PricingRule"
  ADD CONSTRAINT "PricingRule_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PricingRule_versionOfId_fkey" FOREIGN KEY ("versionOfId") REFERENCES "PricingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PricingRule_versionOfId_idx" ON "PricingRule"("versionOfId");
CREATE TABLE "PricingRuleAudit" (
  "id" TEXT PRIMARY KEY,
  "ruleId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PricingRuleAudit_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "PricingRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PricingRuleAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "PricingRuleAudit_ruleId_createdAt_idx" ON "PricingRuleAudit"("ruleId","createdAt");

ALTER TABLE "ReminderSent" ADD COLUMN "bookingVersion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ReminderSent" DROP CONSTRAINT IF EXISTS "ReminderSent_appointmentId_kind_key";
CREATE UNIQUE INDEX "ReminderSent_appointmentId_bookingVersion_kind_key" ON "ReminderSent"("appointmentId","bookingVersion","kind");

CREATE OR REPLACE FUNCTION "protect_medical_entry_chronology"() RETURNS trigger AS $$
DECLARE slot_patient TEXT;
DECLARE slot_doctor TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'medical entries cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'medical entry chronology is immutable';
  END IF;
  IF NEW."appointmentId" IS NOT NULL THEN
    SELECT s."patientId",s."doctorId" INTO slot_patient,slot_doctor
    FROM "ScheduleSlot" s WHERE s."id"=NEW."appointmentId";
    IF slot_patient IS NULL OR slot_patient<>NEW."patientId" OR slot_doctor<>NEW."doctorId" THEN
      RAISE EXCEPTION 'medical entry appointment ownership mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MedicalEntry_chronology_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "MedicalEntry"
FOR EACH ROW EXECUTE FUNCTION "protect_medical_entry_chronology"();

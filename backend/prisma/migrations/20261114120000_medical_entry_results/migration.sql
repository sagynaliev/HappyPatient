-- Lab results on test notes: [{ "name", "value", "unit", "low", "high" }], so values can be read, flagged and exported.
ALTER TABLE "MedicalEntry" ADD COLUMN "results" JSONB;

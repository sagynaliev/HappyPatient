-- Treatments a doctor records on a checked-in visit, with the price fixed from the rule in force when the visit was booked.
CREATE TABLE "VisitTreatment" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "serviceCode" VARCHAR(80),
    "serviceName" VARCHAR(120) NOT NULL,
    "amountKzt" INTEGER NOT NULL,
    "ruleId" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitTreatment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VisitTreatment_amount_check" CHECK ("amountKzt" >= 0)
);
CREATE INDEX "VisitTreatment_slotId_idx" ON "VisitTreatment"("slotId");
ALTER TABLE "VisitTreatment" ADD CONSTRAINT "VisitTreatment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ScheduleSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

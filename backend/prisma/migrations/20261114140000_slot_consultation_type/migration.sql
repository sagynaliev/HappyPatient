-- How the patient attends and whether it is a first or follow-up visit, fixed at booking: "in-person:first", "online:follow-up".
ALTER TABLE "ScheduleSlot" ADD COLUMN "consultationType" VARCHAR(40);

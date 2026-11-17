-- The old tree had floors directly under cities. The administrator chose to start the clinic tree afresh:
-- floors and offices are removed (cities stay), and doctors placed in those offices become unassigned.

-- Parking prices tied to a removed office would otherwise lose their office and apply to every office.
UPDATE "PricingRule" SET "active" = false
WHERE "officeId" IN (SELECT "id" FROM "Location" WHERE "kind" IN ('floor', 'office')) AND "active" = true;

-- Doctors keep their city (cities stay); the office they were given from the list is cleared.
UPDATE "Doctor" SET "locationId" = NULL, "office" = NULL, "officeNumber" = NULL
WHERE "locationId" IN (SELECT "id" FROM "Location" WHERE "kind" = 'office');

DELETE FROM "Location" WHERE "kind" = 'office';
DELETE FROM "Location" WHERE "kind" = 'floor';

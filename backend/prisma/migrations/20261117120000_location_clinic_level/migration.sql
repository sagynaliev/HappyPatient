-- Offices now sit in a clinic: city -> clinic -> floor -> office.
ALTER TYPE "LocationKind" ADD VALUE IF NOT EXISTS 'clinic' BEFORE 'floor';

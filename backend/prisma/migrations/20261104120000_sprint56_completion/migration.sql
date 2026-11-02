CREATE TYPE "LocationKind" AS ENUM ('city','floor','office');
ALTER TABLE "Doctor" ADD COLUMN "locationId" TEXT;
CREATE TABLE "Location"("id" TEXT PRIMARY KEY,"name" VARCHAR(120) NOT NULL,"kind" "LocationKind" NOT NULL,"parentId" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY("parentId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_locationId_fkey" FOREIGN KEY("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Location_parentId_name_key" ON "Location"("parentId","name");
CREATE INDEX "Location_parentId_active_idx" ON "Location"("parentId","active");
CREATE TABLE "IntegrityRun"("id" TEXT PRIMARY KEY,"startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"finishedAt" TIMESTAMP(3),"status" TEXT NOT NULL DEFAULT 'running',"results" JSONB);

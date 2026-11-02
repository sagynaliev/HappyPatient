CREATE UNIQUE INDEX "Category_normalized_name_key"
  ON "Category"(LOWER(BTRIM("name")));
CREATE UNIQUE INDEX "Location_parent_normalized_name_key"
  ON "Location"(COALESCE("parentId",''),LOWER(BTRIM("name")));

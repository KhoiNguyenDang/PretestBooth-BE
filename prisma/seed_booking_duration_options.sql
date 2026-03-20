INSERT INTO "BookingDurationOption" ("id", "type", "durationMinutes", "isActive", "displayOrder", "createdAt", "updatedAt")
VALUES
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99801', 'PRACTICE', 30, true, 1, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99802', 'PRACTICE', 45, true, 2, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99803', 'PRACTICE', 60, true, 3, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99811', 'EXAM', 30, true, 1, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99812', 'EXAM', 45, true, 2, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99813', 'EXAM', 60, true, 3, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99814', 'EXAM', 75, true, 4, NOW(), NOW())
ON CONFLICT ("type", "durationMinutes") DO NOTHING;

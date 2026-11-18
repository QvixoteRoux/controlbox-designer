-- Hand-written (prisma/sql/constraints.sql): rotation is 0 or 90 only.
-- Parts are outlines, so 180 / 270 look the same as 0 / 90; the bounding box (x, y) is
-- unchanged by the conversion.
UPDATE placements SET rotation = rotation - 180 WHERE rotation IN (180, 270);

ALTER TABLE placements DROP CONSTRAINT placements_rotation;
ALTER TABLE placements
  ADD CONSTRAINT placements_rotation
  CHECK (rotation IN (0, 90));

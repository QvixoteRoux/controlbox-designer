-- Bottom plate (owner, 2026-11-20): the opening under a cabinet's removable, screwed-on bottom
-- plate. A rectangle on BOTTOM with rounded corners (default 10 mm); holes may be cut in it or
-- beside it, and one crossing its edge is a warning (packages/shared/src/faces.ts).

-- AlterEnum
ALTER TYPE "OpeningKind" ADD VALUE 'BOTTOM_PLATE';

-- AlterTable
ALTER TABLE "cabinet_openings" ADD COLUMN     "corner_radius" INTEGER;

-- Hand-written (prisma/sql/constraints.sql): the shape check now covers bottom plates, and only
-- they carry a corner radius. kind is compared as text: the new enum value can't be used in
-- the transaction that adds it.
ALTER TABLE cabinet_openings DROP CONSTRAINT cabinet_openings_shape;
ALTER TABLE cabinet_openings
  ADD CONSTRAINT cabinet_openings_shape
  CHECK (
       (kind::text IN ('WINDOW', 'RECT_HOLE') AND width > 0 AND height > 0 AND diameter IS NULL AND gland_id IS NULL AND corner_radius IS NULL)
    OR (kind::text = 'ROUND_HOLE'            AND diameter > 0 AND width IS NULL AND height IS NULL AND gland_id IS NULL AND corner_radius IS NULL)
    OR (kind::text = 'CABLE_GLAND'           AND gland_id IS NOT NULL AND width IS NULL AND height IS NULL AND diameter IS NULL AND corner_radius IS NULL)
    OR (kind::text = 'BOTTOM_PLATE'          AND face = 'BOTTOM' AND width > 0 AND height > 0 AND diameter IS NULL AND gland_id IS NULL
                                             AND corner_radius >= 0 AND 2 * corner_radius <= LEAST(width, height))
  );

-- AlterEnum
ALTER TYPE "HingeSide" ADD VALUE 'BOTH';

-- AlterTable
ALTER TABLE "cabinets" ADD COLUMN     "doors" INTEGER NOT NULL DEFAULT 1;

-- Hand-written (prisma/sql/constraints.sql): 1 or 2 doors (owner, 2026-11-18). Two doors are
-- hinged left and right (BOTH) and mounted as manufactured (TOP); one door never uses BOTH.
-- hinge_side is compared as text: the new enum value can't be used in the transaction that
-- adds it.
ALTER TABLE cabinets
  ADD CONSTRAINT cabinets_doors
  CHECK (
        doors IN (1, 2)
    AND (doors = 2) = (hinge_side::text = 'BOTH')
    AND (doors = 1 OR up_face = 'TOP')
  );

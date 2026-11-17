-- AlterEnum
ALTER TYPE "ComponentKind" ADD VALUE 'GROUND_TERMINAL';

-- AlterTable
ALTER TABLE "component_types" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- Hand-written (prisma/sql/constraints.sql): rails and gutters have height 0; DIN rail is 35 mm wide.
ALTER TABLE components
  ADD CONSTRAINT components_profile_shape
  CHECK (
       (kind NOT IN ('RAIL', 'GUTTER') OR height = 0)
   AND (kind <> 'RAIL' OR width = 350)
  );

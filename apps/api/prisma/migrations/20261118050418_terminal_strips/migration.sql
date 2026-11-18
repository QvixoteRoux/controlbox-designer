-- CreateEnum
CREATE TYPE "TerminalColor" AS ENUM ('LIGHT_GREY', 'DARK_GREY', 'BEIGE', 'RED', 'GREEN', 'BLUE', 'YELLOW');

-- AlterTable
ALTER TABLE "placements" ADD COLUMN     "bridged_levels" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "color" "TerminalColor",
ADD COLUMN     "count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "group_label" TEXT;

-- Hand-written (prisma/sql/constraints.sql): terminal strips.
-- Which kinds may use them is checked by the API (it needs the component's kind).
ALTER TABLE placements
  ADD CONSTRAINT placements_strip
  CHECK (
        count BETWEEN 1 AND 200
    AND bridged_levels IS NOT NULL
    AND bridged_levels <@ ARRAY[1, 2, 3, 4]
  );

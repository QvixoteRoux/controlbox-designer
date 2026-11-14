-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('VIEWER', 'DESIGNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('WORKING', 'RELEASED');

-- CreateEnum
CREATE TYPE "CabinetMaterial" AS ENUM ('METAL', 'PLASTIC');

-- CreateEnum
CREATE TYPE "Face" AS ENUM ('FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM');

-- CreateEnum
CREATE TYPE "HingeSide" AS ENUM ('LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'NONE');

-- CreateEnum
CREATE TYPE "OpeningKind" AS ENUM ('WINDOW', 'ROUND_HOLE', 'RECT_HOLE', 'CABLE_GLAND');

-- CreateEnum
CREATE TYPE "ComponentKind" AS ENUM ('STANDARD', 'FUSE', 'TERMINAL_BLOCK', 'GUTTER', 'RAIL');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "can_projects" BOOLEAN NOT NULL DEFAULT true,
    "can_components" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_revisions" (
    "id" SERIAL NOT NULL,
    "machine_id" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'WORKING',
    "notes" TEXT,
    "based_on_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_by_id" INTEGER,
    "released_at" TIMESTAMP(3),

    CONSTRAINT "machine_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabinet_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cabinet_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabinets" (
    "id" SERIAL NOT NULL,
    "revision_id" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "type_id" INTEGER NOT NULL,
    "material" "CabinetMaterial" NOT NULL,
    "height" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "has_platen" BOOLEAN NOT NULL DEFAULT true,
    "main_voltage" TEXT NOT NULL,
    "other_voltages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hinge_side" "HingeSide" NOT NULL DEFAULT 'LEFT',
    "up_face" "Face" NOT NULL DEFAULT 'TOP',
    "extra" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "cabinets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platens" (
    "id" SERIAL NOT NULL,
    "cabinet_id" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,

    CONSTRAINT "platens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabinet_openings" (
    "id" SERIAL NOT NULL,
    "cabinet_id" INTEGER NOT NULL,
    "kind" "OpeningKind" NOT NULL,
    "face" "Face" NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "diameter" INTEGER,
    "gland_id" INTEGER,
    "component_id" INTEGER,
    "label" TEXT,
    "snapshot" JSONB,

    CONSTRAINT "cabinet_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "component_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "components" (
    "id" SERIAL NOT NULL,
    "kind" "ComponentKind" NOT NULL DEFAULT 'STANDARD',
    "type_id" INTEGER,
    "manufacturer" TEXT NOT NULL,
    "part_number" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "input_voltage" TEXT,
    "phases" INTEGER,
    "height" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "rail_mount" BOOLEAN NOT NULL DEFAULT false,
    "rail_edge_offset" INTEGER,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "image_path" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cable_glands" (
    "id" SERIAL NOT NULL,
    "size" TEXT NOT NULL,
    "hole_diameter" INTEGER NOT NULL,
    "image_path" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cable_glands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placements" (
    "id" SERIAL NOT NULL,
    "platen_id" INTEGER NOT NULL,
    "component_id" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "length" INTEGER,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "rail_id" INTEGER,
    "tag" TEXT,
    "z_index" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "placements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_name_key" ON "projects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "machines_project_id_name_key" ON "machines"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "machine_revisions_machine_id_rev_key" ON "machine_revisions"("machine_id", "rev");

-- CreateIndex
CREATE UNIQUE INDEX "cabinet_types_name_key" ON "cabinet_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cabinets_revision_id_number_key" ON "cabinets"("revision_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "platens_cabinet_id_key" ON "platens"("cabinet_id");

-- CreateIndex
CREATE INDEX "cabinet_openings_cabinet_id_idx" ON "cabinet_openings"("cabinet_id");

-- CreateIndex
CREATE UNIQUE INDEX "component_types_name_key" ON "component_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "components_code_key" ON "components"("code");

-- CreateIndex
CREATE INDEX "components_kind_idx" ON "components"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "components_manufacturer_part_number_key" ON "components"("manufacturer", "part_number");

-- CreateIndex
CREATE UNIQUE INDEX "cable_glands_size_key" ON "cable_glands"("size");

-- CreateIndex
CREATE INDEX "placements_platen_id_idx" ON "placements"("platen_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_revisions" ADD CONSTRAINT "machine_revisions_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_revisions" ADD CONSTRAINT "machine_revisions_based_on_id_fkey" FOREIGN KEY ("based_on_id") REFERENCES "machine_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_revisions" ADD CONSTRAINT "machine_revisions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_revisions" ADD CONSTRAINT "machine_revisions_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabinets" ADD CONSTRAINT "cabinets_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "machine_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabinets" ADD CONSTRAINT "cabinets_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "cabinet_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platens" ADD CONSTRAINT "platens_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabinet_openings" ADD CONSTRAINT "cabinet_openings_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabinet_openings" ADD CONSTRAINT "cabinet_openings_gland_id_fkey" FOREIGN KEY ("gland_id") REFERENCES "cable_glands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabinet_openings" ADD CONSTRAINT "cabinet_openings_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "component_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_platen_id_fkey" FOREIGN KEY ("platen_id") REFERENCES "platens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_rail_id_fkey" FOREIGN KEY ("rail_id") REFERENCES "placements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────── Hand-written constraints (prisma/sql/constraints.sql) ───────────────────

-- Constraints Prisma can't express in schema.prisma.
-- Append to the first migration's migration.sql (or create an empty migration with
-- `prisma migrate dev --create-only --name constraints` and paste this in).

-- Users: a DESIGNER must keep at least one of the two permissions.
ALTER TABLE users
  ADD CONSTRAINT users_designer_has_permission
  CHECK (role <> 'DESIGNER' OR can_projects OR can_components);

-- Machines: at least one copy.
ALTER TABLE machines
  ADD CONSTRAINT machines_quantity_positive
  CHECK (quantity > 0);

-- Revisions: numbered 0…999 (shown as "Rev 000").
ALTER TABLE machine_revisions
  ADD CONSTRAINT machine_revisions_rev_range
  CHECK (rev BETWEEN 0 AND 999);

-- Revisions: at most one WORKING revision per machine.
CREATE UNIQUE INDEX machine_revisions_one_working
  ON machine_revisions (machine_id)
  WHERE status = 'WORKING';

-- Revisions: released ones carry who / when.
ALTER TABLE machine_revisions
  ADD CONSTRAINT machine_revisions_release_info
  CHECK (status <> 'RELEASED' OR (released_at IS NOT NULL AND released_by_id IS NOT NULL));

-- Positive sizes (0.1 mm units).
ALTER TABLE cabinets
  ADD CONSTRAINT cabinets_positive_size
  CHECK (height > 0 AND width > 0 AND depth > 0 AND number > 0);

ALTER TABLE platens
  ADD CONSTRAINT platens_positive_size
  CHECK (height > 0 AND width > 0);

ALTER TABLE components
  ADD CONSTRAINT components_size_non_negative
  CHECK (height >= 0 AND width > 0 AND depth >= 0);

-- Components: phases only 1 or 3; rail offset only when rail mounted.
ALTER TABLE components
  ADD CONSTRAINT components_phases
  CHECK (phases IS NULL OR phases IN (1, 3));

ALTER TABLE components
  ADD CONSTRAINT components_rail_offset
  CHECK (rail_mount OR rail_edge_offset IS NULL);

-- Placements: right-angle rotations only.
ALTER TABLE placements
  ADD CONSTRAINT placements_rotation
  CHECK (rotation IN (0, 90, 180, 270));

-- Openings: each kind carries the fields it needs.
ALTER TABLE cabinet_openings
  ADD CONSTRAINT cabinet_openings_shape
  CHECK (
       (kind IN ('WINDOW', 'RECT_HOLE') AND width > 0 AND height > 0 AND diameter IS NULL AND gland_id IS NULL)
    OR (kind = 'ROUND_HOLE'            AND diameter > 0 AND width IS NULL AND height IS NULL AND gland_id IS NULL)
    OR (kind = 'CABLE_GLAND'           AND gland_id IS NOT NULL AND width IS NULL AND height IS NULL AND diameter IS NULL)
  );

-- Not enforced here (API does it, see guidelines):
--   * released revisions are read-only
--   * the last active ADMIN can't be demoted or deactivated
--   * placement.rail_id points at a RAIL placement on the same platen

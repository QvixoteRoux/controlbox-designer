-- Expandable parts (owner, 2026-11-18): Standard, Safety and Fuse parts can be placed as a row
-- of identical modules side by side (placements.count), like terminal strips.
ALTER TABLE "components" ADD COLUMN "expandable" BOOLEAN NOT NULL DEFAULT false;

-- From prisma/sql/constraints.sql.
ALTER TABLE components
  ADD CONSTRAINT components_expandable_kind
  CHECK (NOT expandable OR kind IN ('STANDARD', 'SAFETY', 'FUSE'));

-- Released snapshots get the new field (false: nothing was expandable before), so they still
-- match ComponentSnapshot and released revisions keep drawing from them.
UPDATE "placements"
SET "snapshot" = jsonb_set("snapshot", '{component,expandable}', 'false')
WHERE jsonb_typeof("snapshot" -> 'component') = 'object'
  AND NOT "snapshot" -> 'component' ? 'expandable';

UPDATE "cabinet_openings"
SET "snapshot" = jsonb_set("snapshot", '{component,expandable}', 'false')
WHERE jsonb_typeof("snapshot" -> 'component') = 'object'
  AND NOT "snapshot" -> 'component' ? 'expandable';

-- Component types get a fill colour for their parts in the platen editor (owner, 2026-11-18:
-- outline by kind, fill by type). NULL: the kind's default fill.
ALTER TABLE "component_types" ADD COLUMN "fill_color" VARCHAR(7);

-- From prisma/sql/constraints.sql.
ALTER TABLE component_types
  ADD CONSTRAINT component_types_fill_color
  CHECK (fill_color IS NULL OR fill_color ~ '^#[0-9a-f]{6}$');

-- Released snapshots get the new field (null: no type colours existed), so they still match
-- ComponentSnapshot and released revisions keep drawing from them.
UPDATE "placements"
SET "snapshot" = jsonb_set("snapshot", '{component,fillColor}', 'null')
WHERE jsonb_typeof("snapshot" -> 'component') = 'object'
  AND NOT "snapshot" -> 'component' ? 'fillColor';

UPDATE "cabinet_openings"
SET "snapshot" = jsonb_set("snapshot", '{component,fillColor}', 'null')
WHERE jsonb_typeof("snapshot" -> 'component') = 'object'
  AND NOT "snapshot" -> 'component' ? 'fillColor';

-- "Stackable" was really "snaps side by side on a rail". Rename it to snappable and turn it on
-- by default (owner, 2026-11-18). "Stackable" is kept free for parts mounted on top of each
-- other (a tower), which isn't modelled yet.

-- Rename (keeps the data), then default on.
ALTER TABLE "components" RENAME COLUMN "stackable" TO "snappable";
ALTER TABLE "components" ALTER COLUMN "snappable" SET DEFAULT true;

-- Existing parts: on for all. Until now it was off unless someone ticked the box, so "off" mostly
-- meant "never set". Parts that should leave a gap can be switched off in the catalog.
UPDATE "components" SET "snappable" = true;

-- Released snapshots carry the same field under the old name. Rename the key and keep its value,
-- so released revisions still draw from their snapshot (PlacementSnapshot / OpeningSnapshot).
UPDATE "placements"
SET "snapshot" = jsonb_set(
  "snapshot" #- '{component,stackable}',
  '{component,snappable}',
  "snapshot" -> 'component' -> 'stackable'
)
WHERE "snapshot" -> 'component' ? 'stackable';

UPDATE "cabinet_openings"
SET "snapshot" = jsonb_set(
  "snapshot" #- '{component,stackable}',
  '{component,snappable}',
  "snapshot" -> 'component' -> 'stackable'
)
WHERE jsonb_typeof("snapshot" -> 'component') = 'object'
  AND "snapshot" -> 'component' ? 'stackable';

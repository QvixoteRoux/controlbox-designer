-- Hand-written (prisma/sql/constraints.sql): the built-in DIN rail.
-- The catalog holds exactly one rail, TS35 x 7.5, 2000 mm stock (BUILT_IN_RAIL in
-- packages/shared/src/schemas/component.ts). It can't be added again, resized or deactivated.

INSERT INTO components (kind, manufacturer, part_number, description, height, width, depth, attributes, updated_at)
SELECT 'RAIL', 'Generic', 'TS35x7.5', 'DIN rail 35 × 7.5 mm (EN 60715)', 0, 350, 75, '{"stockLength": 20000}', now()
WHERE NOT EXISTS (SELECT 1 FROM components WHERE kind = 'RAIL');

CREATE UNIQUE INDEX components_one_rail ON components (kind) WHERE kind = 'RAIL';

ALTER TABLE components
  ADD CONSTRAINT components_builtin_rail
  CHECK (kind <> 'RAIL' OR (width = 350 AND height = 0 AND depth = 75 AND active));

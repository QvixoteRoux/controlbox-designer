-- Opening positions move from "face centre, +y up" to "face top-left corner, +y down"
-- (guidelines/units-and-coordinates.md). Round holes and glands stay placed by their centre;
-- windows and rectangular holes are now placed by their top-left corner.
-- Data only: no column changes. Half units (odd face sizes) round to the nearest whole unit.
-- Release snapshots hold catalog data only, not positions, so they need no change.

WITH face AS (
  SELECT
    o.id,
    CASE WHEN o.face IN ('LEFT', 'RIGHT') THEN c.depth ELSE c.width END AS fw,
    CASE WHEN o.face IN ('TOP', 'BOTTOM') THEN c.depth ELSE c.height END AS fh
  FROM cabinet_openings o
  JOIN cabinets c ON c.id = o.cabinet_id
)
UPDATE cabinet_openings o
SET
  x = round((face.fw - COALESCE(o.width, 0)) / 2.0 + o.x)::int,
  y = round((face.fh - COALESCE(o.height, 0)) / 2.0 - o.y)::int
FROM face
WHERE face.id = o.id;

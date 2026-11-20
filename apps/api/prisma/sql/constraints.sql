-- Constraints Prisma can't express in schema.prisma. This file is the full current list.
-- To add one: append it here, then create an empty migration with
-- `pnpm --filter api prisma migrate dev --create-only --name <change>`, paste just the new
-- statement into it, run `prisma migrate dev`, and add its name to verify-constraints.sql.
-- Prisma doesn't see these, and (checked) doesn't try to drop them in later migrations.

-- Users: a DESIGNER must keep at least one of the two permissions.
ALTER TABLE users
  ADD CONSTRAINT users_designer_has_permission
  CHECK (role <> 'DESIGNER' OR can_projects OR can_components);

-- Users: usernames are unique ignoring case ("Admin" can't exist next to "admin").
-- Login still matches the exact spelling. Added in migration users_username_case_insensitive.
CREATE UNIQUE INDEX users_username_lower_key
  ON users (lower(username));

-- Machines: at least one copy.
ALTER TABLE machines
  ADD CONSTRAINT machines_quantity_positive
  CHECK (quantity > 0);

-- Revisions: numbered 1…999 (shown as "Rev 001"). Was 0…999 until migration
-- revisions_start_at_1, which renumbered existing rows.
ALTER TABLE machine_revisions
  ADD CONSTRAINT machine_revisions_rev_range
  CHECK (rev BETWEEN 1 AND 999);

-- Revisions: at most one WORKING revision per machine.
CREATE UNIQUE INDEX machine_revisions_one_working
  ON machine_revisions (machine_id)
  WHERE status = 'WORKING';

-- Revisions: released ones carry who / when.
ALTER TABLE machine_revisions
  ADD CONSTRAINT machine_revisions_release_info
  CHECK (status <> 'RELEASED' OR (released_at IS NOT NULL AND released_by_id IS NOT NULL));

-- Revisions: a release says what changed. Added in migration release_requires_notes.
ALTER TABLE machine_revisions
  ADD CONSTRAINT machine_revisions_release_notes
  CHECK (status <> 'RELEASED' OR length(btrim(coalesce(notes, ''))) > 0);

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

-- Cabinets: 1 or 2 doors. Two doors are hinged left and right (BOTH) and mounted as
-- manufactured (TOP); one door never uses BOTH. Added in migration cabinet_doors.
ALTER TABLE cabinets
  ADD CONSTRAINT cabinets_doors
  CHECK (
        doors IN (1, 2)
    AND (doors = 2) = (hinge_side::text = 'BOTH')
    AND (doors = 1 OR up_face = 'TOP')
  );

-- Components: phases only 1 or 3; rail offset only when rail mounted.
ALTER TABLE components
  ADD CONSTRAINT components_phases
  CHECK (phases IS NULL OR phases IN (1, 3));

ALTER TABLE components
  ADD CONSTRAINT components_rail_offset
  CHECK (rail_mount OR rail_edge_offset IS NULL);

-- Components: rails and gutters are profiles (length set per placement, so height = 0);
-- DIN rail is always 35 mm wide. Added in migration catalog.
ALTER TABLE components
  ADD CONSTRAINT components_profile_shape
  CHECK (
       (kind NOT IN ('RAIL', 'GUTTER') OR height = 0)
   AND (kind <> 'RAIL' OR width = 350)
  );

-- Components: exactly one DIN rail, the built-in TS35 x 7.5 (BUILT_IN_RAIL in
-- packages/shared). Added in migration builtin_din_rail, which also inserts the row.
CREATE UNIQUE INDEX components_one_rail ON components (kind) WHERE kind = 'RAIL';
ALTER TABLE components
  ADD CONSTRAINT components_builtin_rail
  CHECK (kind <> 'RAIL' OR (width = 350 AND height = 0 AND depth = 75 AND active));

-- Placements: 0 or 90 degrees only (180 / 270 look the same as outlines).
-- Narrowed from 0/90/180/270 in migration rotation_0_90.
ALTER TABLE placements
  ADD CONSTRAINT placements_rotation
  CHECK (rotation IN (0, 90));

-- Placements: terminal strips (count 1-200, bridged levels among 1-4). Which kinds may
-- use them is checked by the API. Added in migration terminal_strips.
ALTER TABLE placements
  ADD CONSTRAINT placements_strip
  CHECK (
        count BETWEEN 1 AND 200
    AND bridged_levels IS NOT NULL
    AND bridged_levels <@ ARRAY[1, 2, 3, 4]
  );

-- Openings: each kind carries the fields it needs. A bottom plate (migration bottom_plate) sits
-- on BOTTOM, with a corner radius of at most half its width and height. kind is compared as
-- text: that migration adds BOTTOM_PLATE and can't use the new value in the same transaction.
ALTER TABLE cabinet_openings
  ADD CONSTRAINT cabinet_openings_shape
  CHECK (
       (kind::text IN ('WINDOW', 'RECT_HOLE') AND width > 0 AND height > 0 AND diameter IS NULL AND gland_id IS NULL AND corner_radius IS NULL)
    OR (kind::text = 'ROUND_HOLE'            AND diameter > 0 AND width IS NULL AND height IS NULL AND gland_id IS NULL AND corner_radius IS NULL)
    OR (kind::text = 'CABLE_GLAND'           AND gland_id IS NOT NULL AND width IS NULL AND height IS NULL AND diameter IS NULL AND corner_radius IS NULL)
    OR (kind::text = 'BOTTOM_PLATE'          AND face = 'BOTTOM' AND width > 0 AND height > 0 AND diameter IS NULL AND gland_id IS NULL
                                             AND corner_radius >= 0 AND 2 * corner_radius <= LEAST(width, height))
  );

-- Components: only kinds with the Standard fields can be expandable (placed as a row of
-- identical modules, like a terminal strip). Added in migration expandable_parts.
ALTER TABLE components
  ADD CONSTRAINT components_expandable_kind
  CHECK (NOT expandable OR kind IN ('STANDARD', 'SAFETY', 'FUSE'));

-- Component types: the editor fill colour is "#rrggbb" (lower case). Added in migration
-- component_type_fill_color.
ALTER TABLE component_types
  ADD CONSTRAINT component_types_fill_color
  CHECK (fill_color IS NULL OR fill_color ~ '^#[0-9a-f]{6}
--   * released revisions are read-only
--   * the last active ADMIN can't be demoted or deactivated
--   * placement.rail_id points at a RAIL placement on the same platen
);

-- Not enforced here (API does it, see guidelines):
--   * released revisions are read-only
--   * the last active ADMIN can't be demoted or deactivated
--   * placement.rail_id points at a RAIL placement on the same platen

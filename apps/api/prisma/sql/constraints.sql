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

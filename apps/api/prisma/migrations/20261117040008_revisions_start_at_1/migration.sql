-- Hand-written (see prisma/sql/constraints.sql): revisions start at 1 ("Rev 001"), not 0.

ALTER TABLE machine_revisions DROP CONSTRAINT machine_revisions_rev_range;

-- Shift existing numbers up by one. Done in two steps (via negatives) because the
-- (machine_id, rev) unique index is checked row by row during an UPDATE.
UPDATE machine_revisions SET rev = -(rev + 1);
UPDATE machine_revisions SET rev = -rev;

ALTER TABLE machine_revisions
  ADD CONSTRAINT machine_revisions_rev_range
  CHECK (rev BETWEEN 1 AND 999);

-- Hand-written (see prisma/sql/constraints.sql): a release says what changed.
ALTER TABLE machine_revisions
  ADD CONSTRAINT machine_revisions_release_notes
  CHECK (status <> 'RELEASED' OR length(btrim(coalesce(notes, ''))) > 0);

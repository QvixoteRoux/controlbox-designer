# Revisions

Revisions belong to a **machine** (`machine_revisions`), not to the project. Each machine has its own history.

## Numbering

- `rev` is an integer 1…999 (DB check `machine_revisions_rev_range`; `FIRST_REV` / `MAX_REV` in `packages/shared`). Display it zero-padded to 3 digits with `formatRev()`: `Rev 001`, `Rev 002`…

## States

- **WORKING**: editable. A machine has **at most one** working revision, enforced by a unique index on the WORKING rows.
- **RELEASED**: frozen and read-only for everyone, admins included.

## Flow

1. Creating a machine creates **Rev 001 (WORKING)**.
2. **Release** (needs the `projects` permission):
   - A **change note is required** (`notes`): what changed in this revision. Enforced by Zod and the DB check `machine_revisions_release_notes`.
   - Fill the `snapshot` on every placement and on every opening that has a gland or component. The snapshot copies the catalog fields used for drawing: manufacturer, part number, code, sizes, rail offset, gland size and diameter. Shapes: `PlacementSnapshot` / `OpeningSnapshot` in `packages/shared/src/schemas/snapshot.ts`.
   - Then set `status = RELEASED`, `released_at` and `released_by_id`.
   - All of this happens in one transaction, with the revision row locked.
3. **New revision**, allowed only when there's no WORKING revision:
   - Deep-copy the latest released revision into `rev + 1` with `based_on_id` set. The copy includes cabinets, platens, placements (with rail links remapped) and openings.
   - Snapshots are cleared on the copy, so it uses the current catalog data.
   - The machine row is locked while the number is picked, so two simultaneous requests can't create the same revision.

All of this lives in `apps/api/src/services/revisions.ts`.

## Deleting

Deleting a project or machine removes every revision under it.

- Anyone with `projects` can delete a project or machine that has **no released revision**.
- Once something is released, **only an admin** can delete it (the UI makes them type the name). This is the one exception to "released is read-only": the history is removed as a whole, never edited.

## Why snapshots

The catalog changes over time. A released layout must still show exactly what was released, even after someone edits a component's size or deactivates it. Released views read from `snapshot`, and working views read from the live catalog.

## Enforcement

- Every service that writes revision data starts with `assertRevisionEditable(revisionId)`, which throws 409 if the revision is RELEASED.
- The editor opens released revisions in view-only mode, with a "Create new revision" button.
- Optional later step: a DB trigger that rejects writes under released revisions, as a second safety net.

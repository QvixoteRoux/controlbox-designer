# Revisions

Revisions belong to a **machine** (`machine_revisions`), not to the project. Each machine has its own history.

## Numbering

- `rev` is an integer 0…999 (DB check). Display it zero-padded to 3 digits with `formatRev()` from `packages/shared`: `Rev 000`, `Rev 001`…

## States

- **WORKING**: editable. A machine has **at most one** working revision, enforced by a unique index on the WORKING rows.
- **RELEASED**: frozen and read-only for everyone, admins included.

## Flow

1. Creating a machine creates **Rev 000 (WORKING)**.
2. **Release:**
   - Fill the `snapshot` on every placement and on every opening that has a gland or component. The snapshot copies the catalog fields used for drawing: manufacturer, part number, code, sizes, rail offset, gland size and diameter.
   - Then set `status = RELEASED`, `released_at` and `released_by_id`.
   - All of this happens in one transaction.
3. **New revision**, allowed only when there's no WORKING revision:
   - Deep-copy the latest released revision into `rev + 1` with `based_on_id` set. The copy includes cabinets, platens, placements (with rail links remapped) and openings.
   - Snapshots are cleared on the copy, so it uses the current catalog data.

## Why snapshots

The catalog changes over time. A released layout must still show exactly what was released, even after someone edits a component's size or deactivates it. Released views read from `snapshot`, and working views read from the live catalog.

## Enforcement

- Every service that writes revision data starts with `assertRevisionEditable(revisionId)`, which throws 409 if the revision is RELEASED.
- The editor opens released revisions in view-only mode, with a "Create new revision" button.
- Optional later step: a DB trigger that rejects writes under released revisions, as a second safety net.

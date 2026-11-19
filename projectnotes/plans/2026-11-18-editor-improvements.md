# Plan: editor improvements (2026-11-18)

Status: done (`2e2638f`, `ae283f7`, `66368a8`, `1090ed5`). Moved from the untracked agent notes.

Order: smallest first; one commit per step.

## 1. Rail / gutter captions (editor only)

- Rails and gutters: caption = part number + cut length, `TS35x7.5 · 1200 mm / 47.24 in` (whole mm, inches 2 decimals, via units.ts).
- Rails only: caption at ~20% from the rail's top edge (right edge when vertical), off the dashed centre line.

## 2. Expandable parts

- Catalog column `expandable` (default false) for STANDARD, SAFETY, FUSE (owner). Switch next to Snappable. Into ComponentSnapshot (released drawings frozen); migration renames nothing, adds column.
- Expandable placement = strip: `count` 1–200, grows to the right (down on a vertical rail), dividers between modules, "N pcs" caption like terminal strips.
- `isStrip(kind)` → `isStrip(part)` (kind or flag): 4 call sites + API count check (placements.ts:186).
- Colour / group label / bridges stay TERMINAL_BLOCK only.

## 3. Part list Kind → Type, type colours

- PartList: collapsible Kind → Type → parts; "No type" group; search opens groups with matches; open state in localStorage (per-viewer convenience).
- component_types: one optional **fill** colour, colour picker on the Types page.
- Owner (confirmed): **outline by kind, fill by type**. No outline colour on types.
- Terminal housing colours, warnings, selection stay on top.
- Snapshot the type colour(s) on release (revisions rule).

## 4. Dimensions for rails and gutters (editor only, computed, not stored)

- Toolbar toggle "Dimensions", off by default (owner).
- Measured from the platen's top-left origin to the **start end + centreline** (owner): horizontal: X to the left end, Y to the centreline; vertical: X to the centreline, Y to the top end.
- Drawn outside the platen edges, labels in both units like step 1 (`450 mm / 17.72 in`, owner), live while dragging.

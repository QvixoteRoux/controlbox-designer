import {
  centreOf,
  isProfile,
  placementBox,
  snapMove,
  snapToGrid,
  type LayoutChange,
  type Placement,
} from "@cabinet-planner/shared";

// Copy / paste on the platen (guidelines/platen-editor.md, owner 2026-11-18). The copy is a
// snapshot of the selected placements; pasting creates new ones in one batch (one undo step).

/** 10 mm: where a paste lands when the pointer isn't over the platen (right and down). */
export const PASTE_OFFSET = 100;

/**
 * The next free tag for each pasted tag: same prefix, the number after the highest one in use
 * ("-K1" with -K1…-K6 in the layout → "-K7"). Tags without a trailing number are pasted as
 * they are. Returns a function that hands out tags in order, never the same one twice.
 */
export function nextTags(existing: (string | null)[]) {
  const highest = new Map<string, number>();
  const note = (tag: string | null) => {
    const m = tag?.match(/^(.*?)(\d+)$/);
    if (!m) return;
    const [, prefix = "", digits = "0"] = m;
    highest.set(prefix, Math.max(highest.get(prefix) ?? 0, Number(digits)));
  };
  existing.forEach(note);
  return (tag: string | null) => {
    const m = tag?.match(/^(.*?)(\d+)$/);
    if (!tag || !m) return tag;
    const prefix = m[1] ?? "";
    const next = (highest.get(prefix) ?? 0) + 1;
    highest.set(prefix, next);
    return `${prefix}${next}`;
  };
}

/**
 * The create changes that paste `copied` with the group's centre at `at` (platen units), or
 * PASTE_OFFSET right and down from the originals when `at` is null.
 * - One part (the anchor: the first rail-mounted part that isn't riding a copied rail) snaps
 *   like a drop (onto a rail under it, side by side); everything else keeps its place relative
 *   to it. With no anchor, the shift is rounded to the grid when grid snap is on.
 * - A copied rail and the copied parts on it are pasted together: the parts ride the new rail.
 * - Other rail-mounted parts land on a rail under their new centre, if there is one.
 * - Pasted parts are unlocked; tags get the next free number (nextTags).
 */
export function pasteChanges(
  copied: Placement[],
  all: Placement[],
  at: { x: number; y: number } | null,
  options: { grid: number | null; platen: { width: number; height: number } },
): LayoutChange[] {
  if (copied.length === 0) return [];
  const boxes = copied.map(placementBox);
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  const centre = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const target = at ?? { x: centre.x + PASTE_OFFSET, y: centre.y + PASTE_OFFSET };

  const copiedRails = new Set(copied.filter((p) => p.part.kind === "RAIL").map((p) => p.id));
  const ridesCopiedRail = (p: Placement) => p.railId !== null && copiedRails.has(p.railId);
  const snap = { tolerance: 0, grid: options.grid, platen: options.platen };

  // The shift: from the anchor's drop, else the pointer (on the grid when grid snap is on).
  let dx = target.x - centre.x;
  let dy = target.y - centre.y;
  const anchor = copied.find(
    (p) => p.part.railMount && !isProfile(p.part.kind) && !ridesCopiedRail(p),
  );
  const anchorDrop =
    anchor && snapMove({ ...anchor, railId: null }, shifted(centreOf(anchor), dx, dy), all, snap);
  if (anchor && anchorDrop?.railId != null) {
    dx = anchorDrop.x - anchor.x;
    dy = anchorDrop.y - anchor.y;
  } else if (options.grid !== null) {
    dx = snapToGrid(dx, options.grid);
    dy = snapToGrid(dy, options.grid);
  }
  dx = Math.round(dx);
  dy = Math.round(dy);

  // New temp ids: rails first, so parts can ride them.
  const ordered = [
    ...copied.filter((p) => copiedRails.has(p.id)),
    ...copied.filter((p) => !copiedRails.has(p.id)),
  ];
  const tempIds = new Map(ordered.map((p, i) => [p.id, -(i + 1)]));
  const tag = nextTags(all.map((p) => p.tag));

  return ordered.map((p) => {
    let x = p.x + dx;
    let y = p.y + dy;
    let rotation = p.rotation;
    let railId: number | null = null;
    if (ridesCopiedRail(p)) {
      railId = tempIds.get(p.railId!) ?? null;
    } else if (p.part.railMount && !isProfile(p.part.kind)) {
      // Onto a rail under its new centre, if there is one (exactly, no tolerance).
      const r = snapMove({ ...p, railId: null }, shifted(centreOf(p), dx, dy), all, {
        ...snap,
        grid: null,
      });
      if (r.railId !== null) ({ x, y, rotation, railId } = r);
    }
    return {
      op: "create" as const,
      tempId: tempIds.get(p.id)!,
      componentId: p.part.componentId,
      x,
      y,
      rotation,
      length: p.length,
      railId,
      tag: tag(p.tag),
      count: p.count,
      color: p.color,
      groupLabel: p.groupLabel,
      bridgedLevels: p.bridgedLevels,
    };
  });
}

const shifted = (c: { x: number; y: number }, dx: number, dy: number) => ({
  x: c.x + dx,
  y: c.y + dy,
});

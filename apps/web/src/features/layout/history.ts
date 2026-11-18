import { withPatch, type LayoutChange, type Placement } from "@cabinet-planner/shared";

// Undo / redo for the platen editor (guidelines/platen-editor.md, "Saving"). Each step keeps
// the layout before and after it; undo sends the changes that turn the current layout back
// into "before", redo into "after". Parts that undo has to re-create get new ids, so every
// step is then renamed to the new ids (remapIds).

export interface Step {
  before: Placement[];
  after: Placement[];
  /** Consecutive steps with the same key merge (arrow-key nudges held down). */
  mergeKey?: string;
  at: number;
}

const FIELDS = [
  "x",
  "y",
  "rotation",
  "length",
  "locked",
  "railId",
  "tag",
  "zIndex",
  "count",
  "color",
  "groupLabel",
  "bridgedLevels",
] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The batch that turns `current` into `target`: deletes, then re-creates (rails first, so
 * parts can go back on them by temporary id), then updates (rails first; the parts they carry
 * are predicted with withPatch, exactly as the API moves them, and only corrected after).
 * `tempIds` maps each re-created placement's old id to its temporary id.
 */
export function changesTo(current: Placement[], target: Placement[]) {
  const now = new Map(current.map((p) => [p.id, p]));
  const wanted = new Set(target.map((p) => p.id));
  const changes: LayoutChange[] = [];

  for (const p of current) {
    if (!wanted.has(p.id)) changes.push({ op: "delete", id: p.id });
  }

  const tempIds = new Map<number, number>();
  const missing = target
    .filter((p) => !now.has(p.id))
    .sort((a, b) => Number(b.part.kind === "RAIL") - Number(a.part.kind === "RAIL"));
  missing.forEach((p, i) => tempIds.set(p.id, -(i + 1)));
  const ref = (id: number | null) => (id === null ? null : (tempIds.get(id) ?? id));
  for (const p of missing) {
    changes.push({
      op: "create",
      tempId: tempIds.get(p.id)!,
      componentId: p.part.componentId,
      x: p.x,
      y: p.y,
      rotation: p.rotation,
      length: p.length,
      railId: ref(p.railId),
      tag: p.tag,
      count: p.count,
      color: p.color,
      groupLabel: p.groupLabel,
      bridgedLevels: p.bridgedLevels,
      locked: p.locked,
      zIndex: p.zIndex,
    });
  }

  // What the layout will look like as the batch runs (deleted parts gone, rails carrying).
  let working = current
    .filter((p) => wanted.has(p.id))
    .map((p) => (p.railId !== null && !wanted.has(p.railId) ? { ...p, railId: null } : p));
  const ordered = target
    .filter((p) => now.has(p.id))
    .sort((a, b) => Number(b.part.kind === "RAIL") - Number(a.part.kind === "RAIL"));
  for (const t of ordered) {
    const w = working.find((p) => p.id === t.id)!;
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) {
      if (!same(w[f], t[f])) patch[f] = f === "railId" ? ref(t.railId) : t[f];
    }
    if (Object.keys(patch).length === 0) continue;
    changes.push({ op: "update", id: t.id, patch });
    working = withPatch(working, t.id, patch as Partial<Placement>);
  }
  return { changes, tempIds };
}

/** Renames placement ids (and rail links) in a layout. */
export function remapIds(placements: Placement[], ids: Map<number, number>): Placement[] {
  if (ids.size === 0) return placements;
  const id = (n: number) => ids.get(n) ?? n;
  return placements.map((p) => ({
    ...p,
    id: id(p.id),
    railId: p.railId === null ? null : id(p.railId),
  }));
}

export const remapStep = (s: Step, ids: Map<number, number>): Step => ({
  ...s,
  before: remapIds(s.before, ids),
  after: remapIds(s.after, ids),
});

/** Old id → new id, from the temporary ids a batch used and the ids the API gave them. */
export function newIds(tempIds: Map<number, number>, created: { tempId: number; id: number }[]) {
  const byTemp = new Map(created.map((c) => [c.tempId, c.id]));
  const ids = new Map<number, number>();
  for (const [old, temp] of tempIds) {
    const id = byTemp.get(temp);
    if (id !== undefined) ids.set(old, id);
  }
  return ids;
}

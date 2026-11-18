import {
  alongRail,
  centreOf,
  lengthAlongRail,
  positionOnRail,
  railFrame,
  snapMove,
  withPatch,
  type LayoutChange,
  type Placement,
  type Rotation,
  type UpdatePlacementInput,
} from "@cabinet-planner/shared";

/** Where a drag would leave a part: x, y, and the rotation and rail it picks up. */
export interface MovePatch {
  x: number;
  y: number;
  rotation: Rotation;
  railId: number | null;
}

/** Only the fields that differ from the placement (an empty patch means nothing moved). */
export function changedFields(p: Placement, move: MovePatch): UpdatePlacementInput {
  const patch: UpdatePlacementInput = {};
  if (move.x !== p.x) patch.x = move.x;
  if (move.y !== p.y) patch.y = move.y;
  if (move.rotation !== p.rotation) patch.rotation = move.rotation;
  if (move.railId !== p.railId) patch.railId = move.railId;
  return patch;
}

/**
 * Moves for parts that all shift by (dx, dy): a multi-select drag (the others follow the
 * dragged part) or an arrow-key nudge. Locked parts stay. Parts on a rail that moves too ride
 * along with it (withPatch), so they get no move of their own. Parts on a rail that stays
 * keep to it, like a typed position: they slide along it (clamped) or come off when moved
 * clearly away.
 */
export function followMoves(
  parts: Placement[],
  dx: number,
  dy: number,
  all: Placement[],
  platen: { width: number; height: number },
  alsoMoving: number[] = [],
) {
  const moving = new Set([...parts.filter((p) => !p.locked).map((p) => p.id), ...alsoMoving]);
  const moves = new Map<number, MovePatch>();
  for (const p of parts) {
    if (p.locked || (p.railId !== null && moving.has(p.railId))) continue;
    if (p.railId !== null && p.part.railMount) {
      const c = centreOf(p);
      const r = snapMove(p, { x: c.x + dx, y: c.y + dy }, all, {
        tolerance: 0,
        grid: null,
        platen,
      });
      moves.set(p.id, { x: r.x, y: r.y, rotation: r.rotation, railId: r.railId });
    } else {
      moves.set(p.id, { x: p.x + dx, y: p.y + dy, rotation: p.rotation, railId: p.railId });
    }
  }
  return moves;
}

/**
 * A part slid along its own rail with its chain (railChain): limits the slide so the whole row
 * stays on the rail. Clamping each part on its own would bunch them up at the rail's end.
 * Returns where the dragged part goes.
 */
export function slideWithChain(
  p: Placement,
  to: { x: number; y: number },
  chain: number[],
  all: Placement[],
): { x: number; y: number } {
  const rail = all.find((r) => r.id === p.railId);
  if (!rail || chain.length === 0) return to;
  let from = Infinity;
  let end = -Infinity;
  for (const q of all.filter((q) => q.id === p.id || chain.includes(q.id))) {
    const a = alongRail(rail, q);
    from = Math.min(from, a);
    end = Math.max(end, a + lengthAlongRail(q));
  }
  const length = railFrame(rail).length;
  const slide = Math.min(Math.max(alongRail(rail, to) - alongRail(rail, p), -from), length - end);
  const at = positionOnRail(rail, p.part, alongRail(rail, p) + slide);
  return { x: at.x, y: at.y };
}

/** The layout with these moves applied (rails carrying their parts), for the drag preview. */
export function withMoves(placements: Placement[], moves: Map<number, MovePatch>) {
  let next = placements;
  for (const [id, move] of moves) next = withPatch(next, id, move);
  return next;
}

/** Update changes for the moves that change something. */
export function movesToChanges(moves: Map<number, MovePatch>, all: Placement[]): LayoutChange[] {
  const changes: LayoutChange[] = [];
  for (const [id, move] of moves) {
    const p = all.find((x) => x.id === id);
    if (!p) continue;
    const patch = changedFields(p, move);
    if (Object.keys(patch).length > 0) changes.push({ op: "update", id, patch });
  }
  return changes;
}

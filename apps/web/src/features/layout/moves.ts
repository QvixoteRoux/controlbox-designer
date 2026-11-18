import type { Placement, Rotation, UpdatePlacementInput } from "@cabinet-planner/shared";

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

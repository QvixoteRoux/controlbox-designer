import type { LayoutChange, LayoutChangesResult, Placement } from "@cabinet-planner/shared";
import { useState } from "react";
import type { RevisionRef } from "../cabinets/api";
import { useLayoutChanges } from "./api";
import { changesTo, newIds, remapStep, type Step } from "./history";

/** Undo keeps this many steps (per editor session; leaving the page forgets them). */
const MAX_STEPS = 100;
/** Steps with the same merge key this close together become one (held-down arrow keys). */
const MERGE_MS = 1500;

/**
 * Saving with undo / redo. `edit` saves a batch and records the step once the server has
 * answered; `undo` / `redo` save the batch that turns the layout back into the step's
 * before / after state. Nothing new is sent while a save is in flight.
 */
export function useLayoutHistory(ref: RevisionRef, cabinetId: number, placements: Placement[]) {
  const save = useLayoutChanges(ref, cabinetId);
  const [history, setHistory] = useState<{ past: Step[]; future: Step[] }>({
    past: [],
    future: [],
  });

  const edit = (
    changes: LayoutChange[],
    options: { mergeKey?: string; onDone?: (result: LayoutChangesResult) => void } = {},
  ) => {
    if (changes.length === 0) return;
    const before = placements;
    // mutateAsync, not mutate: mutate's per-call callbacks only fire for the latest call, and
    // nudges can overlap. Errors are already shown (and rolled back) by useLayoutChanges.
    save.mutateAsync(changes).then(
      (result) => {
        const at = Date.now();
        setHistory(({ past }) => {
          const last = past.at(-1);
          if (options.mergeKey && last?.mergeKey === options.mergeKey && at - last.at < MERGE_MS) {
            return {
              past: [...past.slice(0, -1), { ...last, after: result.placements, at }],
              future: [],
            };
          }
          const step: Step = { before, after: result.placements, mergeKey: options.mergeKey, at };
          return { past: [...past, step].slice(-MAX_STEPS), future: [] };
        });
        options.onDone?.(result);
      },
      () => {},
    );
  };

  /** Turns the layout into one side of a step, then moves the step to the other stack. */
  const travel = (direction: "undo" | "redo") => {
    const from = direction === "undo" ? history.past : history.future;
    const step = from.at(-1);
    if (!step || save.isPending) return;
    const { changes, tempIds } = changesTo(
      placements,
      direction === "undo" ? step.before : step.after,
    );
    const done = (ids: Map<number, number>) =>
      setHistory(({ past, future }) => {
        const rename = (steps: Step[]) => steps.map((s) => remapStep(s, ids));
        const moved = { ...step, mergeKey: undefined };
        return direction === "undo"
          ? { past: rename(past.slice(0, -1)), future: rename([...future, moved]) }
          : { past: rename([...past, moved]), future: rename(future.slice(0, -1)) };
      });
    if (changes.length === 0) return done(new Map());
    save.mutateAsync(changes).then(
      (result) => done(newIds(tempIds, result.created)),
      () => {},
    );
  };

  return {
    edit,
    undo: () => travel("undo"),
    redo: () => travel("redo"),
    canUndo: history.past.length > 0 && !save.isPending,
    canRedo: history.future.length > 0 && !save.isPending,
    saving: save.isPending,
  };
}

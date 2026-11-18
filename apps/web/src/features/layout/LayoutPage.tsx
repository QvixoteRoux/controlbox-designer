import {
  can,
  CabinetParams,
  centreOf,
  formatRev,
  hasWarning,
  layoutWarnings,
  snapMove,
  type ComponentListItem,
  type LayoutDetail,
  type LayoutWarnings,
  type Placement,
  type UpdatePlacementInput,
} from "@cabinet-planner/shared";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Group,
  Kbd,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { errorMessage } from "../../lib/api";
import { useCurrentUser } from "../auth/api";
import { componentsQuery } from "../catalog/api";
import { cabinetRoute, revisionPath, type RevisionRef } from "../cabinets/api";
import { StatusBadge } from "../projects/RevisionBadge";
import { layoutQuery } from "./api";
import { kindColors } from "./colors";
import { GRID, LayoutCanvas } from "./LayoutCanvas";
import { changedFields, followMoves, movesToChanges } from "./moves";
import { PartList } from "./PartList";
import { PropertiesPanel } from "./PropertiesPanel";
import { useLayoutHistory } from "./useLayoutHistory";

/** Arrow keys nudge by 1 mm, with Shift by 10 mm. */
const NUDGE = 10;
const NUDGE_SHIFT = 100;

/** The platen editor: catalog on the left, the platen in the middle, properties on the right. */
export function LayoutPage() {
  const { cabinetId, ...ref } = CabinetParams.parse(useParams());
  const layout = useQuery(layoutQuery(ref, cabinetId));
  if (layout.isPending) return <Loader />;
  if (layout.isError) return <Alert color="red">{errorMessage(layout.error)}</Alert>;
  return <LayoutEditor revisionRef={ref} cabinetId={cabinetId} layout={layout.data} />;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function LayoutEditor({
  revisionRef: ref,
  cabinetId,
  layout,
}: {
  revisionRef: RevisionRef;
  cabinetId: number;
  layout: LayoutDetail;
}) {
  const user = useCurrentUser();
  const components = useQuery(componentsQuery);
  const { context, cabinet, platen, placements } = layout;
  const { project, machine, revision } = context;
  const history = useLayoutHistory(ref, cabinetId, placements);
  const [selection, setSelection] = useState<number[]>([]);
  const [gridSnap, setGridSnap] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);
  const colors = kindColors(useMantineTheme(), useComputedColorScheme("light") === "dark");

  const editable = revision.status === "WORKING" && can(user, "projects") && cabinet.hasPlaten;
  const warnings = platen ? layoutWarnings(placements, platen) : new Map<number, LayoutWarnings>();
  const warningCount = placements.filter((p) => hasWarning(warnings.get(p.id))).length;
  // Ids that went away (deleted, or renamed by undo) drop out of the selection.
  const selected = placements.filter((p) => selection.includes(p.id));
  const single = selected.length === 1 ? selected[0]! : null;
  const topZ = Math.max(0, ...placements.map((p) => p.zIndex));
  const nameOf = (id: number) => {
    const p = placements.find((x) => x.id === id);
    return p ? (p.tag ?? p.part.partNumber) : `#${id}`;
  };
  const update = (id: number, patch: UpdatePlacementInput, mergeKey?: string) =>
    history.edit([{ op: "update", id, patch }], { mergeKey });

  /** Adds a part centred on a point of the platen: onto a rail there, else on the grid. */
  const addAt = (component: ComponentListItem, at: { x: number; y: number }) => {
    if (!platen) return;
    const probe = { id: 0, x: 0, y: 0, rotation: 0 as const, length: null, part: component };
    const r = snapMove({ ...probe, railId: null }, at, placements, {
      tolerance: 0,
      grid: gridSnap ? GRID : null,
      platen,
    });
    history.edit(
      [
        {
          op: "create",
          tempId: -1,
          componentId: component.id,
          x: r.x,
          y: r.y,
          rotation: r.rotation,
          railId: r.railId,
        },
      ],
      { onDone: (result) => setSelection(result.created.map((c) => c.id)) },
    );
  };

  /** Typed X / Y: same snapping as a drag, minus alignment and grid (exact values). */
  const moveTo = (p: Placement, to: { x?: number; y?: number }) => {
    if (!platen) return;
    const r = snapMove(p, centreOf({ ...p, ...to }), placements, {
      tolerance: 0,
      grid: null,
      platen,
    });
    const patch = changedFields(p, {
      x: r.x,
      y: r.y,
      rotation: r.rotation,
      railId: p.part.railMount ? r.railId : p.railId,
    });
    if (Object.keys(patch).length > 0) update(p.id, patch);
  };

  const deleteSelected = () => {
    const ids = selected.filter((p) => !p.locked).map((p) => p.id);
    if (ids.length === 0) return;
    history.edit(ids.map((id) => ({ op: "delete", id })));
    setSelection(selection.filter((id) => !ids.includes(id)));
  };

  const lockSelected = (locked: boolean) =>
    history.edit(
      selected
        .filter((p) => p.locked !== locked)
        .map((p) => ({ op: "update", id: p.id, patch: { locked } })),
    );

  const nudge = (dx: number, dy: number) => {
    if (!platen) return;
    const changes = movesToChanges(followMoves(selected, dx, dy, placements, platen), placements);
    history.edit(changes, { mergeKey: `nudge:${[...selection].sort().join(",")}` });
  };

  // Keyboard: undo / redo, nudge, delete, select all, clear. Not while typing in a field.
  const onKey = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    } else if (mod && key === "y") {
      e.preventDefault();
      history.redo();
    } else if (mod && key === "a") {
      e.preventDefault();
      setSelection(placements.map((p) => p.id));
    } else if (e.key === "Escape") {
      setSelection([]);
    } else if (!editable || selected.length === 0) {
      return;
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_SHIFT : NUDGE;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const [dx, dy] = moves[e.key] ?? [0, 0];
      nudge(dx, dy);
    }
  };
  const onKeyRef = useRef(onKey);
  useEffect(() => {
    onKeyRef.current = onKey;
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const componentById = (id: number) => components.data?.find((c) => c.id === id);

  return (
    <Box
      h="calc(100dvh - 56px - 32px - 2 * var(--mantine-spacing-md))"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Breadcrumbs separatorMargin={6} style={{ fontSize: "var(--mantine-font-size-sm)" }}>
            <Anchor component={Link} to={`/projects/${project.id}`} size="sm">
              {project.name}
            </Anchor>
            <Anchor
              component={Link}
              to={`/projects/${project.id}/machines/${machine.id}`}
              size="sm"
            >
              {machine.name}
            </Anchor>
            <Anchor component={Link} to={revisionPath(ref)} size="sm">
              {formatRev(revision.rev)}
            </Anchor>
            <Anchor component={Link} to={cabinetRoute(ref, cabinetId)} size="sm">
              Cabinet {cabinet.number}
            </Anchor>
          </Breadcrumbs>
          <Group gap="xs">
            <Title order={3}>Platen layout · Cabinet {cabinet.number}</Title>
            <StatusBadge status={revision.status} />
            {warningCount > 0 && (
              <Badge color="red" variant="light">
                {warningCount} warning{warningCount === 1 ? "" : "s"}
              </Badge>
            )}
          </Group>
        </div>
        <Group gap="sm" wrap="nowrap">
          {editable && (
            <Button.Group>
              <Tooltip label="Undo (Ctrl+Z)">
                <Button
                  size="xs"
                  variant="default"
                  disabled={!history.canUndo}
                  onClick={history.undo}
                >
                  Undo
                </Button>
              </Tooltip>
              <Tooltip label="Redo (Ctrl+Y or Ctrl+Shift+Z)">
                <Button
                  size="xs"
                  variant="default"
                  disabled={!history.canRedo}
                  onClick={history.redo}
                >
                  Redo
                </Button>
              </Tooltip>
            </Button.Group>
          )}
          <Switch
            size="xs"
            label="Snap to 5 mm grid"
            checked={gridSnap}
            onChange={(e) => setGridSnap(e.currentTarget.checked)}
          />
          <Button size="xs" variant="default" onClick={() => setFitSignal((n) => n + 1)}>
            Fit
          </Button>
        </Group>
      </Group>

      {revision.status === "RELEASED" && (
        <Alert color="teal" p="xs">
          {formatRev(revision.rev)} is released: the layout is read-only and shows the parts as they
          were at release.
        </Alert>
      )}
      {!cabinet.hasPlaten && (
        <Alert color="yellow" p="xs">
          This cabinet has no platen. Switch it on in the cabinet page to edit the layout.
        </Alert>
      )}

      {platen ? (
        <Box style={{ flex: 1, minHeight: 0, display: "flex", gap: 8 }}>
          <Paper withBorder p="xs" w={260} style={{ flexShrink: 0 }}>
            <PartList
              components={components.data ?? []}
              editable={editable}
              onAdd={(c) => addAt(c, { x: platen.width / 2, y: platen.height / 2 })}
            />
          </Paper>

          <Box style={{ flex: 1, minWidth: 0 }}>
            <LayoutCanvas
              platen={platen}
              placements={placements}
              warnings={warnings}
              selection={selected.map((p) => p.id)}
              onSelectionChange={setSelection}
              editable={editable}
              gridSnap={gridSnap}
              fitSignal={fitSignal}
              onEdit={(changes) => history.edit(changes)}
              onDropPart={(componentId, at) => {
                const c = componentById(componentId);
                if (c) addAt(c, at);
              }}
            />
          </Box>

          <Paper withBorder p="xs" w={280} style={{ flexShrink: 0 }}>
            <ScrollArea h="100%" type="auto">
              {single ? (
                <PropertiesPanel
                  key={single.id}
                  placement={single}
                  colors={colors}
                  warnings={warnings.get(single.id)}
                  nameOf={nameOf}
                  editable={editable}
                  topZ={topZ}
                  onChange={(patch) => update(single.id, patch)}
                  onMoveTo={(to) => moveTo(single, to)}
                  onDelete={deleteSelected}
                />
              ) : selected.length > 1 ? (
                <Stack gap="sm">
                  <Text fw={600}>{selected.length} parts selected</Text>
                  <Text size="xs" c="dimmed">
                    Drag one of them to move them all. Arrow keys nudge them. Locked parts stay
                    where they are; parts on a selected rail move with it.
                  </Text>
                  {editable && (
                    <Group gap="xs">
                      <Button size="xs" variant="default" onClick={() => lockSelected(true)}>
                        Lock all
                      </Button>
                      <Button size="xs" variant="default" onClick={() => lockSelected(false)}>
                        Unlock all
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        disabled={selected.every((p) => p.locked)}
                        onClick={deleteSelected}
                      >
                        Delete
                      </Button>
                    </Group>
                  )}
                </Stack>
              ) : (
                <Stack gap="xs">
                  <Text size="sm" c="dimmed">
                    {editable
                      ? "Drag a part from the list onto the platen, or click a part to edit it. Rail-mounted parts snap onto rails and line up side by side; other parts line up with their neighbours. Hold Alt while dragging to turn snapping off."
                      : "Click a part to see its details."}
                  </Text>
                  <Shortcuts editable={editable} />
                </Stack>
              )}
            </ScrollArea>
          </Paper>
        </Box>
      ) : (
        <Text c="dimmed">This cabinet has no platen.</Text>
      )}
    </Box>
  );
}

function Shortcuts({ editable }: { editable: boolean }) {
  const rows: [string, string][] = [
    ["Scroll", "zoom"],
    ["Drag background", "pan"],
    ["Shift / Ctrl + click", "add to or remove from the selection"],
    ["Shift + drag background", "select an area"],
    ["Ctrl + A", "select all"],
    ["Esc", "clear the selection"],
  ];
  if (editable) {
    rows.push(
      ["Arrows", "nudge 1 mm (Shift: 10 mm)"],
      ["Delete", "delete the selection"],
      ["Ctrl + Z", "undo"],
      ["Ctrl + Y", "redo"],
      ["Alt while dragging", "no snapping"],
    );
  }
  return (
    <Stack gap={4}>
      {rows.map(([keys, what]) => (
        <Text key={keys} size="xs">
          <Kbd size="xs">{keys}</Kbd> {what}
        </Text>
      ))}
    </Stack>
  );
}

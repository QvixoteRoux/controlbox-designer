import {
  can,
  CabinetParams,
  centreOf,
  formatRev,
  hasWarning,
  layoutWarnings,
  snapMove,
  type ComponentListItem,
  type LayoutWarnings,
  type Placement,
} from "@cabinet-planner/shared";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { errorMessage } from "../../lib/api";
import { useCurrentUser } from "../auth/api";
import { componentsQuery } from "../catalog/api";
import { cabinetRoute, revisionPath } from "../cabinets/api";
import { StatusBadge } from "../projects/RevisionBadge";
import { layoutQuery, useCreatePlacement, useDeletePlacement, useUpdatePlacement } from "./api";
import { GRID, LayoutCanvas } from "./LayoutCanvas";
import { changedFields } from "./moves";
import { PartList } from "./PartList";
import { PropertiesPanel } from "./PropertiesPanel";

/** The platen editor: catalog on the left, the platen in the middle, properties on the right. */
export function LayoutPage() {
  const { cabinetId, ...ref } = CabinetParams.parse(useParams());
  const user = useCurrentUser();
  const layout = useQuery(layoutQuery(ref, cabinetId));
  const components = useQuery(componentsQuery);
  const create = useCreatePlacement(ref, cabinetId);
  const update = useUpdatePlacement(ref, cabinetId);
  const remove = useDeletePlacement(ref, cabinetId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [gridSnap, setGridSnap] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);

  if (layout.isPending) return <Loader />;
  if (layout.isError) return <Alert color="red">{errorMessage(layout.error)}</Alert>;

  const { context, cabinet, platen, placements } = layout.data;
  const { project, machine, revision } = context;
  const editable = revision.status === "WORKING" && can(user, "projects") && cabinet.hasPlaten;
  const warnings = platen ? layoutWarnings(placements, platen) : new Map<number, LayoutWarnings>();
  const warningCount = placements.filter((p) => hasWarning(warnings.get(p.id))).length;
  const selected = placements.find((p) => p.id === selectedId) ?? null;
  const topZ = Math.max(0, ...placements.map((p) => p.zIndex));
  const nameOf = (id: number) => {
    const p = placements.find((x) => x.id === id);
    return p ? (p.tag ?? p.part.partNumber) : `#${id}`;
  };

  /** Adds a part centred on a point of the platen: onto a rail there, else on the grid. */
  const addAt = (component: ComponentListItem, at: { x: number; y: number }) => {
    if (!platen) return;
    const probe = {
      id: 0,
      x: 0,
      y: 0,
      rotation: 0 as const,
      length: null,
      railId: null,
      part: component,
    };
    const r = snapMove(probe, at, placements, {
      tolerance: 0,
      grid: gridSnap ? GRID : null,
      platen,
    });
    create.mutate(
      {
        componentId: component.id,
        x: r.x,
        y: r.y,
        rotation: r.rotation,
        length: null,
        railId: r.railId,
        tag: null,
      },
      { onSuccess: (p) => setSelectedId(p.id) },
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
    if (Object.keys(patch).length > 0) update.mutate({ id: p.id, patch });
  };
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
              selectedId={selectedId}
              onSelect={setSelectedId}
              editable={editable}
              gridSnap={gridSnap}
              fitSignal={fitSignal}
              onMove={(id, patch) => update.mutate({ id, patch })}
              onLength={(id, length) => update.mutate({ id, patch: { length } })}
              onDropPart={(componentId, at) => {
                const c = componentById(componentId);
                if (c) addAt(c, at);
              }}
            />
          </Box>

          <Paper withBorder p="xs" w={280} style={{ flexShrink: 0 }}>
            <ScrollArea h="100%" type="auto">
              {selected ? (
                <PropertiesPanel
                  key={selected.id}
                  placement={selected}
                  warnings={warnings.get(selected.id)}
                  nameOf={nameOf}
                  editable={editable}
                  topZ={topZ}
                  onChange={(patch) => update.mutate({ id: selected.id, patch })}
                  onMoveTo={(to) => moveTo(selected, to)}
                  onDelete={() => {
                    remove.mutate(selected.id);
                    setSelectedId(null);
                  }}
                />
              ) : (
                <Text size="sm" c="dimmed">
                  {editable
                    ? "Drag a part from the list onto the platen, or click a part to edit it. Rail-mounted parts snap onto rails and line up side by side; other parts line up with their neighbours. Hold Alt while dragging to turn snapping off. Scroll to zoom, drag the background to pan."
                    : "Click a part to see its details. Scroll to zoom, drag the background to pan."}
                </Text>
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

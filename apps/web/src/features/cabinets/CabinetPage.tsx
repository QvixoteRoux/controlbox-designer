import {
  CabinetParams,
  can,
  Face,
  formatRev,
  openingWarnings,
  toMm,
  type Opening,
} from "@cabinet-planner/shared";
import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";
import { errorMessage } from "../../lib/api";
import { formatDims, formatMm } from "../../lib/format";
import { useCurrentUser } from "../auth/api";
import { StatusBadge } from "../projects/RevisionBadge";
import {
  cabinetQuery,
  revisionPath,
  useDeleteCabinet,
  useDeleteOpening,
  useSetWindow,
  useUpdateCabinet,
} from "./api";
import { CabinetFormModal } from "./CabinetFormModal";
import { FaceView } from "./FaceView";
import { FACE_LABELS, KIND_LABELS } from "./labels";
import { OpeningFormModal } from "./OpeningFormModal";
import { PlatenModal } from "./PlatenModal";

const title = (s: string) => s[0] + s.slice(1).toLowerCase();

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{children}</Text>
    </div>
  );
}

const openingSize = (o: Opening) =>
  o.width !== null && o.height !== null
    ? formatDims(o.width, o.height)
    : o.diameter !== null
      ? `Ø ${formatMm(o.diameter)}`
      : o.gland
        ? `${o.gland.size} (Ø ${formatMm(o.gland.holeDiameter)})`
        : "–";

export function CabinetPage() {
  const { cabinetId, ...ref } = CabinetParams.parse(useParams());
  const user = useCurrentUser();
  const navigate = useNavigate();
  const cabinet = useQuery(cabinetQuery(ref, cabinetId));
  const update = useUpdateCabinet(ref, cabinetId);
  const setWindow = useSetWindow(ref, cabinetId);
  const remove = useDeleteCabinet(ref, cabinetId);
  const removeOpening = useDeleteOpening(ref, cabinetId);
  const [face, setFace] = useState<Face>("FRONT");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [openingTarget, setOpeningTarget] = useState<Opening | { face: Face } | null>(null);
  const [editOpen, editModal] = useDisclosure(false);
  const [platenOpen, platenModal] = useDisclosure(false);
  const [deleteOpen, deleteModal] = useDisclosure(false);

  if (cabinet.isPending) return <Loader />;
  if (cabinet.isError) return <Alert color="red">{errorMessage(cabinet.error)}</Alert>;

  const c = cabinet.data;
  const { project, machine, revision } = c.context;
  const editable = revision.status === "WORKING" && can(user, "projects");
  const warnings = openingWarnings(c, c.openings);
  const onFace = c.openings.filter((o) => o.face === face);
  const hasWindow = c.openings.some((o) => o.kind === "WINDOW");
  const warningCount = [...warnings.values()].filter(
    (w) => w.outside || w.overlaps.length > 0,
  ).length;
  const showError = (err: unknown) =>
    notifications.show({ color: "red", message: errorMessage(err) });

  const select = (id: number) => {
    setSelectedId(id);
    if (editable) {
      const o = c.openings.find((x) => x.id === id);
      if (o) setOpeningTarget(o);
    }
  };

  const confirmDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        notifications.show({ color: "green", message: `Cabinet ${c.number} deleted` });
        void navigate(revisionPath(ref));
      },
    });

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/">
          Projects
        </Anchor>
        <Anchor component={Link} to={`/projects/${project.id}`}>
          {project.name}
        </Anchor>
        <Anchor component={Link} to={`/projects/${project.id}/machines/${machine.id}`}>
          {machine.name}
        </Anchor>
        <Anchor component={Link} to={revisionPath(ref)}>
          {formatRev(revision.rev)}
        </Anchor>
        <Text>Cabinet {c.number}</Text>
      </Breadcrumbs>

      <Group justify="space-between" align="flex-start">
        <Group gap="sm">
          <Title order={2}>
            Cabinet {c.number} · {c.type.name}
          </Title>
          <StatusBadge status={revision.status} />
        </Group>
        {editable && (
          <Group gap="xs">
            <Button variant="default" onClick={editModal.open}>
              Edit
            </Button>
            <Button color="red" variant="light" onClick={deleteModal.open}>
              Delete
            </Button>
          </Group>
        )}
      </Group>

      {revision.status === "RELEASED" && (
        <Alert color="teal">
          {formatRev(revision.rev)} is released, so this cabinet is read-only.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Card withBorder>
          <Text fw={600} mb="xs">
            Cabinet
          </Text>
          <SimpleGrid cols={2} spacing="xs">
            <Field label="H × W × D">{formatDims(c.height, c.width, c.depth)}</Field>
            <Field label="Material">{title(c.material)}</Field>
            <Field label="Main voltage">{c.mainVoltage}</Field>
            <Field label="Other voltages">{c.otherVoltages.join(", ") || "–"}</Field>
            <Field label="Door hinge">{title(c.hingeSide)}</Field>
            <Field label="Mounted with up">{title(c.upFace)}</Field>
          </SimpleGrid>
        </Card>

        <Card withBorder>
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Platen</Text>
            <Switch
              checked={c.hasPlaten}
              disabled={!editable || update.isPending}
              onChange={(e) =>
                update.mutate({ hasPlaten: e.currentTarget.checked }, { onError: showError })
              }
              aria-label="Has platen"
            />
          </Group>
          {c.hasPlaten && c.platen ? (
            <Stack gap="xs">
              <Field label="H × W">{formatDims(c.platen.height, c.platen.width)}</Field>
              {editable && (
                <Group>
                  <Button size="xs" variant="light" onClick={platenModal.open}>
                    Change size
                  </Button>
                </Group>
              )}
              <Text size="xs" c="dimmed">
                The layout editor comes with the component catalog.
              </Text>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              No platen. {c.platen && "Its size and layout are kept if you switch it back on."}
            </Text>
          )}
        </Card>

        <Card withBorder>
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Window</Text>
            <Switch
              checked={hasWindow}
              disabled={!editable || setWindow.isPending}
              onChange={(e) => setWindow.mutate(e.currentTarget.checked, { onError: showError })}
              aria-label="Has window"
            />
          </Group>
          <Text size="sm" c="dimmed">
            {hasWindow
              ? "Switching off removes every window on this cabinet."
              : "Switching on adds a window centred on the door, half its width and height."}
          </Text>
        </Card>
      </SimpleGrid>

      <Group justify="space-between" mt="md">
        <Group gap="sm">
          <Title order={3}>Openings</Title>
          {warningCount > 0 && (
            <Badge color="red" variant="light">
              {warningCount} with warnings
            </Badge>
          )}
        </Group>
        {editable && <Button onClick={() => setOpeningTarget({ face })}>Add opening</Button>}
      </Group>

      <SegmentedControl
        value={face}
        onChange={(v) => {
          setFace(v);
          setSelectedId(null);
        }}
        data={Face.options.map((f) => {
          const n = c.openings.filter((o) => o.face === f).length;
          return { value: f, label: `${title(f)}${n ? ` (${n})` : ""}` };
        })}
        fullWidth
      />

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Text size="sm" c="dimmed" mb="xs">
            {FACE_LABELS[face]}, seen from outside
            {face === "TOP" || face === "BOTTOM" ? " (front edge at the bottom)" : ""}
            {face === "FRONT" && c.hingeSide !== "NONE" ? ". Orange edge = hinge side" : ""}
          </Text>
          <FaceView
            cabinet={c}
            face={face}
            openings={onFace}
            warnings={warnings}
            selectedId={selectedId}
            onSelect={select}
          />
        </Card>

        <div>
          {onFace.length === 0 ? (
            <Text c="dimmed" size="sm">
              No openings on this face.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={440}>
              <Table verticalSpacing="xs" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Kind</Table.Th>
                    <Table.Th>X, Y (mm)</Table.Th>
                    <Table.Th>Size</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {onFace.map((o) => {
                    const w = warnings.get(o.id);
                    return (
                      <Table.Tr
                        key={o.id}
                        bg={o.id === selectedId ? "var(--mantine-color-blue-light)" : undefined}
                        onClick={() => setSelectedId(o.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <Table.Td>
                          <Text size="sm">{KIND_LABELS[o.kind]}</Text>
                          {o.label && (
                            <Text size="xs" c="dimmed">
                              {o.label}
                            </Text>
                          )}
                          {w?.outside && (
                            <Badge size="xs" color="red" variant="light">
                              Outside face
                            </Badge>
                          )}
                          {w && w.overlaps.length > 0 && (
                            <Badge size="xs" color="red" variant="light">
                              Overlaps
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {toMm(o.x)}, {toMm(o.y)}
                        </Table.Td>
                        <Table.Td>
                          {openingSize(o)}
                          {o.component && (
                            <Text size="xs" c="dimmed">
                              {o.component.manufacturer} {o.component.partNumber}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {editable && (
                            <Group gap={4} justify="flex-end" wrap="nowrap">
                              <Button
                                size="compact-xs"
                                variant="light"
                                onClick={() => setOpeningTarget(o)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                color="red"
                                loading={
                                  removeOpening.isPending && removeOpening.variables === o.id
                                }
                                onClick={() => removeOpening.mutate(o.id, { onError: showError })}
                              >
                                Delete
                              </Button>
                            </Group>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </div>
      </SimpleGrid>

      <CabinetFormModal opened={editOpen} onClose={editModal.close} revision={ref} cabinet={c} />
      <PlatenModal opened={platenOpen} onClose={platenModal.close} revision={ref} cabinet={c} />
      <OpeningFormModal
        revision={ref}
        cabinet={c}
        target={openingTarget}
        onClose={() => setOpeningTarget(null)}
      />
      <ConfirmDeleteModal
        opened={deleteOpen}
        onClose={deleteModal.close}
        onConfirm={confirmDelete}
        title={`Delete cabinet ${c.number}`}
        loading={remove.isPending}
        error={remove.error}
      >
        <Text>
          This deletes the cabinet with its platen and {c.openings.length} opening(s) from{" "}
          {formatRev(revision.rev)}.
        </Text>
      </ConfirmDeleteModal>
    </Stack>
  );
}

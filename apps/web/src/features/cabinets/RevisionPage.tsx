import { can, formatRev, RevisionParams } from "@cabinet-planner/shared";
import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { errorMessage } from "../../lib/api";
import { formatDateTime, formatDims } from "../../lib/format";
import { useCurrentUser } from "../auth/api";
import { useCreateRevision } from "../projects/api";
import { StatusBadge } from "../projects/RevisionBadge";
import { cabinetRoute, revisionPath, revisionQuery } from "./api";
import { CabinetFormModal } from "./CabinetFormModal";

const yesNo = (v: boolean) => (
  <Badge variant="light" color={v ? "blue" : "gray"}>
    {v ? "Yes" : "No"}
  </Badge>
);

export function RevisionPage() {
  const ref = RevisionParams.parse(useParams());
  const user = useCurrentUser();
  const navigate = useNavigate();
  const detail = useQuery(revisionQuery(ref));
  const createRevision = useCreateRevision(ref.projectId, ref.machineId);
  const [addOpen, addModal] = useDisclosure(false);

  if (detail.isPending) return <Loader />;
  if (detail.isError) return <Alert color="red">{errorMessage(detail.error)}</Alert>;

  const { project, machine, revision, cabinets, workingRev } = detail.data;
  const released = revision.status === "RELEASED";
  const canEdit = can(user, "projects");

  const newRevision = () =>
    createRevision.mutate(undefined, {
      onSuccess: (r) => {
        notifications.show({ color: "green", message: `${formatRev(r.rev)} created` });
        void navigate(revisionPath({ ...ref, rev: r.rev }));
      },
      onError: (err) => notifications.show({ color: "red", message: errorMessage(err) }),
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
        <Text>{formatRev(revision.rev)}</Text>
      </Breadcrumbs>

      <Group justify="space-between" align="flex-start">
        <Group gap="sm">
          <Title order={2}>
            {machine.name} · {formatRev(revision.rev)}
          </Title>
          <StatusBadge status={revision.status} />
        </Group>
        {canEdit && !released && <Button onClick={addModal.open}>Add cabinet</Button>}
      </Group>

      {released && (
        <Alert color="teal" title="Released: read-only">
          <Stack gap="xs">
            <Text size="sm">
              Released {revision.releasedAt && formatDateTime(revision.releasedAt)} by{" "}
              {revision.releasedBy?.displayName}.
            </Text>
            {revision.notes && (
              <Text size="sm" style={{ whiteSpace: "pre-line" }}>
                {revision.notes}
              </Text>
            )}
            {workingRev !== null ? (
              <Anchor component={Link} to={revisionPath({ ...ref, rev: workingRev })} size="sm">
                Go to {formatRev(workingRev)} (working)
              </Anchor>
            ) : (
              canEdit && (
                <Group>
                  <Button size="xs" loading={createRevision.isPending} onClick={newRevision}>
                    Create new revision
                  </Button>
                </Group>
              )
            )}
          </Stack>
        </Alert>
      )}

      <Title order={3}>Cabinets</Title>
      {cabinets.length === 0 ? (
        <Text c="dimmed">No cabinets in this revision yet.</Text>
      ) : (
        <Table.ScrollContainer minWidth={760}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>No.</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Material</Table.Th>
                <Table.Th>H × W × D</Table.Th>
                <Table.Th>Voltages</Table.Th>
                <Table.Th>Window</Table.Th>
                <Table.Th>Platen</Table.Th>
                <Table.Th>Openings</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cabinets.map((c) => (
                <Table.Tr
                  key={c.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => void navigate(cabinetRoute(ref, c.id))}
                >
                  <Table.Td fw={600}>{c.number}</Table.Td>
                  <Table.Td>{c.type}</Table.Td>
                  <Table.Td>{c.material === "METAL" ? "Metal" : "Plastic"}</Table.Td>
                  <Table.Td>{formatDims(c.height, c.width, c.depth)}</Table.Td>
                  <Table.Td>{[c.mainVoltage, ...c.otherVoltages].join(", ")}</Table.Td>
                  <Table.Td>{yesNo(c.hasWindow)}</Table.Td>
                  <Table.Td>{yesNo(c.hasPlaten)}</Table.Td>
                  <Table.Td>{c.openingCount}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <CabinetFormModal opened={addOpen} onClose={addModal.close} revision={ref} />
    </Stack>
  );
}

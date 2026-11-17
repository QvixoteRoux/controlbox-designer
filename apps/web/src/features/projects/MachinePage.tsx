import { can, formatRev, MachineParams } from "@cabinet-planner/shared";
import {
  Alert,
  Anchor,
  Breadcrumbs,
  Button,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";
import { errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useCurrentUser } from "../auth/api";
import { machineQuery, useCreateRevision, useDeleteMachine } from "./api";
import { MachineFormModal } from "./MachineFormModal";
import { ReleaseModal } from "./ReleaseModal";
import { StatusBadge } from "./RevisionBadge";

export function MachinePage() {
  const { projectId, machineId } = MachineParams.parse(useParams());
  const user = useCurrentUser();
  const navigate = useNavigate();
  const machine = useQuery(machineQuery(projectId, machineId));
  const createRevision = useCreateRevision(projectId, machineId);
  const remove = useDeleteMachine(projectId, machineId);
  const [editOpen, editModal] = useDisclosure(false);
  const [deleteOpen, deleteModal] = useDisclosure(false);
  const [releasing, setReleasing] = useState<number | null>(null);

  if (machine.isPending) return <Loader />;
  if (machine.isError) return <Alert color="red">{errorMessage(machine.error)}</Alert>;

  const m = machine.data;
  const canEdit = can(user, "projects");
  const working = m.revisions.find((r) => r.status === "WORKING");
  const hasReleased = m.revisions.some((r) => r.status === "RELEASED");
  const canDelete = canEdit && (!hasReleased || can(user, "admin"));

  const newRevision = () =>
    createRevision.mutate(undefined, {
      onSuccess: (r) =>
        notifications.show({
          color: "green",
          message: `${formatRev(r.rev)} created from ${formatRev(r.rev - 1)}`,
        }),
      onError: (err) => notifications.show({ color: "red", message: errorMessage(err) }),
    });

  const confirmDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        notifications.show({ color: "green", message: `Machine ${m.name} deleted` });
        void navigate(`/projects/${projectId}`);
      },
    });

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/">
          Projects
        </Anchor>
        <Anchor component={Link} to={`/projects/${projectId}`}>
          {m.project.name}
        </Anchor>
        <Text>{m.name}</Text>
      </Breadcrumbs>

      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{m.name}</Title>
          <Text c="dimmed">
            {m.project.customer} · quantity {m.quantity}
          </Text>
        </div>
        {canEdit && (
          <Group gap="xs">
            <Button variant="default" onClick={editModal.open}>
              Edit
            </Button>
            <Tooltip
              label="Has released revisions: only an admin can delete it"
              disabled={canDelete}
            >
              <Button color="red" variant="light" disabled={!canDelete} onClick={deleteModal.open}>
                Delete
              </Button>
            </Tooltip>
          </Group>
        )}
      </Group>

      <Group justify="space-between" mt="md">
        <Title order={3}>Revisions</Title>
        {canEdit &&
          (working ? (
            <Button color="teal" onClick={() => setReleasing(working.rev)}>
              Release {formatRev(working.rev)}
            </Button>
          ) : (
            <Button loading={createRevision.isPending} onClick={newRevision}>
              Create new revision
            </Button>
          ))}
      </Group>

      <Table.ScrollContainer minWidth={720}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Revision</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Released</Table.Th>
              <Table.Th>Change note</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {m.revisions.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td ff="monospace">{formatRev(r.rev)}</Table.Td>
                <Table.Td>
                  <StatusBadge status={r.status} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDateTime(r.createdAt)}</Text>
                  <Text size="xs" c="dimmed">
                    {r.createdBy.displayName}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {r.releasedAt && r.releasedBy ? (
                    <>
                      <Text size="sm">{formatDateTime(r.releasedAt)}</Text>
                      <Text size="xs" c="dimmed">
                        {r.releasedBy.displayName}
                      </Text>
                    </>
                  ) : (
                    <Text size="sm" c="dimmed">
                      –
                    </Text>
                  )}
                </Table.Td>
                <Table.Td style={{ whiteSpace: "pre-line" }}>
                  <Text size="sm">{r.notes ?? ""}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Text size="sm" c="dimmed">
        Cabinets and the platen layout for each revision arrive with the cabinets feature.
      </Text>

      <MachineFormModal
        opened={editOpen}
        onClose={editModal.close}
        projectId={projectId}
        machine={m}
      />
      <ReleaseModal
        projectId={projectId}
        machineId={machineId}
        rev={releasing}
        onClose={() => setReleasing(null)}
      />
      <ConfirmDeleteModal
        opened={deleteOpen}
        onClose={deleteModal.close}
        onConfirm={confirmDelete}
        title={`Delete machine ${m.name}`}
        loading={remove.isPending}
        error={remove.error}
        confirmText={hasReleased ? m.name : undefined}
      >
        <Text>
          This deletes the machine and all {m.revisions.length} of its revisions. It can't be
          undone.
        </Text>
        {hasReleased && (
          <Alert color="red">This machine has released revisions. Their history is lost too.</Alert>
        )}
      </ConfirmDeleteModal>
    </Stack>
  );
}

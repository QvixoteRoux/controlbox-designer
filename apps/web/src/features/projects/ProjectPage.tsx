import { can, ProjectParams } from "@cabinet-planner/shared";
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
import { Link, useNavigate, useParams } from "react-router";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";
import { errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useCurrentUser } from "../auth/api";
import { projectQuery, useDeleteProject } from "./api";
import { MachineFormModal } from "./MachineFormModal";
import { ProjectFormModal } from "./ProjectFormModal";
import { RevisionBadge } from "./RevisionBadge";

export function ProjectPage() {
  const { projectId } = ProjectParams.parse(useParams());
  const user = useCurrentUser();
  const navigate = useNavigate();
  const project = useQuery(projectQuery(projectId));
  const remove = useDeleteProject(projectId);
  const [editOpen, editModal] = useDisclosure(false);
  const [addOpen, addModal] = useDisclosure(false);
  const [deleteOpen, deleteModal] = useDisclosure(false);

  if (project.isPending) return <Loader />;
  if (project.isError) return <Alert color="red">{errorMessage(project.error)}</Alert>;

  const p = project.data;
  const canEdit = can(user, "projects");
  const isAdmin = can(user, "admin");
  const canDelete = canEdit && (!p.hasReleased || isAdmin);

  const confirmDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        notifications.show({ color: "green", message: `Project ${p.name} deleted` });
        void navigate("/");
      },
    });

  return (
    <Stack>
      <Breadcrumbs>
        <Anchor component={Link} to="/">
          Projects
        </Anchor>
        <Text>{p.name}</Text>
      </Breadcrumbs>

      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{p.name}</Title>
          <Text c="dimmed">
            Customer: {p.customer} · created {formatDate(p.createdAt)} by {p.createdBy.displayName}
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
        <Title order={3}>Machines</Title>
        {canEdit && <Button onClick={addModal.open}>Add machine</Button>}
      </Group>

      {p.machines.length === 0 ? (
        <Text c="dimmed">No machines yet.</Text>
      ) : (
        <Table.ScrollContainer minWidth={480}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Machine</Table.Th>
                <Table.Th>Quantity</Table.Th>
                <Table.Th>Latest revision</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {p.machines.map((m) => (
                <Table.Tr
                  key={m.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => void navigate(`/projects/${p.id}/machines/${m.id}`)}
                >
                  <Table.Td fw={500}>{m.name}</Table.Td>
                  <Table.Td>{m.quantity}</Table.Td>
                  <Table.Td>
                    <RevisionBadge {...m.latestRevision} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <ProjectFormModal opened={editOpen} onClose={editModal.close} project={p} />
      <MachineFormModal opened={addOpen} onClose={addModal.close} projectId={p.id} />
      <ConfirmDeleteModal
        opened={deleteOpen}
        onClose={deleteModal.close}
        onConfirm={confirmDelete}
        title={`Delete project ${p.name}`}
        loading={remove.isPending}
        error={remove.error}
        confirmText={p.hasReleased ? p.name : undefined}
      >
        <Text>
          This deletes the project, its {p.machines.length} machine(s) and every revision of them.
          It can't be undone.
        </Text>
        {p.hasReleased && (
          <Alert color="red">This project has released revisions. Their history is lost too.</Alert>
        )}
      </ConfirmDeleteModal>
    </Stack>
  );
}

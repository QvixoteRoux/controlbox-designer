import type { User } from "@cabinet-planner/shared";
import { Alert, Badge, Button, Group, Loader, Table, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../../lib/api";
import { useCurrentUser } from "../auth/api";
import { isLastActiveAdmin, usersQuery } from "./api";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { UserFormModal } from "./UserFormModal";

const ROLE_COLORS = { ADMIN: "red", DESIGNER: "blue", VIEWER: "gray" } as const;

function Permissions({ user }: { user: User }) {
  if (user.role === "ADMIN") return <Badge variant="light">All</Badge>;
  if (user.role === "VIEWER")
    return (
      <Badge variant="outline" color="gray">
        View only
      </Badge>
    );
  return (
    <Group gap={4}>
      {user.canProjects && <Badge variant="light">Projects</Badge>}
      {user.canComponents && <Badge variant="light">Components</Badge>}
    </Group>
  );
}

export function UsersPage() {
  const me = useCurrentUser();
  const users = useQuery(usersQuery);
  // undefined = closed, null = "add user", User = edit that user.
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const [resetting, setResetting] = useState<User | null>(null);

  if (users.isPending) return <Loader />;
  if (users.isError) return <Alert color="red">{errorMessage(users.error)}</Alert>;

  const rows = users.data.map((user) => (
    <Table.Tr key={user.id} c={user.active ? undefined : "dimmed"}>
      <Table.Td>
        {user.username}
        {user.id === me.id && (
          <Badge ml="xs" size="xs" variant="outline">
            you
          </Badge>
        )}
      </Table.Td>
      <Table.Td>{user.displayName}</Table.Td>
      <Table.Td>
        <Badge color={ROLE_COLORS[user.role]}>{user.role}</Badge>
      </Table.Td>
      <Table.Td>
        <Permissions user={user} />
      </Table.Td>
      <Table.Td>
        {user.active ? (
          <Badge color="green" variant="dot">
            Active
          </Badge>
        ) : (
          <Badge color="gray" variant="dot">
            Inactive
          </Badge>
        )}
      </Table.Td>
      <Table.Td>
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <Button size="xs" variant="light" onClick={() => setEditing(user)}>
            Edit
          </Button>
          <Button size="xs" variant="subtle" onClick={() => setResetting(user)}>
            Reset password
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Users</Title>
        <Button onClick={() => setEditing(null)}>Add user</Button>
      </Group>

      <Table.ScrollContainer minWidth={640}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Username</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Permissions</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <UserFormModal
        opened={editing !== undefined}
        onClose={() => setEditing(undefined)}
        user={editing ?? undefined}
        lastActiveAdmin={editing ? isLastActiveAdmin(editing, users.data) : false}
      />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
    </>
  );
}

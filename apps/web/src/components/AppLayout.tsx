import { can } from "@cabinet-planner/shared";
import { AppShell, Badge, Button, Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { NavLink, Outlet } from "react-router";
import { ChangePasswordModal } from "../features/auth/ChangePasswordModal";
import { useCurrentUser, useLogout } from "../features/auth/api";
import { HealthIndicator } from "../features/health/HealthIndicator";

function NavButton({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} end>
      {({ isActive }) => (
        <Button component="span" size="compact-sm" variant={isActive ? "light" : "subtle"}>
          {label}
        </Button>
      )}
    </NavLink>
  );
}

/** Header (navigation + user menu), page content, and a status footer. */
export function AppLayout() {
  const user = useCurrentUser();
  const logout = useLogout();
  const [passwordOpen, passwordModal] = useDisclosure(false);

  return (
    <AppShell header={{ height: 56 }} footer={{ height: 32 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="lg" wrap="nowrap">
            <Text fw={700}>Cabinet Planner</Text>
            <Group gap={4} wrap="nowrap">
              <NavButton to="/" label="Projects" />
              {can(user, "admin") && <NavButton to="/users" label="Users" />}
            </Group>
          </Group>

          <Menu position="bottom-end" width={200}>
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm">{user.displayName}</Text>
                  <Badge size="xs" variant="light">
                    {user.role}
                  </Badge>
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{user.username}</Menu.Label>
              <Menu.Item onClick={passwordModal.open}>Change password</Menu.Item>
              <Menu.Item color="red" onClick={() => logout.mutate()}>
                Log out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <AppShell.Footer>
        <Group h="100%" px="md" justify="flex-end">
          <HealthIndicator />
        </Group>
      </AppShell.Footer>

      <ChangePasswordModal opened={passwordOpen} onClose={passwordModal.close} />
    </AppShell>
  );
}

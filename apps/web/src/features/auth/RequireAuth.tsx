import { can, type Permission } from "@cabinet-planner/shared";
import { Alert, Center, Loader } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { errorMessage } from "../../lib/api";
import { meQuery, useCurrentUser } from "./api";

/** Route guard: renders the child routes for a logged-in user, otherwise goes to /login. */
export function RequireAuth() {
  const me = useQuery(meQuery);
  const location = useLocation();

  if (me.isPending) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (me.isError) {
    return (
      <Center h="100vh">
        <Alert color="red" title="Can't reach the server">
          {errorMessage(me.error)}
        </Alert>
      </Center>
    );
  }
  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/**
 * Hides a page from users without `permission`. Only for usability: the API is the real check
 * (guidelines/permissions.md).
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const user = useCurrentUser();
  if (!can(user, permission)) {
    return (
      <Alert color="yellow" title="No access">
        You don't have permission to see this page.
      </Alert>
    );
  }
  return children;
}

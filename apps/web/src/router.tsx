import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { NotFoundPage } from "./components/SimplePages";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth, RequirePermission } from "./features/auth/RequireAuth";
import { MachinePage } from "./features/projects/MachinePage";
import { ProjectPage } from "./features/projects/ProjectPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import { UsersPage } from "./features/users/UsersPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <ProjectsPage /> },
          { path: "projects/:projectId", element: <ProjectPage /> },
          { path: "projects/:projectId/machines/:machineId", element: <MachinePage /> },
          {
            path: "users",
            element: (
              <RequirePermission permission="admin">
                <UsersPage />
              </RequirePermission>
            ),
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

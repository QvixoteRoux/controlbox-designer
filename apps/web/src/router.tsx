import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { NotFoundPage } from "./components/SimplePages";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth, RequirePermission } from "./features/auth/RequireAuth";
import { CabinetPage } from "./features/cabinets/CabinetPage";
import { RevisionPage } from "./features/cabinets/RevisionPage";
import { GlandsPage } from "./features/glands/GlandsPage";
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
            path: "projects/:projectId/machines/:machineId/revisions/:rev",
            element: <RevisionPage />,
          },
          {
            path: "projects/:projectId/machines/:machineId/revisions/:rev/cabinets/:cabinetId",
            element: <CabinetPage />,
          },
          { path: "cable-glands", element: <GlandsPage /> },
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

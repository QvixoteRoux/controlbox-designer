import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { HomePage, NotFoundPage } from "./components/SimplePages";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth, RequirePermission } from "./features/auth/RequireAuth";
import { UsersPage } from "./features/users/UsersPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
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

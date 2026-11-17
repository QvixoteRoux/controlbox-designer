import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { meQuery } from "./features/auth/api";
import { ApiError } from "./lib/api";
import { router } from "./router";

// A 401 from any request means the session ended (expired, logged out elsewhere, deactivated):
// clearing "me" makes <RequireAuth> send the user to /login.
const onError = (err: unknown) => {
  if (err instanceof ApiError && err.status === 401) {
    queryClient.setQueryData(meQuery.queryKey, null);
  }
};
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
});

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing from index.html");

createRoot(root).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto">
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);

import { Container, Stack, Title } from "@mantine/core";
import { HealthStatus } from "./features/health/HealthStatus";

export function App() {
  return (
    <Container size="sm" py="xl">
      <Stack>
        <Title order={1}>Cabinet Planner</Title>
        <HealthStatus />
      </Stack>
    </Container>
  );
}

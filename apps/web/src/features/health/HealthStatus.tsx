import { HealthResponse } from "@cabinet-planner/shared";
import { Alert, Badge, Button, Card, Group, Loader, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";

export function HealthStatus() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet("/api/health", HealthResponse, [503]),
    retry: false,
  });

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>System status</Text>
        <Button
          size="xs"
          variant="light"
          loading={health.isFetching}
          onClick={() => void health.refetch()}
        >
          Refresh
        </Button>
      </Group>

      {health.isPending && <Loader size="sm" />}

      {health.isError && (
        <Alert color="red" title="API unreachable">
          {health.error.message}. Is the API running on port 3000?
        </Alert>
      )}

      {health.isSuccess && (
        <Group gap="xs">
          <Text>API</Text>
          <Badge color="green">up</Badge>
          <Text ml="md">Database</Text>
          <Badge color={health.data.db === "up" ? "green" : "red"}>{health.data.db}</Badge>
        </Group>
      )}
    </Card>
  );
}

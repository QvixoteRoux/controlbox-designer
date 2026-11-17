import { HealthResponse } from "@cabinet-planner/shared";
import { Badge, Group, Text, Tooltip } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";

/** Small API + database status shown in the footer. Rechecks every minute. */
export function HealthIndicator() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get("/api/health", HealthResponse, [503]),
    refetchInterval: 60_000,
    retry: false,
  });

  const api_ = health.isError ? "down" : health.isSuccess ? "up" : "…";
  const db = health.data?.db ?? (health.isError ? "unknown" : "…");
  const color = (state: string) => (state === "up" ? "green" : state === "…" ? "gray" : "red");

  return (
    <Tooltip label={health.isError ? errorMessage(health.error) : "Rechecked every minute"}>
      <Group gap={6}>
        <Text size="xs" c="dimmed">
          API
        </Text>
        <Badge size="xs" color={color(api_)}>
          {api_}
        </Badge>
        <Text size="xs" c="dimmed" ml={4}>
          Database
        </Text>
        <Badge size="xs" color={color(db)}>
          {db}
        </Badge>
      </Group>
    </Tooltip>
  );
}

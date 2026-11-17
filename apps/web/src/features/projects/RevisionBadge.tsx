import { formatRev, type RevisionStatus } from "@cabinet-planner/shared";
import { Badge, Group, Text } from "@mantine/core";

export function StatusBadge({ status }: { status: RevisionStatus }) {
  return status === "RELEASED" ? (
    <Badge color="teal" variant="light">
      Released
    </Badge>
  ) : (
    <Badge color="orange" variant="light">
      Working
    </Badge>
  );
}

/** "Rev 003" plus its status. */
export function RevisionBadge({ rev, status }: { rev: number; status: RevisionStatus }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Text ff="monospace" size="sm">
        {formatRev(rev)}
      </Text>
      <StatusBadge status={status} />
    </Group>
  );
}

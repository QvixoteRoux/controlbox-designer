import {
  can,
  ComponentKind,
  stockLength,
  terminalLevels,
  type ComponentListItem,
} from "@cabinet-planner/shared";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Select,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Thumbnail } from "../../components/ImageField";
import { errorMessage } from "../../lib/api";
import { formatDims, formatMm } from "../../lib/format";
import { useCurrentUser } from "../auth/api";
import { componentsQuery, typesQuery, useDeleteComponent } from "./api";
import { ComponentFormModal } from "./ComponentFormModal";
import { COMPONENT_KIND_LABELS } from "./labels";

/** Size column: what matters for each kind. */
function sizeText(c: ComponentListItem) {
  switch (c.kind) {
    case "RAIL":
      return `${formatMm(c.width)} wide, ${formatMm(c.depth)} profile`;
    case "GUTTER":
      return `${formatMm(c.width)} wide${c.depth > 0 ? `, ${formatMm(c.depth)} high` : ""}`;
    default:
      return formatDims(c.width, c.height, c.depth);
  }
}

/** Kind-specific details next to the kind. */
function kindDetail(c: ComponentListItem) {
  switch (c.kind) {
    case "TERMINAL_BLOCK":
    case "GROUND_TERMINAL": {
      const levels = terminalLevels(c);
      return `${levels} level${levels === 1 ? "" : "s"}`;
    }
    case "RAIL":
    case "GUTTER":
      return `stock ${formatMm(stockLength(c) ?? 0)}`;
    case "FUSE": {
      const a = c.attributes as { amperage?: number; poles?: number };
      return `${a.amperage ?? "?"} A, ${a.poles ?? "?"}P`;
    }
    default:
      return null;
  }
}

/** The component catalog: search, filter, add / edit / deactivate. Editing needs Components. */
export function ComponentsPage() {
  const user = useCurrentUser();
  const canEdit = can(user, "components");
  const components = useQuery(componentsQuery);
  const types = useQuery(typesQuery("component-types"));
  const remove = useDeleteComponent();
  // undefined = closed, null = new component.
  const [editing, setEditing] = useState<ComponentListItem | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  if (components.isPending) return <Loader />;
  if (components.isError) return <Alert color="red">{errorMessage(components.error)}</Alert>;

  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = components.data.filter((c) => {
    if (!showInactive && !c.active) return false;
    if (kind !== null && c.kind !== kind) return false;
    if (typeId !== null && String(c.typeId) !== typeId) return false;
    const text = [c.manufacturer, c.partNumber, c.code, c.description, c.type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return words.every((w) => text.includes(w));
  });

  const deleteComponent = (c: ComponentListItem) =>
    remove.mutate(c.id, {
      onSuccess: () => notifications.show({ color: "green", message: `${c.partNumber} deleted` }),
      onError: (err) => notifications.show({ color: "red", message: errorMessage(err) }),
    });

  return (
    <>
      <Group justify="space-between" mb="xs">
        <Title order={2}>Components</Title>
        {canEdit && <Button onClick={() => setEditing(null)}>Add component</Button>}
      </Group>
      <Text c="dimmed" size="sm" mb="md">
        Parts used in a cabinet can't be deleted; deactivate them to hide them from new layouts.
      </Text>

      <Group mb="md" align="flex-end">
        <TextInput
          placeholder="Search manufacturer, part number, code…"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={320}
        />
        <Select
          placeholder="All kinds"
          data={ComponentKind.options.map((k) => ({ value: k, label: COMPONENT_KIND_LABELS[k] }))}
          value={kind}
          onChange={setKind}
          clearable
          w={200}
        />
        <Select
          placeholder="All types"
          data={(types.data ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
          value={typeId}
          onChange={setTypeId}
          clearable
          searchable
          w={200}
        />
        <Switch
          label="Show inactive"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.currentTarget.checked)}
          mb={8}
        />
      </Group>

      {shown.length === 0 ? (
        <Text c="dimmed">
          {components.data.length === 0 ? "No components yet." : "Nothing matches the filters."}
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={800}>
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={56} />
                <Table.Th>Part</Table.Th>
                <Table.Th>Kind</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Size (W × H × D)</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((c) => (
                <Table.Tr key={c.id} c={c.active ? undefined : "dimmed"}>
                  <Table.Td>
                    <Thumbnail imagePath={c.imagePath} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {c.manufacturer} {c.partNumber}
                    </Text>
                    {(c.code || c.description) && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {[c.code, c.description].filter(Boolean).join(" · ")}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{COMPONENT_KIND_LABELS[c.kind]}</Text>
                    {kindDetail(c) && (
                      <Text size="xs" c="dimmed">
                        {kindDetail(c)}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{c.type ?? "–"}</Table.Td>
                  <Table.Td>{sizeText(c)}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Badge variant="dot" color={c.active ? "green" : "gray"}>
                        {c.active ? "Active" : "Inactive"}
                      </Badge>
                      {c.inUse && (
                        <Badge variant="light" color="blue">
                          In use
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {canEdit && (
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        <Button size="xs" variant="light" onClick={() => setEditing(c)}>
                          Edit
                        </Button>
                        <Tooltip label="In use: deactivate it instead" disabled={!c.inUse}>
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            disabled={c.inUse}
                            onClick={() => deleteComponent(c)}
                          >
                            Delete
                          </Button>
                        </Tooltip>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <ComponentFormModal component={editing} onClose={() => setEditing(undefined)} />
    </>
  );
}

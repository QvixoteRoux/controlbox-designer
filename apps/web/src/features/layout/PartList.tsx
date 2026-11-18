import { ComponentKind, type ComponentListItem } from "@cabinet-planner/shared";
import { ActionIcon, Box, Group, ScrollArea, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { useState } from "react";
import { formatDims, formatMm } from "../../lib/format";
import { COMPONENT_KIND_LABELS } from "../catalog/labels";
import { PART_DRAG_TYPE } from "./LayoutCanvas";

interface Props {
  components: ComponentListItem[];
  editable: boolean;
  /** "+" button: add the part in the middle of the platen. */
  onAdd: (component: ComponentListItem) => void;
}

const sizeOf = (c: ComponentListItem) =>
  c.kind === "RAIL" || c.kind === "GUTTER"
    ? `${formatMm(c.width)} wide`
    : formatDims(c.width, c.height);

/** The catalog, grouped by kind. Drag a part onto the platen (or use "+"). Active parts only. */
export function PartList({ components, editable, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = components.filter(
    (c) =>
      c.active &&
      words.every((w) =>
        [c.manufacturer, c.partNumber, c.code, c.description, c.type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(w),
      ),
  );

  return (
    <Stack gap="xs" h="100%">
      <TextInput
        size="xs"
        placeholder="Search parts…"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      <ScrollArea style={{ flex: 1 }} type="auto" offsetScrollbars>
        {shown.length === 0 && (
          <Text size="xs" c="dimmed">
            {components.length === 0
              ? "The catalog is empty: add parts under Components."
              : "No match."}
          </Text>
        )}
        {ComponentKind.options.map((kind) => {
          const ofKind = shown.filter((c) => c.kind === kind);
          if (ofKind.length === 0) return null;
          return (
            <Box key={kind} mb="sm">
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>
                {COMPONENT_KIND_LABELS[kind]}
              </Text>
              {ofKind.map((c) => (
                <Group
                  key={c.id}
                  gap={4}
                  wrap="nowrap"
                  px={6}
                  py={4}
                  draggable={editable}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(PART_DRAG_TYPE, String(c.id));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  style={{
                    borderRadius: 4,
                    cursor: editable ? "grab" : "default",
                    border: "1px solid var(--mantine-color-default-border)",
                    marginBottom: 4,
                  }}
                >
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="xs" fw={500} truncate>
                      {c.manufacturer} {c.partNumber}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {[c.description, sizeOf(c)].filter(Boolean).join(" · ")}
                    </Text>
                  </Box>
                  {editable && (
                    <Tooltip label="Add to the middle of the platen">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={`Add ${c.partNumber}`}
                        onClick={() => onAdd(c)}
                      >
                        +
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              ))}
            </Box>
          );
        })}
      </ScrollArea>
    </Stack>
  );
}

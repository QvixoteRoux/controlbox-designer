import { ComponentKind, type ComponentListItem } from "@cabinet-planner/shared";
import {
  ActionIcon,
  Badge,
  Box,
  Collapse,
  ColorSwatch,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { formatDims, formatMm } from "../../lib/format";
import { typesQuery } from "../catalog/api";
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

const NO_TYPE = "No type";
/** Which groups are open, remembered in this browser (a per-viewer convenience). */
const OPEN_KEY = "cabinet-planner.partList.open";

function loadOpen(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(saved) ? saved.filter((k) => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

function saveOpen(open: Set<string>) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
  } catch {
    // Storage blocked: the groups just won't be remembered.
  }
}

/**
 * The catalog in collapsible groups: kind, then type (in the types' order, "No type" last).
 * A search opens every group with a match. Drag a part onto the platen (or use "+").
 * Active parts only.
 */
export function PartList({ components, editable, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(loadOpen);
  const types = useQuery(typesQuery("component-types")).data ?? [];

  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
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

  const isOpen = (key: string) => searching || open.has(key);
  const toggle = (key: string) => {
    const next = new Set(open);
    if (!next.delete(key)) next.add(key);
    setOpen(next);
    saveOpen(next);
  };

  // Type names in the types' order, then any not in the list (inactive…), then "No type".
  const typeOrder = (name: string | null) => {
    if (name === null) return Infinity;
    const i = types.findIndex((t) => t.name === name);
    return i === -1 ? types.length : i;
  };
  const fillOf = (name: string) => types.find((t) => t.name === name)?.fillColor ?? null;

  const partRow = (c: ComponentListItem) => (
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
          const kindKey = `kind:${kind}`;
          const typeNames = [...new Set(ofKind.map((c) => c.type))].sort(
            (a, b) => typeOrder(a) - typeOrder(b) || (a ?? "").localeCompare(b ?? ""),
          );
          return (
            <Box key={kind} mb={4}>
              <GroupHeader
                open={isOpen(kindKey)}
                count={ofKind.length}
                onToggle={() => toggle(kindKey)}
                strong
              >
                {COMPONENT_KIND_LABELS[kind]}
              </GroupHeader>
              <Collapse expanded={isOpen(kindKey)}>
                <Box pl={8}>
                  {typeNames.map((type) => {
                    const ofType = ofKind.filter((c) => c.type === type);
                    const typeKey = `type:${kind}:${type ?? ""}`;
                    const fill = type === null ? null : fillOf(type);
                    return (
                      <Box key={typeKey}>
                        <GroupHeader
                          open={isOpen(typeKey)}
                          count={ofType.length}
                          onToggle={() => toggle(typeKey)}
                        >
                          <Group gap={6} wrap="nowrap">
                            {fill && <ColorSwatch color={fill} size={10} />}
                            {type ?? NO_TYPE}
                          </Group>
                        </GroupHeader>
                        <Collapse expanded={isOpen(typeKey)}>
                          <Box pl={8} pt={2}>
                            {ofType.map(partRow)}
                          </Box>
                        </Collapse>
                      </Box>
                    );
                  })}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </ScrollArea>
    </Stack>
  );
}

/** A clickable group title with an open / closed arrow and the number of parts in it. */
function GroupHeader({
  open,
  count,
  onToggle,
  strong = false,
  children,
}: {
  open: boolean;
  count: number;
  onToggle: () => void;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <UnstyledButton onClick={onToggle} w="100%" py={3} aria-expanded={open}>
      <Group gap={6} wrap="nowrap">
        <Text size="xs" c="dimmed" w={10}>
          {open ? "▾" : "▸"}
        </Text>
        <Text
          size="xs"
          fw={strong ? 700 : 500}
          c={strong ? "dimmed" : undefined}
          tt={strong ? "uppercase" : undefined}
          style={{ flex: 1, minWidth: 0 }}
          truncate
          component="div"
        >
          {children}
        </Text>
        <Badge size="xs" variant="light" color="gray">
          {count}
        </Badge>
      </Group>
    </UnstyledButton>
  );
}

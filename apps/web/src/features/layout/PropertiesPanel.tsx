import {
  isProfile,
  rotateInPlace,
  ROTATIONS,
  stockLength,
  terminalLevels,
  toMm,
  toUnits,
  type LayoutWarnings,
  type Placement,
  type Rotation,
  type UpdatePlacementInput,
} from "@cabinet-planner/shared";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  List,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { formatDims, formatMm } from "../../lib/format";
import { COMPONENT_KIND_LABELS } from "../catalog/labels";

interface Props {
  placement: Placement;
  warnings: LayoutWarnings | undefined;
  /** Tags or part numbers of other placements, for the overlap list. */
  nameOf: (id: number) => string;
  editable: boolean;
  topZ: number;
  onChange: (patch: UpdatePlacementInput) => void;
  onDelete: () => void;
}

/** Selected placement: position, rotation, length, tag, lock, and its catalog data. */
export function PropertiesPanel({
  placement: p,
  warnings,
  nameOf,
  editable,
  topZ,
  onChange,
  onDelete,
}: Props) {
  const canEdit = editable && !p.locked;
  const profile = isProfile(p.part.kind);
  const stock = stockLength(p.part);
  const levels = terminalLevels(p.part);

  return (
    <Stack gap="sm">
      <div>
        <Text fw={600}>
          {p.part.manufacturer} {p.part.partNumber}
        </Text>
        <Text size="xs" c="dimmed">
          {COMPONENT_KIND_LABELS[p.part.kind]}
          {levels > 0 && ` · ${levels} level${levels === 1 ? "" : "s"}`}
          {p.part.code && ` · ${p.part.code}`}
        </Text>
        {p.part.description && <Text size="xs">{p.part.description}</Text>}
        {!p.part.active && (
          <Badge size="xs" color="gray" mt={4}>
            Inactive in the catalog
          </Badge>
        )}
      </div>

      {warnings && (warnings.outside || warnings.overlaps.length > 0 || warnings.tooLong) && (
        <Alert color="red" p="xs">
          <List size="xs">
            {warnings.outside && <List.Item>Sticks out past the platen</List.Item>}
            {warnings.overlaps.length > 0 && (
              <List.Item>Overlaps {warnings.overlaps.map(nameOf).join(", ")}</List.Item>
            )}
            {warnings.tooLong && stock !== null && (
              <List.Item>Longer than the {formatMm(stock)} stock length</List.Item>
            )}
          </List>
        </Alert>
      )}

      <TextField
        label="Tag"
        placeholder="-K1"
        value={p.tag ?? ""}
        disabled={!canEdit}
        onCommit={(tag) => onChange({ tag })}
      />

      <SimpleGrid cols={2} spacing="xs">
        <MmField label="X" value={p.x} disabled={!canEdit} onCommit={(x) => onChange({ x })} />
        <MmField label="Y" value={p.y} disabled={!canEdit} onCommit={(y) => onChange({ y })} />
      </SimpleGrid>
      <Text size="xs" c="dimmed" mt={-6}>
        Top-left corner, from the platen&apos;s top-left. Y down.
      </Text>

      {profile && p.length !== null && (
        <MmField
          label="Length"
          value={p.length}
          min={1}
          disabled={!canEdit}
          onCommit={(length) => length > 0 && onChange({ length })}
        />
      )}

      <div>
        <Text size="sm" fw={500} mb={4}>
          Rotation
        </Text>
        <SegmentedControl
          size="xs"
          fullWidth
          disabled={!canEdit}
          data={ROTATIONS.map((r) => ({
            value: String(r),
            label: profile ? (r === 0 ? "0° ↔ horizontal" : "90° ↕ vertical") : `${r}°`,
          }))}
          value={String(p.rotation)}
          onChange={(value) => {
            const rotation = Number(value) as Rotation;
            onChange({ rotation, ...rotateInPlace(p, rotation) });
          }}
        />
      </div>

      <Switch
        label="Locked"
        description="Can't be moved or edited until unlocked"
        checked={p.locked}
        disabled={!editable}
        onChange={(e) => onChange({ locked: e.currentTarget.checked })}
      />

      {editable && (
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            disabled={!canEdit || p.zIndex === topZ}
            onClick={() => onChange({ zIndex: topZ + 1 })}
          >
            Bring to front
          </Button>
          <Button size="xs" color="red" variant="light" disabled={!canEdit} onClick={onDelete}>
            Delete
          </Button>
        </Group>
      )}

      <Divider />
      <Text size="xs" c="dimmed">
        {profile
          ? `Profile ${formatMm(p.part.width)} wide${p.part.depth > 0 ? `, ${formatMm(p.part.depth)} high` : ""}${stock !== null ? `, stock ${formatMm(stock)}` : ""}`
          : `W × H × D ${formatDims(p.part.width, p.part.height, p.part.depth)}`}
        {p.part.railMount &&
          p.part.railEdgeOffset !== null &&
          ` · rail offset ${formatMm(p.part.railEdgeOffset)}`}
      </Text>
    </Stack>
  );
}

/** A mm input that saves on blur or Enter (not on every keystroke). */
function MmField({
  label,
  value,
  disabled,
  min,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  min?: number;
  onCommit: (units: number) => void;
}) {
  const [draft, setDraft] = useState<number | string>(toMm(value));
  // Follow outside changes (dragging, undo) unless the user is typing.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(toMm(value));
  }
  const commit = () => {
    if (typeof draft !== "number") return setDraft(toMm(value));
    const units = toUnits(draft);
    if (units !== value) onCommit(units);
  };
  return (
    <NumberInput
      label={label}
      size="xs"
      decimalScale={1}
      suffix=" mm"
      min={min}
      value={draft}
      disabled={disabled}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

function TextField({
  label,
  placeholder,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  placeholder?: string;
  value: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => draft.trim() !== value && onCommit(draft.trim());
  return (
    <TextInput
      label={label}
      size="xs"
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

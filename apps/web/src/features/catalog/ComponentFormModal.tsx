import {
  ComponentInput,
  ComponentKind,
  DEFAULT_STOCK_LENGTH,
  MAX_TERMINAL_LEVELS,
  RAIL_PROFILE_HEIGHTS,
  RAIL_WIDTH,
  stockLength,
  terminalLevels,
  toMm,
  type ComponentListItem,
} from "@cabinet-planner/shared";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ImageField } from "../../components/ImageField";
import { errorMessage } from "../../lib/api";
import {
  convertingResolver,
  convertLength,
  lengthInputProps,
  lengthToUnits,
  mmInputProps,
  mmToUnits,
  type LengthUnit,
} from "../../lib/forms";
import { typesQuery, useComponentImage, useSaveComponent } from "./api";
import { COMPONENT_KIND_LABELS } from "./labels";

type Num = number | string;

interface Values {
  kind: ComponentKind;
  typeId: string | null;
  manufacturer: string;
  partNumber: string;
  code: string;
  description: string;
  active: boolean;
  inputVoltage: string;
  phases: string; // "", "1" or "3"
  /** Unit of height / width / depth / rail offset. Inches only for standard parts and fuses. */
  unit: LengthUnit;
  height: Num;
  width: Num;
  depth: Num;
  railMount: boolean;
  railEdgeOffset: Num;
  stackable: boolean;
  attributes: { amperage: Num; poles: Num; levels: string; stockLength: Num };
  /** DIN rail profile height in 0.1 mm, as a string for the Select. */
  railProfile: string;
}

const LENGTH_FIELDS = ["height", "width", "depth", "railEdgeOffset"] as const;
const allowsInches = (kind: ComponentKind) => kind === "STANDARD" || kind === "FUSE";
const isTerminal = (kind: ComponentKind) => kind === "TERMINAL_BLOCK" || kind === "GROUND_TERMINAL";

/** Form values → the API body for the chosen kind (sizes to 0.1 mm; inches to whole mm). */
function toApi(v: Values) {
  const unit = allowsInches(v.kind) ? v.unit : "mm";
  const len = (n: Num) => lengthToUnits(n, unit);
  const optionalText = (s: string) => (s.trim() === "" ? null : s);
  const identity = {
    kind: v.kind,
    typeId: v.typeId === null ? null : Number(v.typeId),
    manufacturer: v.manufacturer,
    partNumber: v.partNumber,
    code: optionalText(v.code),
    description: optionalText(v.description),
    active: v.active,
  };
  const box = { height: len(v.height), width: len(v.width), depth: len(v.depth) };
  const stock = {
    stockLength:
      v.attributes.stockLength === "" ? DEFAULT_STOCK_LENGTH : mmToUnits(v.attributes.stockLength),
  };
  switch (v.kind) {
    case "STANDARD":
    case "FUSE":
      return {
        ...identity,
        ...box,
        inputVoltage: optionalText(v.inputVoltage),
        phases: v.phases === "" ? null : Number(v.phases),
        railMount: v.railMount,
        railEdgeOffset: v.railMount && v.railEdgeOffset !== "" ? len(v.railEdgeOffset) : null,
        stackable: v.stackable,
        attributes:
          v.kind === "FUSE"
            ? {
                amperage: typeof v.attributes.amperage === "number" ? v.attributes.amperage : NaN,
                poles: typeof v.attributes.poles === "number" ? v.attributes.poles : NaN,
              }
            : {},
      };
    case "TERMINAL_BLOCK":
    case "GROUND_TERMINAL":
      return {
        ...identity,
        ...box,
        railEdgeOffset: len(v.railEdgeOffset),
        stackable: v.stackable,
        attributes: v.kind === "TERMINAL_BLOCK" ? { levels: Number(v.attributes.levels) } : {},
      };
    case "GUTTER":
      return {
        ...identity,
        width: len(v.width),
        depth: v.depth === "" ? 0 : len(v.depth),
        attributes: stock,
      };
    case "RAIL":
      return { ...identity, depth: Number(v.railProfile), attributes: stock };
  }
}

const resolver = convertingResolver(ComponentInput, toApi);

function initialValues(c: ComponentListItem | null): Values {
  const mm = (u: number | null | undefined) => (u == null ? "" : toMm(u));
  const attrs = (c?.attributes ?? {}) as Partial<Record<"amperage" | "poles", number>>;
  const stock = c ? stockLength(c) : null;
  return {
    kind: c?.kind ?? "STANDARD",
    typeId: c?.typeId == null ? null : String(c.typeId),
    manufacturer: c?.manufacturer ?? "",
    partNumber: c?.partNumber ?? "",
    code: c?.code ?? "",
    description: c?.description ?? "",
    active: c?.active ?? true,
    inputVoltage: c?.inputVoltage ?? "",
    phases: c?.phases == null ? "" : String(c.phases),
    unit: "mm",
    height: c && c.height > 0 ? mm(c.height) : "",
    width: c && c.kind !== "RAIL" ? mm(c.width) : "",
    depth: c && c.depth > 0 ? mm(c.depth) : "",
    railMount: c?.railMount ?? false,
    railEdgeOffset: mm(c?.railEdgeOffset),
    stackable: c?.stackable ?? false,
    attributes: {
      amperage: attrs.amperage ?? "",
      poles: attrs.poles ?? "",
      levels: String(c ? Math.max(terminalLevels(c), 1) : 1),
      stockLength: toMm(stock ?? DEFAULT_STOCK_LENGTH),
    },
    railProfile: String(c?.kind === "RAIL" ? c.depth : RAIL_PROFILE_HEIGHTS[0]),
  };
}

type ImageChange = { file: File } | "remove" | null;

interface Props {
  /** undefined = closed, null = new component. */
  component: ComponentListItem | null | undefined;
  onClose: () => void;
}

export function ComponentFormModal({ component, onClose }: Props) {
  return (
    <Modal
      opened={component !== undefined}
      onClose={onClose}
      size="lg"
      title={component ? `Edit ${component.manufacturer} ${component.partNumber}` : "Add component"}
    >
      {component !== undefined && <ComponentForm component={component} onDone={onClose} />}
    </Modal>
  );
}

function ComponentForm({
  component,
  onDone,
}: {
  component: ComponentListItem | null;
  onDone: () => void;
}) {
  const save = useSaveComponent();
  const image = useComponentImage();
  const types = useQuery(typesQuery("component-types"));
  const [imageChange, setImageChange] = useState<ImageChange>(null);
  const form = useForm<Values>({ initialValues: initialValues(component), validate: resolver });
  const v = form.getValues();
  const { kind } = v;
  const unit = allowsInches(kind) ? v.unit : "mm";
  const len = lengthInputProps(unit);
  // Placements and holes depend on the kind, so it's fixed once the part is used.
  const kindLocked = component?.inUse ?? false;

  const typeOptions = (types.data ?? [])
    .filter((t) => t.active || String(t.id) === v.typeId)
    .map((t) => ({ value: String(t.id), label: t.active ? t.name : `${t.name} – inactive` }));
  const profileOptions = [...new Set<number>([...RAIL_PROFILE_HEIGHTS, Number(v.railProfile)])].map(
    (u) => ({ value: String(u), label: `${toMm(u)} mm` }),
  );

  const switchUnit = (to: LengthUnit) => {
    for (const field of LENGTH_FIELDS) {
      form.setFieldValue(field, convertLength(form.getValues()[field], v.unit, to));
    }
    form.setFieldValue("unit", to);
  };

  const submit = form.onSubmit((values) => {
    const input = ComponentInput.parse(toApi(values));
    save.mutate(
      { id: component?.id, input },
      {
        onSuccess: (saved) => {
          const done = () => {
            notifications.show({ color: "green", message: `${saved.partNumber} saved` });
            onDone();
          };
          if (imageChange === null) return done();
          image.mutate(
            { id: saved.id, file: imageChange === "remove" ? null : imageChange.file },
            {
              onSuccess: done,
              onError: (err) =>
                notifications.show({
                  color: "red",
                  message: `Saved, but the picture failed: ${errorMessage(err)}`,
                }),
            },
          );
        },
      },
    );
  });

  const currentImage = imageChange === "remove" ? null : (component?.imagePath ?? null);

  return (
    <form onSubmit={submit}>
      <Stack>
        {save.isError && <Alert color="red">{errorMessage(save.error)}</Alert>}

        <SimpleGrid cols={2}>
          <Select
            label="Kind"
            data={ComponentKind.options.map((k) => ({ value: k, label: COMPONENT_KIND_LABELS[k] }))}
            allowDeselect={false}
            disabled={kindLocked}
            description={kindLocked ? "In use: the kind can't change" : undefined}
            {...form.getInputProps("kind")}
          />
          <Select
            label="Type"
            placeholder="None"
            data={typeOptions}
            clearable
            searchable
            nothingFoundMessage="No types yet: add them under Types"
            {...form.getInputProps("typeId")}
          />
          <TextInput label="Manufacturer" data-autofocus {...form.getInputProps("manufacturer")} />
          <TextInput label="Part number" {...form.getInputProps("partNumber")} />
          <TextInput
            label="Code"
            placeholder="Optional internal ID"
            {...form.getInputProps("code")}
          />
        </SimpleGrid>
        <Textarea label="Description" autosize minRows={1} {...form.getInputProps("description")} />

        {/* ── Sizes, per kind ── */}
        {kind === "RAIL" && (
          <>
            <Text size="sm" c="dimmed">
              DIN rail is always {toMm(RAIL_WIDTH)} mm wide; the length is cut to fit when it's
              placed. Mounting holes are ignored.
            </Text>
            <SimpleGrid cols={2}>
              <Select
                label="Profile height"
                description="Only for 3D views"
                data={profileOptions}
                allowDeselect={false}
                {...form.getInputProps("railProfile")}
              />
              <NumberInput
                label="Stock length"
                description="Placed rails longer than this get a warning"
                {...mmInputProps}
                {...form.getInputProps("attributes.stockLength")}
              />
            </SimpleGrid>
          </>
        )}

        {kind === "GUTTER" && (
          <>
            <Text size="sm" c="dimmed">
              The width is what matters on the platen; the length is cut to fit when it's placed.
            </Text>
            <SimpleGrid cols={3}>
              <NumberInput label="Width" {...mmInputProps} {...form.getInputProps("width")} />
              <NumberInput
                label="Height"
                description="Optional, for 3D"
                {...mmInputProps}
                {...form.getInputProps("depth")}
              />
              <NumberInput
                label="Stock length"
                {...mmInputProps}
                {...form.getInputProps("attributes.stockLength")}
              />
            </SimpleGrid>
          </>
        )}

        {kind !== "RAIL" && kind !== "GUTTER" && (
          <>
            <Group justify="space-between" align="flex-end">
              <Text size="sm" fw={500}>
                Size as mounted
              </Text>
              {allowsInches(kind) && (
                <SegmentedControl
                  size="xs"
                  data={[
                    { value: "mm", label: "mm" },
                    { value: "in", label: "inches" },
                  ]}
                  value={v.unit}
                  onChange={switchUnit}
                />
              )}
            </Group>
            {unit === "in" && (
              <Text size="xs" c="dimmed">
                Inches are rounded to the nearest whole millimetre when saved.
              </Text>
            )}
            <SimpleGrid cols={3}>
              <NumberInput
                label="Width"
                description={isTerminal(kind) ? "Along the rail" : undefined}
                {...len}
                {...form.getInputProps("width")}
              />
              <NumberInput label="Height" {...len} {...form.getInputProps("height")} />
              <NumberInput label="Depth" {...len} {...form.getInputProps("depth")} />
            </SimpleGrid>
          </>
        )}

        {kind === "TERMINAL_BLOCK" && (
          <Select
            label="Levels"
            data={Array.from({ length: MAX_TERMINAL_LEVELS }, (_, i) => String(i + 1))}
            allowDeselect={false}
            {...form.getInputProps("attributes.levels")}
          />
        )}
        {kind === "GROUND_TERMINAL" && (
          <Text size="sm" c="dimmed">
            Ground terminals are always 1 level, drawn green/yellow.
          </Text>
        )}

        {kind === "FUSE" && (
          <SimpleGrid cols={2}>
            <NumberInput
              label="Amperage"
              suffix=" A"
              decimalScale={2}
              allowNegative={false}
              {...form.getInputProps("attributes.amperage")}
            />
            <NumberInput
              label="Poles"
              allowDecimal={false}
              allowNegative={false}
              {...form.getInputProps("attributes.poles")}
            />
          </SimpleGrid>
        )}

        {(kind === "STANDARD" || kind === "FUSE") && (
          <SimpleGrid cols={2}>
            <TextInput
              label="Input voltage"
              placeholder="e.g. 24VDC, 230VAC"
              {...form.getInputProps("inputVoltage")}
            />
            <Select
              label="Phases"
              placeholder="DC / not applicable"
              data={[
                { value: "1", label: "1 phase" },
                { value: "3", label: "3 phases" },
              ]}
              clearable
              value={v.phases === "" ? null : v.phases}
              onChange={(p) => form.setFieldValue("phases", p ?? "")}
              error={form.errors.phases}
            />
          </SimpleGrid>
        )}

        {/* ── Rail mounting ── */}
        {(kind === "STANDARD" || kind === "FUSE") && (
          <Switch
            label="Mounts on DIN rail"
            {...form.getInputProps("railMount", { type: "checkbox" })}
          />
        )}
        {(isTerminal(kind) || ((kind === "STANDARD" || kind === "FUSE") && v.railMount)) && (
          <SimpleGrid cols={2}>
            <NumberInput
              label="Rail edge offset"
              description="From the part's top edge to the rail's top edge"
              {...len}
              {...form.getInputProps("railEdgeOffset")}
            />
            <Switch
              mt="lg"
              label="Stackable"
              description="Butts up against its neighbours on the rail"
              {...form.getInputProps("stackable", { type: "checkbox" })}
            />
          </SimpleGrid>
        )}

        <ImageField
          imagePath={currentImage}
          pending={imageChange !== null && imageChange !== "remove" ? imageChange.file : null}
          onPick={(file) => setImageChange({ file })}
          onRemove={() => setImageChange(component?.imagePath ? "remove" : null)}
        />

        {component && (
          <Switch
            label="Active"
            description="Inactive parts are hidden when adding to a layout; existing uses stay"
            {...form.getInputProps("active", { type: "checkbox" })}
          />
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending || image.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

import {
  canMountInHole,
  Face,
  faceSize,
  GlandArrayInput,
  gridWarnings,
  OpeningInput,
  OpeningKind,
  toMm,
  type Opening,
} from "@cabinet-planner/shared";
import {
  Alert,
  Button,
  Group,
  List,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { errorMessage } from "../../lib/api";
import { formatMm } from "../../lib/format";
import { convertingResolver, mmInputProps, mmToUnits, unitsToMm } from "../../lib/forms";
import { componentsQuery } from "../catalog/api";
import { partLabel } from "../catalog/labels";
import { glandsQuery } from "../glands/api";
import { useCreateGlandArray, useSaveOpening, type RevisionRef } from "./api";
import { FACE_LABELS, KIND_LABELS } from "./labels";

interface Values {
  kind: OpeningKind;
  face: Face;
  x: number | string;
  y: number | string;
  width: number | string;
  height: number | string;
  diameter: number | string;
  glandId: string | null;
  /** Round holes: catalog component mounted in the hole. */
  componentId: string | null;
  label: string;
  /** Cable glands only, when adding: create a grid instead of one hole. */
  array: boolean;
  columns: number | string;
  rows: number | string;
  pitchX: number | string;
  pitchY: number | string;
}

const label = (v: Values) => (v.label.trim() === "" ? null : v.label);
const glandId = (v: Values) => (v.glandId === null ? undefined : Number(v.glandId));
const count = (n: number | string) => (typeof n === "number" ? n : NaN);

/** Form values (mm) → the API's OpeningInput for the chosen kind (0.1 mm units). */
function toOpening(v: Values) {
  const base = { face: v.face, x: mmToUnits(v.x), y: mmToUnits(v.y), label: label(v) };
  switch (v.kind) {
    case "WINDOW":
    case "RECT_HOLE":
      return { kind: v.kind, ...base, width: mmToUnits(v.width), height: mmToUnits(v.height) };
    case "ROUND_HOLE":
      return {
        kind: v.kind,
        ...base,
        diameter: mmToUnits(v.diameter),
        componentId: v.componentId === null ? null : Number(v.componentId),
      };
    case "CABLE_GLAND":
      return { kind: v.kind, ...base, glandId: glandId(v) };
  }
}

/** Form values (mm) → the API's GlandArrayInput. An empty pitch counts as 0. */
const toGlandArray = (v: Values) => ({
  face: v.face,
  x: mmToUnits(v.x),
  y: mmToUnits(v.y),
  glandId: glandId(v),
  columns: count(v.columns),
  rows: count(v.rows),
  pitchX: v.pitchX === "" ? 0 : mmToUnits(v.pitchX),
  pitchY: v.pitchY === "" ? 0 : mmToUnits(v.pitchY),
  label: label(v),
});

const openingResolver = convertingResolver(OpeningInput, toOpening);
const arrayResolver = convertingResolver(GlandArrayInput, toGlandArray);

interface Props {
  revision: RevisionRef;
  cabinet: { id: number; width: number; height: number; depth: number };
  /** null = closed; { face } = new opening on that face; an Opening = edit it. */
  target: Opening | { face: Face } | null;
  onClose: () => void;
}

export function OpeningFormModal({ revision, cabinet, target, onClose }: Props) {
  const editing = target !== null && "id" in target ? target : undefined;
  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={editing ? `Edit ${KIND_LABELS[editing.kind].toLowerCase()}` : "Add opening"}
    >
      {target !== null && (
        <OpeningForm
          revision={revision}
          cabinet={cabinet}
          opening={editing}
          face={target.face}
          onDone={onClose}
        />
      )}
    </Modal>
  );
}

function OpeningForm({
  revision,
  cabinet,
  opening,
  face,
  onDone,
}: {
  revision: RevisionRef;
  cabinet: Props["cabinet"];
  opening?: Opening;
  face: Face;
  onDone: () => void;
}) {
  const save = useSaveOpening(revision, cabinet.id);
  const createArray = useCreateGlandArray(revision, cabinet.id);
  const glands = useQuery(glandsQuery);
  const components = useQuery(componentsQuery);
  const mm = (u: number | null | undefined) => (u == null ? "" : unitsToMm(u));
  // Arrays are only for adding cable glands; an existing opening is edited on its own.
  const isArray = (v: Values) => !opening && v.kind === "CABLE_GLAND" && v.array;

  const form = useForm<Values>({
    initialValues: {
      kind: opening?.kind ?? "ROUND_HOLE",
      face: opening?.face ?? face,
      x: mm(opening?.x ?? 0),
      y: mm(opening?.y ?? 0),
      width: mm(opening?.width),
      height: mm(opening?.height),
      diameter: mm(opening?.diameter),
      glandId: opening?.glandId == null ? null : String(opening.glandId),
      componentId: opening?.componentId == null ? null : String(opening.componentId),
      label: opening?.label ?? "",
      array: false,
      columns: 2,
      rows: 1,
      pitchX: "",
      pitchY: "",
    },
    validate: (values) => (isArray(values) ? arrayResolver(values) : openingResolver(values)),
  });
  const values = form.getValues();
  const { kind } = values;
  const arrayMode = isArray(values);

  // Active glands, plus the current one even if it was deactivated since.
  const glandOptions = (glands.data ?? [])
    .filter((g) => g.active || g.id === opening?.glandId)
    .map((g) => ({
      value: String(g.id),
      label: `${g.size} (hole ${formatMm(g.holeDiameter)})${g.active ? "" : " – inactive"}`,
    }));
  const selectedGland = glands.data?.find((g) => String(g.id) === values.glandId);

  // Parts that fit in a hole: active ones, plus the current one even if deactivated since.
  const componentOptions = (components.data ?? [])
    .filter((c) => canMountInHole(c.kind) && (c.active || c.id === opening?.componentId))
    .map((c) => ({
      value: String(c.id),
      label: `${partLabel(c)}${c.description ? ` – ${c.description}` : ""}${c.active ? "" : " (inactive)"}`,
    }));

  // Live warnings for the array, once enough is filled in to place the holes.
  const parsedArray = arrayMode ? GlandArrayInput.safeParse(toGlandArray(values)) : null;
  const arrayWarnings =
    parsedArray?.success && selectedGland
      ? gridWarnings(parsedArray.data, selectedGland.holeDiameter, faceSize(cabinet, values.face))
      : null;
  const holeCount = count(values.columns) * count(values.rows);

  const submit = form.onSubmit((v) => {
    if (isArray(v)) {
      createArray.mutate(GlandArrayInput.parse(toGlandArray(v)), {
        onSuccess: (created) => {
          notifications.show({ color: "green", message: `${created.length} cable glands added` });
          onDone();
        },
      });
      return;
    }
    save.mutate(
      { id: opening?.id, input: OpeningInput.parse(toOpening(v)) },
      { onSuccess: onDone },
    );
  });
  const error = arrayMode ? createArray.error : save.error;
  const pending = save.isPending || createArray.isPending;

  return (
    <form onSubmit={submit}>
      <Stack>
        {error != null && <Alert color="red">{errorMessage(error)}</Alert>}
        <SimpleGrid cols={2}>
          <Select
            label="Kind"
            data={OpeningKind.options.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
            allowDeselect={false}
            {...form.getInputProps("kind")}
          />
          <Select
            label="Face"
            data={Face.options.map((f) => ({ value: f, label: FACE_LABELS[f] }))}
            allowDeselect={false}
            {...form.getInputProps("face")}
          />
        </SimpleGrid>

        {kind === "CABLE_GLAND" && (
          <Select
            label="Cable gland"
            description="The hole size comes from the gland list"
            data={glandOptions}
            nothingFoundMessage="No cable glands yet: add them under Cable glands"
            searchable
            {...form.getInputProps("glandId")}
          />
        )}
        {kind === "CABLE_GLAND" && !opening && (
          <Switch
            label="Array of glands"
            description="Several glands in rows and columns, saved as separate openings"
            {...form.getInputProps("array", { type: "checkbox" })}
          />
        )}

        <Text size="sm" c="dimmed">
          {arrayMode
            ? "Centre of the first (top-left) hole; the array grows to the right and down"
            : kind === "WINDOW" || kind === "RECT_HOLE"
              ? "Position of the top-left corner"
              : "Position of the centre"}
          , measured from the top-left corner of the face, seen from outside: X to the right, Y
          down.
        </Text>
        <SimpleGrid cols={2}>
          <NumberInput
            label="X"
            {...mmInputProps}
            allowNegative
            data-autofocus
            {...form.getInputProps("x")}
          />
          <NumberInput label="Y" {...mmInputProps} allowNegative {...form.getInputProps("y")} />
        </SimpleGrid>

        {(kind === "WINDOW" || kind === "RECT_HOLE") && (
          <SimpleGrid cols={2}>
            <NumberInput label="Width" {...mmInputProps} {...form.getInputProps("width")} />
            <NumberInput label="Height" {...mmInputProps} {...form.getInputProps("height")} />
          </SimpleGrid>
        )}
        {kind === "ROUND_HOLE" && (
          <>
            <NumberInput label="Diameter" {...mmInputProps} {...form.getInputProps("diameter")} />
            <Select
              label="Mounted component"
              description="Optional: pushbutton, pilot light, selector…"
              placeholder="None"
              data={componentOptions}
              clearable
              searchable
              nothingFoundMessage="No matching parts in the catalog"
              {...form.getInputProps("componentId")}
            />
          </>
        )}

        {arrayMode && (
          <>
            <SimpleGrid cols={2}>
              <NumberInput
                label="Columns"
                min={1}
                max={50}
                allowDecimal={false}
                allowNegative={false}
                {...form.getInputProps("columns")}
              />
              <NumberInput
                label="Rows"
                min={1}
                max={50}
                allowDecimal={false}
                allowNegative={false}
                {...form.getInputProps("rows")}
              />
              <NumberInput
                label="Spacing X"
                description="Centre to centre, between columns"
                disabled={values.columns === 1}
                {...mmInputProps}
                {...form.getInputProps("pitchX")}
              />
              <NumberInput
                label="Spacing Y"
                description="Centre to centre, between rows"
                disabled={values.rows === 1}
                {...mmInputProps}
                {...form.getInputProps("pitchY")}
              />
            </SimpleGrid>
            {arrayWarnings &&
              selectedGland &&
              (arrayWarnings.overlapX || arrayWarnings.overlapY || arrayWarnings.outside) && (
                <Alert color="yellow" title="Check the spacing">
                  <List size="sm">
                    {arrayWarnings.overlapX && (
                      <List.Item>
                        Neighbouring columns overlap: spacing X is less than the{" "}
                        {toMm(selectedGland.holeDiameter)} mm hole.
                      </List.Item>
                    )}
                    {arrayWarnings.overlapY && (
                      <List.Item>
                        Neighbouring rows overlap: spacing Y is less than the{" "}
                        {toMm(selectedGland.holeDiameter)} mm hole.
                      </List.Item>
                    )}
                    {arrayWarnings.outside && (
                      <List.Item>Some holes stick out past the edge of the face.</List.Item>
                    )}
                  </List>
                  <Text size="xs" mt={4}>
                    You can still save; the holes are shown in red afterwards.
                  </Text>
                </Alert>
              )}
          </>
        )}

        <TextInput
          label="Label"
          placeholder={arrayMode ? "Optional prefix, e.g. PG → PG1, PG2…" : "Optional, e.g. S1"}
          {...form.getInputProps("label")}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {arrayMode && Number.isFinite(holeCount) ? `Add ${holeCount} glands` : "Save"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

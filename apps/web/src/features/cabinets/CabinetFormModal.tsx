import {
  CabinetMaterial,
  CreateCabinetInput,
  Face,
  HingeSide,
  type Cabinet,
  type UpdateCabinetInput,
} from "@cabinet-planner/shared";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { errorMessage } from "../../lib/api";
import { convertingResolver, mmInputProps, mmToUnits, unitsToMm } from "../../lib/forms";
import {
  cabinetRoute,
  cabinetTypesQuery,
  useCreateCabinet,
  useUpdateCabinet,
  type RevisionRef,
} from "./api";

const label = (s: string) => s[0] + s.slice(1).toLowerCase();
const options = (values: readonly string[]) => values.map((v) => ({ value: v, label: label(v) }));

interface Values {
  number: number | string;
  typeId: string | null;
  material: string;
  height: number | string;
  width: number | string;
  depth: number | string;
  mainVoltage: string;
  otherVoltages: string[];
  hingeSide: string;
  upFace: string;
  hasPlaten: boolean;
}

/** Form values (mm, strings from selects) → API shape (0.1 mm units). */
const toApi = (v: Values) => ({
  ...(v.number !== "" && { number: v.number }),
  typeId: v.typeId === null ? undefined : Number(v.typeId),
  material: v.material,
  height: mmToUnits(v.height),
  width: mmToUnits(v.width),
  depth: mmToUnits(v.depth),
  mainVoltage: v.mainVoltage,
  otherVoltages: v.otherVoltages,
  hingeSide: v.hingeSide,
  upFace: v.upFace,
  hasPlaten: v.hasPlaten,
});

interface Props {
  opened: boolean;
  onClose: () => void;
  revision: RevisionRef;
  /** The cabinet to edit; omit to add one. */
  cabinet?: Cabinet;
}

export function CabinetFormModal({ opened, onClose, revision, cabinet }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={cabinet ? `Edit cabinet ${cabinet.number}` : "Add cabinet"}
    >
      {opened && <CabinetForm revision={revision} cabinet={cabinet} onDone={onClose} />}
    </Modal>
  );
}

function CabinetForm({
  revision,
  cabinet,
  onDone,
}: {
  revision: RevisionRef;
  cabinet?: Cabinet;
  onDone: () => void;
}) {
  const types = useQuery(cabinetTypesQuery);
  const create = useCreateCabinet(revision);
  const update = useUpdateCabinet(revision, cabinet?.id ?? 0);
  const save = cabinet ? update : create;
  const navigate = useNavigate();

  const form = useForm<Values>({
    initialValues: {
      number: cabinet?.number ?? "",
      typeId: cabinet ? String(cabinet.typeId) : null,
      material: cabinet?.material ?? "METAL",
      height: cabinet ? unitsToMm(cabinet.height) : "",
      width: cabinet ? unitsToMm(cabinet.width) : "",
      depth: cabinet ? unitsToMm(cabinet.depth) : "",
      mainVoltage: cabinet?.mainVoltage ?? "",
      otherVoltages: cabinet?.otherVoltages ?? [],
      hingeSide: cabinet?.hingeSide ?? "LEFT",
      upFace: cabinet?.upFace ?? "TOP",
      hasPlaten: cabinet?.hasPlaten ?? true,
    },
    validate: convertingResolver(CreateCabinetInput, toApi),
  });

  const submit = form.onSubmit((values) => {
    const input = CreateCabinetInput.parse(toApi(values));
    if (!cabinet) {
      create.mutate(input, {
        onSuccess: (c) => {
          notifications.show({ color: "green", message: `Cabinet ${c.number} added` });
          onDone();
          void navigate(cabinetRoute(revision, c.id));
        },
      });
      return;
    }
    // Send only what changed.
    const patch = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(cabinet[key as keyof Cabinet]) &&
          key !== "extra",
      ),
    ) as UpdateCabinetInput;
    if (Object.keys(patch).length === 0) return onDone();
    update.mutate(patch, { onSuccess: onDone });
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        {save.isError && <Alert color="red">{errorMessage(save.error)}</Alert>}
        <SimpleGrid cols={{ base: 1, xs: 3 }}>
          <NumberInput
            label="Number"
            placeholder="Next free"
            min={1}
            allowDecimal={false}
            allowNegative={false}
            {...form.getInputProps("number")}
          />
          <Select
            label="Type"
            data={(types.data ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
            allowDeselect={false}
            data-autofocus
            {...form.getInputProps("typeId")}
          />
          <Select
            label="Material"
            data={options(CabinetMaterial.options)}
            allowDeselect={false}
            {...form.getInputProps("material")}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, xs: 3 }}>
          <NumberInput label="Height" {...mmInputProps} {...form.getInputProps("height")} />
          <NumberInput label="Width" {...mmInputProps} {...form.getInputProps("width")} />
          <NumberInput label="Depth" {...mmInputProps} {...form.getInputProps("depth")} />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput
            label="Main voltage"
            placeholder="400VAC"
            {...form.getInputProps("mainVoltage")}
          />
          <TagsInput
            label="Other voltages"
            placeholder="Type and press Enter"
            {...form.getInputProps("otherVoltages")}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <Select
            label="Door hinge side"
            description="As seen from the front"
            data={options(HingeSide.options)}
            allowDeselect={false}
            {...form.getInputProps("hingeSide")}
          />
          <Select
            label="Face pointing up when mounted"
            description="Top = mounted as manufactured"
            data={options(Face.options)}
            allowDeselect={false}
            {...form.getInputProps("upFace")}
          />
        </SimpleGrid>

        <Switch
          label="Has a platen (mounting plate)"
          {...form.getInputProps("hasPlaten", { type: "checkbox" })}
        />
        {!cabinet && (
          <Text size="sm" c="dimmed">
            The platen starts 50 mm smaller than the cabinet in height and width; you can change it
            afterwards.
          </Text>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {cabinet ? "Save" : "Add cabinet"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

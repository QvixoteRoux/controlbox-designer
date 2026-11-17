import { defaultPlatenSize, UpdatePlatenInput, type Platen } from "@cabinet-planner/shared";
import { Alert, Button, Group, Modal, NumberInput, SimpleGrid, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { errorMessage } from "../../lib/api";
import { formatDims } from "../../lib/format";
import { convertingResolver, mmInputProps, mmToUnits, unitsToMm } from "../../lib/forms";
import { useUpdatePlaten, type RevisionRef } from "./api";

interface Values {
  height: number | string;
  width: number | string;
}

const toApi = (v: Values) => ({ height: mmToUnits(v.height), width: mmToUnits(v.width) });

export function PlatenModal({
  opened,
  onClose,
  revision,
  cabinet,
}: {
  opened: boolean;
  onClose: () => void;
  revision: RevisionRef;
  cabinet: { id: number; height: number; width: number; platen: Platen | null };
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="Platen size">
      {opened && <PlatenForm revision={revision} cabinet={cabinet} onDone={onClose} />}
    </Modal>
  );
}

function PlatenForm({
  revision,
  cabinet,
  onDone,
}: {
  revision: RevisionRef;
  cabinet: { id: number; height: number; width: number; platen: Platen | null };
  onDone: () => void;
}) {
  const update = useUpdatePlaten(revision, cabinet.id);
  const fallback = defaultPlatenSize(cabinet);
  const form = useForm<Values>({
    initialValues: {
      height: unitsToMm(cabinet.platen?.height ?? fallback.height),
      width: unitsToMm(cabinet.platen?.width ?? fallback.width),
    },
    validate: convertingResolver(UpdatePlatenInput, toApi),
  });

  const submit = form.onSubmit((values) =>
    update.mutate(UpdatePlatenInput.parse(toApi(values)), { onSuccess: onDone }),
  );

  return (
    <form onSubmit={submit}>
      <Stack>
        {update.isError && <Alert color="red">{errorMessage(update.error)}</Alert>}
        <SimpleGrid cols={2}>
          <NumberInput
            label="Height"
            data-autofocus
            {...mmInputProps}
            {...form.getInputProps("height")}
          />
          <NumberInput label="Width" {...mmInputProps} {...form.getInputProps("width")} />
        </SimpleGrid>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Default: {formatDims(fallback.height, fallback.width)}
          </Text>
          <Button
            size="xs"
            variant="subtle"
            onClick={() =>
              form.setValues({
                height: unitsToMm(fallback.height),
                width: unitsToMm(fallback.width),
              })
            }
          >
            Use default
          </Button>
        </Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

import {
  can,
  CreateCableGlandInput,
  type CableGlandListItem,
  type UpdateCableGlandInput,
} from "@cabinet-planner/shared";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../../lib/api";
import { formatMm } from "../../lib/format";
import { convertingResolver, mmInputProps, mmToUnits, unitsToMm } from "../../lib/forms";
import { useCurrentUser } from "../auth/api";
import { glandsQuery, useCreateGland, useDeleteGland, useUpdateGland } from "./api";

/** Cable gland list: size + hole diameter. Editing needs the Components permission. */
export function GlandsPage() {
  const user = useCurrentUser();
  const glands = useQuery(glandsQuery);
  const remove = useDeleteGland();
  // undefined = closed, null = new gland.
  const [editing, setEditing] = useState<CableGlandListItem | null | undefined>(undefined);
  const canEdit = can(user, "components");

  if (glands.isPending) return <Loader />;
  if (glands.isError) return <Alert color="red">{errorMessage(glands.error)}</Alert>;

  const deleteGland = (g: CableGlandListItem) =>
    remove.mutate(g.id, {
      onSuccess: () => notifications.show({ color: "green", message: `${g.size} deleted` }),
      onError: (err) => notifications.show({ color: "red", message: errorMessage(err) }),
    });

  return (
    <>
      <Group justify="space-between" mb="xs">
        <Title order={2}>Cable glands</Title>
        {canEdit && <Button onClick={() => setEditing(null)}>Add cable gland</Button>}
      </Group>
      <Text c="dimmed" size="sm" mb="md">
        Glands used in a cabinet can't be deleted; deactivate them to hide them from new openings.
      </Text>

      {glands.data.length === 0 ? (
        <Text c="dimmed">No cable glands yet.</Text>
      ) : (
        <Table.ScrollContainer minWidth={480}>
          <Table verticalSpacing="sm" maw={720}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Size</Table.Th>
                <Table.Th>Hole diameter</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {glands.data.map((g) => (
                <Table.Tr key={g.id} c={g.active ? undefined : "dimmed"}>
                  <Table.Td fw={500}>{g.size}</Table.Td>
                  <Table.Td>{formatMm(g.holeDiameter)}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Badge variant="dot" color={g.active ? "green" : "gray"}>
                        {g.active ? "Active" : "Inactive"}
                      </Badge>
                      {g.inUse && (
                        <Badge variant="light" color="blue">
                          In use
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {canEdit && (
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        <Button size="xs" variant="light" onClick={() => setEditing(g)}>
                          Edit
                        </Button>
                        <Tooltip label="In use: deactivate it instead" disabled={!g.inUse}>
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            disabled={g.inUse}
                            onClick={() => deleteGland(g)}
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

      <Modal
        opened={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? `Edit ${editing.size}` : "Add cable gland"}
      >
        {editing !== undefined && (
          <GlandForm gland={editing} onDone={() => setEditing(undefined)} />
        )}
      </Modal>
    </>
  );
}

interface GlandFormValues {
  size: string;
  holeDiameter: number | string;
  active: boolean;
}

function GlandForm({ gland, onDone }: { gland: CableGlandListItem | null; onDone: () => void }) {
  const create = useCreateGland();
  const update = useUpdateGland();
  const save = gland ? update : create;
  const toApi = (v: GlandFormValues) => ({ size: v.size, holeDiameter: mmToUnits(v.holeDiameter) });
  const form = useForm<GlandFormValues>({
    initialValues: {
      size: gland?.size ?? "",
      holeDiameter: gland ? unitsToMm(gland.holeDiameter) : "",
      active: gland?.active ?? true,
    },
    validate: convertingResolver(CreateCableGlandInput, toApi),
  });

  const submit = form.onSubmit((values) => {
    const input = CreateCableGlandInput.parse(toApi(values));
    const done = () => {
      notifications.show({ color: "green", message: `${input.size} saved` });
      onDone();
    };
    if (!gland) return create.mutate(input, { onSuccess: done });
    const patch: UpdateCableGlandInput = {
      ...(input.size !== gland.size && { size: input.size }),
      ...(input.holeDiameter !== gland.holeDiameter && { holeDiameter: input.holeDiameter }),
      ...(values.active !== gland.active && { active: values.active }),
    };
    if (Object.keys(patch).length === 0) return onDone();
    update.mutate({ id: gland.id, patch }, { onSuccess: done });
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        {save.isError && <Alert color="red">{errorMessage(save.error)}</Alert>}
        <TextInput
          label="Size"
          placeholder="M20, PG13.5, 1/2in NPT…"
          data-autofocus
          {...form.getInputProps("size")}
        />
        <NumberInput
          label="Hole diameter"
          description="The hole to cut in the cabinet"
          {...mmInputProps}
          {...form.getInputProps("holeDiameter")}
        />
        {gland && (
          <Switch
            label="Active"
            description="Inactive glands can't be picked for new openings"
            {...form.getInputProps("active", { type: "checkbox" })}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

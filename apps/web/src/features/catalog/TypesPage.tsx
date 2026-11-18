import {
  can,
  CreateCatalogTypeInput,
  type CatalogTypeKind,
  type CatalogTypeListItem,
} from "@cabinet-planner/shared";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  ColorInput,
  ColorSwatch,
  Group,
  Loader,
  NumberInput,
  SimpleGrid,
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
import { convertingResolver } from "../../lib/forms";
import { useCurrentUser } from "../auth/api";
import { typesQuery, useDeleteType, useSaveType } from "./api";

/** Cabinet types and component types, side by side. Editing needs the Components permission. */
export function TypesPage() {
  return (
    <>
      <Title order={2} mb="xs">
        Types
      </Title>
      <Text c="dimmed" size="sm" mb="md">
        Lists used to group cabinets and components. Types in use can't be deleted; deactivate them
        to hide them from new choices.
      </Text>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
        <TypeList kind="cabinet-types" title="Cabinet types" />
        <TypeList kind="component-types" title="Component types" />
      </SimpleGrid>
    </>
  );
}

function TypeList({ kind, title }: { kind: CatalogTypeKind; title: string }) {
  const user = useCurrentUser();
  const canEdit = can(user, "components");
  const types = useQuery(typesQuery(kind));
  const save = useSaveType(kind);
  const remove = useDeleteType(kind);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Component types colour the fill of their parts in the platen editor.
  const withFill = kind === "component-types";
  const columns = withFill ? 5 : 4;

  const fail = (err: unknown) => notifications.show({ color: "red", message: errorMessage(err) });

  return (
    <Stack gap="xs">
      <Title order={4}>{title}</Title>
      {types.isPending && <Loader size="sm" />}
      {types.isError && <Alert color="red">{errorMessage(types.error)}</Alert>}
      {types.data && (
        <Table verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th w={80}>Order</Table.Th>
              {withFill && <Table.Th w={150}>Fill</Table.Th>}
              <Table.Th w={150}>Status</Table.Th>
              <Table.Th w={130} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {types.data.map((t) =>
              editingId === t.id ? (
                <Table.Tr key={t.id}>
                  <Table.Td colSpan={columns}>
                    <TypeForm kind={kind} type={t} onDone={() => setEditingId(null)} />
                  </Table.Td>
                </Table.Tr>
              ) : (
                <Table.Tr key={t.id} c={t.active ? undefined : "dimmed"}>
                  <Table.Td>{t.name}</Table.Td>
                  <Table.Td>{t.sortOrder}</Table.Td>
                  {withFill && (
                    <Table.Td>
                      <FillColor
                        value={t.fillColor}
                        disabled={!canEdit}
                        onChange={(fillColor) =>
                          save.mutate({ id: t.id, patch: { fillColor } }, { onError: fail })
                        }
                      />
                    </Table.Td>
                  )}
                  <Table.Td>
                    <Group gap={4}>
                      {canEdit ? (
                        <Switch
                          size="xs"
                          label={t.active ? "Active" : "Inactive"}
                          checked={t.active}
                          onChange={(e) =>
                            save.mutate(
                              { id: t.id, patch: { active: e.currentTarget.checked } },
                              { onError: fail },
                            )
                          }
                        />
                      ) : (
                        <Badge variant="dot" color={t.active ? "green" : "gray"}>
                          {t.active ? "Active" : "Inactive"}
                        </Badge>
                      )}
                      {t.inUse && (
                        <Badge size="xs" variant="light" color="blue">
                          In use
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {canEdit && (
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Button
                          size="compact-xs"
                          variant="light"
                          onClick={() => setEditingId(t.id)}
                        >
                          Edit
                        </Button>
                        <Tooltip label="In use: deactivate it instead" disabled={!t.inUse}>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            aria-label={`Delete ${t.name}`}
                            disabled={t.inUse}
                            onClick={() => remove.mutate(t.id, { onError: fail })}
                          >
                            ✕
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ),
            )}
          </Table.Tbody>
        </Table>
      )}
      {types.data?.length === 0 && (
        <Text size="sm" c="dimmed">
          None yet.
        </Text>
      )}
      {canEdit && editingId === null && <TypeForm kind={kind} />}
    </Stack>
  );
}

/** Swatches to start from: light, so captions stay readable on them. */
const FILL_SWATCHES = [
  "#a5d8ff",
  "#b2f2bb",
  "#ffec99",
  "#ffc9c9",
  "#d0bfff",
  "#ffd8a8",
  "#99e9f2",
  "#dee2e6",
];

/** A component type's fill colour: picked, typed or cleared (empty = the kind default). */
function FillColor({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (fillColor: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value ?? "");
  }
  if (disabled) {
    return value ? (
      <ColorSwatch color={value} size={18} />
    ) : (
      <Text size="xs" c="dimmed">
        Default
      </Text>
    );
  }
  const commit = (next: string) => {
    const color = /^#[0-9a-fA-F]{6}$/.test(next) ? next.toLowerCase() : null;
    if (next !== "" && color === null) return setDraft(value ?? "");
    if (color !== value) onChange(color);
  };
  return (
    <ColorInput
      size="xs"
      placeholder="Default"
      format="hex"
      swatches={FILL_SWATCHES}
      swatchesPerRow={8}
      value={draft}
      onChange={setDraft}
      onChangeEnd={commit}
      onBlur={() => commit(draft)}
      rightSection={
        value ? (
          <ActionIcon
            size="xs"
            variant="subtle"
            aria-label="Clear fill"
            onClick={() => onChange(null)}
          >
            ✕
          </ActionIcon>
        ) : null
      }
    />
  );
}

interface Values {
  name: string;
  sortOrder: number | string;
}

const toApi = (v: Values) => ({
  name: v.name,
  sortOrder: v.sortOrder === "" ? undefined : v.sortOrder,
});

/** Inline add (no type) or rename / reorder (with a type). */
function TypeForm({
  kind,
  type,
  onDone,
}: {
  kind: CatalogTypeKind;
  type?: CatalogTypeListItem;
  onDone?: () => void;
}) {
  const save = useSaveType(kind);
  const form = useForm<Values>({
    initialValues: { name: type?.name ?? "", sortOrder: type?.sortOrder ?? "" },
    validate: convertingResolver(CreateCatalogTypeInput, toApi),
  });

  const submit = form.onSubmit((values) => {
    const input = CreateCatalogTypeInput.parse(toApi(values));
    const done = () => {
      form.reset();
      onDone?.();
    };
    if (!type) return save.mutate({ input }, { onSuccess: done });
    save.mutate(
      { id: type.id, patch: { name: input.name, sortOrder: input.sortOrder ?? type.sortOrder } },
      { onSuccess: done },
    );
  });

  return (
    <form onSubmit={submit}>
      <Group align="flex-start" gap="xs" wrap="nowrap">
        <TextInput
          placeholder={type ? "Name" : "New type"}
          size="xs"
          style={{ flex: 1 }}
          {...form.getInputProps("name")}
          error={form.errors.name ?? (save.isError ? errorMessage(save.error) : undefined)}
        />
        <NumberInput
          placeholder="Order"
          size="xs"
          w={80}
          allowDecimal={false}
          allowNegative={false}
          {...form.getInputProps("sortOrder")}
        />
        <Button type="submit" size="xs" loading={save.isPending}>
          {type ? "Save" : "Add"}
        </Button>
        {onDone && (
          <Button size="xs" variant="default" onClick={onDone}>
            Cancel
          </Button>
        )}
      </Group>
    </form>
  );
}

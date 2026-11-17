import { CreateMachineInput, type Machine, type UpdateMachineInput } from "@cabinet-planner/shared";
import { Alert, Button, Group, Modal, NumberInput, Stack, Text, TextInput } from "@mantine/core";
import { schemaResolver, useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router";
import { errorMessage } from "../../lib/api";
import { useCreateMachine, useUpdateMachine } from "./api";

interface Props {
  opened: boolean;
  onClose: () => void;
  projectId: number;
  /** The machine to edit; omit to add one. */
  machine?: Pick<Machine, "id" | "name" | "quantity">;
}

const fields = CreateMachineInput.pick({ name: true, quantity: true });

function useMachineForm(initial: { name: string; quantity: number }) {
  return useForm({ initialValues: initial, validate: schemaResolver(fields, { sync: true }) });
}

export function MachineFormModal({ opened, onClose, projectId, machine }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={machine ? "Edit machine" : "Add machine"}>
      {opened &&
        (machine ? (
          <EditForm projectId={projectId} machine={machine} onDone={onClose} />
        ) : (
          <CreateForm projectId={projectId} onDone={onClose} />
        ))}
    </Modal>
  );
}

function CreateForm({ projectId, onDone }: { projectId: number; onDone: () => void }) {
  const create = useCreateMachine(projectId);
  const navigate = useNavigate();
  const form = useMachineForm({ name: "", quantity: 1 });

  const submit = form.onSubmit((values) => {
    create.mutate(CreateMachineInput.parse(values), {
      onSuccess: (machine) => {
        notifications.show({ color: "green", message: `Machine ${machine.name} added` });
        onDone();
        void navigate(`/projects/${projectId}/machines/${machine.id}`);
      },
    });
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        <Text size="sm" c="dimmed">
          The machine starts with Rev 001, ready to edit.
        </Text>
        {create.isError && <Alert color="red">{errorMessage(create.error)}</Alert>}
        <MachineFields form={form} />
        <Buttons onCancel={onDone} loading={create.isPending} label="Add machine" />
      </Stack>
    </form>
  );
}

function EditForm({
  projectId,
  machine,
  onDone,
}: {
  projectId: number;
  machine: NonNullable<Props["machine"]>;
  onDone: () => void;
}) {
  const update = useUpdateMachine(projectId, machine.id);
  const form = useMachineForm({ name: machine.name, quantity: machine.quantity });

  const submit = form.onSubmit((values) => {
    const parsed = fields.parse(values);
    const patch: UpdateMachineInput = {
      ...(parsed.name !== machine.name && { name: parsed.name }),
      ...(parsed.quantity !== machine.quantity && { quantity: parsed.quantity }),
    };
    if (Object.keys(patch).length === 0) return onDone();
    update.mutate(patch, { onSuccess: onDone });
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        {update.isError && <Alert color="red">{errorMessage(update.error)}</Alert>}
        <MachineFields form={form} />
        <Buttons onCancel={onDone} loading={update.isPending} label="Save" />
      </Stack>
    </form>
  );
}

function MachineFields({ form }: { form: ReturnType<typeof useMachineForm> }) {
  return (
    <>
      <TextInput label="Machine name" data-autofocus {...form.getInputProps("name")} />
      <NumberInput
        label="Quantity"
        description="How many identical copies of this machine get built"
        min={1}
        allowDecimal={false}
        allowNegative={false}
        {...form.getInputProps("quantity")}
      />
    </>
  );
}

function Buttons({
  onCancel,
  loading,
  label,
}: {
  onCancel: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <Group justify="flex-end">
      <Button variant="default" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" loading={loading}>
        {label}
      </Button>
    </Group>
  );
}

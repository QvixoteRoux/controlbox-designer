import {
  CreateUserInput,
  EditUserForm,
  Role,
  type UpdateUserInput,
  type User,
} from "@cabinet-planner/shared";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import {
  schemaResolver,
  useForm,
  type FormErrors,
  type GetInputPropsReturnType,
} from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { errorMessage } from "../../lib/api";
import { useCreateUser, useUpdateUser } from "./api";

const ROLE_OPTIONS = Role.options.map((r) => ({
  value: r,
  label: r[0] + r.slice(1).toLowerCase(),
}));

interface Props {
  opened: boolean;
  onClose: () => void;
  /** The user to edit; omit to create a new one. */
  user?: User;
  /** Editing the only active admin: role and active are locked. */
  lastActiveAdmin?: boolean;
}

export function UserFormModal({ opened, onClose, user, lastActiveAdmin = false }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={user ? `Edit ${user.username}` : "Add user"}>
      {/* Remount on open so the form starts from the user's current values. */}
      {opened &&
        (user ? (
          <EditForm user={user} lastActiveAdmin={lastActiveAdmin} onDone={onClose} />
        ) : (
          <CreateForm onDone={onClose} />
        ))}
    </Modal>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const create = useCreateUser();
  const form = useForm({
    initialValues: {
      username: "",
      displayName: "",
      password: "",
      role: "VIEWER" as Role,
      canProjects: true,
      canComponents: true,
    },
    validate: schemaResolver(CreateUserInput, { sync: true }),
  });

  const submit = form.onSubmit((values) => {
    create.mutate(CreateUserInput.parse(values), {
      onSuccess: (user) => {
        notifications.show({ color: "green", message: `User ${user.username} created` });
        onDone();
      },
    });
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        {create.isError && <Alert color="red">{errorMessage(create.error)}</Alert>}
        <TextInput
          label="Username"
          autoComplete="off"
          data-autofocus
          {...form.getInputProps("username")}
        />
        <TextInput label="Display name" {...form.getInputProps("displayName")} />
        <PasswordInput
          label="Password"
          description="At least 8 characters. The user can change it later."
          autoComplete="new-password"
          {...form.getInputProps("password")}
        />
        <RoleFields form={form} />
        <FormButtons onCancel={onDone} loading={create.isPending} label="Create user" />
      </Stack>
    </form>
  );
}

function EditForm({
  user,
  lastActiveAdmin,
  onDone,
}: {
  user: User;
  lastActiveAdmin: boolean;
  onDone: () => void;
}) {
  const update = useUpdateUser();
  const form = useForm<EditUserForm>({
    initialValues: {
      displayName: user.displayName,
      role: user.role,
      canProjects: user.canProjects,
      canComponents: user.canComponents,
      active: user.active,
    },
    validate: schemaResolver(EditUserForm, { sync: true }),
  });

  const submit = form.onSubmit((values) => {
    // Send only what changed.
    const patch = Object.fromEntries(
      Object.entries(EditUserForm.parse(values)).filter(
        ([key, value]) => user[key as keyof EditUserForm] !== value,
      ),
    ) as UpdateUserInput;
    if (Object.keys(patch).length === 0) return onDone();

    update.mutate(
      { id: user.id, patch },
      {
        onSuccess: () => {
          notifications.show({ color: "green", message: `User ${user.username} updated` });
          onDone();
        },
      },
    );
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        {update.isError && <Alert color="red">{errorMessage(update.error)}</Alert>}
        {lastActiveAdmin && (
          <Alert color="blue">
            This is the last active admin, so the role and active status can't change. Make another
            user an admin first.
          </Alert>
        )}
        <TextInput label="Display name" data-autofocus {...form.getInputProps("displayName")} />
        <RoleFields form={form} roleLocked={lastActiveAdmin} />
        <Switch
          label="Active"
          description="Inactive users can't log in and are logged out right away."
          disabled={lastActiveAdmin}
          {...form.getInputProps("active", { type: "checkbox" })}
        />
        <FormButtons onCancel={onDone} loading={update.isPending} label="Save" />
      </Stack>
    </form>
  );
}

/** The part of a create or edit form that RoleFields reads and binds. */
interface RoleFieldsForm {
  getValues: () => { role: Role; canProjects: boolean; canComponents: boolean };
  getInputProps: (
    path: "role" | "canProjects" | "canComponents",
    options?: { type?: "checkbox" },
  ) => GetInputPropsReturnType;
  errors: FormErrors;
}

/** Role select plus the two designer permissions; the last checked box can't be unticked. */
function RoleFields({ form, roleLocked = false }: { form: RoleFieldsForm; roleLocked?: boolean }) {
  const { role, canProjects, canComponents } = form.getValues();
  const designer = role === "DESIGNER";

  return (
    <>
      <Select
        label="Role"
        data={ROLE_OPTIONS}
        allowDeselect={false}
        disabled={roleLocked}
        {...form.getInputProps("role")}
      />
      {designer ? (
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            Designer permissions (at least one)
          </Text>
          <Checkbox
            label="Projects: create and edit projects, machines, cabinets and layouts"
            disabled={canProjects && !canComponents}
            {...form.getInputProps("canProjects", { type: "checkbox" })}
          />
          <Checkbox
            label="Components: add and edit catalog items"
            disabled={canComponents && !canProjects}
            {...form.getInputProps("canComponents", { type: "checkbox" })}
          />
          {form.errors.canProjects && (
            <Text size="xs" c="red">
              {form.errors.canProjects}
            </Text>
          )}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          {role === "ADMIN"
            ? "Admins can do everything, including managing users."
            : "Viewers can look at everything but change nothing."}
        </Text>
      )}
    </>
  );
}

function FormButtons({
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

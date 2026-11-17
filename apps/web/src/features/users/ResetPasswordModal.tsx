import { ResetPasswordInput, type User } from "@cabinet-planner/shared";
import { Alert, Button, Group, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import { schemaResolver, useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { errorMessage } from "../../lib/api";
import { useCurrentUser } from "../auth/api";
import { useResetPassword } from "./api";

export function ResetPasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  return (
    <Modal opened={user !== null} onClose={onClose} title={`Reset password: ${user?.username}`}>
      {user && <ResetForm user={user} onDone={onClose} />}
    </Modal>
  );
}

function ResetForm({ user, onDone }: { user: User; onDone: () => void }) {
  const me = useCurrentUser();
  const reset = useResetPassword();
  const form = useForm({
    initialValues: { password: "", confirm: "" },
    validate: (values) => {
      const errors = schemaResolver(ResetPasswordInput, { sync: true })(values);
      if (values.confirm !== values.password) errors.confirm = "Passwords don't match";
      return errors;
    },
  });

  const submit = form.onSubmit(({ password }) => {
    reset.mutate(
      { id: user.id, password },
      {
        onSuccess: () => {
          notifications.show({ color: "green", message: `Password reset for ${user.username}` });
          onDone();
        },
      },
    );
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        <Text size="sm" c="dimmed">
          {user.id === me.id
            ? "You stay logged in here; your other sessions are logged out."
            : `${user.displayName} is logged out everywhere and needs the new password to log in.`}
        </Text>
        {reset.isError && <Alert color="red">{errorMessage(reset.error)}</Alert>}
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          data-autofocus
          {...form.getInputProps("password")}
        />
        <PasswordInput
          label="Repeat new password"
          autoComplete="new-password"
          {...form.getInputProps("confirm")}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={reset.isPending}>
            Reset password
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

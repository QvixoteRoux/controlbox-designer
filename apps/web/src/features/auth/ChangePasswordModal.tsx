import { ChangePasswordInput } from "@cabinet-planner/shared";
import { Alert, Button, Group, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import { schemaResolver, useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { errorMessage } from "../../lib/api";
import { useChangePassword } from "./api";

export function ChangePasswordModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const change = useChangePassword();
  const form = useForm({
    initialValues: { currentPassword: "", newPassword: "", confirm: "" },
    validate: (values) => {
      const errors = schemaResolver(ChangePasswordInput, { sync: true })(values);
      if (values.confirm !== values.newPassword) errors.confirm = "Passwords don't match";
      return errors;
    },
  });

  const close = () => {
    form.reset();
    change.reset();
    onClose();
  };

  const submit = form.onSubmit(({ currentPassword, newPassword }) => {
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          notifications.show({ color: "green", message: "Password changed" });
          close();
        },
      },
    );
  });

  return (
    <Modal opened={opened} onClose={close} title="Change password">
      <form onSubmit={submit}>
        <Stack>
          <Text size="sm" c="dimmed">
            You stay logged in here; other browsers and devices are logged out.
          </Text>
          {change.isError && <Alert color="red">{errorMessage(change.error)}</Alert>}
          <PasswordInput
            label="Current password"
            autoComplete="current-password"
            {...form.getInputProps("currentPassword")}
          />
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            {...form.getInputProps("newPassword")}
          />
          <PasswordInput
            label="Repeat new password"
            autoComplete="new-password"
            {...form.getInputProps("confirm")}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={change.isPending}>
              Change password
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

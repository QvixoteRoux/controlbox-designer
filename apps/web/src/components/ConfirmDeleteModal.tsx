import { Alert, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { errorMessage } from "../lib/api";

interface Props {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  loading: boolean;
  error: unknown;
  /** When set, the user must type this exact text to enable the button (for big deletions). */
  confirmText?: string;
}

export function ConfirmDeleteModal({
  opened,
  onClose,
  onConfirm,
  title,
  children,
  loading,
  error,
  confirmText,
}: Props) {
  const [typed, setTyped] = useState("");
  const close = () => {
    setTyped("");
    onClose();
  };

  return (
    <Modal opened={opened} onClose={close} title={title}>
      <Stack>
        {children}
        {error != null && <Alert color="red">{errorMessage(error)}</Alert>}
        {confirmText !== undefined && (
          <TextInput
            label={
              <Text span size="sm">
                Type <b>{confirmText}</b> to confirm
              </Text>
            }
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            data-autofocus
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={loading}
            disabled={confirmText !== undefined && typed !== confirmText}
            onClick={onConfirm}
          >
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

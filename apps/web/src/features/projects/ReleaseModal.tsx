import { FIRST_REV, formatRev, ReleaseRevisionInput } from "@cabinet-planner/shared";
import { Alert, Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { schemaResolver, useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { errorMessage } from "../../lib/api";
import { useReleaseRevision } from "./api";

interface Props {
  projectId: number;
  machineId: number;
  /** The WORKING revision to release; null = closed. */
  rev: number | null;
  onClose: () => void;
}

export function ReleaseModal({ projectId, machineId, rev, onClose }: Props) {
  return (
    <Modal
      opened={rev !== null}
      onClose={onClose}
      title={rev !== null ? `Release ${formatRev(rev)}` : ""}
    >
      {rev !== null && (
        <ReleaseForm projectId={projectId} machineId={machineId} rev={rev} onDone={onClose} />
      )}
    </Modal>
  );
}

function ReleaseForm({
  projectId,
  machineId,
  rev,
  onDone,
}: {
  projectId: number;
  machineId: number;
  rev: number;
  onDone: () => void;
}) {
  const release = useReleaseRevision(projectId, machineId);
  const form = useForm({
    initialValues: { notes: "" },
    validate: schemaResolver(ReleaseRevisionInput, { sync: true }),
  });

  const submit = form.onSubmit((values) => {
    const { notes } = ReleaseRevisionInput.parse(values);
    release.mutate(
      { rev, notes },
      {
        onSuccess: () => {
          notifications.show({ color: "green", message: `${formatRev(rev)} released` });
          onDone();
        },
      },
    );
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        <Alert color="yellow">
          A released revision is read-only for everyone, admins included. Further changes need a new
          revision.
        </Alert>
        {release.isError && <Alert color="red">{errorMessage(release.error)}</Alert>}
        <Textarea
          label="What changed"
          description="Kept with the revision as its change note"
          placeholder={
            rev === FIRST_REV ? "First issue" : "e.g. Added 2nd contactor, moved PSU to rail 2"
          }
          autosize
          minRows={3}
          data-autofocus
          {...form.getInputProps("notes")}
        />
        <Text size="sm" c="dimmed">
          Catalog data (sizes, part numbers) is frozen into this revision, so later catalog edits
          don't change it.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" color="teal" loading={release.isPending}>
            Release {formatRev(rev)}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

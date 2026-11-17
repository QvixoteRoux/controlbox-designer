import { CreateProjectInput, type Project, type UpdateProjectInput } from "@cabinet-planner/shared";
import { Alert, Autocomplete, Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { schemaResolver, useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { errorMessage } from "../../lib/api";
import { customersQuery, useCreateProject, useUpdateProject } from "./api";

interface Props {
  opened: boolean;
  onClose: () => void;
  /** The project to edit; omit to create one. */
  project?: Pick<Project, "id" | "name" | "customer">;
}

export function ProjectFormModal({ opened, onClose, project }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={project ? "Edit project" : "New project"}>
      {opened &&
        (project ? (
          <EditForm project={project} onDone={onClose} />
        ) : (
          <CreateForm onDone={onClose} />
        ))}
    </Modal>
  );
}

const fields = CreateProjectInput.pick({ name: true, customer: true });

function useProjectForm(initial: { name: string; customer: string }) {
  return useForm({ initialValues: initial, validate: schemaResolver(fields, { sync: true }) });
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const create = useCreateProject();
  const navigate = useNavigate();
  const form = useProjectForm({ name: "", customer: "" });

  const submit = form.onSubmit((values) => {
    create.mutate(CreateProjectInput.parse(values), {
      onSuccess: (project) => {
        notifications.show({ color: "green", message: `Project ${project.name} created` });
        onDone();
        void navigate(`/projects/${project.id}`);
      },
    });
  });

  return (
    <ProjectFields
      form={form}
      onSubmit={submit}
      onCancel={onDone}
      error={create.error}
      loading={create.isPending}
      label="Create project"
    />
  );
}

function EditForm({
  project,
  onDone,
}: {
  project: NonNullable<Props["project"]>;
  onDone: () => void;
}) {
  const update = useUpdateProject(project.id);
  const form = useProjectForm({ name: project.name, customer: project.customer });

  const submit = form.onSubmit((values) => {
    const parsed = fields.parse(values);
    const patch: UpdateProjectInput = {
      ...(parsed.name !== project.name && { name: parsed.name }),
      ...(parsed.customer !== project.customer && { customer: parsed.customer }),
    };
    if (Object.keys(patch).length === 0) return onDone();
    update.mutate(patch, { onSuccess: onDone });
  });

  return (
    <ProjectFields
      form={form}
      onSubmit={submit}
      onCancel={onDone}
      error={update.error}
      loading={update.isPending}
      label="Save"
    />
  );
}

function ProjectFields({
  form,
  onSubmit,
  onCancel,
  error,
  loading,
  label,
}: {
  form: ReturnType<typeof useProjectForm>;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
  error: unknown;
  loading: boolean;
  label: string;
}) {
  const customers = useQuery(customersQuery);

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        {error != null && <Alert color="red">{errorMessage(error)}</Alert>}
        <TextInput label="Project name" data-autofocus {...form.getInputProps("name")} />
        <Autocomplete
          label="Customer"
          description="Pick an existing customer or type a new one"
          data={customers.data ?? []}
          {...form.getInputProps("customer")}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {label}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

import { can } from "@cabinet-planner/shared";
import { Alert, Button, Group, Loader, Table, Text, TextInput, Title } from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useCurrentUser } from "../auth/api";
import { projectsQuery } from "./api";
import { ProjectFormModal } from "./ProjectFormModal";

export function ProjectsPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search.trim(), 250);
  const projects = useQuery(projectsQuery(debouncedSearch));
  const [createOpen, createModal] = useDisclosure(false);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Projects</Title>
        {can(user, "projects") && <Button onClick={createModal.open}>New project</Button>}
      </Group>

      <TextInput
        placeholder="Search by project or customer"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        mb="md"
        maw={400}
      />

      {projects.isPending && <Loader />}
      {projects.isError && <Alert color="red">{errorMessage(projects.error)}</Alert>}
      {projects.isSuccess &&
        (projects.data.length === 0 ? (
          <Text c="dimmed">
            {debouncedSearch ? "No projects match your search." : "No projects yet."}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Project</Table.Th>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th>Machines</Table.Th>
                  <Table.Th>Last updated</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {projects.data.map((p) => (
                  <Table.Tr
                    key={p.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => void navigate(`/projects/${p.id}`)}
                  >
                    <Table.Td fw={500}>{p.name}</Table.Td>
                    <Table.Td>{p.customer}</Table.Td>
                    <Table.Td>{p.machineCount}</Table.Td>
                    <Table.Td>{formatDate(p.updatedAt)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ))}

      <ProjectFormModal opened={createOpen} onClose={createModal.close} />
    </>
  );
}

import { Button, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router";

/** Placeholder until the projects feature lands. */
export function HomePage() {
  return (
    <Stack>
      <Title order={2}>Projects</Title>
      <Text c="dimmed">Projects, machines and revisions arrive in the next feature.</Text>
    </Stack>
  );
}

export function NotFoundPage() {
  return (
    <Stack align="flex-start">
      <Title order={2}>Page not found</Title>
      <Button component={Link} to="/" variant="light">
        Back to projects
      </Button>
    </Stack>
  );
}

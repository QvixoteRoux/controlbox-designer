import { Button, Stack, Title } from "@mantine/core";
import { Link } from "react-router";

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

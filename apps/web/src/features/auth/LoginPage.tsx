import { LoginInput } from "@cabinet-planner/shared";
import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { schemaResolver, useForm } from "@mantine/form";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate } from "react-router";
import { errorMessage } from "../../lib/api";
import { meQuery, useLogin } from "./api";

export function LoginPage() {
  const me = useQuery(meQuery);
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const form = useForm({
    initialValues: { username: "", password: "" },
    validate: schemaResolver(LoginInput, { sync: true }),
  });

  if (me.data) return <Navigate to={from} replace />;

  const submit = form.onSubmit((values) => {
    login.mutate(LoginInput.parse(values), {
      onSuccess: () => void navigate(from, { replace: true }),
    });
  });

  return (
    <Center h="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" w={360}>
        <form onSubmit={submit}>
          <Stack>
            <Title order={2}>Cabinet Planner</Title>
            {login.isError && <Alert color="red">{errorMessage(login.error)}</Alert>}
            <TextInput
              label="Username"
              autoComplete="username"
              autoFocus
              {...form.getInputProps("username")}
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              {...form.getInputProps("password")}
            />
            <Button type="submit" loading={login.isPending}>
              Log in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}

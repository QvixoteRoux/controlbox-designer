import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// One .env at the repo root (see guidelines/stack.md). Real environment variables win.
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  SESSION_COOKIE_NAME: z.string().default("cp_session"),
  UPLOAD_DIR: z.string().default("./uploads"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment (check .env):\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

import { buildApp } from "./app.js";
import { createPrisma } from "./db.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env.js";
import { LocalImageStore } from "./images.js";

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);
// A relative UPLOAD_DIR is relative to the repo root, like .env (src/ and dist/ are 3 levels down).
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const app = await buildApp(
  {
    db: prisma,
    pingDb: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    auth: {
      cookieName: env.SESSION_COOKIE_NAME,
      secureCookies: env.NODE_ENV === "production",
    },
    images: new LocalImageStore(resolve(repoRoot, env.UPLOAD_DIR)),
  },
  { logger: { level: env.NODE_ENV === "production" ? "info" : "debug" } },
);

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

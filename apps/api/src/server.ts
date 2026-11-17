import { buildApp } from "./app.js";
import { createPrisma } from "./db.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);

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

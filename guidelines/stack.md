# Stack & repo layout

## Stack

| Layer                | Choice                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language             | TypeScript (strict) everywhere                                                                                                                                                   |
| Package manager      | pnpm workspaces                                                                                                                                                                  |
| Frontend             | React + Vite                                                                                                                                                                     |
| Platen / face editor | react-konva (Konva canvas)                                                                                                                                                       |
| UI components        | Mantine (modals, forms, tables); `@mantine/form` validated with the shared Zod schemas (`schemaResolver`); `@mantine/notifications` for toasts                                   |
| Routing              | React Router 8 (`createBrowserRouter`, routes in `apps/web/src/router.tsx`)                                                                                                      |
| Data fetching        | TanStack Query                                                                                                                                                                   |
| Backend              | Node + Fastify                                                                                                                                                                   |
| Validation           | Zod (schemas shared with the frontend)                                                                                                                                           |
| ORM / migrations     | Prisma 7: the DB URL lives in `apps/api/prisma.config.ts`, PrismaClient uses `@prisma/adapter-pg`, and the generated client goes to `apps/api/src/generated/prisma` (gitignored) |
| Database             | PostgreSQL 18, installed natively (no Docker for local dev); production must run the same major version                                                                          |
| Image storage        | Local `uploads/` in dev, MinIO (S3-compatible) in prod                                                                                                                           |
| Auth                 | Username + password (argon2 hash), server-side sessions in an httpOnly cookie                                                                                                    |
| Tests                | Vitest (unit + API integration tests against a real database), Playwright (editor end-to-end, later)                                                                             |
| Deploy               | Docker images → Dokploy                                                                                                                                                          |

## Layout

```
controlbox-designer/
├─ apps/
│  ├─ web/                 React app
│  │  └─ src/
│  │     ├─ features/      projects/, cabinets/, platen-editor/, catalog/, users/
│  │     ├─ components/    shared UI pieces
│  │     └─ lib/           api client, hooks
│  └─ api/
│     ├─ prisma/           schema.prisma, migrations/, sql/, seed.ts
│     └─ src/
│        ├─ routes/        one file per resource
│        ├─ services/      business rules (revision copy, release, snapping checks)
│        └─ auth/          sessions, can() guards
├─ packages/
│  └─ shared/
│     └─ src/
│        ├─ schemas/       Zod schemas per entity
│        ├─ units.ts       mm <-> 0.1 mm helpers
│        ├─ revisions.ts   formatRev()
│        └─ permissions.ts can()
├─ guidelines/             tracked
├─ CLAUDE.md               tracked
├─ .env                    untracked, one file for the whole repo (copy of .env.example)
├─ localnotes/             untracked
└─ agentNotes/             untracked
```

## Environment

- A single `.env` at the repo root. `apps/api` (server and `prisma.config.ts`) loads it by explicit path, so commands work from any folder.
- Requires Node 24 or newer and pnpm (`npm install -g pnpm`).

## One-time local database setup

PostgreSQL 18 runs natively on the dev/host machine at `localhost:5432`.

1. Install PostgreSQL 18 (on Windows: `winget install PostgreSQL.PostgreSQL.18 --interactive`, or the EDB installer).
   - Set the `postgres` superuser password during setup. Install Server and Command Line Tools; Stack Builder add-ons aren't needed.
   - Add `C:\Program Files\PostgreSQL\18\bin` to PATH (the installer doesn't) so `psql` works.
2. Create the app role and database. Run as the superuser, e.g. `psql -U postgres`:
   ```sql
   CREATE ROLE planner WITH LOGIN PASSWORD 'planner' CREATEDB;
   CREATE DATABASE cabinet_planner OWNER planner;
   ```
   `CREATEDB` is needed because `prisma migrate dev` creates a temporary shadow database. Use a real password outside local dev.
3. Copy `.env.example` to `.env` and adjust `DATABASE_URL` and the `SEED_ADMIN_*` values. The password in `DATABASE_URL` is part of a URL: percent-encode `@ : / ? # % &` (e.g. `@` → `%40`), or stick to letters, digits, `-` and `_`.
4. Create the tables, check the hand-written constraints (every row should say `ok`), and seed:
   ```
   pnpm --filter api prisma migrate dev
   psql "<DATABASE_URL>" -f apps/api/prisma/sql/verify-constraints.sql
   pnpm --filter api prisma db seed
   ```
   Run Prisma through `pnpm` as shown: calling the `prisma` binary directly can't find `tsx` for the seed.

## Tests and the test database

- `pnpm test` needs PostgreSQL running: the API integration tests use their own database, `<dev db name>_test` (e.g. `cabinet_planner_test`), or `TEST_DATABASE_URL` if set.
- The tests create that database on first run and apply migrations every run (`apps/api/test/global-setup.ts`), so the `planner` role needs `CREATEDB`. Tables are emptied before each test; dev data is never touched.
- API test files run one at a time because they share the database.

## Conventions

- DB tables and columns use snake_case (via `@@map` / `@map`). TS code uses camelCase.
- API: REST + JSON under `/api`. Revision-scoped resources are nested: `/api/projects/:id/machines/:machineId/revisions/:rev/cabinets`.
  - Handlers parse input with the shared Zod schemas (`Schema.parse(request.body)`); a `ZodError` becomes a 400 with per-field messages.
  - Business-rule failures throw `HttpError(status, message)` from `apps/api/src/errors.ts`. Every error response has the shared `ApiErrorBody` shape.
- Feature folders own their components, hooks and API calls. Only code shared across features goes in `components/` or `lib/`.
- **Images** (components and cable glands):
  - Upload: `PUT …/:id/image` with the file as the raw body and its own `Content-Type` (`image/png`, `image/jpeg` or `image/webp`; anything else gets a 415). The API checks the file's first bytes, not the header. Safety cap 20 MB. `DELETE …/:id/image` clears it.
  - Stored through the `ImageStore` interface (`apps/api/src/images.ts`). Dev: `LocalImageStore` in `UPLOAD_DIR` (relative paths are from the repo root). Prod: an S3/MinIO store with the same interface, added with the Docker setup.
  - The DB keeps only the key (`components/<id>-<uuid>.png`). Served at `GET /api/images/<key>` to signed-in users, cached as immutable.
  - Files are **never deleted** when replaced or cleared: a released revision's snapshot may still point at the old key.
  - No SVG: it can carry scripts.
- Optimistic updates for drag in the editor; the server stays authoritative.

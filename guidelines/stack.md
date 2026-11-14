# Stack & repo layout

## Stack

| Layer                | Choice                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language             | TypeScript (strict) everywhere                                                                                                                                                   |
| Package manager      | pnpm workspaces                                                                                                                                                                  |
| Frontend             | React + Vite                                                                                                                                                                     |
| Platen / face editor | react-konva (Konva canvas)                                                                                                                                                       |
| UI components        | Mantine (modals, forms, tables)                                                                                                                                                  |
| Data fetching        | TanStack Query                                                                                                                                                                   |
| Backend              | Node + Fastify                                                                                                                                                                   |
| Validation           | Zod (schemas shared with the frontend)                                                                                                                                           |
| ORM / migrations     | Prisma 7: the DB URL lives in `apps/api/prisma.config.ts`, PrismaClient uses `@prisma/adapter-pg`, and the generated client goes to `apps/api/src/generated/prisma` (gitignored) |
| Database             | PostgreSQL 17, installed natively (no Docker for local dev)                                                                                                                      |
| Image storage        | Local `uploads/` in dev, MinIO (S3-compatible) in prod                                                                                                                           |
| Auth                 | Username + password (argon2 hash), server-side sessions in an httpOnly cookie                                                                                                    |
| Tests                | Vitest (unit), Playwright (editor end-to-end, later)                                                                                                                             |
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

PostgreSQL 17 runs natively on the dev/host machine at `localhost:5432`.

1. Install PostgreSQL 17 (on Windows: `winget install PostgreSQL.PostgreSQL.17`, or the EDB installer). Set the `postgres` superuser password during setup.
2. Create the app role and database. Run as the superuser, e.g. `psql -U postgres`:
   ```sql
   CREATE ROLE planner WITH LOGIN PASSWORD 'planner' CREATEDB;
   CREATE DATABASE cabinet_planner OWNER planner;
   ```
   `CREATEDB` is needed because `prisma migrate dev` creates a temporary shadow database. Use a real password outside local dev.
3. Copy `.env.example` to `.env` and adjust `DATABASE_URL` and the `SEED_ADMIN_*` values.
4. Create the tables and seed data:
   ```
   pnpm --filter api prisma migrate dev
   pnpm --filter api prisma db seed
   ```

## Conventions

- DB tables and columns use snake_case (via `@@map` / `@map`). TS code uses camelCase.
- API: REST + JSON under `/api`. Revision-scoped resources are nested: `/api/projects/:id/machines/:machineId/revisions/:rev/cabinets`.
- Feature folders own their components, hooks and API calls. Only code shared across features goes in `components/` or `lib/`.
- Optimistic updates for drag in the editor; the server stays authoritative.

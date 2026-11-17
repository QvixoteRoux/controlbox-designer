# Cabinet Planner

Web app for laying out electrical cabinets:
**projects → machines → revisions → cabinets → platen layout**, using a shared component catalog.

## Read first

- `guidelines/README.md`: index of the project rules. Read the file for the area you're touching before you change it.
- `agentNotes/`: your scratch space (untracked). Keep a running log of decisions, open questions and TODOs in `agentNotes/progress.md`.
- `localnotes/`: the owner's private notes (untracked). Read them only when asked and never edit them.

## Stack (fixed: ask before swapping anything)

TypeScript everywhere · pnpm workspaces

- `apps/web`: React + Vite, react-konva for the platen editor
- `apps/api`: Fastify + Prisma + PostgreSQL 18 (native install, no Docker for local dev)
- `packages/shared`: Zod schemas, TS types, units and permission helpers (used by both apps)
- Deploy: Docker images run on Dokploy

## Hard rules

1. **Lengths are integers in 0.1 mm** in the DB, the API and the shared types. Convert to and from mm only at the UI edge with `packages/shared/src/units.ts`. Never use floats for lengths.
2. **Coordinates:** the platen origin is its top-left corner with +y down. Cabinet-face origins are at the face centre with +y up, viewed from outside. → `guidelines/units-and-coordinates.md`
3. **Released revisions are read-only.** Every write that touches revision data calls `assertRevisionEditable()` first. → `guidelines/revisions.md`
4. **Every write endpoint checks permissions** with `can(user, 'projects' | 'components' | 'admin')` from `packages/shared`. → `guidelines/permissions.md`
5. **The Zod schemas in `packages/shared` are the single source of truth** for request and response shapes. Don't redefine those types inside the apps.
6. **Schema changes:**
   - Edit `apps/api/prisma/schema.prisma`, then run `pnpm --filter api prisma migrate dev --name <change>`.
   - Hand-written SQL constraints live in `apps/api/prisma/sql/` and must go into a migration.
7. **Catalog rows that are in use are never hard-deleted.** Set `active = false` instead.
8. **Images** are stored as files (local folder in dev, MinIO/S3 in prod). The DB stores only the path.

## Commands

One-time DB setup (role, database, `.env`): `guidelines/stack.md`.

```
pnpm install
pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed
pnpm dev                  # web + api
pnpm typecheck && pnpm lint && pnpm test
```

## Before you call a task done

- Typecheck, lint and tests pass.
- If a rule in `guidelines/` should change, propose the change and ask before editing.
- Add a line to `agentNotes/progress.md`.

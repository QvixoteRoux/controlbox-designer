# Cabinet Planner

A web app for laying out electrical control cabinets: which parts go on the mounting plate (platen), where they sit on the DIN rails, and which holes and cable glands go in the cabinet walls.

Work is organised as **projects → machines → revisions → cabinets → platen layout**, using one shared component catalog. Released revisions are frozen, so a released drawing never changes when the catalog does.

## Features

- **Projects, machines and revisions:** a working revision per machine; releasing it freezes it (with release notes), and the next revision starts as a copy.
- **Cabinets:** size, material, voltages, and openings on each face (windows, round and rectangular holes, cable glands and gland arrays), with warnings for overlaps and holes off the face.
- **Component catalog:** standard parts, fuses, terminal blocks (1–4 levels), ground terminals, wire ducts and the built-in 35 mm DIN rail. Sizes in mm, or in inches for standard parts. A picture per part.
- **Platen editor:**
  - drag parts from the catalog onto the platen; zoom, pan, 5 mm grid
  - rail snap: rail-mounted parts click onto DIN rails at their datasheet offset, sit side by side, and turn with vertical rails; moving a rail moves its parts
  - alignment guides for everything else
  - terminal strips: N terminals in one placement, with colour, group label and bridged levels
  - multi-select, arrow-key nudge, undo/redo
  - warnings for overlaps, parts off the platen, rails longer than stock, and parts hanging past a rail's end
- **Users and permissions:** viewer, designer and admin roles; separate rights for editing projects and the catalog.

## Stack

TypeScript everywhere, in a pnpm workspace:

| Package           | What                                                            |
| ----------------- | --------------------------------------------------------------- |
| `apps/web`        | React + Vite, Mantine, TanStack Query, react-konva (the editor) |
| `apps/api`        | Fastify, Prisma 7, PostgreSQL 18                                |
| `packages/shared` | Zod schemas, types, units, geometry and snapping, permissions   |

All lengths are integers in 0.1 mm, from the database to the API to the editor; millimetres only appear at the UI edge.

## Getting started

You need **Node 24+**, **pnpm** and **PostgreSQL 18** (installed natively; local development doesn't use Docker).

1. Create a database role and database (as the `postgres` superuser):
   ```sql
   CREATE ROLE planner WITH LOGIN PASSWORD 'planner' CREATEDB;
   CREATE DATABASE cabinet_planner OWNER planner;
   ```
2. Copy `.env.example` to `.env` at the repo root and adjust `DATABASE_URL` and the `SEED_ADMIN_*` values.
3. Install, migrate, seed and start:
   ```
   pnpm install
   pnpm --filter api prisma migrate dev
   pnpm --filter api prisma db seed
   pnpm dev
   ```
4. Open the web app at the address Vite prints (usually http://localhost:5173) and sign in with the seeded admin account.

More detail (Windows install notes, checking the hand-written database constraints, the test database) is in [guidelines/stack.md](guidelines/stack.md).

## Checks

```
pnpm typecheck && pnpm lint && pnpm test
pnpm format:check
```

The API tests run against a real PostgreSQL database (`cabinet_planner_test` by default, see `.env.example`).

## Documentation

The rules behind the code live in [guidelines/](guidelines/README.md): units and coordinates, the data model, permissions, revisions, and how the platen editor snaps and saves. Read the file for an area before changing it.

## Status

In active development. Not yet in production: the Docker / Dokploy deployment and S3 image storage are still to come.

## License

Copyright (C) 2026 Qvixote Roux

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. The full text is in [LICENSE](LICENSE).

In short: anyone may use, study, change and share it, but if they run a modified version for other people, including as a web service, they must offer those users its source code under the same license.

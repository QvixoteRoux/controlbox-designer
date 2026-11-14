# Permissions

## Roles

| Role         | Can do                                                                                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VIEWER**   | View projects, cabinets, layouts and the catalog. Nothing else.                                                                                                                                                                                                                                                         |
| **DESIGNER** | Has two permissions, **Projects** (`can_projects`: create and edit projects, revisions, cabinets and layouts) and **Components** (`can_components`: add and edit catalog items, cable glands, cabinet types and component types). Both are on by default. An admin can turn one off, but **at least one must stay on**. |
| **ADMIN**    | Everything, including users, roles and releasing revisions.                                                                                                                                                                                                                                                             |

New users default to VIEWER.

## Rules

- The "at least one" rule is enforced in three places:
  - a DB check constraint (`users_designer_has_permission`)
  - Zod
  - the admin UI, which disables the last checked box
- Only an ADMIN can change roles or permissions, create users or reset passwords.
- The **last active ADMIN** can't be demoted or deactivated. This is checked in the API service.
- Releasing a revision requires `projects`. Change this to `admin` if releases need sign-off.

## Helper (`packages/shared/src/permissions.ts`)

```ts
export type Permission = "projects" | "components" | "admin";

export function can(
  user: { role: Role; canProjects: boolean; canComponents: boolean },
  p: Permission,
): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role !== "DESIGNER") return false;
  if (p === "projects") return user.canProjects;
  if (p === "components") return user.canComponents;
  return false;
}
```

- The API guards every write route with `can()`. There are no role checks scattered elsewhere.
- The web app uses the same `can()` to hide or disable controls. That is only for usability; the API is the real check.

## Auth

- Users log in with a username and password, hashed with argon2.
- Sessions are server-side. The table stores the token's SHA-256 hash, and the raw token sits in an httpOnly, SameSite=Lax cookie.
- Sessions expire after 30 days and refresh on use. Logging out deletes the row.
- Deactivating a user (`active = false`) deletes their sessions.

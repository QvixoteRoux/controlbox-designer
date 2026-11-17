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
- Only an ADMIN can see the user list, change roles or permissions, create users or reset passwords.
- Every user can change their **own** password (current password required).
- The **last active ADMIN** can't be demoted or deactivated. This is checked in the API service, inside a transaction that locks the active admin rows, so two simultaneous demotions can't both pass.
- Role and permission changes apply on the user's next request: each request reads the user fresh with the session.
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
  - Guards live in `apps/api/src/auth/guards.ts`: `requireAuth` (any logged-in user, used for reads) and `requirePermission(p)` (wraps `can()`).
  - Every route except login and health needs a logged-in user, so a VIEWER can look but not change anything.
- The web app uses the same `can()` to hide or disable controls. That is only for usability; the API is the real check.

## Auth

- Users log in with a username and password, hashed with argon2. A failed login gives the same message and takes about the same time whether or not the username exists.
- **Usernames:** login matches the exact spelling (`Admin` can't log in as `admin`), but uniqueness ignores case: a new user can't be `Admin` while `admin` exists. Enforced by the DB index `users_username_lower_key` on `lower(username)`.
- Sessions are server-side. The table stores the token's SHA-256 hash, and the raw token sits in an httpOnly, SameSite=Lax cookie (also Secure in production).
- Sessions expire after 30 days. Using a session pushes the expiry forward, at most once a day. Logging out deletes the row.
- Logging in again from the same browser replaces that browser's session.
- These end all of a user's sessions:
  - deactivating them (`active = false`)
  - an admin resetting their password (an admin resetting their own keeps the current session)
  - changing their own password (except the session they changed it from)
- **CSRF:** writes (anything but GET/HEAD/OPTIONS) whose `Origin` header doesn't match `Host` are refused with 403. Any proxy in front of the API (Vite in dev, the reverse proxy in prod) must pass the original `Host` through.
- Not yet done: rate limiting failed logins. Add it before the app is exposed outside the company network.

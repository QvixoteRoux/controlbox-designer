import { hash, verify } from "argon2";

export const hashPassword = (password: string) => hash(password);

let dummyHash: Promise<string> | undefined;

/**
 * Checks a password against its stored hash. With no hash (unknown or inactive user) it still
 * runs one argon2 verify against a dummy hash, so response times don't reveal which usernames exist.
 */
export async function verifyPassword(storedHash: string | null, password: string) {
  if (storedHash === null) {
    await verify(await (dummyHash ??= hash("not-a-real-password")), password);
    return false;
  }
  return verify(storedHash, password);
}

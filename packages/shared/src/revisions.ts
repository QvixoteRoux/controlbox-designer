/** A machine's first revision. */
export const FIRST_REV = 1;
export const MAX_REV = 999;

/** Revision number → display label, zero-padded to 3 digits. 7 → "Rev 007". */
export function formatRev(rev: number): string {
  if (!Number.isInteger(rev) || rev < FIRST_REV || rev > MAX_REV) {
    throw new RangeError(`Revision must be an integer ${FIRST_REV}…${MAX_REV}, got ${rev}`);
  }
  return `Rev ${String(rev).padStart(3, "0")}`;
}

// Every length and position is an integer in 0.1 mm (see guidelines/units-and-coordinates.md).
// Convert only at the UI edge, with these two helpers.

/** Millimetres (up to 1 decimal) → stored units (integer 0.1 mm). 600 mm → 6000. */
export const toUnits = (mm: number) => Math.round(mm * 10);

/** Stored units (integer 0.1 mm) → millimetres. 52 → 5.2. */
export const toMm = (u: number) => u / 10;

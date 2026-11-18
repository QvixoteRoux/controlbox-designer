// Every length and position is an integer in 0.1 mm (see guidelines/units-and-coordinates.md).
// Convert only at the UI edge, with these two helpers.

/** Millimetres (up to 1 decimal) → stored units (integer 0.1 mm). 600 mm → 6000. */
export const toUnits = (mm: number) => Math.round(mm * 10);

/** Stored units (integer 0.1 mm) → millimetres. 52 → 5.2. */
export const toMm = (u: number) => u / 10;

export const MM_PER_INCH = 25.4;

/**
 * Inches typed in a catalog form → stored units, rounded to the nearest **whole millimetre**
 * (catalog sizes in inches are nominal). 2.5 in = 63.5 mm → 64 mm → 640.
 */
export const inchesToUnits = (inches: number) => toUnits(Math.round(inches * MM_PER_INCH));

/** Stored units → inches, for showing a size in an inch field (3 decimals). */
export const unitsToInches = (u: number) => Math.round((toMm(u) / MM_PER_INCH) * 1000) / 1000;

/**
 * A length for labels in both units: "1200 mm / 47.24 in". Whole millimetres, or one decimal
 * when the length has one; inches to 2 decimals.
 */
export function formatLength(u: number) {
  const mm = toMm(u);
  const inches = (mm / MM_PER_INCH).toFixed(2);
  return `${Number.isInteger(mm) ? mm : mm.toFixed(1)} mm / ${inches} in`;
}

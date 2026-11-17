import { inchesToUnits, toMm, toUnits, unitsToInches } from "@cabinet-planner/shared";
import type { FormErrors } from "@mantine/form";
import type { z } from "zod";

/**
 * A Mantine form validator for forms whose values differ from the API shape (e.g. lengths typed in
 * mm while the API takes 0.1 mm units). `toApi` converts the form values; the shared schema then
 * checks the result, and its errors are reported on the form field with the same path.
 */
export function convertingResolver<V>(schema: z.ZodType, toApi: (values: V) => unknown) {
  return (values: V): FormErrors => {
    const result = schema.safeParse(toApi(values));
    if (result.success) return {};
    const errors: FormErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".");
      errors[key] ??= issue.code === "invalid_type" ? "Required" : issue.message;
    }
    return errors;
  };
}

/** A NumberInput value in mm → 0.1 mm units (NaN when empty, so the schema reports it). */
export const mmToUnits = (mm: number | string) => (typeof mm === "number" ? toUnits(mm) : NaN);

/** 0.1 mm units → a value for a mm NumberInput. */
export const unitsToMm = (units: number) => toMm(units);

/** Props shared by every mm NumberInput: one decimal, a unit suffix. */
export const mmInputProps = { decimalScale: 1, suffix: " mm", allowNegative: false } as const;

/** Unit a catalog size is typed in. Inches are rounded to whole millimetres on save. */
export type LengthUnit = "mm" | "in";

/** Props for a size NumberInput in the chosen unit. */
export const lengthInputProps = (unit: LengthUnit) =>
  unit === "mm"
    ? mmInputProps
    : ({ decimalScale: 3, suffix: " in", allowNegative: false } as const);

/** A NumberInput value in the chosen unit → 0.1 mm units (NaN when empty). */
export const lengthToUnits = (value: number | string, unit: LengthUnit) =>
  typeof value !== "number" ? NaN : unit === "mm" ? toUnits(value) : inchesToUnits(value);

/** 0.1 mm units → a NumberInput value in the chosen unit. */
export const unitsToLength = (units: number, unit: LengthUnit) =>
  unit === "mm" ? toMm(units) : unitsToInches(units);

/**
 * Re-expresses a typed size in the other unit when the unit switch changes (empty stays empty).
 * mm → in keeps 3 decimals; in → mm rounds to the whole millimetre, as saving would.
 */
export const convertLength = (value: number | string, from: LengthUnit, to: LengthUnit) =>
  typeof value !== "number" || from === to ? value : unitsToLength(lengthToUnits(value, from), to);

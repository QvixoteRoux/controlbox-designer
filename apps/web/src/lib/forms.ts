import { toMm, toUnits } from "@cabinet-planner/shared";
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

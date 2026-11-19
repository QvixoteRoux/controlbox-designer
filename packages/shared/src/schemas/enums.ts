import { z } from "zod";

// Mirrors of the Prisma enums in apps/api/prisma/schema.prisma.

export const Role = z.enum(["VIEWER", "DESIGNER", "ADMIN"]);
export type Role = z.infer<typeof Role>;

export const RevisionStatus = z.enum(["WORKING", "RELEASED"]);
export type RevisionStatus = z.infer<typeof RevisionStatus>;

export const CabinetMaterial = z.enum(["METAL", "PLASTIC"]);
export type CabinetMaterial = z.infer<typeof CabinetMaterial>;

export const Face = z.enum(["FRONT", "BACK", "LEFT", "RIGHT", "TOP", "BOTTOM"]);
export type Face = z.infer<typeof Face>;

export const HingeSide = z.enum(["LEFT", "RIGHT", "TOP", "BOTTOM", "NONE"]);
export type HingeSide = z.infer<typeof HingeSide>;

export const OpeningKind = z.enum(["WINDOW", "ROUND_HOLE", "RECT_HOLE", "CABLE_GLAND"]);
export type OpeningKind = z.infer<typeof OpeningKind>;

export const ComponentKind = z.enum([
  "STANDARD",
  "SAFETY",
  "FUSE",
  "RELAY",
  "TERMINAL_BLOCK",
  "GROUND_TERMINAL",
  "GUTTER",
  "RAIL",
]);
export type ComponentKind = z.infer<typeof ComponentKind>;

export const TerminalColor = z.enum([
  "LIGHT_GREY",
  "DARK_GREY",
  "BEIGE",
  "RED",
  "GREEN",
  "BLUE",
  "YELLOW",
]);
export type TerminalColor = z.infer<typeof TerminalColor>;

import { z } from "zod";
import { HexColor, Id, IdParams, NonNegativeUnits, PositiveUnits, Timestamp } from "./common.js";
import { ComponentKind } from "./enums.js";

// One catalog table; `kind` decides which fields apply and what `attributes` holds
// (guidelines/data-model.md). Every size is in 0.1 mm.

/** DIN rail is always 35 mm wide. */
export const RAIL_WIDTH = 350;
/** Rails and wire ducts come 2000 mm long and are cut to fit. */
export const DEFAULT_STOCK_LENGTH = 20000;
/**
 * The one DIN rail in the catalog: TS35 × 7.5 (EN 60715), the same across manufacturers.
 * A migration adds it to every database; it can't be added again, resized, deactivated or
 * deleted. Only its type, code, description and picture can be edited.
 * Keep in step with migration `builtin_din_rail` and `prisma/sql/constraints.sql`.
 */
export const BUILT_IN_RAIL = {
  kind: "RAIL",
  manufacturer: "Generic",
  partNumber: "TS35x7.5",
  description: "DIN rail 35 × 7.5 mm (EN 60715)",
  height: 0,
  width: RAIL_WIDTH,
  depth: 75,
  stockLength: DEFAULT_STOCK_LENGTH,
} as const;
/** Built-in parts (only the DIN rail) can't be added, deleted or resized. */
export const isBuiltIn = (c: { kind: ComponentKind }) => c.kind === "RAIL";
/** Terminal blocks have 1 to 4 levels (4 is rare). */
export const MAX_TERMINAL_LEVELS = 4;

// ── Attributes per kind ──

export const StandardAttributes = z.strictObject({});
export const FuseAttributes = z.strictObject({
  amperage: z.number().positive(),
  poles: z.number().int().positive(),
});
export const TerminalBlockAttributes = z.strictObject({
  levels: z.number().int().min(1).max(MAX_TERMINAL_LEVELS),
});
/** Ground (PE) terminals: always 1 level, drawn green/yellow. */
export const GroundTerminalAttributes = z.strictObject({});
const StockLength = PositiveUnits.default(DEFAULT_STOCK_LENGTH);
export const GutterAttributes = z.strictObject({ stockLength: StockLength });
export const RailAttributes = z.strictObject({ stockLength: StockLength });

// ── Input (POST / PUT body) ──
// Each kind takes only the fields that mean something for it; the API fills in the rest
// (e.g. a rail's width is always RAIL_WIDTH and it is never rail mounted itself).

const Text = (max: number) => z.string().trim().min(1, "Required").max(max);
const OptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((s) => (s === "" ? null : s));

// ── Relays ──
// A relay usually plugs into a base (socket, a second part number) that mounts on the rail and
// takes the wiring (owner, 2026-11-18). Both are typed in the relay's catalog entry. On the
// platen the pair is one box: the outline of base and relay together, the relay centred on the
// base. The row's height / width / depth / rail offset hold that outline, so all the rail and
// snap geometry works unchanged; `attributes` keeps the sizes as typed.

/** A relay's base (socket). */
export const RelayBase = z.strictObject({
  manufacturer: Text(100),
  partNumber: Text(100),
  width: PositiveUnits,
  height: PositiveUnits,
  depth: PositiveUnits,
});
export type RelayBase = z.infer<typeof RelayBase>;

/** What a relay row keeps in `attributes`, as typed, so the form can show it again. */
export const RelayAttributes = z.strictObject({
  /** The relay plugs into a base that mounts on the rail. */
  baseMount: z.boolean(),
  /** The relay's own size (the row's columns hold the outline with the base). */
  relay: z.strictObject({ width: PositiveUnits, height: PositiveUnits, depth: PositiveUnits }),
  base: RelayBase.nullable(),
  /** Base and relay together, as mounted: typed, since the plug-in overlap varies by base. */
  mountedDepth: PositiveUnits.nullable(),
  /** From the base's top edge to the rail's top edge, as typed (base mounted, on a rail). */
  baseRailEdgeOffset: NonNegativeUnits.nullable(),
});
export type RelayAttributes = z.infer<typeof RelayAttributes>;

const RelayInputAttributes = z.strictObject({
  baseMount: z.boolean().default(true),
  base: RelayBase.nullable().default(null),
  mountedDepth: PositiveUnits.nullable().default(null),
});

/**
 * Relay on its base: the outline (the larger of the two in each direction) and where base and
 * relay sit in it, both centred, unrotated (width along x). `baseTop` is the base's top edge
 * below the outline's, for turning the base's rail offset into the outline's.
 */
export function relayOutline(
  relay: { width: number; height: number },
  base: { width: number; height: number },
) {
  const width = Math.max(relay.width, base.width);
  const height = Math.max(relay.height, base.height);
  const at = (b: { width: number; height: number }) => ({
    x: (width - b.width) / 2,
    y: (height - b.height) / 2,
    width: b.width,
    height: b.height,
  });
  return {
    width,
    height,
    base: at(base),
    relay: at(relay),
    baseTop: Math.round((height - base.height) / 2),
  };
}

/** A relay mounted on a base, from a part's kind and attributes; null for anything else. */
export function relayOnBase(part: { kind: ComponentKind; attributes: unknown }) {
  if (part.kind !== "RELAY") return null;
  const a = RelayAttributes.safeParse(part.attributes);
  if (!a.success || !a.data.baseMount || a.data.base === null) return null;
  return { ...a.data, base: a.data.base, outline: relayOutline(a.data.relay, a.data.base) };
}

const identity = {
  typeId: Id.nullable().default(null),
  manufacturer: Text(100),
  partNumber: Text(100),
  /** Internal ID / code. Optional, unique when set. */
  code: OptionalText(50),
  description: OptionalText(500),
  active: z.boolean().default(true),
};

const electrical = {
  inputVoltage: OptionalText(50),
  /** AC only: 1 or 3. null for DC or not applicable. */
  phases: z
    .union([z.literal(1), z.literal(3)])
    .nullable()
    .default(null),
};

const box = { height: PositiveUnits, width: PositiveUnits, depth: PositiveUnits };

const mounting = {
  railMount: z.boolean().default(false),
  /** Distance from the component's top edge to the rail's top edge. Only when railMount. */
  railEdgeOffset: NonNegativeUnits.nullable().default(null),
  snappable: z.boolean().default(true),
  /** Placed as a row of identical modules side by side, like a terminal strip. */
  expandable: z.boolean().default(false),
};

/** Terminals always sit on a rail, so the rail offset is required and they snap side by side. */
const terminalMounting = {
  railEdgeOffset: NonNegativeUnits,
  snappable: z.boolean().default(true),
};

const railOffsetOnlyWhenRailMounted = (c: {
  railMount?: boolean;
  railEdgeOffset?: number | null;
}) => c.railMount !== false || c.railEdgeOffset == null;
const railOffsetError = {
  message: "Only for rail-mounted components",
  path: ["railEdgeOffset"],
};

const StandardInput = z
  .object({
    kind: z.literal("STANDARD"),
    ...identity,
    ...electrical,
    ...box,
    ...mounting,
    attributes: StandardAttributes.default({}),
  })
  .refine(railOffsetOnlyWhenRailMounted, railOffsetError);
/** Safety devices: the same fields as STANDARD, drawn in their own colour. */
const SafetyInput = z
  .object({
    kind: z.literal("SAFETY"),
    ...identity,
    ...electrical,
    ...box,
    ...mounting,
    attributes: StandardAttributes.default({}),
  })
  .refine(railOffsetOnlyWhenRailMounted, railOffsetError);
const FuseInput = z
  .object({
    kind: z.literal("FUSE"),
    ...identity,
    ...electrical,
    ...box,
    ...mounting,
    attributes: FuseAttributes,
  })
  .refine(railOffsetOnlyWhenRailMounted, railOffsetError);
/** Relays: Standard fields for the relay itself, plus its base when base mounted (default). */
const RelayInput = z
  .object({
    kind: z.literal("RELAY"),
    ...identity,
    ...electrical,
    ...box,
    railMount: mounting.railMount,
    /** Base mounted: from the base's top edge; otherwise from the relay's. */
    railEdgeOffset: mounting.railEdgeOffset,
    snappable: mounting.snappable,
    attributes: RelayInputAttributes.default({ baseMount: true, base: null, mountedDepth: null }),
  })
  .refine(railOffsetOnlyWhenRailMounted, railOffsetError)
  .refine((c) => !c.attributes.baseMount || c.attributes.base !== null, {
    message: "Fill in the base, or turn Base mount off",
    path: ["attributes", "base"],
  })
  .refine((c) => !c.attributes.baseMount || c.attributes.mountedDepth !== null, {
    message: "Required with a base",
    path: ["attributes", "mountedDepth"],
  });
const TerminalBlockInput = z.object({
  kind: z.literal("TERMINAL_BLOCK"),
  ...identity,
  ...box,
  ...terminalMounting,
  attributes: TerminalBlockAttributes,
});
const GroundTerminalInput = z.object({
  kind: z.literal("GROUND_TERMINAL"),
  ...identity,
  ...box,
  ...terminalMounting,
  attributes: GroundTerminalAttributes.default({}),
});
const GutterInput = z.object({
  kind: z.literal("GUTTER"),
  ...identity,
  /** Duct width: the size that matters on the platen. */
  width: PositiveUnits,
  /** Duct height, only for 3D views. 0 = not given. */
  depth: NonNegativeUnits.default(0),
  attributes: GutterAttributes.default({ stockLength: DEFAULT_STOCK_LENGTH }),
});
/** Only for editing the built-in rail (BUILT_IN_RAIL): everything else about it is fixed. */
const RailInput = z.object({
  kind: z.literal("RAIL"),
  typeId: identity.typeId,
  code: identity.code,
  description: identity.description,
});

/** POST /api/components and PUT /api/components/:id. */
export const ComponentInput = z.discriminatedUnion("kind", [
  StandardInput,
  SafetyInput,
  FuseInput,
  RelayInput,
  TerminalBlockInput,
  GroundTerminalInput,
  GutterInput,
  RailInput,
]);
export type ComponentInput = z.infer<typeof ComponentInput>;
export type ComponentInputOf<K extends ComponentKind> = Extract<ComponentInput, { kind: K }>;

/** Every column of a catalog row, filled in from a kind's input. */
export function componentColumns(input: ComponentInput) {
  if (input.kind === "RAIL") {
    const { stockLength, ...fixed } = BUILT_IN_RAIL;
    return {
      ...fixed,
      typeId: input.typeId,
      code: input.code,
      description: input.description,
      active: true,
      attributes: { stockLength } as Record<string, number>,
      inputVoltage: null,
      phases: null,
      railMount: false,
      railEdgeOffset: null,
      snappable: false,
      expandable: false,
    };
  }
  const base = {
    kind: input.kind,
    typeId: input.typeId,
    manufacturer: input.manufacturer,
    partNumber: input.partNumber,
    code: input.code,
    description: input.description,
    active: input.active,
    attributes: input.attributes,
    inputVoltage: null as string | null,
    phases: null as 1 | 3 | null,
    railMount: false,
    railEdgeOffset: null as number | null,
    snappable: false,
    expandable: false,
  };
  switch (input.kind) {
    case "STANDARD":
    case "SAFETY":
    case "FUSE":
      return {
        ...base,
        inputVoltage: input.inputVoltage,
        phases: input.phases,
        height: input.height,
        width: input.width,
        depth: input.depth,
        railMount: input.railMount,
        railEdgeOffset: input.railMount ? input.railEdgeOffset : null,
        snappable: input.snappable,
        expandable: input.expandable,
      };
    case "RELAY": {
      const relay = { width: input.width, height: input.height, depth: input.depth };
      const { baseMount, base: relayBase, mountedDepth } = input.attributes;
      const offset = input.railMount ? input.railEdgeOffset : null;
      const electricalColumns = {
        inputVoltage: input.inputVoltage,
        phases: input.phases,
        railMount: input.railMount,
        snappable: input.snappable,
      };
      if (!baseMount || relayBase === null || mountedDepth === null) {
        const attributes: RelayAttributes = {
          baseMount: false,
          relay,
          base: null,
          mountedDepth: null,
          baseRailEdgeOffset: null,
        };
        return { ...base, ...electricalColumns, ...relay, railEdgeOffset: offset, attributes };
      }
      const outline = relayOutline(relay, relayBase);
      const attributes: RelayAttributes = {
        baseMount: true,
        relay,
        base: relayBase,
        mountedDepth,
        baseRailEdgeOffset: offset,
      };
      return {
        ...base,
        ...electricalColumns,
        width: outline.width,
        height: outline.height,
        depth: mountedDepth,
        railEdgeOffset: offset === null ? null : offset + outline.baseTop,
        attributes,
      };
    }
    case "TERMINAL_BLOCK":
    case "GROUND_TERMINAL":
      return {
        ...base,
        height: input.height,
        width: input.width,
        depth: input.depth,
        railMount: true,
        railEdgeOffset: input.railEdgeOffset,
        snappable: input.snappable,
      };
    case "GUTTER":
      return { ...base, height: 0, width: input.width, depth: input.depth };
  }
}

// ── Output ──

export const ComponentParams = IdParams;

/** A catalog row as the API returns it. `attributes` matches the kind (see the *Attributes schemas). */
export const Component = z.object({
  id: Id,
  kind: ComponentKind,
  typeId: Id.nullable(),
  manufacturer: z.string(),
  partNumber: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  inputVoltage: z.string().nullable(),
  phases: z.union([z.literal(1), z.literal(3)]).nullable(),
  /** Bounding box as mounted. Rails and gutters: height 0, the length is set per placement. */
  height: NonNegativeUnits,
  width: PositiveUnits,
  depth: NonNegativeUnits,
  railMount: z.boolean(),
  railEdgeOffset: NonNegativeUnits.nullable(),
  snappable: z.boolean(),
  expandable: z.boolean(),
  attributes: z.record(z.string(), z.json()),
  imagePath: z.string().nullable(),
  active: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Component = z.infer<typeof Component>;

/** GET /api/components: every row with its type name and whether anything uses it. */
export const ComponentListItem = Component.extend({
  type: z.string().nullable(),
  inUse: z.boolean(),
});
export type ComponentListItem = z.infer<typeof ComponentListItem>;
export const ComponentList = z.array(ComponentListItem);

/** What an opening shows about the component mounted in it. */
export const ComponentRef = Component.pick({
  id: true,
  kind: true,
  manufacturer: true,
  partNumber: true,
  code: true,
  description: true,
});
export type ComponentRef = z.infer<typeof ComponentRef>;

/** Kinds that can be mounted in a round hole on a cabinet face (pushbuttons, pilot lights…). */
export const HOLE_MOUNT_KINDS = ["STANDARD", "SAFETY", "FUSE"] as const satisfies ComponentKind[];
export const canMountInHole = (kind: ComponentKind) =>
  (HOLE_MOUNT_KINDS as readonly ComponentKind[]).includes(kind);

/** Levels of a terminal (ground terminals: always 1; other kinds: 0). */
export function terminalLevels(c: { kind: ComponentKind; attributes: unknown }): number {
  if (c.kind === "GROUND_TERMINAL") return 1;
  if (c.kind !== "TERMINAL_BLOCK") return 0;
  const parsed = TerminalBlockAttributes.safeParse(c.attributes);
  return parsed.success ? parsed.data.levels : 1;
}

/** Stock length of a rail or gutter (null for other kinds). */
export function stockLength(c: { kind: ComponentKind; attributes: unknown }): number | null {
  if (c.kind !== "RAIL" && c.kind !== "GUTTER") return null;
  const parsed = RailAttributes.safeParse(c.attributes);
  return parsed.success ? parsed.data.stockLength : DEFAULT_STOCK_LENGTH;
}

// ── Cabinet and component types (lookup lists) ──

/** A row of a type list (cabinet types or component types). */
export const CatalogType = z.object({
  id: Id,
  name: z.string(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  /** Component types only: the fill colour of their parts in the editor (null: the kind default). */
  fillColor: z.string().nullable(),
});
export type CatalogType = z.infer<typeof CatalogType>;
export const CatalogTypeListItem = CatalogType.extend({ inUse: z.boolean() });
export type CatalogTypeListItem = z.infer<typeof CatalogTypeListItem>;
export const CatalogTypeList = z.array(CatalogTypeListItem);

export const CatalogTypeKind = z.enum(["cabinet-types", "component-types"]);
export type CatalogTypeKind = z.infer<typeof CatalogTypeKind>;

const TypeName = Text(50);
export const CreateCatalogTypeInput = z.object({
  name: TypeName,
  sortOrder: z.number().int().min(0).max(9999).optional(),
  /** Component types only. */
  fillColor: HexColor.nullable().optional(),
});
export type CreateCatalogTypeInput = z.infer<typeof CreateCatalogTypeInput>;

export const UpdateCatalogTypeInput = z
  .strictObject({
    name: TypeName,
    sortOrder: z.number().int().min(0).max(9999),
    active: z.boolean(),
    /** Component types only; null clears it. */
    fillColor: HexColor.nullable(),
  })
  .partial()
  .refine((t) => Object.keys(t).length > 0, "Nothing to update");
export type UpdateCatalogTypeInput = z.infer<typeof UpdateCatalogTypeInput>;

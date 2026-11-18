import {
  DEFAULT_TERMINAL_COLOR,
  footprint,
  formatLength,
  freeMove,
  hasWarning,
  isProfile,
  isStrip,
  terminalLevels,
  placementBox,
  railChain,
  snapMove,
  boxesOverlap,
  snapToGrid,
  toMm,
  type Guide,
  type LayoutChange,
  type LayoutWarnings,
  type Placement,
} from "@cabinet-planner/shared";
import { Box, useComputedColorScheme, useMantineTheme } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useRef, useState, type DragEvent } from "react";
import { Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { kindColors, textOn } from "./colors";
import { followMoves, movesToChanges, slideWithChain, withMoves, type MovePatch } from "./moves";

/** MIME type of a catalog part dragged from the part list. */
export const PART_DRAG_TYPE = "application/x-cabinet-planner-component";

/** Grid step: 5 mm. */
export const GRID = 50;
/** Shortest length a rail or gutter can be dragged to: 10 mm. */
const MIN_LENGTH = 100;
const PAD = 24;
/** "Near" for snapping, in screen pixels (no setting: guidelines/platen-editor.md). */
const SNAP_PX = 8;

/** Middle mouse button: `MouseEvent.button` value, and its bit in `MouseEvent.buttons`. */
const MIDDLE = 1;
const MIDDLE_BUTTONS = 4;
// Left drags as usual; middle drags one part on its own (and pans from the background).
Konva.dragButtons = [0, MIDDLE];

/** Keys and buttons held during a part drag. */
interface DragKeys {
  /** Alt: no snapping, off the rail. */
  alt: boolean;
  /** Middle button: only this part moves (not its chain or the rest of the selection). */
  single: boolean;
}

interface Drag {
  /** The dragged part, plus the rest of the selection following it. */
  moves: Map<number, MovePatch>;
  guides: Guide[];
  /** The placements when the drag started; the drag preview ends once they change. */
  base: Placement[];
  dropped: boolean;
}

interface View {
  scale: number; // px per 0.1 mm
  x: number;
  y: number;
}

interface Props {
  platen: { width: number; height: number };
  placements: Placement[];
  warnings: Map<number, LayoutWarnings>;
  /** Selected placement ids. */
  selection: number[];
  onSelectionChange: (ids: number[]) => void;
  editable: boolean;
  gridSnap: boolean;
  /** Bumped by the "Fit" button to reset zoom and pan. */
  fitSignal: number;
  /** A drag or a length handle ended: the changes to save (one undo step). */
  onEdit: (changes: LayoutChange[]) => void;
  /** A part was dropped from the list at this point (platen units). */
  onDropPart: (componentId: number, at: { x: number; y: number }) => void;
}

/**
 * The platen to scale. Stage coordinates are platen units (0.1 mm, top-left origin, +y down);
 * the view transform does the zoom and pan. Wheel zooms around the pointer, dragging the
 * background pans, Shift + drag on the background selects an area. Click selects, Shift /
 * Ctrl + click adds or removes. Dragged parts snap (snapMove: rails, side by side, alignment,
 * grid); Alt turns snapping off. The rest of the selection follows the dragged part, and parts
 * on a rail follow it.
 */
export function LayoutCanvas(props: Props) {
  const { platen, placements, warnings, selection, onSelectionChange, editable, gridSnap } = props;
  const { ref, width, height } = useElementSize();
  const stageRef = useRef<Konva.Stage>(null);
  const theme = useMantineTheme();
  const colors = kindColors(theme, useComputedColorScheme("light") === "dark");
  const [fitted, setFitted] = useState<{ key: string; view: View | null }>({
    key: "",
    view: null,
  });

  // Fit the platen in the box once the box has a size, when the platen changes, and on "Fit".
  // (Adjusted during render rather than in an effect, to avoid a second paint.)
  const ready = width > 0 && height > 0;
  const fitKey = `${props.fitSignal}|${platen.width}|${platen.height}`;
  if (ready && fitted.key !== fitKey) {
    const scale = Math.min((width - 2 * PAD) / platen.width, (height - 2 * PAD) / platen.height);
    setFitted({
      key: fitKey,
      view: {
        scale,
        x: (width - platen.width * scale) / 2,
        y: (height - platen.height * scale) / 2,
      },
    });
  }
  const view = fitted.key === fitKey ? fitted.view : null;
  const setView = (v: View) => setFitted({ key: fitKey, view: v });

  const px = view ? 1 / view.scale : 1; // one screen pixel in platen units
  const snap = (v: number, alt: boolean) =>
    gridSnap && !alt ? snapToGrid(v, GRID) : Math.round(v);

  // While dragging, the layout is drawn with the drag applied (parts on a dragged rail come
  // along). After the drop the preview stays until the saved change shows up, so nothing jumps.
  const [drag, setDrag] = useState<Drag | null>(null);
  if (drag?.dropped && drag.base !== placements) setDrag(null);
  const shown = drag ? withMoves(placements, drag.moves) : placements;

  // Shift + drag on the background: a selection rectangle (platen units).
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const bandBox = band && {
    x: Math.min(band.x0, band.x1),
    y: Math.min(band.y0, band.y1),
    width: Math.abs(band.x1 - band.x0),
    height: Math.abs(band.y1 - band.y0),
  };

  const toggle = (id: number) =>
    onSelectionChange(
      selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id],
    );

  const dragMove = (p: Placement, node: Konva.Node, { alt, single }: DragKeys) => {
    const box = placementBox(shown.find((s) => s.id === p.id) ?? p); // as drawn now
    const centre = { x: node.x() + box.width / 2, y: node.y() + box.height / 2 };
    // Its chain (the parts touching it in a row on its rail) comes along, unless it's moved on
    // its own (middle button) or freely (Alt). It doesn't snap against parts that move with it.
    const chain = alt || single ? [] : railChain(placements, p.id);
    const r = alt
      ? freeMove(p, centre)
      : snapMove(
          p,
          centre,
          placements.filter((o) => !chain.includes(o.id)),
          { tolerance: SNAP_PX * px, grid: gridSnap ? GRID : null, platen },
        );
    if (chain.length > 0 && r.railId === p.railId)
      Object.assign(r, slideWithChain(p, r, chain, placements));
    node.position({ x: r.x, y: r.y });
    // The chain and the rest of the selection follow by the same distance.
    const others = single
      ? []
      : placements.filter(
          (o) =>
            o.id !== p.id &&
            (chain.includes(o.id) || (selection.includes(p.id) && selection.includes(o.id))),
        );
    const moves = followMoves(others, r.x - p.x, r.y - p.y, placements, platen, [p.id]);
    moves.set(p.id, {
      x: r.x,
      y: r.y,
      rotation: r.rotation,
      railId: p.part.railMount ? r.railId : p.railId,
    });
    setDrag({ moves, guides: r.guides, base: drag?.base ?? placements, dropped: false });
  };

  const dragEnd = () => {
    if (!drag || drag.dropped) return;
    const changes = movesToChanges(drag.moves, placements);
    if (changes.length === 0) return setDrag(null);
    props.onEdit(changes);
    setDrag({ ...drag, guides: [], dropped: true });
  };

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!view || !pointer) return;
    const factor = e.evt.deltaY < 0 ? 1.15 : 1 / 1.15;
    const scale = Math.min(Math.max(view.scale * factor, 0.005), 2);
    // Keep the point under the cursor where it is.
    const at = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    setView({ scale, x: pointer.x - at.x * scale, y: pointer.y - at.y * scale });
  };

  const onDrop = (e: DragEvent) => {
    const id = Number(e.dataTransfer.getData(PART_DRAG_TYPE));
    const stage = stageRef.current;
    if (!editable || !id || !stage) return;
    e.preventDefault();
    stage.setPointersPositions(e.nativeEvent);
    const at = stage.getRelativePointerPosition();
    if (at) props.onDropPart(id, at);
  };

  // Grid lines every 10 mm, stronger every 100 mm.
  const gridLines = [];
  if (view && view.scale * 100 >= 4) {
    for (let x = 100; x < platen.width; x += 100) {
      gridLines.push(
        <Line
          key={`x${x}`}
          points={[x, 0, x, platen.height]}
          stroke={x % 1000 === 0 ? colors.gridMajor : colors.grid}
          strokeWidth={px}
          listening={false}
        />,
      );
    }
    for (let y = 100; y < platen.height; y += 100) {
      gridLines.push(
        <Line
          key={`y${y}`}
          points={[0, y, platen.width, y]}
          stroke={y % 1000 === 0 ? colors.gridMajor : colors.grid}
          strokeWidth={px}
          listening={false}
        />,
      );
    }
  }

  // Rails and gutters behind the other parts (guidelines/platen-editor.md layers).
  const ordered = [
    ...shown.filter((p) => isProfile(p.part.kind)),
    ...shown.filter((p) => !isProfile(p.part.kind)),
  ];
  const original = (id: number) => placements.find((p) => p.id === id);

  return (
    <Box
      ref={ref}
      h="100%"
      bg={colors.background}
      style={{ borderRadius: 4, overflow: "hidden" }}
      onDragOver={(e) => {
        if (editable && e.dataTransfer.types.includes(PART_DRAG_TYPE)) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      {ready && view && (
        <Stage
          ref={stageRef}
          width={width}
          height={height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable={band === null}
          onWheel={onWheel}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) {
              setView({ ...view, x: e.target.x(), y: e.target.y() });
            }
          }}
          onMouseDown={(e) => {
            const stage = stageRef.current;
            if (!stage || (e.target !== stage && e.target.name() !== "platen")) return;
            if (e.evt.button === MIDDLE) {
              e.evt.preventDefault(); // middle drag on the background just pans
              return;
            }
            if (e.evt.shiftKey) {
              // Start a selection rectangle instead of panning.
              stage.draggable(false);
              const at = stage.getRelativePointerPosition();
              if (at) setBand({ x0: at.x, y0: at.y, x1: at.x, y1: at.y });
            } else if (!e.evt.ctrlKey && !e.evt.metaKey) {
              onSelectionChange([]);
            }
          }}
          onMouseMove={() => {
            const at = stageRef.current?.getRelativePointerPosition();
            if (band && at) setBand({ ...band, x1: at.x, y1: at.y });
          }}
          onMouseUp={() => {
            if (!bandBox) return;
            const hit = placements
              .filter((p) => boxesOverlap(placementBox(p), bandBox))
              .map((p) => p.id);
            onSelectionChange([...new Set([...selection, ...hit])]);
            setBand(null);
          }}
        >
          <Layer>
            <Rect
              name="platen"
              width={platen.width}
              height={platen.height}
              fill={colors.platen}
              stroke={colors.platenEdge}
              strokeWidth={2 * px}
            />
            {gridLines}
            <Text
              x={0}
              y={platen.height + 6 * px}
              width={platen.width}
              align="center"
              text={`Platen ${toMm(platen.width)} × ${toMm(platen.height)} mm`}
              fontSize={12 * px}
              fill={colors.text}
              listening={false}
            />
          </Layer>
          <Layer>
            {ordered.map((p) => (
              <PlacedShape
                key={p.id}
                placement={p}
                warn={hasWarning(warnings.get(p.id))}
                selected={selection.includes(p.id)}
                lengthHandle={editable && selection.length === 1 && selection[0] === p.id}
                draggable={editable && !p.locked}
                px={px}
                colors={colors}
                snap={snap}
                onPress={(modifier) => {
                  if (modifier) toggle(p.id);
                  else if (!selection.includes(p.id)) onSelectionChange([p.id]);
                }}
                onClick={(modifier) => {
                  // A plain click (no drag) on a part of a bigger selection selects just it.
                  if (!modifier && selection.length > 1) onSelectionChange([p.id]);
                }}
                onDragMove={(node, keys) => dragMove(original(p.id) ?? p, node, keys)}
                onDragEnd={dragEnd}
                onLength={(length) => props.onEdit([{ op: "update", id: p.id, patch: { length } }])}
              />
            ))}
            {bandBox && (
              <Rect
                {...bandBox}
                stroke={colors.selected}
                strokeWidth={px}
                dash={[4 * px, 3 * px]}
                fill={`${colors.selected}22`}
                listening={false}
              />
            )}
            {drag?.guides.map((g) => (
              <Line
                key={`${g.axis}${g.at}`}
                points={
                  g.axis === "x" ? [g.at, 0, g.at, platen.height] : [0, g.at, platen.width, g.at]
                }
                stroke={colors.guide}
                strokeWidth={px}
                dash={[4 * px, 3 * px]}
                listening={false}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </Box>
  );
}

function PlacedShape({
  placement: p,
  warn,
  selected,
  lengthHandle: showLengthHandle,
  draggable,
  px,
  colors,
  snap,
  onPress,
  onClick,
  onDragMove,
  onDragEnd,
  onLength,
}: {
  placement: Placement;
  warn: boolean;
  selected: boolean;
  /** Only when this part alone is selected. */
  lengthHandle: boolean;
  draggable: boolean;
  px: number;
  colors: ReturnType<typeof kindColors>;
  snap: (v: number, alt: boolean) => number;
  /** Mouse down; `modifier`: Shift / Ctrl / Cmd held. */
  onPress: (modifier: boolean) => void;
  onClick: (modifier: boolean) => void;
  onDragMove: (node: Konva.Node, keys: DragKeys) => void;
  onDragEnd: () => void;
  onLength: (length: number) => void;
}) {
  const box = placementBox(p);
  const base = colors.kind[p.part.kind];
  const stroke = selected ? colors.selected : warn ? colors.warn : base;
  const vertical = p.rotation === 90;
  // Rails and gutters add their cut length: "TS35x7.5 · 1200 mm / 47.24 in".
  const caption = isProfile(p.part.kind)
    ? `${p.tag ?? p.part.partNumber} · ${formatLength(footprint(p.part, p.length).width)}`
    : (p.tag ?? p.part.partNumber);
  const terminal =
    p.part.kind === "TERMINAL_BLOCK" ? colors.terminal[p.color ?? DEFAULT_TERMINAL_COLOR] : null;
  // Caption frame: the text runs along `along`, and `across` is the room for its height.
  // Rails and gutters: along their length (turned with them).
  // Every other part: along its own height axis, reading bottom to top at 0° (90° counterclockwise,
  // so long part numbers fit narrow parts side by side on a rail); at 90° that is left to right.
  const captionVertical = isProfile(p.part.kind) ? vertical : !vertical;
  const along = captionVertical ? box.height : box.width;
  const across = captionVertical ? box.width : box.height;
  const captionFrame = !captionVertical
    ? { x: 0, y: 0, rotation: 0 }
    : isProfile(p.part.kind)
      ? { x: box.width, y: 0, rotation: 90 }
      : { x: 0, y: box.height, rotation: -90 };
  // Strips get a second line with the number of terminals, under a divider.
  const strip = isStrip(p.part);
  // Screen size cap: 11 px on rails and gutters, 13 px on the rotated part captions. A rail's
  // caption is smaller (0.3 of its width) and sits ~20% from its top edge (its right edge when
  // vertical), clear of the dashed centre line.
  const rail = p.part.kind === "RAIL";
  const fontSize = Math.min(
    (isProfile(p.part.kind) ? 11 : 13) * px,
    across * (strip || rail ? 0.3 : 0.4),
  );
  const captionBand = rail
    ? { y: across * 0.22 - fontSize / 2, height: fontSize }
    : { y: 0, height: across };
  const showText = fontSize >= 6 * px;
  // Fill: the type's colour when it has one (the kind keeps the outline), else a tint of the kind.
  const typeFill = warn ? null : p.part.fillColor;
  const textFill = terminal?.text ?? (typeFill ? textOn(typeFill) : colors.text);
  // The far end of a rail or gutter: drag it to cut the length.
  const lengthHandle = showLengthHandle && draggable && isProfile(p.part.kind) && p.length !== null;
  const handle = 10 * px;

  const setCursor = (e: KonvaEventObject<MouseEvent>, cursor: string) => {
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = cursor;
  };

  return (
    <>
      <Group
        x={box.x}
        y={box.y}
        draggable={draggable}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          if (e.evt.button === MIDDLE) e.evt.preventDefault(); // no browser autoscroll
          onPress(e.evt.button === 0 && (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey));
        }}
        onClick={(e) => onClick(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey)}
        onTap={() => onPress(false)}
        onDragMove={(e) =>
          onDragMove(e.target, {
            alt: e.evt.altKey,
            // Middle button held (and not the left one): this part on its own.
            single: (e.evt.buttons & MIDDLE_BUTTONS) !== 0 && (e.evt.buttons & 1) === 0,
          })
        }
        onDragEnd={(e) => {
          e.cancelBubble = true; // not a stage pan
          onDragEnd();
        }}
        onMouseEnter={(e) => draggable && setCursor(e, "move")}
        onMouseLeave={(e) => setCursor(e, "default")}
      >
        {p.part.kind === "GROUND_TERMINAL" ? (
          <>
            <Rect width={box.width} height={box.height / 2} fill={colors.groundGreen} />
            <Rect
              y={box.height / 2}
              width={box.width}
              height={box.height / 2}
              fill={colors.groundYellow}
            />
          </>
        ) : terminal ? (
          <Rect width={box.width} height={box.height} fill={terminal.fill} />
        ) : (
          <Rect
            width={box.width}
            height={box.height}
            fill={typeFill ? `${typeFill}cc` : `${warn ? colors.warn : base}33`}
          />
        )}
        {isStrip(p.part) && (
          <StripDetails placement={p} vertical={vertical} px={px} colors={colors} />
        )}
        {p.part.kind === "RAIL" && (
          <Line
            points={
              vertical
                ? [box.width / 2, 0, box.width / 2, box.height]
                : [0, box.height / 2, box.width, box.height / 2]
            }
            stroke={base}
            strokeWidth={px}
            dash={[6 * px, 4 * px]}
          />
        )}
        <Rect
          width={box.width}
          height={box.height}
          stroke={stroke}
          strokeWidth={(selected ? 2.5 : 1.5) * px}
          dash={p.locked ? [4 * px, 3 * px] : undefined}
        />
        {showText && (
          <Group {...captionFrame} listening={false}>
            {strip ? (
              <>
                <Text
                  width={along}
                  height={across / 2 - fontSize * 0.3}
                  align="center"
                  verticalAlign="bottom"
                  text={caption}
                  fontSize={fontSize}
                  fill={textFill}
                  wrap="none"
                  ellipsis
                />
                <Line
                  points={[along * 0.1, across / 2, along * 0.9, across / 2]}
                  stroke={textFill}
                  strokeWidth={px}
                  opacity={0.7}
                />
                <Text
                  y={across / 2 + fontSize * 0.3}
                  width={along}
                  height={across / 2 - fontSize * 0.3}
                  align="center"
                  verticalAlign="top"
                  text={`${p.count} pcs`}
                  fontSize={fontSize}
                  fill={textFill}
                  wrap="none"
                  ellipsis
                />
              </>
            ) : (
              <Text
                {...captionBand}
                width={along}
                align="center"
                verticalAlign="middle"
                text={caption}
                fontSize={fontSize}
                fill={textFill}
                wrap="none"
                ellipsis
              />
            )}
          </Group>
        )}
      </Group>
      {lengthHandle && (
        <Rect
          x={vertical ? box.x + box.width / 2 - handle / 2 : box.x + box.width - handle / 2}
          y={vertical ? box.y + box.height - handle / 2 : box.y + box.height / 2 - handle / 2}
          width={handle}
          height={handle}
          fill={colors.selected}
          draggable
          onMouseEnter={(e) => setCursor(e, vertical ? "ns-resize" : "ew-resize")}
          onMouseLeave={(e) => setCursor(e, "default")}
          onDragMove={(e) => {
            // Stay on the profile's axis.
            if (vertical) e.target.x(box.x + box.width / 2 - handle / 2);
            else e.target.y(box.y + box.height / 2 - handle / 2);
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            const end = vertical
              ? e.target.y() + handle / 2 - box.y
              : e.target.x() + handle / 2 - box.x;
            onLength(Math.max(MIN_LENGTH, snap(end, e.evt.altKey)));
          }}
        />
      )}
    </>
  );
}

/**
 * Inside a terminal strip: a divider between terminals (when they're far enough apart to
 * see), a bar across the strip for each bridged level, and the group label outside the
 * strip's top edge (its right edge on a vertical rail, where the top edge faces).
 */
function StripDetails({
  placement: p,
  vertical,
  px,
  colors,
}: {
  placement: Placement;
  vertical: boolean;
  px: number;
  colors: ReturnType<typeof kindColors>;
}) {
  const box = placementBox(p);
  const pitch = p.part.width;
  const across = vertical ? box.width : box.height;
  const along = vertical ? box.height : box.width;
  const levels = Math.max(terminalLevels(p.part), 1);
  const labelSize = 11 * px;

  // One line between each pair of terminals, across the strip, in a colour that shows on the
  // strip's housing colour (dark on light grey / beige / yellow / green-yellow, white on dark).
  const lineColor =
    p.part.kind === "TERMINAL_BLOCK"
      ? colors.terminal[p.color ?? DEFAULT_TERMINAL_COLOR].text
      : "#222";
  const dividers = [];
  if (pitch >= 2 * px) {
    for (let i = 1; i < p.count; i++) {
      const at = i * pitch;
      dividers.push(
        <Line
          key={i}
          points={vertical ? [0, at, box.width, at] : [at, 0, at, box.height]}
          stroke={lineColor}
          opacity={0.75}
          strokeWidth={px}
          listening={false}
        />,
      );
    }
  }

  // Level 1 nearest the part's top edge; a bar 2 mm (at least 2 px) thick.
  const thickness = Math.max(20, 2 * px);
  const bridges = p.bridgedLevels.map((level) => {
    const offset = (across * (level - 0.5)) / levels - thickness / 2;
    return (
      <Rect
        key={level}
        x={vertical ? across - offset - thickness : 0}
        y={vertical ? 0 : offset}
        width={vertical ? thickness : along}
        height={vertical ? along : thickness}
        fill={colors.bridge}
        listening={false}
      />
    );
  });

  return (
    <>
      {bridges}
      {dividers}
      {p.groupLabel && (
        <Text
          x={vertical ? box.width + labelSize * 1.4 : 0}
          y={vertical ? 0 : -labelSize * 1.4}
          width={along}
          rotation={vertical ? 90 : 0}
          align="center"
          text={p.groupLabel}
          fontSize={labelSize}
          fontStyle="bold"
          fill={colors.text}
          listening={false}
        />
      )}
    </>
  );
}

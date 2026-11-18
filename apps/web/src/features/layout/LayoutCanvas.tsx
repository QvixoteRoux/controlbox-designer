import {
  hasWarning,
  isProfile,
  placementBox,
  snapToGrid,
  toMm,
  type LayoutWarnings,
  type Placement,
} from "@cabinet-planner/shared";
import { Box, useComputedColorScheme, useMantineTheme } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useRef, useState, type DragEvent } from "react";
import { Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { kindColors } from "./colors";

/** MIME type of a catalog part dragged from the part list. */
export const PART_DRAG_TYPE = "application/x-cabinet-planner-component";

/** Grid step: 5 mm. */
export const GRID = 50;
/** Shortest length a rail or gutter can be dragged to: 10 mm. */
const MIN_LENGTH = 100;
const PAD = 24;

interface View {
  scale: number; // px per 0.1 mm
  x: number;
  y: number;
}

interface Props {
  platen: { width: number; height: number };
  placements: Placement[];
  warnings: Map<number, LayoutWarnings>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  editable: boolean;
  gridSnap: boolean;
  /** Bumped by the "Fit" button to reset zoom and pan. */
  fitSignal: number;
  onMove: (id: number, x: number, y: number) => void;
  onLength: (id: number, length: number) => void;
  /** A part was dropped from the list at this point (platen units). */
  onDropPart: (componentId: number, at: { x: number; y: number }) => void;
}

/**
 * The platen to scale. Stage coordinates are platen units (0.1 mm, top-left origin, +y down);
 * the view transform does the zoom and pan. Wheel zooms around the pointer, dragging the
 * background pans, parts drag with grid snap (Alt turns it off).
 */
export function LayoutCanvas(props: Props) {
  const { platen, placements, warnings, selectedId, onSelect, editable, gridSnap } = props;
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
    ...placements.filter((p) => isProfile(p.part.kind)),
    ...placements.filter((p) => !isProfile(p.part.kind)),
  ];

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
          draggable
          onWheel={onWheel}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) {
              setView({ ...view, x: e.target.x(), y: e.target.y() });
            }
          }}
          onMouseDown={(e) => {
            if (e.target === stageRef.current || e.target.name() === "platen") onSelect(null);
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
                selected={p.id === selectedId}
                draggable={editable && !p.locked}
                px={px}
                colors={colors}
                snap={snap}
                onSelect={() => onSelect(p.id)}
                onMove={(x, y) => props.onMove(p.id, x, y)}
                onLength={(length) => props.onLength(p.id, length)}
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
  draggable,
  px,
  colors,
  snap,
  onSelect,
  onMove,
  onLength,
}: {
  placement: Placement;
  warn: boolean;
  selected: boolean;
  draggable: boolean;
  px: number;
  colors: ReturnType<typeof kindColors>;
  snap: (v: number, alt: boolean) => number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onLength: (length: number) => void;
}) {
  const box = placementBox(p);
  const base = colors.kind[p.part.kind];
  const stroke = selected ? colors.selected : warn ? colors.warn : base;
  const vertical = p.rotation === 90;
  const caption = p.tag ?? p.part.partNumber;
  const fontSize = Math.min(11 * px, (vertical ? box.width : box.height) * 0.4);
  const showText = fontSize >= 6 * px;
  // The far end of a rail or gutter: drag it to cut the length.
  const lengthHandle = selected && draggable && isProfile(p.part.kind) && p.length !== null;
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
          onSelect();
        }}
        onTap={onSelect}
        onDragMove={(e) => {
          const alt = e.evt.altKey;
          e.target.x(snap(e.target.x(), alt));
          e.target.y(snap(e.target.y(), alt));
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true; // not a stage pan
          onMove(Math.round(e.target.x()), Math.round(e.target.y()));
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
        ) : (
          <Rect width={box.width} height={box.height} fill={`${warn ? colors.warn : base}33`} />
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
          <Text
            width={vertical ? box.height : box.width}
            height={vertical ? box.width : box.height}
            x={vertical ? box.width : 0}
            rotation={vertical ? 90 : 0}
            align="center"
            verticalAlign="middle"
            text={caption}
            fontSize={fontSize}
            fill={colors.text}
            wrap="none"
            ellipsis
            listening={false}
          />
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

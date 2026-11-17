import { db } from "./helpers.js";

// Revision content inserted straight into the DB, for testing release and copy before the
// cabinet and editor features exist.

/** A cabinet with a platen holding a DIN rail and a contactor snapped to it, plus three openings. */
export async function addCabinetContent(revisionId: number) {
  const type = await db.cabinetType.create({ data: { name: `Control-${revisionId}` } });
  const rail = await db.component.create({
    data: {
      kind: "RAIL",
      manufacturer: "Acme",
      partNumber: `RAIL-${revisionId}`,
      height: 0,
      width: 350,
      depth: 75,
      attributes: { stockLength: 20000 },
    },
  });
  const contactor = await db.component.create({
    data: {
      manufacturer: "Acme",
      partNumber: `K-${revisionId}`,
      height: 900,
      width: 450,
      depth: 800,
      railMount: true,
      railEdgeOffset: 200,
    },
  });
  const pushbutton = await db.component.create({
    data: {
      manufacturer: "Acme",
      partNumber: `PB-${revisionId}`,
      height: 300,
      width: 300,
      depth: 400,
    },
  });
  const gland = await db.cableGland.create({
    data: { size: `M20-${revisionId}`, holeDiameter: 205 },
  });

  const cabinet = await db.cabinet.create({
    data: {
      revisionId,
      number: 1,
      typeId: type.id,
      material: "METAL",
      height: 6000,
      width: 4000,
      depth: 2000,
      mainVoltage: "400VAC",
      otherVoltages: ["24VDC"],
    },
  });
  const platen = await db.platen.create({
    data: { cabinetId: cabinet.id, height: 5500, width: 3500 },
  });
  const railPlacement = await db.placement.create({
    data: { platenId: platen.id, componentId: rail.id, x: 100, y: 500, length: 3000 },
  });
  const onRail = await db.placement.create({
    data: {
      platenId: platen.id,
      componentId: contactor.id,
      x: 400,
      y: 300,
      railId: railPlacement.id,
      tag: "-K1",
    },
  });
  await db.cabinetOpening.createMany({
    data: [
      {
        cabinetId: cabinet.id,
        kind: "WINDOW",
        face: "FRONT",
        x: 0,
        y: 1000,
        width: 2000,
        height: 1000,
      },
      {
        cabinetId: cabinet.id,
        kind: "CABLE_GLAND",
        face: "BOTTOM",
        x: -500,
        y: 0,
        glandId: gland.id,
      },
      {
        cabinetId: cabinet.id,
        kind: "ROUND_HOLE",
        face: "FRONT",
        x: 0,
        y: -1500,
        diameter: 225,
        componentId: pushbutton.id,
      },
    ],
  });

  return { cabinet, platen, rail, contactor, pushbutton, gland, railPlacement, onRail };
}

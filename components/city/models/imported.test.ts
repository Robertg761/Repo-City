import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { desaturate } from "../palette";
import { mergeParts, triangleCount } from "./props/geometry";
import { SURFACE_ATTRIBUTE } from "../textures/surface-types";
import { LADDER_PIVOT, blenderFireParts } from "./vehicles/emergency";
import { TRUCK_SPECS } from "./vehicles/shapes";
import { MODEL } from "./vehicles/fireEngine.model";
import { importedOrigin } from "./imported";

const shade = (hex: string) => desaturate(hex, 0.2);

describe("the Blender fire engine (spike)", () => {
  it("stands its ladder on the procedural engine's pivot", () => {
    importedOrigin(MODEL, "Ladder").forEach((v, i) => expect(v).toBeCloseTo(LADDER_PIVOT[i], 3));
    // Where the geometry actually lands: the raised ladder rises from the
    // turntable over the rear axle, well above the truck's roof.
    const ladder = new Box3().setFromBufferAttribute(
      mergeParts(blenderFireParts(shade, 0).slice(-1)).getAttribute("position") as never,
    );
    expect(ladder.min.y).toBeGreaterThan(1.4);
    expect(ladder.max.y).toBeGreaterThan(5.5);
    expect(ladder.max.z).toBeLessThan(LADDER_PIVOT[2] + 0.6);
  });

  it("fills the procedural engine's footprint", () => {
    const spec = TRUCK_SPECS.engine;
    const box = new Box3().setFromBufferAttribute(
      mergeParts(blenderFireParts(shade, 0).slice(0, -1)).getAttribute("position") as never,
    );
    expect(Math.abs(box.min.y)).toBeLessThan(0.02);
    // Bumpers, the rear step and the mirrors stand a little proud of the body.
    expect(box.max.z - spec.length / 2).toBeGreaterThan(0);
    expect(box.max.z - spec.length / 2).toBeLessThan(0.2);
    expect(-spec.length / 2 - box.min.z).toBeLessThan(0.3);
    expect(box.max.x).toBeLessThan(spec.width / 2 + 0.25);
  });

  it("merges with colours, baked occlusion and surface ids", () => {
    const merged = mergeParts(blenderFireParts(shade, 0.4));
    expect(triangleCount(merged)).toBeGreaterThan(3000);
    expect(merged.hasAttribute(SURFACE_ATTRIBUTE)).toBe(true);
    const color = merged.getAttribute("color");
    let dark = 0;
    for (let i = 0; i < color.count; i++) if (color.getX(i) < 0.05) dark++;
    expect(dark / color.count).toBeLessThan(0.5);
  });
});

describe("the Blender fire engine in an incident (spike)", () => {
  it("merges alongside three.js primitives", async () => {
    const { BoxGeometry } = await import("three");
    const merged = mergeParts([...blenderFireParts(shade, 0), { geometry: new BoxGeometry(1, 1, 1), color: "#ff0000" }]);
    expect(triangleCount(merged)).toBeGreaterThan(3000);
  });
});

describe("the Blender fire station (spike)", () => {
  it("parks an engine per open bay, each with two roof lamps", async () => {
    const { blenderFire } = await import("./landmarks/fire");
    expect(blenderFire(1).beacons).toHaveLength(0);
    expect(blenderFire(2).beacons).toHaveLength(2);
    expect(blenderFire(3).beacons).toHaveLength(4);
  });

  it("stands in the procedural station's natural size", async () => {
    const { blenderFire, fireStation } = await import("./landmarks/fire");
    const { extentOf } = await import("./landmarks/assembly");
    for (const level of [1, 2, 3]) {
      const [w, h, d] = extentOf(blenderFire(level).slots);
      const [pw, , pd] = extentOf(fireStation(level).slots);
      expect(Math.abs(w - pw)).toBeLessThan(0.5);
      expect(Math.abs(d - pd)).toBeLessThan(0.5);
      expect(h).toBeLessThan(9.6);
    }
  });

  it("paints every slot through vertex colours and surface ids", async () => {
    const { blenderFire } = await import("./landmarks/fire");
    for (const geometry of Object.values(blenderFire(3).slots)) {
      expect(geometry!.hasAttribute("color")).toBe(true);
      expect(geometry!.hasAttribute(SURFACE_ATTRIBUTE)).toBe(true);
    }
  });
});

describe("loading the model data", () => {
  it("tries again after a failed load and keeps what arrived", async () => {
    const { lazyModel, loadModels } = await import("./imported");
    let calls = 0;
    const model = lazyModel("zz-flaky-test-model", async () => {
      calls++;
      if (calls === 1) throw new Error("chunk failed");
      return { DATA: { materials: [], nodes: [], markers: [] } };
    });
    await expect(loadModels()).rejects.toThrow("chunk failed");
    await loadModels();
    expect(calls).toBe(2);
    expect(model.nodes).toEqual([]);
  });
});

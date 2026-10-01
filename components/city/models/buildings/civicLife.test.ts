/**
 * The civic kit's moving parts: a clock hall's four faces and the flag house's
 * flag are left out of the body and placed for the renderer to turn and wave
 * (`civic.ts`, `civicLife.ts`, `civicAnimated.tsx`), on both the lean kit and
 * the near one.
 */
import { describe, expect, it } from "vitest";
import { Object3D, Quaternion, Vector3 } from "three";
import { FLAP_DATA } from "../../flagWave";
import { handTurn } from "../../clockTime";
import { buildCivic, type CivicPalette } from "./civic";
import { civicLifeGeometry } from "./civicLife";

const palette: CivicPalette = {
  wall: [0.9, 0.9, 0.88],
  stone: [0.96, 0.95, 0.92],
  roof: [0.7, 0.76, 0.78],
  accent: [0.5, 0.66, 0.74],
  trim: [0.95, 0.95, 0.94],
  door: [0.35, 0.33, 0.28],
  window: [0.29, 0.33, 0.38],
  metal: [0.6, 0.63, 0.63],
  flag: [0.78, 0.35, 0.24],
  containers: [
    [0.29, 0.53, 0.66],
    [0.71, 0.41, 0.25],
    [0.44, 0.56, 0.42],
  ],
};
const plot = { w: 7, h: 9.8, d: 7 };

describe.each([false, true])("the civic kit's moving parts (near: %s)", (near) => {
  it("leaves the clock hall's hands out of the body and places a clock on each of its four faces", () => {
    const hall = buildCivic("manifest", plot, palette, { models: "blender", near });
    const clocks = hall.life?.clocks ?? [];
    expect(clocks).toHaveLength(4);
    // One on each face of the tower: +z, -z, +x, -x.
    expect(clocks.map((c) => Math.round(((c.yaw + Math.PI * 2) % (Math.PI * 2)) * 100) / 100).sort()).toEqual(
      [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((a) => Math.round(a * 100) / 100).sort(),
    );
    // They share one height and one radius, round the tower.
    expect(new Set(clocks.map((c) => c.at[1].toFixed(3))).size).toBe(1);
    expect(new Set(clocks.map((c) => c.radius.toFixed(3))).size).toBe(1);
    expect(hall.life?.flags).toHaveLength(0);
  });

  it("flies the flag house's flag from its pole's top, with its own scale", () => {
    const house = buildCivic("contributing", plot, palette, { models: "blender", near });
    expect(house.life?.flags).toHaveLength(1);
    expect(house.life?.flags[0].scale).toBeGreaterThan(0);
    expect(house.life?.clocks).toHaveLength(0);
  });

  it("is absent from the procedural build, whose hands and flag are in the body", () => {
    expect(buildCivic("manifest", plot, palette, { models: "procedural" }).life).toBeUndefined();
  });

  it("makes the hands and the cloth in the palette's colours, ready to draw", () => {
    const life = civicLifeGeometry(near, palette);
    expect(life.hands.map((h) => h.kind)).toEqual(near ? ["hour", "minute", "second"] : ["hour", "minute"]);
    for (const hand of life.hands) {
      hand.geometry.computeBoundingBox();
      const box = hand.geometry.boundingBox!;
      expect(box.max.y).toBeGreaterThan(0.3); // pointing at twelve
      expect(box.max.y).toBeLessThanOrEqual(1);
      expect(box.max.z - box.min.z).toBeLessThan(0.1); // flat to the dial
      expect(hand.geometry.getAttribute("color").count).toBeGreaterThan(0);
    }
    const [hour, minute] = life.hands;
    hour.geometry.computeBoundingBox();
    minute.geometry.computeBoundingBox();
    expect(minute.geometry.boundingBox!.max.y).toBeGreaterThan(hour.geometry.boundingBox!.max.y);
    // The cloth carries the wave, held at the pole: its hoist vertices sit at 0.
    const cloth = life.cloth!;
    const data = cloth.getAttribute(FLAP_DATA);
    let held = 0;
    for (let i = 0; i < data.count; i++) if (data.getX(i) === 0) held++;
    expect(held).toBeGreaterThan(0);
  });

  it("reads one time on every face of the tower", () => {
    const hall = buildCivic("manifest", plot, palette, { models: "blender", near });
    const quarter = Math.PI / 2; // a hand at three
    for (const clock of hall.life!.clocks) {
      const face = new Object3D();
      face.rotation.y = clock.yaw;
      const hand = new Object3D();
      face.add(hand);
      face.updateMatrixWorld(true);
      hand.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), handTurn(quarter, face.matrixWorld.determinant() < 0)));
      hand.updateMatrixWorld(true);
      const tip = new Vector3(0, 1, 0).transformDirection(hand.matrixWorld);
      // Three o'clock is on the viewer's right: the way the face looks, turned a quarter clockwise from above.
      const looking = new Vector3(Math.sin(clock.yaw), 0, Math.cos(clock.yaw));
      const right = new Vector3(0, 1, 0).cross(looking);
      expect(tip.distanceTo(right)).toBeLessThan(1e-9);
      // And it is on the side of the tower the face is on, going round: the face's outward normal is not the hand's direction.
      expect(Math.abs(tip.dot(looking))).toBeLessThan(1e-9);
    }
  });
});

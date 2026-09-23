import { describe, expect, it } from "vitest";
import { overviewFraming } from "./entities";
import {
  FADE_FROM,
  FADE_TO,
  MAX_SCALE,
  closeFade,
  drawnScale,
  labelPriority,
  naturalScale,
  placeLabels,
  type LabelBox,
} from "./labels";

const box = (id: string, x: number, y: number, priority: number, visible = true): LabelBox => ({
  id,
  x,
  y,
  w: 160,
  h: 44,
  priority,
  visible,
});

describe("district label size (PLAN.md section 8)", () => {
  it("matches drei's distanceFactor", () => {
    // drei: factor / (2 tan(fov / 2) distance).
    expect(naturalScale(100, 50, 35)).toBeCloseTo(100 / (2 * Math.tan((17.5 * Math.PI) / 180) * 50));
  });

  it("draws labels at the overview exactly as before, in every settlement", () => {
    for (const size of [90, 150, 226, 310]) {
      const camera = overviewFraming(size).position;
      const natural = naturalScale(size * 0.72, Math.hypot(...camera));
      expect(natural, String(size)).toBeLessThan(MAX_SCALE);
      expect(drawnScale(natural)).toBe(natural);
      expect(closeFade(natural)).toBe(1);
    }
  });

  it("stops growing past MAX_SCALE and fades out before it would be huge", () => {
    expect(drawnScale(5)).toBe(MAX_SCALE);
    expect(closeFade(FADE_FROM)).toBe(1);
    expect(closeFade((FADE_FROM + FADE_TO) / 2)).toBeCloseTo(0.5);
    expect(closeFade(FADE_TO)).toBe(0);
    expect(closeFade(10)).toBe(0);
    // A close-up on a metropolis tower: well past the fade.
    expect(closeFade(naturalScale(310 * 0.72, 70))).toBe(0);
  });
});

describe("district label overlap", () => {
  it("shows the more important of two overlapping labels and hides the other", () => {
    const shown = placeLabels([box("remote", 400, 380, 12), box("proving", 450, 360, 30)]);
    expect([...shown]).toEqual(["proving"]);
  });

  it("keeps labels that clear each other", () => {
    const shown = placeLabels([box("a", 100, 100, 1), box("b", 400, 100, 1), box("c", 100, 300, 1)]);
    expect(shown.size).toBe(3);
  });

  it("gives way to the hovered or selected district", () => {
    const shown = placeLabels([
      box("big", 400, 380, labelPriority(40, false, false)),
      box("hovered", 420, 390, labelPriority(3, true, false)),
    ]);
    expect([...shown]).toEqual(["hovered"]);
    expect(labelPriority(1, false, true)).toBeGreaterThan(labelPriority(1, true, false));
  });

  it("never lets an invisible label take room", () => {
    const shown = placeLabels([box("behind", 400, 380, 99, false), box("front", 410, 380, 1)]);
    expect([...shown]).toEqual(["front"]);
  });

  it("breaks ties by id, so equals never flicker", () => {
    const a = placeLabels([box("b", 400, 380, 5), box("a", 410, 380, 5)]);
    const b = placeLabels([box("a", 410, 380, 5), box("b", 400, 380, 5)]);
    expect([...a]).toEqual(["a"]);
    expect([...b]).toEqual(["a"]);
  });
});

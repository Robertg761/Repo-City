import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GradeFloorEffect, GRADE_FLOOR_FRAGMENT } from "./gradeFloor";

/**
 * Regression: fields, hedges and red or green houses rendered solid black on
 * desktop OpenGL. `HueSaturation` leaves negative channels, and the sRGB
 * conversion the effect pass wraps around `BrightnessContrast` takes
 * `pow(negative, 2.4)`, NaN on NVIDIA GL. The grade must cut negatives off
 * before that conversion.
 */
describe("the grade's floor", () => {
  it("clamps every colour channel at zero and keeps alpha", () => {
    expect(GRADE_FLOOR_FRAGMENT).toMatch(/max\(\s*inputColor\.rgb,\s*vec3\(0\.0\)\s*\)/);
    expect(GRADE_FLOOR_FRAGMENT).toMatch(/inputColor\.a/);
    expect(new GradeFloorEffect().name).toBe("GradeFloorEffect");
  });

  it("sits directly after the saturation in the composer chain", () => {
    const post = readFileSync(new URL("./Post.tsx", import.meta.url), "utf8");
    const sat = post.indexOf("<HueSaturation");
    const floor = post.indexOf("object={gradeFloor}");
    const contrast = post.indexOf("<BrightnessContrast");
    expect(sat).toBeGreaterThan(-1);
    expect(floor).toBeGreaterThan(sat);
    expect(contrast).toBeGreaterThan(floor);
  });
});

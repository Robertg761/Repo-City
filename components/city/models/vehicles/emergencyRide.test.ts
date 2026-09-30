/**
 * Every emergency and works vehicle parks at y = 0 in an incident's frame,
 * so its lowest point must be its tyres' treads at 0 (the carriageway is
 * 0.04 to 0.05 above the ground plate, so a tyre sinks a few hundredths into
 * it and never hovers), in both levels of detail and both model sets.
 */
import { Box3 } from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { EmergencyKind } from "./emergency";

const KINDS: EmergencyKind[] = ["police", "ambulance", "fire", "tow", "works"];

describe.each([true, false])("parked service vehicles (Blender models: %s)", (blender) => {
  let emergency: typeof import("./emergency");
  let level: typeof import("../detailLevel");

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("../modelSource", () => ({ BLENDER_MODELS: blender }));
    emergency = await import("./emergency");
    level = await import("../detailLevel");
  });
  afterAll(() => vi.doUnmock("../modelSource"));

  it.each(KINDS.flatMap((kind) => (["lean", "near"] as const).map((l) => [kind, l] as const)))(
    "%s (%s) stands on its tyres",
    (kind, detail) => {
      const geometry = level.atLevel(detail, () => emergency.emergencyGeometry(kind, 0.2, ));
      const box = new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never);
      expect(box.min.y).toBeGreaterThan(-0.03);
      expect(box.min.y).toBeLessThan(0.03);
    },
  );
});

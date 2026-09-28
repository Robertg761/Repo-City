import { describe, expect, it } from "vitest";
import type { RoadKind, RoadSegment } from "@/types/city";
import { MEDIAN_WIDTH, roadLays, sidewalkLays } from "./groundwork";
import { gullyGeometry, roadDetailLays, utilityCoverGeometry } from "./roadDetails";

const road = (kind: RoadKind, width = 4.5, length = 30): RoadSegment => ({
  id: kind, kind, from: [0, 0, 0], to: [length, 0, length], width, major: false, appearAt: 0,
});

describe("road utility details", () => {
  it("keeps grates in the asphalt and utility covers clear of the avenue median", () => {
    const lays = roadLays([road("street"), road("avenue", 9.5), road("lane", 3), road("highway", 10)]);
    const details = roadDetailLays(lays, sidewalkLays(lays));
    expect(details.covers).toHaveLength(3);
    expect(details.drains).toHaveLength(4);
    const avenue = details.covers.find((cover) => cover.road === 1)!;
    expect(avenue.lateral - 0.37).toBeGreaterThan(MEDIAN_WIDTH / 2);
    for (const grate of details.drains) {
      expect(Math.abs(grate.lateral) + 0.21).toBeLessThan(lays[grate.road].width / 2);
      expect(grate.s).toBeGreaterThan(4.2);
      expect(grate.s).toBeLessThan(lays[grate.road].length - 4.2);
    }
  });

  it("skips short segments and caps dense scenes deterministically", () => {
    const short = roadLays([road("street", 4.5, 2)]);
    expect(roadDetailLays(short, sidewalkLays(short)).covers).toEqual([]);
    const lays = roadLays(Array.from({ length: 1000 }, () => road("street")));
    const walks = sidewalkLays(lays);
    const details = roadDetailLays(lays, walks);
    expect(details.covers).toHaveLength(400);
    expect(details.drains).toHaveLength(800);
    expect(roadDetailLays(lays, walks)).toEqual(details);
  });

  it("uses cached, upward facing geometry with a small triangle budget", () => {
    expect(utilityCoverGeometry()).toBe(utilityCoverGeometry());
    expect(gullyGeometry()).toBe(gullyGeometry());
    for (const geometry of [utilityCoverGeometry(), gullyGeometry()]) {
      expect(geometry.index!.count / 3).toBeLessThan(80);
      const normals = geometry.getAttribute("normal");
      for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeCloseTo(1);
      expect(Array.from(geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  NATURAL_LANDMARK_SIZE,
  cityBoundsSize,
  districtSquareSide,
  planLayout,
  rectMaxX,
  rectMaxZ,
  rectMinX,
  rectMinZ,
  ROAD_MAJOR_WIDTH,
  type LayoutDistrictInput,
  type Rect,
} from "./layout";

const area = (r: Rect): number => r.w * r.d;

const intersects = (a: Rect, b: Rect, epsilon = 1e-6): boolean =>
  rectMinX(a) < rectMaxX(b) - epsilon &&
  rectMinX(b) < rectMaxX(a) - epsilon &&
  rectMinZ(a) < rectMaxZ(b) - epsilon &&
  rectMinZ(b) < rectMaxZ(a) - epsilon;

const contains = (outer: Rect, inner: Rect, epsilon = 1e-6): boolean =>
  rectMinX(inner) >= rectMinX(outer) - epsilon &&
  rectMaxX(inner) <= rectMaxX(outer) + epsilon &&
  rectMinZ(inner) >= rectMinZ(outer) - epsilon &&
  rectMaxZ(inner) <= rectMaxZ(outer) + epsilon;

const districts = (counts: number[]): LayoutDistrictInput[] =>
  counts.map((buildingCount, index) => ({ id: `d-${index}`, buildingCount }));

describe("cityBoundsSize", () => {
  it("frames a small town in about 130 units and a metropolis in about 230", () => {
    expect(cityBoundsSize(10)).toBeGreaterThan(110);
    expect(cityBoundsSize(10)).toBeLessThan(145);
    expect(cityBoundsSize(300)).toBeGreaterThan(200);
    expect(cityBoundsSize(300)).toBeLessThan(245);
  });

  it("leaves the landmark band, the ring road and a margin around the districts", () => {
    for (const n of [1, 10, 90, 300, 600]) {
      expect(cityBoundsSize(n) - districtSquareSide(n)).toBeCloseTo(61, 3);
    }
  });

  it("never shrinks as the repository grows", () => {
    let previous = 0;
    for (let n = 1; n <= 400; n += 7) {
      const size = cityBoundsSize(n);
      expect(size).toBeGreaterThanOrEqual(previous);
      previous = size;
    }
  });
});

describe("planLayout", () => {
  it("tiles the district square with disjoint district and civic cells", () => {
    const layout = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    const cells = [...layout.districts.map((d) => d.rect), layout.civic.rect];

    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        expect(intersects(cells[i], cells[j])).toBe(false);
      }
    }

    const total = cells.reduce((sum, r) => sum + area(r), 0);
    expect(total).toBeCloseTo(layout.districtSide ** 2, 3);
  });

  it("reserves the cell nearest the origin for the civic centre", () => {
    const layout = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    const civicDistance = Math.hypot(layout.civic.rect.x, layout.civic.rect.z);
    for (const district of layout.districts) {
      expect(Math.hypot(district.rect.x, district.rect.z)).toBeGreaterThan(civicDistance);
    }
    // The civic cell contains the origin, so the landmark slots sit around it.
    expect(rectMinX(layout.civic.rect)).toBeLessThan(0);
    expect(rectMaxX(layout.civic.rect)).toBeGreaterThan(0);
  });

  it("works for every plausible district count", () => {
    for (let count = 1; count <= 8; count++) {
      const layout = planLayout(districts(Array.from({ length: count }, () => 12)), count * 12);
      expect(layout.districts).toHaveLength(count);
      const cells = [...layout.districts.map((d) => d.rect), layout.civic.rect];
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          expect(intersects(cells[i], cells[j])).toBe(false);
        }
        expect(area(cells[i])).toBeGreaterThan(0);
      }
      expect(cells.reduce((sum, r) => sum + area(r), 0)).toBeCloseTo(layout.districtSide ** 2, 3);
    }
  });

  it("keeps blocks inside their district and clear of the district seams", () => {
    const layout = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    for (const district of layout.districts) {
      expect(district.blocks.length).toBeGreaterThan(0);
      for (const block of district.blocks) {
        expect(contains(district.rect, block)).toBe(true);
        expect(rectMinX(block) - rectMinX(district.rect)).toBeGreaterThanOrEqual(
          ROAD_MAJOR_WIDTH / 2,
        );
        expect(rectMaxZ(district.rect) - rectMaxZ(block)).toBeGreaterThanOrEqual(
          ROAD_MAJOR_WIDTH / 2,
        );
      }
    }
  });

  it("gives every district more slots than it has buildings", () => {
    const counts = [120, 61, 30, 14, 7, 2];
    const layout = planLayout(districts(counts), counts.reduce((a, b) => a + b, 0));
    layout.districts.forEach((district, index) => {
      expect(district.slots.length).toBeGreaterThan(counts[index]);
    });
  });

  it("never lets two slot cells overlap", () => {
    const layout = planLayout(districts([120, 61, 30, 14, 7, 2]), 234);
    const cells: Rect[] = layout.districts.flatMap((d) =>
      d.slots.map((s) => ({ x: s.x, z: s.z, w: s.cellW, d: s.cellD })),
    );
    const sorted = [...cells].sort((a, b) => rectMinX(a) - rectMinX(b));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (rectMinX(sorted[j]) >= rectMaxX(sorted[i])) break;
        expect(intersects(sorted[i], sorted[j], 1e-3)).toBe(false);
      }
    }
  });

  it("orders slots from the district centre outwards", () => {
    const layout = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    for (const district of layout.districts) {
      let previous = -1;
      for (const slot of district.slots) {
        const distance = Math.hypot(slot.x - district.rect.x, slot.z - district.rect.z);
        expect(distance).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = distance;
      }
    }
  });

  it("keeps the landmark plots outside the district square and inside the ring", () => {
    const layout = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    const half = layout.districtSide / 2;
    for (const plot of Object.values(layout.landmarkPlots)) {
      const outer = Math.max(Math.abs(plot.x), Math.abs(plot.z));
      expect(outer).toBeGreaterThan(half);
      expect(outer).toBeLessThan(layout.ringRadius);
      for (const district of layout.districts) {
        expect(
          Math.abs(plot.x - district.rect.x) < district.rect.w / 2 &&
            Math.abs(plot.z - district.rect.z) < district.rect.d / 2,
        ).toBe(false);
      }
    }
  });

  it("reserves a plot no bigger than the assembly the renderer draws", () => {
    const layout = planLayout(districts([120, 61, 30, 14, 7, 2]), 234);
    for (const [type, plot] of Object.entries(layout.landmarkPlots)) {
      const natural = NATURAL_LANDMARK_SIZE[type as keyof typeof NATURAL_LANDMARK_SIZE];
      expect(plot.w).toBeLessThanOrEqual(natural[0] + 1e-6);
      expect(plot.d).toBeLessThanOrEqual(natural[2] + 1e-6);
      // Uniform scale: the renderer never stretches an assembly.
      expect(plot.w / natural[0]).toBeCloseTo(plot.d / natural[2], 3);
    }
  });

  it("splits every road at its junctions so traffic can turn", () => {
    const layout = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    for (const road of layout.roads) {
      // No other road may cross this one anywhere but at a shared endpoint.
      const horizontal = Math.abs(road.from[2] - road.to[2]) < 1e-6;
      const lo = horizontal ? Math.min(road.from[0], road.to[0]) : Math.min(road.from[2], road.to[2]);
      const hi = horizontal ? Math.max(road.from[0], road.to[0]) : Math.max(road.from[2], road.to[2]);
      for (const other of layout.roads) {
        if (other === road) continue;
        const otherHorizontal = Math.abs(other.from[2] - other.to[2]) < 1e-6;
        if (otherHorizontal === horizontal) continue;
        const at = otherHorizontal ? other.from[2] : other.from[0];
        const cross = otherHorizontal ? road.from[0] : road.from[2];
        const oLo = otherHorizontal
          ? Math.min(other.from[0], other.to[0])
          : Math.min(other.from[2], other.to[2]);
        const oHi = otherHorizontal
          ? Math.max(other.from[0], other.to[0])
          : Math.max(other.from[2], other.to[2]);
        const crosses = at > lo + 1e-6 && at < hi - 1e-6 && cross >= oLo - 1e-6 && cross <= oHi + 1e-6;
        expect(crosses).toBe(false);
      }
    }
  });

  it("times every road inside the reveal window", () => {
    const layout = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    for (const road of layout.roads) {
      expect(road.appearAt).toBeGreaterThanOrEqual(150);
      expect(road.appearAt).toBeLessThanOrEqual(560);
    }
    const majors = layout.roads.filter((r) => r.major).map((r) => r.appearAt);
    const minors = layout.roads.filter((r) => !r.major).map((r) => r.appearAt);
    expect(Math.min(...majors)).toBeLessThanOrEqual(Math.min(...minors));
  });

  it("is a pure function of the district counts", () => {
    const a = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    const b = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

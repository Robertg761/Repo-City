import { describe, expect, it } from "vitest";
import {
  NATURAL_LANDMARK_SIZE,
  cityBoundsSize,
  districtSquareSide,
  landmarkBandDepth,
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
  it("frames a small town in about 110 units and a metropolis in about 230", () => {
    expect(cityBoundsSize(10)).toBeGreaterThan(95);
    expect(cityBoundsSize(10)).toBeLessThan(125);
    expect(cityBoundsSize(300)).toBeGreaterThan(200);
    expect(cityBoundsSize(300)).toBeLessThan(245);
  });

  it("leaves the landmark band, the ring road and a margin around the districts", () => {
    for (const n of [1, 10, 90, 300, 600]) {
      const surround = cityBoundsSize(n) - districtSquareSide(n);
      // Ring road, its gap and the outer margin are fixed; the landmark band
      // scales with the town, between 12 and 20 units deep.
      expect(surround).toBeCloseTo(2 * (landmarkBandDepth(districtSquareSide(n)) + 10.5), 3);
      expect(surround).toBeGreaterThanOrEqual(2 * (12 + 10.5) - 1e-6);
      expect(surround).toBeLessThanOrEqual(2 * (20 + 10.5) + 1e-6);
    }
  });

  it("shrinks the landmark band with the town", () => {
    expect(landmarkBandDepth(districtSquareSide(10))).toBeLessThan(
      landmarkBandDepth(districtSquareSide(300)),
    );
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

  it("keeps quiet districts at a comparable density to busy ones", () => {
    // The failure this guards is a district with four files laid over a region
    // sized for forty: it renders as an empty lot with a name floating over it.
    for (const counts of [
      [163, 35, 24, 5, 4], // hono
      [118, 38, 22, 11, 6, 5, 2], // vscode
      [122, 80, 40, 16, 16, 12, 6, 5, 3], // atom
      [90, 39, 16, 8, 7, 3, 2, 2, 1], // turborepo
      [9, 1], // p-limit
    ]) {
      const total = counts.reduce((a, b) => a + b, 0);
      const layout = planLayout(districts(counts), total);
      const densities = layout.districts.map(
        (d, index) => (counts[index] + 1) / (d.rect.w * d.rect.d),
      );
      const spread = Math.max(...densities) / Math.min(...densities);
      expect(spread, `counts ${counts.join(",")} spread ${spread.toFixed(1)}x`).toBeLessThan(6);
    }
  });

  it("arranges the civic plaza symmetrically about the hall", () => {
    for (const counts of [[163, 35, 24, 5, 4], [40, 20, 12], [9, 1]]) {
      const total = counts.reduce((a, b) => a + b, 0);
      for (let files = 1; files <= 5; files++) {
        const layout = planLayout(districts(counts), total, { landmarkFiles: files });
        const { hall, buildingSlots, rect } = layout.civic;
        expect(buildingSlots.length).toBeGreaterThan(0);
        expect(buildingSlots.length).toBeLessThanOrEqual(files);

        for (const slot of buildingSlots) {
          // Square cells, so the quarter turn that faces the hall leaves the
          // footprint the geometry checks use unchanged.
          expect(slot.cellW).toBeCloseTo(slot.cellD, 6);
          expect(slot.maxHeight).toBeLessThan(hall.w);
          // Clear of the hall and inside the plaza.
          const dx = Math.abs(slot.x - hall.x);
          const dz = Math.abs(slot.z - hall.z);
          expect(Math.max(dx, dz)).toBeGreaterThan((hall.w + slot.cellW) / 2);
          expect(dx + slot.cellW / 2).toBeLessThanOrEqual(rect.w / 2 - ROAD_MAJOR_WIDTH / 2);
          expect(dz + slot.cellD / 2).toBeLessThanOrEqual(rect.d / 2 - ROAD_MAJOR_WIDTH / 2);
        }

        // No two cells overlap.
        for (let i = 0; i < buildingSlots.length; i++) {
          for (let j = i + 1; j < buildingSlots.length; j++) {
            const a = buildingSlots[i];
            const b = buildingSlots[j];
            expect(
              Math.abs(a.x - b.x) >= (a.cellW + b.cellW) / 2 - 1e-6 ||
                Math.abs(a.z - b.z) >= (a.cellD + b.cellD) / 2 - 1e-6,
            ).toBe(true);
          }
        }

        // As symmetric about the hall as the count allows: every position has
        // its mirror, bar the odd one out on a row plaza.
        const offsets = buildingSlots.map((s) => Math.round((s.x - hall.x) * 100) / 100 + 0);
        const unpaired = offsets.filter(
          (x) => offsets.filter((y) => Math.abs(y + x) < 1e-9).length === 0,
        );
        expect(unpaired.length, `files ${files}, offsets ${offsets.join(",")}`).toBeLessThanOrEqual(
          1,
        );
      }
    }
  });

  it("is a pure function of the district counts", () => {
    const a = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    const b = planLayout(districts([37, 21, 12, 9, 6, 5]), 90);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/**
 * Finds the ledges of a merged model too narrow to draw: a strip of flat,
 * upward-facing surface left showing at the foot of a wall, narrower than a
 * pixel or two at the distance the city is seen from. A parapet set a hair
 * inside its cornice leaves one; so does a roof deck stopped a hair short of
 * the parapet round it. The strip is lit from above and the walls beside it
 * are not, so it shows as a bright line, and a line that thin rasterizes as
 * dashes that crawl as the camera moves.
 *
 * `coplanar.ts` cannot see these: nothing overlaps. The fault is a width, so
 * this measures one. For every wall that stands on (or passes through) a flat
 * surface, it walks out from the wall's foot, along the wall's outward
 * normal, for as long as the surface under it is exposed to the sky: on an
 * upward face at that height, and not buried inside one of the model's own
 * volumes. A walk that finds open surface at once and loses it again inside
 * `narrowerThan` is a sliver. A wall flush with the edge of what it stands
 * on finds no surface at all, which is the fix.
 *
 * Positions are in the model's own space; `scale` is the per-axis scale the
 * model is drawn at, so the width reported is the one on screen. Pure arrays,
 * no three.js.
 */

export interface NarrowLedge {
  /** The wall's triangle, in index-buffer order. */
  wall: number;
  /** The wall's outward normal: the direction the ledge runs out from it. */
  normal: [number, number, number];
  /** Height of the ledge, model space. */
  y: number;
  /** Width of the exposed strip, world units (after `scale`); 0 for a lip. */
  width: number;
  /**
   * For a lip -- a wall that comes up through the surface and stops a hair
   * above it -- how far above, world units; 0 for a ledge.
   */
  height: number;
  /** A point on the strip, model space. */
  at: [number, number, number];
}

type V = [number, number, number];

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

interface Tri {
  i: number;
  p: V[];
  n: V;
  /** Bounds on x and z, for the upward ray's broad phase. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
}

/** Is (x, z) inside the triangle's shadow on the ground plane? */
function insideXZ(t: Tri, x: number, z: number): boolean {
  if (x < t.minX - 1e-9 || x > t.maxX + 1e-9 || z < t.minZ - 1e-9 || z > t.maxZ + 1e-9) return false;
  let sign = 0;
  for (let e = 0; e < 3; e++) {
    const a = t.p[e];
    const b = t.p[(e + 1) % 3];
    const s = (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]);
    if (Math.abs(s) < 1e-12) continue;
    if (sign === 0) sign = Math.sign(s);
    else if (Math.sign(s) !== sign) return false;
  }
  return true;
}

/** Height of the triangle's plane over (x, z); the triangle must not be vertical. */
function heightAt(t: Tri, x: number, z: number): number {
  const [a] = t.p;
  return a[1] - (t.n[0] * (x - a[0]) + t.n[2] * (z - a[2])) / t.n[1];
}

/** Where a triangle crosses the horizontal plane `y`, as a segment, if it does. */
function chordAt(t: Tri, y: number): [V, V] | null {
  const points: V[] = [];
  for (let e = 0; e < 3; e++) {
    const a = t.p[e];
    const b = t.p[(e + 1) % 3];
    if (Math.abs(a[1] - y) < 1e-9) points.push(a);
    else if ((a[1] - y) * (b[1] - y) < 0 && Math.abs(b[1] - y) >= 1e-9) {
      const f = (y - a[1]) / (b[1] - a[1]);
      points.push([a[0] + (b[0] - a[0]) * f, y, a[2] + (b[2] - a[2]) * f]);
    }
  }
  let best: [V, V] | null = null;
  let length = 1e-6;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[i][0] - points[j][0], points[i][2] - points[j][2]);
      if (d > length) {
        length = d;
        best = [points[i], points[j]];
      }
    }
  }
  return best;
}

export function narrowLedges(
  positions: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  options: {
    /** Strips narrower than this, in world units after `scale`, are reported. */
    narrowerThan: number;
    /** Lips lower than this, in world units after `scale`, are reported too. */
    lowerThan?: number;
    /**
     * A point under the lid of a volume no higher than this above it (model
     * units) is buried inside it and never seen. 0.1 by default: more than
     * any parapet, plant box or crown stands, less than a setback storey.
     */
    buriedWithin?: number;
    scale?: readonly [number, number, number];
  },
): NarrowLedge[] {
  const scale = options.scale ?? [1, 1, 1];
  const count = indices ? indices.length / 3 : positions.length / 9;
  const vertex = (i: number): V => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];

  const tris: Tri[] = [];
  for (let t = 0; t < count; t++) {
    const ids = indices ? [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]] : [t * 3, t * 3 + 1, t * 3 + 2];
    const p = ids.map(vertex);
    const c = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const len = Math.hypot(c[0], c[1], c[2]);
    if (len < 1e-12) continue;
    tris.push({
      i: t,
      p,
      n: [c[0] / len, c[1] / len, c[2] / len],
      minX: Math.min(p[0][0], p[1][0], p[2][0]),
      maxX: Math.max(p[0][0], p[1][0], p[2][0]),
      minZ: Math.min(p[0][2], p[1][2], p[2][2]),
      maxZ: Math.max(p[0][2], p[1][2], p[2][2]),
      maxY: Math.max(p[0][1], p[1][1], p[2][1]),
    });
  }

  const flats = tris.filter((t) => t.n[1] > 0.9999);
  // Walls and roof slopes: anything that rises from a surface and faces out
  // over it. Overhangs face down and never stand on anything.
  const walls = tris.filter((t) => t.n[1] > -1e-4 && Math.hypot(t.n[0], t.n[2]) > 1e-3);
  const lids = tris.filter((t) => Math.abs(t.n[1]) >= 1e-4);
  const heights = [...new Set(flats.map((t) => Math.round(t.p[0][1] * 1e7) / 1e7))].sort((a, b) => a - b);

  // Showing at (x, y, z): standing on a flat face at `y`, and not buried under
  // something standing on it -- the first face straight above is not the lid
  // of a volume, close overhead. Only close: the boxes here have no floors, so
  // a lid far overhead is as likely a cornice overhanging a ledge that the
  // camera sees perfectly well from the side.
  const lift = 1e-5;
  const buriedWithin = options.buriedWithin ?? 0.1;
  const exposed = (x: number, y: number, z: number): boolean => {
    if (!flats.some((t) => Math.abs(t.p[0][1] - y) < 1e-7 && insideXZ(t, x, z))) return false;
    let nearest = Infinity;
    let lid = false;
    for (const t of lids) {
      if (t.maxY <= y + lift || !insideXZ(t, x, z)) continue;
      const h = heightAt(t, x, z);
      if (h <= y + lift || h >= nearest) continue;
      nearest = h;
      lid = t.n[1] > 0;
    }
    return !(lid && nearest - y <= buriedWithin);
  };

  const found: NarrowLedge[] = [];
  const reach = 64;
  for (const wall of walls) {
    const m: V = [wall.n[0], 0, wall.n[2]];
    const ml = Math.hypot(m[0], m[2]);
    m[0] /= ml;
    m[2] /= ml;
    // Model units per world unit along the wall's normal.
    const stretch = Math.hypot(m[0] * scale[0], m[2] * scale[2]);
    const limit = options.narrowerThan / stretch;
    const bottom = Math.min(wall.p[0][1], wall.p[1][1], wall.p[2][1]);
    for (const y of heights) {
      if (y < bottom - 1e-7 || y >= wall.maxY - 1e-7) continue;
      const chord = chordAt(wall, y);
      if (!chord) continue;
      // A wall that comes up through a surface and stops a hair above it: a
      // lip too low to draw, which dashes the same way.
      const lip = (wall.maxY - y) * scale[1];
      if (options.lowerThan && y > bottom + 1e-7 && lip < options.lowerThan) {
        const mx = (chord[0][0] + chord[1][0]) / 2;
        const mz = (chord[0][2] + chord[1][2]) / 2;
        if (exposed(mx + m[0] * 1e-4, y, mz + m[2] * 1e-4)) {
          found.push({ wall: wall.i, normal: [m[0], 0, m[2]], y, width: 0, height: lip, at: [mx, y, mz] });
          continue;
        }
      }
      for (const f of [0.2, 0.5, 0.8]) {
        const bx = chord[0][0] + (chord[1][0] - chord[0][0]) * f;
        const bz = chord[0][2] + (chord[1][2] - chord[0][2]) * f;
        const open = (d: number) => exposed(bx + m[0] * d, y, bz + m[2] * d);
        const first = limit / reach;
        if (!open(first)) continue;
        // Walk out to the edge of the exposed strip, then pin it down.
        let inside = first;
        let outside = -1;
        for (let k = 2; k <= reach; k++) {
          const d = (limit * k) / reach;
          if (!open(d)) {
            outside = d;
            break;
          }
          inside = d;
        }
        if (outside < 0) continue;
        for (let k = 0; k < 20; k++) {
          const mid = (inside + outside) / 2;
          if (open(mid)) inside = mid;
          else outside = mid;
        }
        const width = inside * stretch;
        found.push({
          wall: wall.i,
          normal: [m[0], 0, m[2]],
          y,
          width,
          height: 0,
          at: [bx + (m[0] * inside) / 2, y, bz + (m[2] * inside) / 2],
        });
        break;
      }
    }
  }
  return found;
}

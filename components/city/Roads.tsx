"use client";

/**
 * The street network (PLAN.md sections 36 and 76.5). Instanced meshes, one
 * per kind of surface: the carriageways, the pavement slabs either side, the
 * kerb line along their inner edge, and every painted mark -- zebra bands at
 * the junctions, the dashed centre line of the major streets, a motorway's
 * edge lines -- in one mesh of scaled unit boxes.
 *
 * The settlements add surfaces only where their roads need them, so a city,
 * whose roads are all streets, draws exactly the four meshes it always did:
 *
 *   - village lanes: a lighter carriageway of their own, drawn just behind
 *     the streets so a lane running into the main street never fights it,
 *     and a soft gravel verge instead of a kerb;
 *   - bends: a joint disc at every shallow bend and wherever lanes meet, so
 *     an angled lane has no wedge bitten out of it;
 *   - metropolis avenues: a kerbed median planted with grass (its trees are
 *     in `Props.tsx`);
 *   - the metropolis motorway ring: a hard shoulder, edge lines, a concrete
 *     barrier, and a square at each corner.
 *
 * Surfaces are procedural textures (`textures/`): asphalt with a patchy oil
 * line down each lane, pavement flags in a running bond, and paint scuffed by
 * the same wear. The kerb stays plain -- at this scale it is a line, and a
 * line with texture on it is noise.
 *
 * Roads are not selectable: they are the surface incidents and traffic live
 * on. The geometry is derived in `groundwork.ts`, which is pure and tested;
 * this file only animates it.
 *
 * Everything draws itself in from the road's `from` end during the reveal,
 * which is step 2 of the sequence in section 43: the pavement grows with the
 * carriageway, and each mark lands once the growing front has passed it.
 */

import { type RefObject, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh, type Material } from "three";
import type { RoadSegment } from "@/types/city";
import {
  MEDIAN_WIDTH,
  SIDEWALK_HEIGHT,
  SIDEWALK_WIDTH,
  VERGE_WIDTH,
  barrierLays,
  crosswalkLays,
  edgeLineLays,
  jointLays,
  laneDashLays,
  medianLays,
  roadLays,
  roadNodes,
  sidewalkLays,
  vergeLays,
  type JointLay,
  type MarkLay,
  type RoadLay,
  type SidewalkLay,
} from "./groundwork";
import {
  BARRIER_COLOR,
  CROSSWALK_COLOR,
  CURB_COLOR,
  LANE_COLOR,
  MEDIAN_GRASS,
  ROAD_COLOR,
  SHOULDER_COLOR,
  SIDEWALK_COLOR,
  VERGE_COLOR,
  desaturate,
  mix,
  type SceneAtmosphere,
} from "./palette";
import { revealScale } from "./reveal";
import { useStreetMaterial } from "./textures/surfaces";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();
const scratchColor = new Color();

/** Surface heights, in world units above the ground plate. */
const ROAD_Y = 0.04;
const MARK_Y = 0.09;
/** Width of the darker lip between the carriageway and the pavement. */
const CURB_WIDTH = 0.3;
/** A lane's verge sits just under the road surface, flush with the grass. */
const VERGE_HEIGHT = 0.06;
/** The avenue median: a kerb as tall as a pavement, the grass a hair above. */
const MEDIAN_GRASS_INSET = 0.16;
/** The motorway's central barrier. */
const BARRIER_WIDTH = 0.4;
const BARRIER_HEIGHT = 0.55;

/** Places an instance in a road's own frame: `s` along it, `lateral` across. */
function place(lay: RoadLay, s: number, lateral: number, y: number): void {
  scratch.position.set(
    lay.x + lay.dx * s + lay.dz * lateral,
    y,
    lay.z + lay.dz * s - lay.dx * lateral,
  );
  scratch.rotation.set(0, lay.angle, 0);
}

/**
 * How far along a road its pieces may be laid: as far as the road has grown,
 * and without limit once it is whole. A pavement, verge or edge line mitred
 * round a bend runs on a little past its own segment's end, and must not be
 * cut off at the node once there is nothing left to grow.
 */
function reach(fronts: Float32Array, lays: readonly RoadLay[], road: number): number {
  return fronts[road] >= lays[road].length - 1e-3 ? Number.POSITIVE_INFINITY : fronts[road];
}

/** The carriageways: each one as long as its road has grown so far. */
function layCarriageways(
  mesh: InstancedMesh | null,
  indices: readonly number[],
  lays: readonly RoadLay[],
  fronts: Float32Array,
): void {
  if (!mesh) return;
  indices.forEach((road, slot) => {
    const lay = lays[road];
    const length = Math.max(fronts[road], 0.0001);
    place(lay, length / 2, 0, ROAD_Y);
    scratch.scale.set(fronts[road] > 0 ? lay.width : 0, 1, length);
    scratch.updateMatrix();
    mesh.setMatrixAt(slot, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Lays each strip -- a pavement, a verge, a median -- behind its road's
 * growing front, never ahead of it.
 */
function layStrips(
  mesh: InstancedMesh | null,
  strips: readonly SidewalkLay[],
  lays: readonly RoadLay[],
  fronts: Float32Array,
  y: number,
  width: number,
): void {
  if (!mesh) return;
  strips.forEach((strip, i) => {
    const lay = lays[strip.road];
    const along = Math.min(Math.max(reach(fronts, lays, strip.road) - strip.start, 0), strip.along);
    place(lay, strip.start + along / 2, strip.lateral, y);
    scratch.scale.set(along > 0.01 ? width : 0, 1, Math.max(along, 0.0001));
    scratch.updateMatrix();
    mesh.setMatrixAt(i, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/** Joint patches appear whole once the road that reaches the node has. */
function layJoints(
  mesh: InstancedMesh | null,
  joints: readonly JointLay[],
  fronts: Float32Array,
): void {
  if (!mesh) return;
  joints.forEach((joint, i) => {
    const shown = fronts[joint.road] > 0 && fronts[joint.road] >= joint.s - 0.01;
    scratch.position.set(joint.x, ROAD_Y, joint.z);
    scratch.rotation.set(0, joint.angle, 0);
    scratch.scale.set(shown ? joint.size : 0, 1, shown ? joint.size : 0);
    scratch.updateMatrix();
    mesh.setMatrixAt(i, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

export default function Roads({
  roads,
  atmosphere,
}: {
  roads: readonly RoadSegment[];
  atmosphere: SceneAtmosphere;
}) {
  const lays = useMemo(() => roadLays(roads), [roads]);
  const topology = useMemo(() => roadNodes(lays), [lays]);
  const walks = useMemo(() => sidewalkLays(lays, topology), [lays, topology]);
  const marks = useMemo<MarkLay[]>(
    () => [
      ...crosswalkLays(lays, roads, topology),
      ...laneDashLays(lays, topology),
      ...edgeLineLays(lays, topology),
    ],
    [lays, roads, topology],
  );
  const verges = useMemo(() => vergeLays(lays, topology), [lays, topology]);
  const medians = useMemo(() => medianLays(lays, topology), [lays, topology]);
  const barriers = useMemo(() => barrierLays(lays, topology), [lays, topology]);
  const joints = useMemo(() => {
    const all = jointLays(lays, topology);
    return {
      street: all.filter((joint) => !joint.lane && joint.shape === "disc"),
      lane: all.filter((joint) => joint.lane),
      square: all.filter((joint) => joint.shape === "square"),
    };
  }, [lays, topology]);

  /** Which lays each carriageway mesh draws: lanes apart from everything else. */
  const surfaces = useMemo(() => {
    const street: number[] = [];
    const lane: number[] = [];
    lays.forEach((lay, i) => (lay.style === "lane" ? lane : street).push(i));
    return { street, lane };
  }, [lays]);

  const surfaceRef = useRef<InstancedMesh>(null);
  const laneRef = useRef<InstancedMesh>(null);
  const walkRef = useRef<InstancedMesh>(null);
  const curbRef = useRef<InstancedMesh>(null);
  const markRef = useRef<InstancedMesh>(null);
  const vergeRef = useRef<InstancedMesh>(null);
  const medianRef = useRef<InstancedMesh>(null);
  const medianGrassRef = useRef<InstancedMesh>(null);
  const barrierRef = useRef<InstancedMesh>(null);
  const discRef = useRef<InstancedMesh>(null);
  const laneDiscRef = useRef<InstancedMesh>(null);
  const squareRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);

  const tone = atmosphere.desaturation;
  const asphalt = useStreetMaterial("asphalt", desaturate(ROAD_COLOR, tone), 0.95);
  const pavers = useStreetMaterial("pavers", desaturate(SIDEWALK_COLOR, tone), 0.92);
  const paint = useStreetMaterial("paint", desaturate(CROSSWALK_COLOR, tone), 0.85);
  // Behind the streets in the depth test, so they win wherever the two meet.
  const laneAsphalt = useStreetMaterial("asphalt", desaturate(LANE_COLOR, tone), 0.95, 1);
  const patch = useStreetMaterial("patch", desaturate(ROAD_COLOR, tone), 0.95, 2);
  const lanePatch = useStreetMaterial("patch", desaturate(LANE_COLOR, tone), 0.95, 2);

  /** How far each road has drawn itself in, in world units from `from`. */
  const fronts = useMemo(() => new Float32Array(lays.length), [lays]);

  useFrame(() => {
    if (settled.current) return;
    const now = performance.now();
    let done = true;

    lays.forEach((lay, i) => {
      const grow = revealScale(now, clock.current, lay.appearAt);
      if (grow < 1) done = false;
      fronts[i] = grow > 0.002 ? Math.max(lay.length * grow, 0.0001) : 0;
    });

    layCarriageways(surfaceRef.current, surfaces.street, lays, fronts);
    layCarriageways(laneRef.current, surfaces.lane, lays, fronts);

    const walkMesh = walkRef.current;
    const curbMesh = curbRef.current;
    if (walkMesh) {
      walks.forEach((walk, i) => {
        const lay = lays[walk.road];
        // The slab is laid behind the front, never ahead of it.
        const along = Math.min(Math.max(reach(fronts, lays, walk.road) - walk.start, 0), walk.along);
        const centre = walk.start + along / 2;
        const side = Math.sign(walk.lateral);

        place(lay, centre, walk.lateral, SIDEWALK_HEIGHT / 2);
        scratch.scale.set(along > 0.01 ? SIDEWALK_WIDTH : 0, 1, Math.max(along, 0.0001));
        scratch.updateMatrix();
        walkMesh.setMatrixAt(i, scratch.matrix);

        if (!curbMesh) return;
        place(lay, centre, (lay.width / 2 + CURB_WIDTH / 2) * side, SIDEWALK_HEIGHT / 2 + 0.005);
        scratch.scale.set(along > 0.01 ? CURB_WIDTH : 0, 1, Math.max(along, 0.0001));
        scratch.updateMatrix();
        curbMesh.setMatrixAt(i, scratch.matrix);
      });
      walkMesh.instanceMatrix.needsUpdate = true;
      if (curbMesh) curbMesh.instanceMatrix.needsUpdate = true;
    }

    const markMesh = markRef.current;
    if (markMesh) {
      marks.forEach((mark, i) => {
        const lay = lays[mark.road];
        // Paint lands whole, once the road under it exists.
        const painted = reach(fronts, lays, mark.road) >= mark.s + mark.along / 2;
        place(lay, mark.s, mark.lateral, MARK_Y);
        scratch.scale.set(painted ? mark.across : 0, 1, painted ? mark.along : 0.0001);
        scratch.updateMatrix();
        markMesh.setMatrixAt(i, scratch.matrix);
      });
      markMesh.instanceMatrix.needsUpdate = true;
    }

    layStrips(vergeRef.current, verges, lays, fronts, VERGE_HEIGHT / 2, VERGE_WIDTH);
    layStrips(medianRef.current, medians, lays, fronts, SIDEWALK_HEIGHT / 2, MEDIAN_WIDTH);
    layStrips(
      medianGrassRef.current,
      medians,
      lays,
      fronts,
      SIDEWALK_HEIGHT / 2 + 0.006,
      MEDIAN_WIDTH - MEDIAN_GRASS_INSET * 2,
    );
    layStrips(barrierRef.current, barriers, lays, fronts, BARRIER_HEIGHT / 2, BARRIER_WIDTH);
    layJoints(discRef.current, joints.street, fronts);
    layJoints(laneDiscRef.current, joints.lane, fronts);
    layJoints(squareRef.current, joints.square, fronts);

    if (done) settled.current = true;
  });

  // The verges are two colours in one mesh: gravel beside a lane, concrete
  // beside a motorway.
  useEffect(() => {
    const mesh = vergeRef.current;
    if (!mesh) return;
    verges.forEach((verge, i) => {
      scratchColor.set(desaturate(verge.style === "lane" ? VERGE_COLOR : SHOULDER_COLOR, tone));
      mesh.setColorAt(i, scratchColor);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [verges, tone]);

  if (lays.length === 0) return null;

  return (
    <group>
      {surfaces.street.length > 0 && (
        <instancedMesh
          ref={surfaceRef}
          args={[undefined, undefined, surfaces.street.length]}
          receiveShadow
          frustumCulled={false}
        >
          <boxGeometry args={[1, 0.08, 1]} />
          <primitive object={asphalt} attach="material" />
        </instancedMesh>
      )}

      {surfaces.lane.length > 0 && (
        <instancedMesh
          ref={laneRef}
          args={[undefined, undefined, surfaces.lane.length]}
          receiveShadow
          frustumCulled={false}
        >
          <boxGeometry args={[1, 0.08, 1]} />
          <primitive object={laneAsphalt} attach="material" />
        </instancedMesh>
      )}

      {walks.length > 0 && (
        <>
          <instancedMesh
            ref={walkRef}
            args={[undefined, undefined, walks.length]}
            receiveShadow
            castShadow
            frustumCulled={false}
          >
            <boxGeometry args={[1, SIDEWALK_HEIGHT, 1]} />
            <primitive object={pavers} attach="material" />
          </instancedMesh>

          <instancedMesh
            ref={curbRef}
            args={[undefined, undefined, walks.length]}
            receiveShadow
            frustumCulled={false}
          >
            <boxGeometry args={[1, SIDEWALK_HEIGHT, 1]} />
            <meshStandardMaterial
              color={desaturate(CURB_COLOR, tone)}
              roughness={0.95}
              metalness={0}
            />
          </instancedMesh>
        </>
      )}

      {marks.length > 0 && (
        <instancedMesh
          ref={markRef}
          args={[undefined, undefined, marks.length]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 0.02, 1]} />
          <primitive object={paint} attach="material" />
        </instancedMesh>
      )}

      <JointMesh meshRef={discRef} count={joints.street.length} material={patch} shape="disc" />
      <JointMesh meshRef={laneDiscRef} count={joints.lane.length} material={lanePatch} shape="disc" />
      <JointMesh meshRef={squareRef} count={joints.square.length} material={patch} shape="square" />

      {verges.length > 0 && (
        <instancedMesh
          ref={vergeRef}
          args={[undefined, undefined, verges.length]}
          receiveShadow
          frustumCulled={false}
        >
          <boxGeometry args={[1, VERGE_HEIGHT, 1]} />
          <meshStandardMaterial roughness={1} metalness={0} />
        </instancedMesh>
      )}

      {medians.length > 0 && (
        <>
          <instancedMesh
            ref={medianRef}
            args={[undefined, undefined, medians.length]}
            receiveShadow
            castShadow
            frustumCulled={false}
          >
            <boxGeometry args={[1, SIDEWALK_HEIGHT, 1]} />
            <meshStandardMaterial color={desaturate(CURB_COLOR, tone)} roughness={0.95} metalness={0} />
          </instancedMesh>
          <instancedMesh
            ref={medianGrassRef}
            args={[undefined, undefined, medians.length]}
            receiveShadow
            frustumCulled={false}
          >
            <boxGeometry args={[1, SIDEWALK_HEIGHT, 1]} />
            <meshStandardMaterial
              color={desaturate(mix(MEDIAN_GRASS, atmosphere.terrainColor, 0.35), tone)}
              roughness={1}
              metalness={0}
            />
          </instancedMesh>
        </>
      )}

      {barriers.length > 0 && (
        <instancedMesh
          ref={barrierRef}
          args={[undefined, undefined, barriers.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        >
          <boxGeometry args={[1, BARRIER_HEIGHT, 1]} />
          <meshStandardMaterial color={desaturate(BARRIER_COLOR, tone)} roughness={0.9} metalness={0} />
        </instancedMesh>
      )}
    </group>
  );
}

/** One kind of joint patch: discs at bends, squares at motorway corners. */
function JointMesh({
  meshRef,
  count,
  material,
  shape,
}: {
  meshRef: RefObject<InstancedMesh | null>;
  count: number;
  material: Material;
  shape: "disc" | "square";
}) {
  if (count === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} receiveShadow frustumCulled={false}>
      {shape === "disc" ? (
        <cylinderGeometry args={[0.5, 0.5, 0.08, 20]} />
      ) : (
        <boxGeometry args={[1, 0.08, 1]} />
      )}
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
}

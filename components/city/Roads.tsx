"use client";

/**
 * The street network (PLAN.md section 36). Four instanced meshes: the
 * carriageways, the pavement slabs either side, the kerb line along their
 * inner edge, and every painted mark -- zebra bands at the junctions and the
 * dashed centre line of the avenues -- in one mesh of scaled unit boxes.
 *
 * Roads are not selectable: they are the surface incidents and traffic live
 * on. The geometry is derived in `groundwork.ts`, which is pure and tested;
 * this file only animates it.
 *
 * Everything draws itself in from the road's `from` end during the reveal,
 * which is step 2 of the sequence in section 43: the pavement grows with the
 * carriageway, and each mark lands once the growing front has passed it.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, type InstancedMesh } from "three";
import type { RoadSegment } from "@/types/city";
import {
  SIDEWALK_HEIGHT,
  SIDEWALK_WIDTH,
  crosswalkLays,
  laneDashLays,
  roadLays,
  sidewalkLays,
  type MarkLay,
  type RoadLay,
} from "./groundwork";
import {
  CROSSWALK_COLOR,
  CURB_COLOR,
  ROAD_COLOR,
  SIDEWALK_COLOR,
  desaturate,
  type SceneAtmosphere,
} from "./palette";
import { revealScale } from "./reveal";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();

/** Surface heights, in world units above the ground plate. */
const ROAD_Y = 0.04;
const MARK_Y = 0.09;
/** Width of the darker lip between the carriageway and the pavement. */
const CURB_WIDTH = 0.3;

/** Places an instance in a road's own frame: `s` along it, `lateral` across. */
function place(lay: RoadLay, s: number, lateral: number, y: number): void {
  scratch.position.set(
    lay.x + lay.dx * s + lay.dz * lateral,
    y,
    lay.z + lay.dz * s - lay.dx * lateral,
  );
  scratch.rotation.set(0, lay.angle, 0);
}

export default function Roads({
  roads,
  atmosphere,
}: {
  roads: readonly RoadSegment[];
  atmosphere: SceneAtmosphere;
}) {
  const lays = useMemo(() => roadLays(roads), [roads]);
  const walks = useMemo(() => sidewalkLays(lays), [lays]);
  const marks = useMemo<MarkLay[]>(
    () => [...crosswalkLays(lays, roads), ...laneDashLays(lays)],
    [lays, roads],
  );

  const surfaceRef = useRef<InstancedMesh>(null);
  const walkRef = useRef<InstancedMesh>(null);
  const curbRef = useRef<InstancedMesh>(null);
  const markRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);

  /** How far each road has drawn itself in, in world units from `from`. */
  const fronts = useMemo(() => new Float32Array(lays.length), [lays]);

  useFrame(() => {
    const surface = surfaceRef.current;
    if (!surface || settled.current) return;
    const now = performance.now();
    let done = true;

    lays.forEach((lay, i) => {
      const grow = revealScale(now, clock.current, lay.appearAt);
      if (grow < 1) done = false;
      const length = Math.max(lay.length * grow, 0.0001);
      fronts[i] = grow > 0.002 ? length : 0;
      place(lay, length / 2, 0, ROAD_Y);
      scratch.scale.set(grow > 0.002 ? lay.width : 0, 1, length);
      scratch.updateMatrix();
      surface.setMatrixAt(i, scratch.matrix);
    });
    surface.instanceMatrix.needsUpdate = true;

    const walkMesh = walkRef.current;
    const curbMesh = curbRef.current;
    if (walkMesh) {
      walks.forEach((walk, i) => {
        const lay = lays[walk.road];
        // The slab is laid behind the front, never ahead of it.
        const along = Math.min(Math.max(fronts[walk.road] - walk.start, 0), walk.along);
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
        const painted = fronts[mark.road] >= mark.s + mark.along / 2;
        place(lay, mark.s, mark.lateral, MARK_Y);
        scratch.scale.set(painted ? mark.across : 0, 1, painted ? mark.along : 0.0001);
        scratch.updateMatrix();
        markMesh.setMatrixAt(i, scratch.matrix);
      });
      markMesh.instanceMatrix.needsUpdate = true;
    }

    if (done) settled.current = true;
  });

  if (lays.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={surfaceRef}
        args={[undefined, undefined, lays.length]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 0.08, 1]} />
        <meshStandardMaterial
          color={desaturate(ROAD_COLOR, atmosphere.desaturation)}
          roughness={0.95}
          metalness={0}
        />
      </instancedMesh>

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
            <meshStandardMaterial
              color={desaturate(SIDEWALK_COLOR, atmosphere.desaturation)}
              roughness={0.92}
              metalness={0}
            />
          </instancedMesh>

          <instancedMesh
            ref={curbRef}
            args={[undefined, undefined, walks.length]}
            receiveShadow
            frustumCulled={false}
          >
            <boxGeometry args={[1, SIDEWALK_HEIGHT, 1]} />
            <meshStandardMaterial
              color={desaturate(CURB_COLOR, atmosphere.desaturation)}
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
          <meshStandardMaterial
            color={desaturate(CROSSWALK_COLOR, atmosphere.desaturation)}
            roughness={0.85}
            metalness={0}
          />
        </instancedMesh>
      )}
    </group>
  );
}

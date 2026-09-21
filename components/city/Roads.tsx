"use client";

/**
 * The road network (PLAN.md section 36). Two instanced meshes: one for the
 * carriageways, one for the centre lines of the major roads. Roads are not
 * selectable -- they are the surface incidents and traffic live on.
 *
 * Roads draw themselves in from their `from` end during the reveal, which is
 * step 2 of the sequence in section 43.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, type InstancedMesh } from "three";
import type { RoadSegment } from "@/types/city";
import { ROAD_COLOR, ROAD_LINE_COLOR, desaturate, type SceneAtmosphere } from "./palette";
import { revealScale } from "./reveal";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();

interface Lay {
  x: number;
  z: number;
  dx: number;
  dz: number;
  length: number;
  angle: number;
  width: number;
  major: boolean;
  appearAt: number;
}

function layout(roads: readonly RoadSegment[]): Lay[] {
  return roads.map((road) => {
    const dx = road.to[0] - road.from[0];
    const dz = road.to[2] - road.from[2];
    const length = Math.hypot(dx, dz) || 0.001;
    return {
      x: road.from[0],
      z: road.from[2],
      dx: dx / length,
      dz: dz / length,
      length,
      angle: Math.atan2(dx, dz),
      width: Math.max(road.width, 1),
      major: road.major,
      // The generator times the whole reveal (PLAN.md section 43).
      appearAt: road.appearAt,
    };
  });
}

export default function Roads({
  roads,
  atmosphere,
}: {
  roads: readonly RoadSegment[];
  atmosphere: SceneAtmosphere;
}) {
  const lays = useMemo(() => layout(roads), [roads]);
  const majors = useMemo(() => lays.filter((l) => l.major), [lays]);
  const surfaceRef = useRef<InstancedMesh>(null);
  const lineRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);

  useFrame(() => {
    const surface = surfaceRef.current;
    if (!surface || settled.current) return;
    const now = performance.now();
    let done = true;

    lays.forEach((lay, i) => {
      const grow = revealScale(now, clock.current, lay.appearAt);
      if (grow < 1) done = false;
      const length = Math.max(lay.length * grow, 0.0001);
      scratch.position.set(lay.x + (lay.dx * length) / 2, 0.04, lay.z + (lay.dz * length) / 2);
      scratch.rotation.set(0, lay.angle, 0);
      scratch.scale.set(grow > 0.002 ? lay.width : 0, 1, length);
      scratch.updateMatrix();
      surface.setMatrixAt(i, scratch.matrix);
    });
    surface.instanceMatrix.needsUpdate = true;

    const line = lineRef.current;
    if (line) {
      majors.forEach((lay, i) => {
        const grow = revealScale(now, clock.current, lay.appearAt);
        const length = Math.max(lay.length * grow, 0.0001);
        scratch.position.set(lay.x + (lay.dx * length) / 2, 0.09, lay.z + (lay.dz * length) / 2);
        scratch.rotation.set(0, lay.angle, 0);
        scratch.scale.set(grow > 0.002 ? 0.4 : 0, 1, length * 0.94);
        scratch.updateMatrix();
        line.setMatrixAt(i, scratch.matrix);
      });
      line.instanceMatrix.needsUpdate = true;
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

      {majors.length > 0 && (
        <instancedMesh
          ref={lineRef}
          args={[undefined, undefined, majors.length]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 0.02, 1]} />
          <meshStandardMaterial
            color={desaturate(ROAD_LINE_COLOR, atmosphere.desaturation)}
            roughness={0.9}
            metalness={0}
          />
        </instancedMesh>
      )}
    </group>
  );
}

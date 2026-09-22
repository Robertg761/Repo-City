"use client";

/**
 * A district: a tinted ground region plus a floating label (PLAN.md sections
 * 8 and 42). The label is a drei `<Html>` overlay rather than `<Text>` so the
 * renderer never depends on a font download at runtime.
 *
 * `rect` is CENTRE plus extent, matching the generator and drei's
 * `planeGeometry`: the region covers `[x - w/2, x + w/2]` on x and
 * `[z - d/2, z + d/2]` on z (see the world conventions in `types/city.ts`).
 *
 * The label is DOM, so it is always drawn in front of the city: left at a
 * fixed height it lands in the middle of whatever tower happens to be behind
 * it. `City.tsx` measures each district's own skyline and sends the height to
 * clear it, the label sits on a dark glass pill so it survives a pale facade
 * underneath, and it fades out as the camera comes down into the streets,
 * where it would be a screen-high caption over the thing being inspected.
 */

import { useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import type { District } from "@/types/city";
import { districtCenter } from "./entities";
import { desaturate, districtColor, stateTint, type SceneAtmosphere } from "./palette";
import { useRevealGroup } from "./useReveal";
import { useEntityHandlers, useEntityState } from "./useEntity";

interface DistrictGroundProps {
  district: District;
  atmosphere: SceneAtmosphere;
  /** Height of the label anchor, measured by `City.tsx` from the skyline. */
  labelY: number;
  /** drei's `distanceFactor`, scaled so a big city's labels are not ants. */
  labelScale: number;
}

/** Camera distances, in world units, between which the label fades in. */
const FADE_NEAR = 58;
const FADE_FAR = 108;

export default function DistrictGround({
  district,
  atmosphere,
  labelY,
  labelScale,
}: DistrictGroundProps) {
  const { hovered, selected } = useEntityState(district.id);
  const handlers = useEntityHandlers(district.id);
  // The generator schedules every reveal, districts included (section 43).
  const reveal = useRevealGroup(district.appearAt);
  const [x, , z] = districtCenter(district.rect);
  const label = useRef<HTMLDivElement>(null);
  const anchor = useMemo(() => new Vector3(x, labelY, z), [x, labelY, z]);

  const color = stateTint(
    desaturate(districtColor(district.colorIndex), atmosphere.desaturation),
    hovered,
    selected,
  );

  // Opacity is written straight to the node: fading a label must not re-render
  // the district, and it must not wait on React (PLAN.md section 43).
  useFrame(({ camera }) => {
    const node = label.current;
    if (!node) return;
    const distance = camera.position.distanceTo(anchor);
    const ramp = (distance - FADE_NEAR) / (FADE_FAR - FADE_NEAR);
    const visible = ramp < 0 ? 0 : ramp > 1 ? 1 : ramp;
    node.style.opacity = (visible * (selected || hovered ? 1 : 0.88)).toFixed(3);
  });

  return (
    <group ref={reveal} position={[x, 0, z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow {...handlers}>
        <planeGeometry args={[district.rect.w, district.rect.d]} />
        <meshStandardMaterial color={color} roughness={1} metalness={0} />
      </mesh>

      {/* No entrance animation on the label: a CSS delay is one more thing
          that can be mid-flight when a screenshot is taken, and the tinted
          ground underneath already animates in. */}
      <Html position={[0, labelY, 0]} center distanceFactor={labelScale} zIndexRange={[20, 0]}>
        <div
          ref={label}
          style={{
            pointerEvents: "none",
            whiteSpace: "nowrap",
            textAlign: "center",
            fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
            color: "#eef2f3",
            padding: "4px 11px 5px",
            borderRadius: 12,
            background: "rgba(10,15,21,0.46)",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 10px 24px -16px rgba(0,0,0,0.9)",
            backdropFilter: "blur(3px)",
            textShadow: "0 1px 3px rgba(0,0,0,0.55)",
            opacity: 0,
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "0.01em" }}>
            {district.name}
          </div>
          {/* PLAN.md section 8: a renamed district still shows its source. */}
          <div style={{ fontSize: 12.5, opacity: 0.72 }}>
            {district.sourcePath.startsWith("/") ? district.sourcePath : `/${district.sourcePath}`}
          </div>
        </div>
      </Html>
    </group>
  );
}

"use client";

/**
 * A district: a tinted ground region plus a floating label (PLAN.md sections
 * 8 and 42). The label is a drei `<Html>` overlay rather than `<Text>` so the
 * renderer never depends on a font download at runtime.
 *
 * `rect` is min-corner plus extent: the region covers `[x, x + w]` on x and
 * `[z, z + d]` on z.
 */

import { Html } from "@react-three/drei";
import type { District } from "@/types/city";
import { districtCenter } from "./entities";
import { desaturate, districtColor, stateTint, type SceneAtmosphere } from "./palette";
import { useRevealGroup } from "./useReveal";
import { useEntityHandlers, useEntityState } from "./useEntity";

interface DistrictGroundProps {
  district: District;
  index: number;
  atmosphere: SceneAtmosphere;
}

/** Districts settle in right after the roads, before the buildings rise. */
const districtAppearAt = (index: number) => 180 + index * 70;

/**
 * The label fades in on a CSS animation rather than a timer: the delay is the
 * same `appearAt` schedule, and no React state changes while the city builds.
 */
const LABEL_KEYFRAMES =
  "@keyframes repo-city-label-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}";

export default function DistrictGround({ district, index, atmosphere }: DistrictGroundProps) {
  const { hovered, selected } = useEntityState(district.id);
  const handlers = useEntityHandlers(district.id);
  const reveal = useRevealGroup(districtAppearAt(index));
  const [x, , z] = districtCenter(district.rect);

  const color = stateTint(
    desaturate(districtColor(district.colorIndex), atmosphere.desaturation),
    hovered,
    selected,
  );

  return (
    <group ref={reveal} position={[x, 0, z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow {...handlers}>
        <planeGeometry args={[district.rect.w, district.rect.d]} />
        <meshStandardMaterial color={color} roughness={1} metalness={0} />
      </mesh>

      <Html position={[0, 9, 0]} center distanceFactor={90} zIndexRange={[20, 0]}>
        <style>{LABEL_KEYFRAMES}</style>
        <div
          style={{
            pointerEvents: "none",
            whiteSpace: "nowrap",
            textAlign: "center",
            fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
            color: "#20303a",
            textShadow: "0 1px 0 rgba(255,255,255,0.55)",
            opacity: selected || hovered ? 1 : 0.82,
            animation: `repo-city-label-in 420ms ease-out ${districtAppearAt(index) + 260}ms both`,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.01em" }}>
            {district.name}
          </div>
          <div style={{ fontSize: 15, opacity: 0.7 }}>/{district.sourcePath}</div>
        </div>
      </Html>
    </group>
  );
}

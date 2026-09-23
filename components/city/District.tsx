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
 * clear it, and the label sits on a dark glass pill so it survives a pale
 * facade underneath.
 *
 * All the labels are laid out together, once a frame (`DistrictLabels`,
 * `labels.ts`). Each scales with distance like a thing in the world, as at
 * the overview it always has, but only up to a cap: coming down into the
 * streets it stops growing and fades out rather than becoming a screen-high
 * caption over the thing being inspected. And where two would overlap, the
 * less important one (fewer buildings, not hovered, not selected) fades out
 * until the view gives it room.
 *
 * A village (PLAN.md 76.11) has no tinted ground: its districts are lanes of
 * cottages among fields and a plate of colour under each lane would read as
 * a car park. The ground is still there, invisible, so a click on a lane's
 * verge still selects its district, and it shows faintly while hovered or
 * selected. Its label is a little smaller, because a cottage is.
 */

import { useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera, Vector3 } from "three";
import type { SettlementTier } from "@/types/analysis";
import type { District } from "@/types/city";
import { districtCenter } from "./entities";
import {
  LABEL_FOV,
  closeFade,
  drawnScale,
  labelPriority,
  naturalScale,
  placeLabels,
  type LabelBox,
} from "./labels";
import { desaturate, districtColor, stateTint, type SceneAtmosphere } from "./palette";
import { useRevealClock, useRevealGroup } from "./useReveal";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useCityStore } from "@/store/useCityStore";

interface DistrictGroundProps {
  district: District;
  atmosphere: SceneAtmosphere;
  /** The settlement tier; absent means the city. */
  settlement?: SettlementTier;
}

/** A village's district labels, relative to the city's. */
export const VILLAGE_LABEL_SCALE = 0.85;
/** How much of the district tint a village shows while hovered or selected. */
export const VILLAGE_TINT_OPACITY = 0.4;

/** Whether a district draws its tinted ground plate, and how strongly. */
export function groundOpacity(settlement: SettlementTier | undefined, hovered: boolean, selected: boolean): number {
  if (settlement !== "village") return 1;
  return hovered || selected ? VILLAGE_TINT_OPACITY : 0;
}

export default function DistrictGround({ district, atmosphere, settlement }: DistrictGroundProps) {
  const storedTier = useCityStore((s) => s.city?.settlement?.tier);
  const tier = settlement ?? storedTier;
  const village = tier === "village";
  const { hovered, selected } = useEntityState(district.id);
  const handlers = useEntityHandlers(district.id);
  // The generator schedules every reveal, districts included (section 43).
  const reveal = useRevealGroup(district.appearAt);
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
        {village ? (
          <meshStandardMaterial
            color={color}
            roughness={1}
            metalness={0}
            transparent
            opacity={groundOpacity(tier, hovered, selected)}
            depthWrite={false}
          />
        ) : (
          <meshStandardMaterial color={color} roughness={1} metalness={0} />
        )}
      </mesh>
    </group>
  );
}

/** How quickly a label's opacity follows its target, per second. */
const FADE_RATE = 7;
/** A label at rest, and one being pointed at or inspected. */
const REST_OPACITY = 0.88;

interface LabelSlot {
  district: District;
  anchor: Vector3;
  priority: number;
  node: HTMLDivElement | null;
  /** Its own size before scaling, measured once it is in the page. */
  size: [number, number] | null;
  opacity: number;
}

const projected = new Vector3();

/**
 * Every district's label, laid out together once a frame: sized, faded when
 * the camera is close, and thinned where two would overlap (`labels.ts`).
 * Everything is written straight to the nodes: moving the camera must not
 * re-render a district, and must not wait on React (PLAN.md section 43).
 */
export function DistrictLabels({
  districts,
  labelHeights,
  labelScale,
  labelFloor,
  settlement,
}: {
  districts: readonly District[];
  /** Height of each label's anchor, measured by `City.tsx` from the skyline. */
  labelHeights: ReadonlyMap<string, number>;
  /** drei's `distanceFactor` for a city label, scaled so a big city's are not ants. */
  labelScale: number;
  labelFloor: number;
  settlement?: SettlementTier;
}) {
  const clock = useRevealClock();
  const factor = labelScale * (settlement === "village" ? VILLAGE_LABEL_SCALE : 1);
  const slots = useMemo<LabelSlot[]>(
    () =>
      districts.map((district) => {
        const [x, , z] = districtCenter(district.rect);
        return {
          district,
          anchor: new Vector3(x, labelHeights.get(district.id) ?? labelFloor, z),
          priority: district.buildingIds.length,
          node: null,
          size: null,
          opacity: 0,
        };
      }),
    [districts, labelHeights, labelFloor],
  );
  const scales = useRef<number[]>([]);

  useFrame(({ camera, size }, delta) => {
    const { hoveredId, selectedId } = useCityStore.getState();
    const fov = camera instanceof PerspectiveCamera ? camera.fov : LABEL_FOV;
    const since = performance.now() - clock.current;
    const boxes: LabelBox[] = [];
    const fades: number[] = [];
    slots.forEach((slot, i) => {
      const node = slot.node;
      if (node && !slot.size && node.offsetWidth > 0) slot.size = [node.offsetWidth, node.offsetHeight];
      const natural = naturalScale(factor, camera.position.distanceTo(slot.anchor), fov);
      const scale = drawnScale(natural);
      scales.current[i] = scale;
      const fade = closeFade(natural);
      fades[i] = fade;
      projected.copy(slot.anchor).project(camera);
      const hovered = hoveredId === slot.district.id;
      const selected = selectedId === slot.district.id;
      boxes.push({
        id: slot.district.id,
        x: ((projected.x + 1) / 2) * size.width,
        y: ((1 - projected.y) / 2) * size.height,
        w: (slot.size?.[0] ?? 0) * scale,
        h: (slot.size?.[1] ?? 0) * scale,
        priority: labelPriority(slot.priority, hovered, selected),
        visible: slot.size !== null && fade > 0.02 && projected.z < 1 && since >= slot.district.appearAt,
      });
    });
    const shown = placeLabels(boxes);
    const step = Math.min(1, delta * FADE_RATE);
    slots.forEach((slot, i) => {
      const node = slot.node;
      if (!node) return;
      const id = slot.district.id;
      const lit = hoveredId === id || selectedId === id;
      const target = shown.has(id) ? fades[i] * (lit ? 1 : REST_OPACITY) : 0;
      const next = slot.opacity + (target - slot.opacity) * step;
      if (Math.abs(next - slot.opacity) > 0.002 || (next === 0) !== (slot.opacity === 0)) {
        node.style.opacity = next.toFixed(3);
        slot.opacity = next;
      }
      node.style.transform = `scale(${scales.current[i].toFixed(4)})`;
    });
  });

  return (
    <>
      {slots.map((slot) => (
        // No entrance animation on the label: a CSS delay is one more thing
        // that can be mid-flight when a screenshot is taken, and the tinted
        // ground underneath already animates in.
        <Html key={slot.district.id} position={slot.anchor} center zIndexRange={[20, 0]}>
          <div
            ref={(node) => {
              slot.node = node;
              if (!node) slot.size = null;
            }}
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
              transformOrigin: "50% 50%",
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "0.01em" }}>{slot.district.name}</div>
            {/* PLAN.md section 8: a renamed district still shows its source. */}
            <div style={{ fontSize: 12.5, opacity: 0.72 }}>
              {slot.district.sourcePath.startsWith("/") ? slot.district.sourcePath : `/${slot.district.sourcePath}`}
            </div>
          </div>
        </Html>
      ))}
    </>
  );
}

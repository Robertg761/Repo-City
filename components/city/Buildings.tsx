"use client";

/**
 * The building layer (PLAN.md sections 9, 37, 38).
 *
 * Eight procedural archetypes -- house, parapet low-rise, pitched low-rise,
 * sawtooth warehouse, setback mid-rise, mechanical mid-rise, stepped tower,
 * crowned tower -- one `InstancedMesh` each, plus one mesh of lit windows and
 * two of rooftop props. Three hundred buildings therefore cost about eleven
 * draw calls, and every one of them has a roof, a cornice, windows and a door
 * instead of being a stretched box.
 *
 * Which archetype a building wears is decided in `models/buildings`,
 * deterministically, from its tier, kind, language family, role and a hash of
 * its path. Height and footprint still come from the generator's `size`; the
 * archetype only says what shape that volume takes. The language never
 * changes the art style (section 9).
 *
 * Picking still goes through `event.instanceId`, now into the per-archetype
 * `ids` array from `planBuildings`. Hover tints the instance, selection tints
 * it harder, and the ground ring does the rest; neither spawns a mesh.
 *
 * Settlements (PLAN.md 76.1 decision 7): a village builds with cottages,
 * farmhouses and barns and a town with terraces, shopfronts and low blocks
 * of flats (`ARCHETYPE_TABLES`). Those models carry absolute colours for
 * their thatch, tile and glass, and take a wall colour and an accent colour
 * per instance from `palettes.ts`, through `settlementMaterial`. Still one
 * instanced mesh per model. The city's archetypes draw exactly as before.
 */

import { useNearModels } from "./models/useModels";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  InstancedBufferAttribute,
  MeshStandardMaterial,
  Object3D,
  type InstancedMesh,
} from "three";
import type { SettlementTier } from "@/types/analysis";
import type { Building, RoadSegment } from "@/types/city";
import { useCityStore } from "@/store/useCityStore";
import {
  PROP_MESH,
  archetypeGeometry,
  archetypeNearGeometry,
  propBlockGeometry,
  propTankGeometry,
  windowPanelGeometry,
} from "./models/buildings/geometry";
import {
  ACCENT_ATTRIBUTE,
  GLASS_ATTRIBUTE,
  ROOF_ATTRIBUTE,
  SURFACES_ATTRIBUTE,
  buildingDetailMaterial,
  cityPaintMaterial,
  settlementMaterial,
} from "./models/buildings/material";
import { weather } from "./models/buildings/facades";
import { MATERIALS_PALETTE } from "./look";
import { BLENDER_MODELS } from "./models/modelSource";
import { LodInstances } from "./lod";
import { nearSizeAt, propBlockNearGeometry, propTankNearGeometry } from "./models/props/near";
import { useQuality } from "./quality";
import {
  litWindowCount,
  planBuildings,
  type ArchetypeGroup,
  type CityBuildingPlan,
  type PropInstance,
} from "./models/buildings/placement";
import {
  WINDOW_COLOR,
  buildingColor,
  desaturate,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import { revealSettle } from "./reveal";
import { useSky, useSkyFrame } from "./sky";
import { useInstanceHandlers } from "./useEntity";
import { useRevealClock } from "./useReveal";

const scratch = new Object3D();
const scratchColor = new Color();

/** Most buildings of one archetype drawn in detail at once (high tier). */
const BUILDING_NEAR_CAP = 24;
/**
 * The near models run to thousands of triangles (and cast shadows too), so an
 * archetype's cap is what fits this many at once: a 15,000-triangle tower
 * gets eight, a 3,000-triangle house the full cap.
 */
const BUILDING_NEAR_TRIANGLES = 120_000;
const BUILDING_NEAR_MIN = 4;
/**
 * How close to the camera, in world units, a building of its archetype's usual
 * size is drawn in detail. `LodInstances` picks by radius over distance, and a
 * tower's radius is its height, so one size for every archetype would draw the
 * spire in detail from across the whole overview and the house only from a
 * few units; this is the same distance for all, scaled by the size each
 * archetype's instances have. At 64 a 7.5 wide tower spans a few degrees of the
 * view and its window frames are a few pixels: closer than the overview
 * (about 160 out), where nothing is drawn in detail.
 */
const BUILDING_NEAR_DISTANCE = 64;
const PAINTED_ATTRIBUTES = [ACCENT_ATTRIBUTE] as const;
const CITY_PAINTED_ATTRIBUTES = [ACCENT_ATTRIBUTE, ROOF_ATTRIBUTE, GLASS_ATTRIBUTE, SURFACES_ATTRIBUTE] as const;
/** The attribute and its item size, per instance, that a city building's paint fills. */
const CITY_ATTRIBUTE_SIZES: readonly (readonly [string, number])[] = [
  [ACCENT_ATTRIBUTE, 3],
  [ROOF_ATTRIBUTE, 3],
  [GLASS_ATTRIBUTE, 3],
  [SURFACES_ATTRIBUTE, 2],
];
const NO_ATTRIBUTES = [] as const;

/**
 * Rooftop plant in detail: the closest few of a kind, within this many units
 * of the camera for a unit-sized one (they are small and there are many; only
 * a street-level view looks up at a roof this close).
 */
const ROOF_PROP_NEAR_CAP = 32;
const ROOF_PROP_NEAR_DISTANCE = 14;

/** Below this the instance is scaled to nothing rather than drawn as a speck. */
const VISIBLE = 0.002;

function ArchetypeInstances({
  plan,
  group,
  atmosphere,
}: {
  plan: CityBuildingPlan;
  group: ArchetypeGroup;
  atmosphere: SceneAtmosphere;
}) {
  const nearVersion = useNearModels();
  const meshRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);
  const handlers = useInstanceHandlers(group.ids);
  const hoveredId = useCityStore((s) => s.hoveredId);
  const selectedId = useCityStore((s) => s.selectedId);
  const { textureSize, anisotropy } = useQuality();

  const instances = useMemo(
    () => plan.instances.slice(group.offset, group.offset + group.count),
    [plan, group],
  );
  // A settlement model paints its walls and its accents per instance; the
  // city's archetypes shade the district colour, as they always have.
  const painted = instances.length > 0 && instances[0].paint !== undefined;
  // The material palette (the default): the city's own archetypes take a facade, a roof and
  // a glass tint per instance (`facades.ts`).
  const cityPainted = instances.length > 0 && instances[0].city !== undefined;
  const geometry = useMemo(() => {
    const shared = archetypeGeometry(group.model);
    if (!painted && !cityPainted) return shared;
    // The accent is a per-instance attribute on the geometry, so each mesh
    // gets its own shallow copy rather than writing into the shared one.
    const own = shared.clone();
    for (const [name, size] of cityPainted ? CITY_ATTRIBUTE_SIZES : ([[ACCENT_ATTRIBUTE, 3]] as const)) {
      own.setAttribute(
        name,
        new InstancedBufferAttribute(new Float32Array(Math.max(1, instances.length) * size), size),
      );
    }
    return own;
  }, [group.model, painted, cityPainted, instances.length]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the version is the near model arriving
  const nearGeometry = useMemo(() => archetypeNearGeometry(group.model), [group.model, nearVersion]);
  const near = useMemo(() => {
    if (!nearGeometry) return { cap: 0, size: 0 };
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere?.radius ?? 1;
    let scale = 0;
    for (const instance of instances) {
      const [w, , d] = instance.building.size;
      scale += Math.max(w, instance.height, d);
    }
    scale /= Math.max(1, instances.length);
    const triangles = (nearGeometry.index?.count ?? nearGeometry.getAttribute("position").count) / 3;
    const cap = Math.floor(BUILDING_NEAR_TRIANGLES / Math.max(1, triangles));
    return {
      cap: Math.min(BUILDING_NEAR_CAP, Math.max(BUILDING_NEAR_MIN, cap)),
      size: (radius * scale) / BUILDING_NEAR_DISTANCE,
    };
  }, [nearGeometry, geometry, instances]);
  const material = useMemo(
    () => cityPainted
      ? cityPaintMaterial({ flatShading: true, roughness: 0.82, metalness: 0 }, { textureSize, anisotropy, surfaceAttribute: true })
      : painted
      ? settlementMaterial({ flatShading: true, roughness: 0.84, metalness: 0 }, { textureSize, anisotropy, surfaceAttribute: true })
      : buildingDetailMaterial({ flatShading: true, roughness: 0.82, metalness: 0 }, { textureSize, anisotropy, surfaceAttribute: true }),
    [painted, cityPainted, textureSize, anisotropy],
  );
  useEffect(
    () => () => {
      if (painted || cityPainted) geometry.dispose();
    },
    [geometry, painted, cityPainted],
  );
  useEffect(() => () => material.dispose(), [material]);
  // Health drains a settlement or district colour as it always has; on the
  // materials palette it weathers instead (`facades.weather`).
  const baseColors = useMemo(
    () =>
      instances.map((instance) =>
        instance.city
          ? weather(instance.city.wall, atmosphere.desaturation)
          : desaturate(
              instance.paint?.wall ?? buildingColor(instance.building.colorIndex),
              atmosphere.desaturation,
            ),
      ),
    [instances, atmosphere.desaturation],
  );
  const accentColors = useMemo(
    () =>
      instances.map((instance) =>
        instance.city
          ? weather(instance.city.accent, atmosphere.desaturation)
          : instance.paint
            ? desaturate(instance.paint.accent, atmosphere.desaturation)
            : null,
      ),
    [instances, atmosphere.desaturation],
  );
  const cityColors = useMemo(
    () =>
      instances.map((instance) =>
        instance.city
          ? {
              roof: weather(instance.city.roof, atmosphere.desaturation),
              glass: weather(instance.city.glass, atmosphere.desaturation),
            }
          : null,
      ),
    [instances, atmosphere.desaturation],
  );

  // A new geometry or material -- the quality tier changing the texture size
  // -- remounts the mesh with fresh instance matrices, so it has to be laid
  // out again or every building sits at the origin at unit scale.
  useEffect(() => {
    settled.current = false;
  }, [clock, plan, group, geometry, material]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || settled.current) return;
    const now = performance.now();
    let done = true;

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const b = instance.building;
      // A settle rather than a plain ease-out: the building rises a few
      // percent past its height and drops onto it, which reads as
      // construction rather than inflation (PLAN.md section 43).
      const grow = revealSettle(now, clock.current, b.appearAt);
      if (grow < 1) done = false;
      const height = Math.max(instance.height * grow, 0.0001);
      const visible = grow > VISIBLE;
      // The door's quarter turn may have swapped the model's axes; the plot
      // the generator reserved is unchanged either way.
      const sx = instance.swapped ? b.size[2] : b.size[0];
      const sz = instance.swapped ? b.size[0] : b.size[2];
      scratch.position.set(b.position[0], b.position[1], b.position[2]);
      scratch.rotation.set(0, instance.yaw, 0);
      scratch.scale.set(visible ? sx : 0, height, visible ? sz : 0);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (done) settled.current = true;
  });

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const accent = geometry.getAttribute(ACCENT_ATTRIBUTE) as InstancedBufferAttribute | undefined;
    const roof = geometry.getAttribute(ROOF_ATTRIBUTE) as InstancedBufferAttribute | undefined;
    const glass = geometry.getAttribute(GLASS_ATTRIBUTE) as InstancedBufferAttribute | undefined;
    const surfaces = geometry.getAttribute(SURFACES_ATTRIBUTE) as InstancedBufferAttribute | undefined;
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const b = instance.building;
      const hovered = b.id === hoveredId;
      const selected = b.id === selectedId;
      scratchColor.set(stateTint(baseColors[i], hovered, selected));
      // A little hue and value drift inside the district's own colour: a block
      // of twelve buildings should not be twelve copies (PLAN.md section 4).
      // A settlement wall already has its own colour, so it drifts less.
      const drift = instance.paint || instance.city ? 0.5 : 1;
      scratchColor.offsetHSL(instance.hueShift * drift, instance.satShift * drift, instance.lightShift * drift);
      mesh.setColorAt(i, scratchColor);
      const accentHex = accentColors[i];
      if (accent && accentHex) {
        scratchColor.set(stateTint(accentHex, hovered, selected));
        accent.setXYZ(i, scratchColor.r, scratchColor.g, scratchColor.b);
      }
      const city = cityColors[i];
      if (city && roof && glass && surfaces) {
        // The roof and the glass follow hover and selection like the wall.
        scratchColor.set(stateTint(city.roof, hovered, selected));
        roof.setXYZ(i, scratchColor.r, scratchColor.g, scratchColor.b);
        scratchColor.set(stateTint(city.glass, hovered, selected));
        glass.setXYZ(i, scratchColor.r, scratchColor.g, scratchColor.b);
        surfaces.setXY(i, instance.city?.wallSurface ?? 0, instance.city?.roofSurface ?? 0);
      }
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (accent) accent.needsUpdate = true;
    if (roof) roof.needsUpdate = true;
    if (glass) glass.needsUpdate = true;
    if (surfaces) surfaces.needsUpdate = true;
    // `material` too: a new one remounts the mesh without its colours.
  }, [instances, baseColors, accentColors, cityColors, geometry, material, hoveredId, selectedId]);

  return (
    // Vertex colours carry the roof, cornice, door and window shading; the
    // instance colour carries the district. One material, one draw call for
    // the lean level, one more for the few buildings drawn in detail.
    <LodInstances
      ref={meshRef}
      geometry={geometry}
      nearGeometry={nearGeometry}
      material={material}
      count={instances.length}
      maxNear={near.cap}
      nearSize={near.size}
      instancedAttributes={cityPainted ? CITY_PAINTED_ATTRIBUTES : painted ? PAINTED_ATTRIBUTES : NO_ATTRIBUTES}
      handlers={handlers}
      castShadow
      receiveShadow
    />
  );
}

/**
 * The colours a lit window shows at night, relative to `WINDOW_COLOR`: most
 * are warm lamplight, some a paler white, a few the cool blue of a screen.
 * By day every window is the plain pale gold it has always been.
 */
const NIGHT_TONES: readonly { share: number; tint: [number, number, number] }[] = [
  { share: 0.58, tint: [1, 0.9, 0.72] },
  { share: 0.84, tint: [1, 1.08, 1.32] },
  { share: 1, tint: [0.8, 1.1, 1.6] },
];

function nightTone(tone: number): [number, number, number] {
  return (NIGHT_TONES.find((entry) => tone < entry.share) ?? NIGHT_TONES[NIGHT_TONES.length - 1]).tint;
}

/** The windows' emissive strength for an hour. Auto's is what it always was. */
export function windowEmissive(atmosphere: SceneAtmosphere): number {
  const lit = windowLit(atmosphere);
  const day = 0.1 + atmosphere.windowGlow * 0.35;
  const dark = 0.15 + atmosphere.windowGlow * 1.1 + atmosphere.nightness * 0.45;
  return day + (dark - day) * lit;
}

/**
 * How much the lit panes are "on", 0..1: by day they are only an occupied
 * cue, a warm tint behind the glazing bars rather than a bright cream pane
 * over them; they come up through the golden hour and are full at night.
 */
export function windowLit(atmosphere: SceneAtmosphere): number {
  return Math.min(1, Math.max(atmosphere.nightness, atmosphere.evening * 0.7));
}

/** The share of the pane's colour a window keeps at a level of `windowLit`. */
export const windowDim = (lit: number): number => 0.28 + 0.72 * lit;

/**
 * A window material whose glow takes each instance's colour too, so one
 * mesh can light some panes amber and others screen-blue. `MeshStandard`
 * multiplies only the surface colour by the instance colour; the emissive
 * term is multiplied here as well.
 */
function windowMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: WINDOW_COLOR,
    emissive: WINDOW_COLOR,
    roughness: 0.4,
    metalness: 0,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif",
    );
  };
  material.customProgramCacheKey = () => "lit-window";
  return material;
}

/**
 * The lit windows, as one mesh of quads sitting just proud of the dark panes
 * baked into every archetype. The hour's `litWindowShare` decides which
 * buildings are awake; the dark panes keep the facades readable in daylight
 * either way (PLAN.md section 19).
 *
 * The plan holds every window that could be lit, sorted by the order the
 * buildings light up in, so the hour only changes how many instances draw
 * (`litWindowCount`), their glow, and at night their colour. None of that
 * re-plans the city or touches a matrix.
 */
function LitWindows({ plan }: { plan: CityBuildingPlan }) {
  const meshRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);
  const geometry = useMemo(() => windowPanelGeometry(), []);
  const material = useMemo(() => windowMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);
  const windows = plan.windows;
  const sky = useSky();
  const tinted = useRef(-1);

  useEffect(() => {
    settled.current = false;
    tinted.current = -1;
  }, [clock, plan]);

  useSkyFrame((atmosphere) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.count = litWindowCount(windows, atmosphere.litWindowShare);
    (mesh.material as MeshStandardMaterial).emissiveIntensity = windowEmissive(atmosphere);
    // Colour only moves with the night, and only in steps worth a write.
    const night = Math.round(atmosphere.nightness * 40) / 40;
    const lit = Math.round(windowLit(atmosphere) * 40) / 40;
    const stamp = night * 100 + lit;
    if (stamp === tinted.current) return;
    tinted.current = stamp;
    const dim = windowDim(lit);
    for (let i = 0; i < windows.length; i++) {
      const [r, g, b] = nightTone(windows[i].tone);
      scratchColor.setRGB(dim * (1 + (r - 1) * night), dim * (1 + (g - 1) * night), dim * (1 + (b - 1) * night));
      mesh.setColorAt(i, scratchColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, plan);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || settled.current) return;
    const now = performance.now();
    let done = true;

    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const instance = plan.instances[w.buildingIndex];
      const b = instance.building;
      const grow = revealSettle(now, clock.current, b.appearAt);
      if (grow < 1) done = false;
      const height = instance.height * grow;
      const visible = grow > VISIBLE;
      const sx = instance.swapped ? b.size[2] : b.size[0];
      const sz = instance.swapped ? b.size[0] : b.size[2];
      const cos = Math.cos(instance.yaw);
      const sin = Math.sin(instance.yaw);
      const lx = w.ox * sx;
      const lz = w.oz * sz;
      scratch.position.set(
        b.position[0] + lx * cos + lz * sin,
        b.position[1] + w.oy * height,
        b.position[2] - lx * sin + lz * cos,
      );
      scratch.rotation.set(0, instance.yaw + w.panelYaw, 0);
      const width = w.uw * (w.alongX ? sx : sz);
      scratch.scale.set(visible ? width : 0, visible ? w.uh * height : 0, 1);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (done) settled.current = true;
  });

  if (windows.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, windows.length]}
      count={litWindowCount(windows, sky.atmosphere.litWindowShare)}
      frustumCulled={false}
    />
  );
}

/** Air-conditioning units, vents, skylights, masts and water tanks. */
function RoofProps({
  plan,
  props,
  geometry,
  nearGeometry,
  atmosphere,
}: {
  plan: CityBuildingPlan;
  props: PropInstance[];
  geometry: ReturnType<typeof propBlockGeometry>;
  /** The detailed model for the closest few, or null to draw only the lean one. */
  nearGeometry: ReturnType<typeof propBlockGeometry> | null;
  atmosphere: SceneAtmosphere;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);
  const { textureSize, anisotropy } = useQuality();
  const material = useMemo(
    () => buildingDetailMaterial({ flatShading: true, roughness: 0.7, metalness: 0.1 }, {
      textureSize, anisotropy, surfaceAttribute: geometry.hasAttribute("surface"), surface: 7,
    }),
    [geometry, textureSize, anisotropy],
  );
  useEffect(() => () => material.dispose(), [material]);

  const colors = useMemo(
    () =>
      props.map((prop) => {
        const base =
          prop.kind === "skylight" ? mix("#9fb4bd", "#dfe6e6", 0.5) : prop.kind === "antenna" ? "#8d9195" : "#a7a9a8";
        return desaturate(base, atmosphere.desaturation);
      }),
    [props, atmosphere.desaturation],
  );

  useEffect(() => {
    settled.current = false;
    // The material follows the quality tier; a new one remounts the mesh.
  }, [clock, plan, props, material]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < props.length; i++) {
      scratchColor.set(colors[i]);
      mesh.setColorAt(i, scratchColor);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [props, colors, material]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || settled.current) return;
    const now = performance.now();
    let done = true;

    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      const instance = plan.instances[prop.buildingIndex];
      const b = instance.building;
      const grow = revealSettle(now, clock.current, b.appearAt);
      if (grow < 1) done = false;
      const height = instance.height * grow;
      const visible = grow > 0.98;
      const sx = instance.swapped ? b.size[2] : b.size[0];
      const sz = instance.swapped ? b.size[0] : b.size[2];
      const cos = Math.cos(instance.yaw);
      const sin = Math.sin(instance.yaw);
      const lx = prop.x * sx;
      const lz = prop.z * sz;
      scratch.position.set(
        b.position[0] + lx * cos + lz * sin,
        b.position[1] + prop.y * height,
        b.position[2] - lx * sin + lz * cos,
      );
      scratch.rotation.set(0, instance.yaw + prop.spin, 0);
      // Props arrive with the last of the settle rather than growing with the
      // building: a water tank does not inflate.
      scratch.scale.set(
        visible ? prop.size[0] : 0,
        visible ? prop.size[1] : 0,
        visible ? prop.size[2] : 0,
      );
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (done) settled.current = true;
  });

  if (props.length === 0) return null;

  return (
    <LodInstances
      ref={meshRef}
      geometry={geometry}
      nearGeometry={nearGeometry}
      material={material}
      count={props.length}
      maxNear={ROOF_PROP_NEAR_CAP}
      nearSize={nearSizeAt(geometry, ROOF_PROP_NEAR_DISTANCE)}
      castShadow
    />
  );
}

export default function Buildings({
  buildings,
  atmosphere,
  settlement,
  roads,
}: {
  buildings: readonly Building[];
  atmosphere: SceneAtmosphere;
  /**
   * The settlement tier and the street network. `City.tsx` may pass them;
   * until it does they come from the model in the store, and a model without
   * a settlement is today's city.
   */
  settlement?: SettlementTier;
  roads?: readonly RoadSegment[];
}) {
  useNearModels();
  const storedTier = useCityStore((s) => s.city?.settlement?.tier);
  const storedRoads = useCityStore((s) => s.city?.roads);
  const tier = settlement ?? storedTier ?? "city";
  const network = roads ?? storedRoads;
  // Every window that could ever be lit, in the order the city lights up:
  // the hour picks how many of them draw (`LitWindows`).
  const plan = useMemo(
    () =>
      planBuildings(buildings, {
        litShare: 1,
        settlement: tier,
        roads: network,
        materials: MATERIALS_PALETTE && BLENDER_MODELS,
      }),
    [buildings, tier, network],
  );
  const blockProps = useMemo(
    () => plan.props.filter((prop) => PROP_MESH[prop.kind] === "block"),
    [plan],
  );
  const tankProps = useMemo(
    () => plan.props.filter((prop) => PROP_MESH[prop.kind] === "tank"),
    [plan],
  );

  return (
    <group>
      {plan.groups.map((group) => (
        <ArchetypeInstances
          key={group.model}
          plan={plan}
          group={group}
          atmosphere={atmosphere}
        />
      ))}
      <LitWindows plan={plan} />
      <RoofProps
        plan={plan}
        props={blockProps}
        geometry={propBlockGeometry()}
        nearGeometry={propBlockNearGeometry()}
        atmosphere={atmosphere}
      />
      <RoofProps
        plan={plan}
        props={tankProps}
        geometry={propTankGeometry()}
        nearGeometry={propTankNearGeometry()}
        atmosphere={atmosphere}
      />
    </group>
  );
}

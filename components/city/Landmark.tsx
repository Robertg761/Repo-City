"use client";

/**
 * The infrastructure landmarks (PLAN.md sections 14, 15, 16, 20):
 *
 *   power   CI            plant with cooling towers, a switchyard and pylons;
 *                         `state` drives beacons, smoke and a cold stack
 *   fire    tests         station with bays and engines; `level` drives the size
 *   info    docs          kiosk, visitor centre or library; `level` drives which
 *   station releases      platforms, canopy, a tunnel and trains that keep
 *                         the generator's arrivals-per-minute timetable
 *   civic   the repo      the town hall at the centre of the city
 *
 * Primitive assemblies only: no external models anywhere in this project.
 *
 * The shapes live in `components/city/models/landmarks/*`, which merges the
 * hundred-odd boxes and cylinders of a landmark into one geometry per MATERIAL
 * (see `assembly.ts`). This file is only the material, the state and the
 * animation on top: five or six meshes each, not a hundred.
 *
 * Every assembly is modelled at the natural size recorded in
 * `NATURAL_LANDMARK_SIZE` (lib/city/layout.ts). The generator reserves a plot
 * for each landmark and reports it in `landmark.size`; this component scales
 * the assembly uniformly into that plot, which is what guarantees a power
 * station never lands on top of a block of buildings. Anchors used by the
 * effects below are in that same natural frame, so they scale with it.
 *
 * A village (PLAN.md 76.1 decision 7) has its own set, modelled at house
 * scale in `models/landmarks/village.ts`: a chapel on the green instead of
 * the domed hall, a single-bay fire station, a halt on a single line and a
 * substation instead of the power station. They fit their plot the same
 * way, except that they are never enlarged past their natural size: a
 * chapel blown up to fill a big plot would tower over the cottages. A town
 * keeps the city's models; its hall is the town hall.
 */

import type { FireSlot } from "./models/landmarks/fire";
import type { Slots } from "./models/landmarks/assembly";
import { useNearModels } from "./models/useModels";
import { useCallback, useEffect, useMemo, useRef, type Ref } from "react";
import { useFrame } from "@react-three/fiber";
import { Matrix4, MeshStandardMaterial, Plane, Vector3, type BufferGeometry, type Group, type InstancedMesh } from "three";
import { buildingDetailMaterial } from "./models/buildings/material";
import { useQuality } from "./quality";
import { NATURAL_LANDMARK_SIZE } from "@/lib/city/layout";
import type { SettlementTier } from "@/types/analysis";
import type { Landmark } from "@/types/city";
import { useCityStore } from "@/store/useCityStore";
import {
  CIVIC_COLOR,
  CIVIC_ROOF,
  CONCRETE,
  HAZARD_RED,
  TREE_LEAF,
  WARNING_ORANGE,
  WINDOW_COLOR,
  desaturate,
  litWindowGlow,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import { BatchEntity } from "./Batch";
import { Beacon, Glow, Smoke, Sparks } from "./effects";
import { facingTurn } from "./models/landmarks/facing";
import { POWER_ANCHORS, powerMode, powerPlant } from "./models/landmarks/power";
import { SORTIE_PERIOD, SORTIE_TRAVEL, fireStation, fireStationLive, sortieAt, type Sortie } from "./models/landmarks/fire";
import { AviationLight, FlashLight } from "./landmarkLife";
import { placePhase } from "./effects";
import { infoCentre } from "./models/landmarks/info";
import {
  PARKED_X,
  PORTAL_X,
  TRACK_A,
  TRACK_B,
  WHEEL_RADIUS,
  fallbackArrivals,
  trainCars,
  trainParts,
  trainPose,
  transitStation,
  tunnelShade,
  type Pantograph,
  type TrainParts,
} from "./models/landmarks/station";
import { townHall } from "./models/landmarks/townhall";
import {
  chapelNear,
  fireStationNearLive,
  haltNear,
  infoCentreNear,
  powerPlantNear,
  substationNear,
  townHallNear,
  trainCarsNear,
  trainPartsNear,
  transitStationNear,
  villageFireStationNear,
} from "./models/landmarks/near";
import {
  VILLAGE_NATURAL_SIZE,
  chapel,
  halt,
  substation,
  villageFireStation,
} from "./models/landmarks/village";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";
import { useSkyFrame, useSkyValue } from "./sky";

interface Skin {
  wall: string;
  roof: string;
  accent: string;
  glow: number;
  /** Atmosphere desaturation plus the hover and selection tint, in one step. */
  tint: (hex: string) => string;
}

/**
 * Landmarks are civic buildings standing in a city of warm beige housing, and
 * the sun is warm: to read as infrastructure rather than as one more block of
 * flats they need cooler, cleaner materials and one saturated accent each.
 * Everything here is derived from the shared palette, so an archived city
 * still drains them all together (PLAN.md sections 4 and 19).
 */
const PALE = mix(CIVIC_COLOR, "#ffffff", 0.45);
const TRIM = mix(CIVIC_COLOR, "#ffffff", 0.75);
const CONCRETE_GREY = mix(CONCRETE, "#7f8683", 0.55);
const SLATE = "#8c9ea3";
const STEEL = "#7d8689";
const DARK_STEEL = "#59626a";
const SIGN_BLUE = "#4d8fce";
const TRANSIT_BLUE = "#4489b4";
const VERDIGRIS = "#7fb1a8";
const ENGINE_RED = mix(HAZARD_RED, "#e05540", 0.5);

/**
 * A landmark is drawn once, so its detailed level (`models/landmarks/near.ts`,
 * 30 to 60 thousand triangles each) replaces the lean one outright instead of
 * standing in for the closest instances, as it does for the instanced layers.
 * The quality governor already steps down when frames sag, and the low tier
 * takes the lean model back: no distance switch is needed for a handful of
 * buildings, and none of them can be seen swapping.
 */
function useDetailed(): boolean {
  // The detailed models arrive after the city is drawn; the near accessors
  // return null until they do, and this asks again when each lands.
  useNearModels();
  return useQuality().tier !== "low";
}

/** One merged slot, drawn with one material. Absent slots draw nothing. */
function Part({
  geometry,
  color,
  roughness = 0.8,
  metalness = 0,
  emissive,
  emissiveIntensity = 0,
  materialRef,
  cast = true,
  receive = true,
  clip,
  instances,
  meshRef,
}: {
  geometry: BufferGeometry | undefined;
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  materialRef?: Ref<MeshStandardMaterial>;
  cast?: boolean;
  receive?: boolean;
  /** World-space clipping planes, shadows included. */
  clip?: Plane[];
  /** Draws this many copies as an instanced mesh, placed by the caller through `meshRef`. */
  instances?: number;
  meshRef?: Ref<InstancedMesh>;
}) {
  const { textureSize, anisotropy } = useQuality();
  const material = useMemo(() => {
    const parameters = {
      color, roughness, metalness,
      emissive: emissive ?? "#000000", emissiveIntensity,
      toneMapped: emissive === undefined,
      clippingPlanes: clip ?? null, clipShadows: clip !== undefined,
      // Only the Blender models carry vertex colours (baked occlusion).
      vertexColors: geometry?.hasAttribute("color") ?? false,
    };
    return buildingDetailMaterial(parameters, {
      textureSize, anisotropy, surfaceAttribute: geometry?.hasAttribute("surface") ?? false,
    });
  }, [geometry, color, roughness, metalness, emissive, emissiveIntensity, clip, textureSize, anisotropy]);
  useEffect(() => () => material.dispose(), [material]);
  if (!geometry) return null;
  if (instances !== undefined) {
    return (
      <instancedMesh
        ref={meshRef}
        key={instances}
        args={[geometry, undefined, instances]}
        castShadow={cast}
        receiveShadow={receive}
        frustumCulled={false}
      >
        <primitive ref={materialRef} object={material} attach="material" />
      </instancedMesh>
    );
  }
  return (
    <mesh geometry={geometry} castShadow={cast} receiveShadow={receive}>
      <primitive ref={materialRef} object={material} attach="material" />
    </mesh>
  );
}

/**
 * CI as the city's power infrastructure (PLAN.md section 14). `state` is
 * exactly `RepoMetrics["ci"]["state"]`, and each value has to read from the
 * overview without ever implying a failure the analysis did not find:
 *
 *   healthy         clean steam off both cooling towers, a lit hall, a green
 *                   board, and the occasional harmless arc across the yard
 *   recent-failure  an amber beacon over the hall, the chimney venting grey,
 *                   sparks in the switchyard
 *   failing         a red beacon, dark smoke, a cold chimney and unsteady
 *                   hall lights
 *   unknown         the plant, running, with an unlit board: there is a CI
 *                   provider but no completed run to report
 *   none            no plant at all, just the substation that keeps the
 *                   lights on. Section 14: do not imply failure.
 */
function PowerPlant({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const state = landmark.state;
  const failing = state === "failing";
  const recent = state === "recent-failure";
  const troubled = failing || recent;
  const bare = state === "none";
  const detailed = useDetailed();
  const slots = (detailed && powerPlantNear(powerMode(state))) || powerPlant(state);
  const windows = useRef<MeshStandardMaterial>(null);
  // The aviation lights are only lit up for the dusk and the dark.
  const night = useRef(0);
  useSkyFrame((sky) => {
    night.current = sky.nightness;
  });

  const lit = troubled ? 0.14 + skin.glow * 0.5 : 0.4 + skin.glow;

  // A failing plant's lights are unsteady; every other state holds a level.
  useFrame(({ clock }) => {
    const material = windows.current;
    if (!material || !failing) return;
    const t = clock.elapsedTime;
    const dip = Math.sin(t * 9.1) * Math.sin(t * 2.7) > 0.55 ? 0.06 : 1;
    material.emissiveIntensity = lit * dip;
  });

  const board = failing
    ? HAZARD_RED
    : recent
      ? WARNING_ORANGE
      : state === "healthy"
        ? "#5fd08a"
        : "#7c8489";

  return (
    <group>
      <Part geometry={slots.deck} color={skin.tint(CONCRETE_GREY)} roughness={0.95} />
      <Part geometry={slots.hull} color={skin.tint(PALE)} roughness={0.82} />
      <Part geometry={slots.cold} color={skin.tint("#857f78")} roughness={0.95} />
      <Part geometry={slots.steel} color={skin.tint(STEEL)} roughness={0.5} metalness={0.35} />
      <Part geometry={slots.hazard} color={skin.tint(HAZARD_RED)} roughness={0.7} />
      <Part
        geometry={slots.glass}
        color={WINDOW_COLOR}
        emissive={WINDOW_COLOR}
        emissiveIntensity={lit}
        materialRef={windows}
        cast={false}
      />

      <mesh position={POWER_ANCHORS.board}>
        <sphereGeometry args={[0.24, 10, 8]} />
        <meshStandardMaterial
          color={board}
          emissive={board}
          // Unlit for `unknown` and `none`: nothing to report is not a fault.
          emissiveIntensity={state === "unknown" || bare ? 0 : 1.8}
          toneMapped={false}
        />
      </mesh>

      {!bare && (
        <>
          <AviationLight position={[POWER_ANCHORS.chimney[0], POWER_ANCHORS.chimney[1] + 0.35, POWER_ANCHORS.chimney[2]]} night={night} />
          <AviationLight position={[-6.9, 8.0, 5.05]} night={night} radius={0.17} />
          <AviationLight position={[0.4, 8.0, 5.05]} night={night} radius={0.17} />
        </>
      )}

      {/* Healthy: steam off the cooling towers and the occasional arc across
          the switchyard, the "subtle electrical effect" of section 14. */}
      {state === "healthy" && (
        <>
          {/* Faint, and low: a healthy plant is quiet, and a puff that drifts
              clear of the tower reads as a bubble rather than as condensate. */}
          <Smoke
            origin={POWER_ANCHORS.towerA}
            color="#f2f5f5"
            rate={0.19}
            height={2.4}
            spread={0.22}
            radius={0.5}
            puffs={3}
            opacity={0.2}
          />
          <Smoke
            origin={POWER_ANCHORS.towerB}
            color="#f2f5f5"
            rate={0.15}
            height={2.1}
            spread={0.22}
            radius={0.5}
            puffs={3}
            opacity={0.18}
          />
        </>
      )}
      {(state === "healthy" || troubled) && !bare && (
        <Sparks
          position={POWER_ANCHORS.switchyard}
          color={failing ? "#ffd9a8" : "#cfe8ff"}
          rate={failing ? 0.75 : state === "healthy" ? 0.11 : 0.4}
          spread={1.5}
          count={failing ? 5 : 3}
        />
      )}

      {troubled && (
        <>
          <Beacon
            position={POWER_ANCHORS.beacon}
            color={failing ? HAZARD_RED : WARNING_ORANGE}
            rate={failing ? 3.2 : 1.6}
            height={2.4}
            glowRadius={failing ? 1.5 : 1.3}
          />
          {/* A failing plant's chimney is the cold one, so its smoke comes off
              the towers that are still being worked; a recent failure vents
              grey from a chimney that is still lit. */}
          {recent && (
            <Smoke
              origin={POWER_ANCHORS.chimney}
              color="#7c7974"
              rate={0.3}
              height={11}
              spread={1.5}
              radius={0.9}
              puffs={5}
              opacity={0.44}
            />
          )}
          {failing && (
            <>
              <Smoke
                origin={POWER_ANCHORS.towerA}
                color="#57544f"
                rate={0.38}
                height={12}
                spread={1.5}
                radius={1.0}
                puffs={6}
                opacity={0.5}
              />
              <Smoke
                origin={POWER_ANCHORS.towerB}
                color="#6b6864"
                rate={0.3}
                height={10}
                spread={1.4}
                radius={0.95}
                puffs={5}
                opacity={0.42}
              />
            </>
          )}
        </>
      )}
    </group>
  );
}

/** The fire station's slots, painted; the station and its engine on call-out share the paint. */
function FireParts({ slots, skin }: { slots: Slots<FireSlot>; skin: Skin }) {
  return (
    <>
      <Part geometry={slots.deck} color={skin.tint(CONCRETE_GREY)} roughness={0.95} />
      <Part geometry={slots.wall} color={skin.tint(PALE)} roughness={0.78} />
      <Part geometry={slots.red} color={skin.tint(ENGINE_RED)} roughness={0.55} />
      <Part geometry={slots.trim} color={skin.tint(TRIM)} roughness={0.6} />
      <Part geometry={slots.steel} color={skin.tint(DARK_STEEL)} roughness={0.5} metalness={0.25} />
      <Part geometry={slots.metal} color={skin.tint(STEEL)} roughness={0.45} metalness={0.35} />
      <Part geometry={slots.dark} color={skin.tint("#4d5359")} roughness={0.8} />
      <Part geometry={slots.green} color={skin.tint(TREE_LEAF)} roughness={0.95} />
      <Part geometry={slots.blue} color={skin.tint("#3d5068")} roughness={0.25} metalness={0.2} />
      <Part
        geometry={slots.glass}
        color={WINDOW_COLOR}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.3 + skin.glow}
        cast={false}
      />
    </>
  );
}

/** Tests as the city's emergency service (PLAN.md section 15). */
function FireStation({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const detailed = useDetailed();
  // The first engine stands apart, so it can drive out on a call-out; without the Blender models it stays put.
  const live = (detailed && fireStationNearLive(landmark.level)) || fireStationLive(landmark.level);
  const { slots, beacons, sortie } = live ?? fireStation(landmark.level);
  const engine = useRef<Group>(null);
  const alarm = useRef(0);
  const state = useRef<Sortie>({ out: 0, alarm: 0 });
  // Stations are never in step: the offset comes from where this one stands.
  const offset = useMemo(
    () => placePhase(landmark.position[0], 0, landmark.position[2]) * SORTIE_PERIOD,
    [landmark.position],
  );

  useFrame(({ clock }) => {
    const pose = sortieAt(clock.elapsedTime, offset, state.current);
    alarm.current = pose.alarm;
    const group = engine.current;
    if (group) group.position.z = (sortie?.spot[2] ?? 0) + pose.out * SORTIE_TRAVEL;
  });

  return (
    <group>
      <FireParts slots={slots} skin={skin} />
      {beacons.map((at, i) => (
        <FlashLight key={i} position={at} color="#ff5f52" radius={0.17} side={i % 2} />
      ))}
      {sortie && (
        <group ref={engine} position={sortie.spot}>
          <FireParts slots={sortie.slots} skin={skin} />
          {sortie.lamps.map((at, i) => (
            <FlashLight key={i} position={at} color="#ff5f52" radius={0.17} side={i % 2} alarm={alarm} />
          ))}
        </group>
      )}
    </group>
  );
}

/** Documentation as the city's wayfinding (PLAN.md section 16). */
function VisitorCenter({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const detailed = useDetailed();
  const { slots, lamps } = (detailed && infoCentreNear(landmark.level)) || infoCentre(landmark.level);

  return (
    <group>
      <Part geometry={slots.deck} color={skin.tint(CONCRETE_GREY)} roughness={0.95} />
      <Part geometry={slots.wall} color={skin.tint(PALE)} roughness={0.76} />
      <Part geometry={slots.roof} color={skin.tint(SLATE)} roughness={0.8} />
      <Part geometry={slots.green} color={skin.tint(TREE_LEAF)} roughness={0.95} />
      {/* Blue-and-white is the wayfinding colour the whole city borrows. */}
      <Part geometry={slots.sign} color={skin.tint(SIGN_BLUE)} roughness={0.55} />
      <Part
        geometry={slots.glass}
        color={mix("#bcd9e4", WINDOW_COLOR, 0.35)}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.25 + skin.glow * 0.9}
        roughness={0.25}
        metalness={0.1}
        cast={false}
      />
      {skin.glow > 0.45 &&
        lamps.map((at, i) => (
          <Glow key={i} position={at} color={WINDOW_COLOR} radius={0.8} rate={0.2} strength={0.36} nightOnly />
        ))}
    </group>
  );
}

/** One train, drawn from the shared geometry. */
function Train({ skin, clip, pantograph }: { skin: Skin; clip?: Plane[]; pantograph: Pantograph }) {
  const detailed = useDetailed();
  const cars = (detailed && trainCarsNear(pantograph)) || trainCars(pantograph);
  return (
    <>
      <Part
        geometry={cars.body}
        color={skin.tint(TRANSIT_BLUE)}
        roughness={0.45}
        metalness={0.1}
        clip={clip}
      />
      <Part
        geometry={cars.gear}
        color={skin.tint(DARK_STEEL)}
        roughness={0.6}
        metalness={0.3}
        clip={clip}
      />
      <Part
        geometry={cars.glass}
        color={WINDOW_COLOR}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.35 + skin.glow}
        cast={false}
        clip={clip}
      />
    </>
  );
}

/** What the station drives on the running train each frame. */
interface TrainControl {
  /** Turns every wheelset to `angle` radians. */
  turn(angle: number): void;
  /** Dims the whole set: 1 in daylight, less inside the tunnel's shade. */
  shade(level: number): void;
}

const wheelMatrix = new Matrix4();

/**
 * The train that runs: the same set as `Train`, but its wheelsets are apart
 * and turn (`control.turn`), and the set can be dimmed as it goes into the
 * tunnel (`control.shade`), so it is swallowed by the dark instead of being
 * cut off at the portal face.
 */
function RunningTrain({
  skin,
  clip,
  pantograph,
  controlRef,
}: {
  skin: Skin;
  clip: Plane[];
  pantograph: Pantograph;
  controlRef: { current: TrainControl | null };
}) {
  const detailed = useDetailed();
  const parts: TrainParts | null = (detailed && trainPartsNear(pantograph)) || trainParts(pantograph);
  const cars = parts?.slots ?? trainCars(pantograph);
  const body = useRef<MeshStandardMaterial>(null);
  const gear = useRef<MeshStandardMaterial>(null);
  const glass = useRef<MeshStandardMaterial>(null);
  const wheelMaterial = useRef<MeshStandardMaterial>(null);
  const wheels = useRef<InstancedMesh>(null);
  const angle = useRef(0);

  useEffect(() => {
    const place = (turn: number) => {
      const mesh = wheels.current;
      if (!mesh || !parts) return;
      for (let i = 0; i < parts.axles.length; i++) {
        const [x, y, z] = parts.axles[i];
        // Turn about the axle (z), then stand at its marker.
        wheelMatrix.makeRotationZ(turn).setPosition(x, y, z);
        mesh.setMatrixAt(i, wheelMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    place(angle.current);
    const dim = (material: MeshStandardMaterial | null, level: number) => {
      if (!material) return;
      const was = (material.userData.shade as number | undefined) ?? 1;
      if (was === level) return;
      // The colour and the glow are scaled from what they were, so the skin's own changes still take.
      material.color.multiplyScalar(level / was);
      material.emissiveIntensity *= level / was;
      material.userData.shade = level;
    };
    controlRef.current = {
      turn(next) {
        angle.current = next;
        place(next);
      },
      shade(level) {
        dim(body.current, level);
        dim(gear.current, level);
        dim(glass.current, level);
        dim(wheelMaterial.current, level);
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [parts, controlRef]);

  return (
    <>
      <Part
        geometry={cars.body}
        color={skin.tint(TRANSIT_BLUE)}
        roughness={0.45}
        metalness={0.1}
        clip={clip}
        materialRef={body}
      />
      <Part
        geometry={cars.gear}
        color={skin.tint(DARK_STEEL)}
        roughness={0.6}
        metalness={0.3}
        clip={clip}
        materialRef={gear}
      />
      {parts?.wheels.gear && (
        <Part
          geometry={parts.wheels.gear}
          color={skin.tint(DARK_STEEL)}
          roughness={0.6}
          metalness={0.3}
          clip={clip}
          instances={parts.axles.length}
          meshRef={wheels}
          materialRef={wheelMaterial}
        />
      )}
      <Part
        geometry={cars.glass}
        color={WINDOW_COLOR}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.35 + skin.glow}
        cast={false}
        clip={clip}
        materialRef={glass}
      />
    </>
  );
}

/** The portal face in the station's natural frame: keep x < PORTAL_X. */
const PORTAL_PLANE = new Plane(new Vector3(-1, 0, 0), PORTAL_X);

/**
 * Releases as the city's shipping (PLAN.md section 20). The running train
 * keeps the generator's timetable: `detail.trainsPerMinute` arrivals a minute
 * out of the tunnel on track A, a stop at the platform, and back in.
 */
function TransitStation({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const level = landmark.level;
  const detailed = useDetailed();
  const { slots, lamps, tracks } = (detailed && transitStationNear(level)) || transitStation(level);
  const perMinute = landmark.detail?.trainsPerMinute ?? fallbackArrivals(level);
  const frame = useRef<Group>(null);
  const train = useRef<Group>(null);
  const clip = useMemo(() => [new Plane()], []);
  const control = useRef<TrainControl | null>(null);
  // Where the running train was last frame (null while it is in the tunnel), and how far its wheels have turned.
  const last = useRef<{ x: number | null; turn: number }>({ x: null, turn: 0 });

  useFrame(({ clock, gl }) => {
    // Clipping is off by default in three.js and only costs anything for the
    // materials that carry planes, which here is the running train alone.
    if (!gl.localClippingEnabled) gl.localClippingEnabled = true;
    const group = train.current;
    const station = frame.current;
    if (!group || !station) return;
    const pose = trainPose(clock.elapsedTime, perMinute);
    group.visible = pose.visible;
    group.position.x = pose.x;
    const wheels = control.current;
    if (wheels) {
      const before = last.current;
      if (pose.visible) {
        // A wheel rolling along +x turns clockwise about +z.
        if (before.x !== null && before.x !== pose.x) {
          before.turn -= (pose.x - before.x) / WHEEL_RADIUS;
          wheels.turn(before.turn);
        }
        before.x = pose.x;
      } else {
        before.x = null;
      }
      wheels.shade(tunnelShade(pose.x));
    }
    // The plane is world space, and the station is scaled, turned and, while
    // the city reveals itself, growing: carry it along every frame.
    clip[0].copy(PORTAL_PLANE).applyMatrix4(station.matrixWorld);
  });

  return (
    <group ref={frame}>
      <Part geometry={slots.deck} color={skin.tint(CONCRETE_GREY)} roughness={0.95} />
      <Part geometry={slots.wall} color={skin.tint(PALE)} roughness={0.78} />
      <Part geometry={slots.roof} color={skin.tint(SLATE)} roughness={0.82} />
      <Part geometry={slots.steel} color={skin.tint(STEEL)} roughness={0.5} metalness={0.35} />
      <Part geometry={slots.accent} color={skin.tint(TRANSIT_BLUE)} roughness={0.6} />
      <Part geometry={slots.dark} color={skin.tint("#1f2427")} roughness={1} cast={false} />
      <Part
        geometry={slots.glass}
        color={WINDOW_COLOR}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.3 + skin.glow}
        cast={false}
      />

      <group ref={train} position={[PORTAL_X + 7, 0, TRACK_A]} visible={false}>
        <RunningTrain skin={skin} clip={clip} pantograph="raised" controlRef={control} />
      </group>
      {tracks === 2 && (
        <group position={[PARKED_X, 0, TRACK_B]} rotation-y={Math.PI}>
          <Train skin={skin} pantograph="lowered" />
        </group>
      )}

      {skin.glow > 0.45 &&
        lamps.map((at, i) => (
          <Glow key={i} position={at} color={WINDOW_COLOR} radius={0.9} rate={0.2} strength={0.36} nightOnly />
        ))}
    </group>
  );
}

/** The repository itself, at the centre of the city (PLAN.md section 23). */
function TownHall({ skin }: { skin: Skin }) {
  const detailed = useDetailed();
  const { slots, lantern } = (detailed && townHallNear()) || townHall();

  return (
    <group>
      <Part geometry={slots.stone} color={skin.tint(SLATE)} roughness={0.9} />
      <Part geometry={slots.wall} color={skin.tint(PALE)} roughness={0.75} />
      {/* A verdigris dome and copper flags: the one civic colour in the city. */}
      <Part geometry={slots.accent} color={skin.tint(VERDIGRIS)} roughness={0.5} metalness={0.2} />
      <Part geometry={slots.metal} color={skin.tint(STEEL)} roughness={0.55} metalness={0.3} />
      <Part
        geometry={slots.glass}
        color={mix("#cfe2ea", WINDOW_COLOR, 0.4)}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.3 + skin.glow}
        roughness={0.3}
        cast={false}
      />
      <mesh position={lantern}>
        <sphereGeometry args={[0.42, 10, 8]} />
        <meshStandardMaterial
          color={WINDOW_COLOR}
          emissive={WINDOW_COLOR}
          emissiveIntensity={0.5 + skin.glow * 1.4}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Village limewash and stone, warmer than the city's civic white. */
const LIMESTONE = "#d8cfbd";
const VILLAGE_SLATE = "#6f7a82";
const OAK = "#6b4e39";
const YEW = "#3f5f45";
const BRICK = "#a8604a";

/** The chapel on the green: the repository itself, in a village (PLAN.md 76.10). */
function Chapel({ skin }: { skin: Skin }) {
  const detailed = useDetailed();
  const { slots, lamp } = (detailed && chapelNear()) || chapel();
  return (
    <group>
      <Part geometry={slots.stone} color={skin.tint(LIMESTONE)} roughness={0.92} />
      <Part geometry={slots.roof} color={skin.tint(VILLAGE_SLATE)} roughness={0.8} />
      <Part geometry={slots.trim} color={skin.tint(TRIM)} roughness={0.7} />
      <Part geometry={slots.wood} color={skin.tint(OAK)} roughness={0.85} />
      <Part geometry={slots.green} color={skin.tint(YEW)} roughness={0.95} />
      <Part geometry={slots.metal} color={skin.tint(DARK_STEEL)} roughness={0.5} metalness={0.3} />
      <Part
        geometry={slots.glass}
        color={mix("#8fa6b4", WINDOW_COLOR, 0.3)}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.2 + skin.glow}
        roughness={0.3}
        cast={false}
      />
      {skin.glow > 0.45 && <Glow position={lamp} color={WINDOW_COLOR} radius={0.7} rate={0.2} strength={0.36} nightOnly />}
    </group>
  );
}

/** The village's retained fire station (PLAN.md section 15, at village scale). */
function VillageFireStation({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const detailed = useDetailed();
  const { slots, beacons } = (detailed && villageFireStationNear(landmark.level)) || villageFireStation(landmark.level);
  return (
    <group>
      <Part geometry={slots.deck} color={skin.tint(CONCRETE_GREY)} roughness={0.95} />
      <Part geometry={slots.wall} color={skin.tint(BRICK)} roughness={0.85} />
      <Part geometry={slots.roof} color={skin.tint(VILLAGE_SLATE)} roughness={0.8} />
      <Part geometry={slots.red} color={skin.tint(ENGINE_RED)} roughness={0.55} />
      <Part geometry={slots.trim} color={skin.tint(TRIM)} roughness={0.6} />
      <Part geometry={slots.steel} color={skin.tint(DARK_STEEL)} roughness={0.5} metalness={0.25} />
      <Part
        geometry={slots.glass}
        color={WINDOW_COLOR}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.3 + skin.glow}
        cast={false}
      />
      {beacons.slice(1).map((at, i) => (
        <FlashLight key={i} position={at} color="#ff5f52" radius={0.14} haloRadius={1.0} side={i % 2} />
      ))}
    </group>
  );
}

/** The halt: releases, at village scale (PLAN.md section 20). */
function Halt({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const detailed = useDetailed();
  const { slots, lamps } = (detailed && haltNear(landmark.level)) || halt(landmark.level);
  return (
    <group>
      <Part geometry={slots.deck} color={skin.tint(mix(CONCRETE_GREY, LIMESTONE, 0.4))} roughness={0.95} />
      <Part geometry={slots.wall} color={skin.tint(PALE)} roughness={0.8} />
      <Part geometry={slots.roof} color={skin.tint(VILLAGE_SLATE)} roughness={0.82} />
      <Part geometry={slots.steel} color={skin.tint(STEEL)} roughness={0.5} metalness={0.35} />
      <Part geometry={slots.accent} color={skin.tint(mix(TRANSIT_BLUE, "#2f6a52", 0.55))} roughness={0.6} />
      <Part geometry={slots.dark} color={skin.tint("#5b554e")} roughness={1} />
      <Part geometry={slots.wood} color={skin.tint(OAK)} roughness={0.9} />
      <Part
        geometry={slots.glass}
        color={WINDOW_COLOR}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.3 + skin.glow}
        cast={false}
      />
      {skin.glow > 0.45 &&
        lamps.map((at, i) => (
          <Glow key={i} position={at} color={WINDOW_COLOR} radius={0.7} rate={0.2} strength={0.36} nightOnly />
        ))}
    </group>
  );
}

/**
 * CI in a village: the substation that feeds it (PLAN.md section 14). The
 * lamp on the hut says what the CI says; `unknown` and `none` leave it dark,
 * because nothing to report is not a fault.
 */
function Substation({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const detailed = useDetailed();
  const { slots, anchors } = (detailed && substationNear()) || substation();
  const state = landmark.state;
  const failing = state === "failing";
  const recent = state === "recent-failure";
  const lamp = failing ? HAZARD_RED : recent ? WARNING_ORANGE : state === "healthy" ? "#5fd08a" : "#7c8489";
  return (
    <group>
      <Part geometry={slots.deck} color={skin.tint(mix(CONCRETE_GREY, "#9a9384", 0.5))} roughness={0.98} />
      <Part geometry={slots.hull} color={skin.tint(mix(PALE, "#b8c2bf", 0.5))} roughness={0.7} />
      <Part geometry={slots.steel} color={skin.tint(STEEL)} roughness={0.5} metalness={0.35} />
      <Part geometry={slots.hazard} color={skin.tint(WARNING_ORANGE)} roughness={0.7} />
      <Part geometry={slots.dark} color={skin.tint("#69717a")} roughness={0.8} />
      <Part geometry={slots.wood} color={skin.tint(OAK)} roughness={0.9} />
      <Part geometry={slots.glass} color={skin.tint("#9fb9c4")} roughness={0.3} metalness={0.1} />
      <mesh position={anchors.lamp}>
        <sphereGeometry args={[0.16, 8, 6]} />
        <meshStandardMaterial
          color={lamp}
          emissive={lamp}
          emissiveIntensity={state === "unknown" || state === "none" ? 0 : 1.8}
          toneMapped={false}
        />
      </mesh>
      {(failing || recent) && (
        <Sparks
          position={anchors.yard}
          color={failing ? "#ffd9a8" : "#cfe8ff"}
          rate={failing ? 0.7 : 0.35}
          spread={0.9}
          count={failing ? 4 : 2}
        />
      )}
      {failing && (
        <Beacon position={anchors.lamp} color={HAZARD_RED} rate={3.2} height={0.6} glowRadius={0.9} />
      )}
    </group>
  );
}

export default function LandmarkPiece({
  landmark,
  atmosphere,
  settlement,
}: {
  landmark: Landmark;
  atmosphere: SceneAtmosphere;
  /** The settlement tier; read from the model in the store when not passed. */
  settlement?: SettlementTier;
}) {
  const { hovered, selected } = useEntityState(landmark.id);
  const handlers = useEntityHandlers(landmark.id);
  const reveal = useRevealGroup(landmark.appearAt);
  const storedTier = useCityStore((s) => s.city?.settlement?.tier);
  const village = (settlement ?? storedTier) === "village";

  const natural = village
    ? VILLAGE_NATURAL_SIZE[landmark.landmarkType as keyof typeof VILLAGE_NATURAL_SIZE] ??
      NATURAL_LANDMARK_SIZE[landmark.landmarkType]
    : NATURAL_LANDMARK_SIZE[landmark.landmarkType];
  const plotFit = landmark.size
    ? Math.min(landmark.size[0] / natural[0], landmark.size[2] / natural[2])
    : 1;
  // A village building is modelled at house scale: shrink it into a small
  // plot, never blow it up to fill a big one.
  const fit = village ? Math.min(plotFit, 1) : plotFit;

  const tint = useCallback(
    (hex: string) => stateTint(desaturate(hex, atmosphere.desaturation), hovered, selected),
    [atmosphere.desaturation, hovered, selected],
  );

  // Lit with the city's windows, and more at night: the power plant, the
  // fire station and the station are landmarks after dark too (`sky.tsx`).
  const glow = useSkyValue((a) => litWindowGlow(a) + a.nightness * 0.05);
  const skin: Skin = {
    wall: tint(CIVIC_COLOR),
    roof: tint(CIVIC_ROOF),
    accent: tint("#7fa9bd"),
    glow,
    tint,
  };

  return (
    <group
      ref={reveal}
      position={landmark.position}
      rotation-y={landmark.rotationY}
      {...handlers}
    >
      <BatchEntity id={landmark.id}>
        <group scale={fit} rotation-y={facingTurn(landmark.rotationY)}>
          {village ? (
            <>
              {landmark.landmarkType === "power" && <Substation landmark={landmark} skin={skin} />}
              {landmark.landmarkType === "fire" && <VillageFireStation landmark={landmark} skin={skin} />}
              {/* The kiosk: a village's documentation is a notice board, not a library. */}
              {landmark.landmarkType === "info" && (
                <VisitorCenter landmark={{ ...landmark, level: 1 }} skin={skin} />
              )}
              {landmark.landmarkType === "station" && <Halt landmark={landmark} skin={skin} />}
              {landmark.landmarkType === "civic" && <Chapel skin={skin} />}
            </>
          ) : (
            <>
              {landmark.landmarkType === "power" && <PowerPlant landmark={landmark} skin={skin} />}
              {landmark.landmarkType === "fire" && <FireStation landmark={landmark} skin={skin} />}
              {landmark.landmarkType === "info" && <VisitorCenter landmark={landmark} skin={skin} />}
              {landmark.landmarkType === "station" && <TransitStation landmark={landmark} skin={skin} />}
              {landmark.landmarkType === "civic" && <TownHall skin={skin} />}
            </>
          )}
        </group>
      </BatchEntity>
    </group>
  );
}

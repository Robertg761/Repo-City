"use client";

/**
 * The infrastructure landmarks (PLAN.md sections 14, 15, 16, 20):
 *
 *   power   CI            plant with cooling towers, a switchyard and pylons;
 *                         `state` drives beacons, smoke and a cold stack
 *   fire    tests         station with bays and engines; `level` drives the size
 *   info    docs          kiosk, visitor centre or library; `level` drives which
 *   station releases      platforms, canopy, track and a running train
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
 */

import { useCallback, useRef, type Ref } from "react";
import { useFrame } from "@react-three/fiber";
import type { BufferGeometry, Group, MeshStandardMaterial } from "three";
import { NATURAL_LANDMARK_SIZE } from "@/lib/city/layout";
import type { Landmark } from "@/types/city";
import {
  CIVIC_COLOR,
  CIVIC_ROOF,
  CONCRETE,
  HAZARD_RED,
  TREE_LEAF,
  WARNING_ORANGE,
  WINDOW_COLOR,
  desaturate,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import { Beacon, BlinkLight, Glow, Smoke, Sparks } from "./effects";
import { facingTurn } from "./models/landmarks/facing";
import { POWER_ANCHORS, powerPlant } from "./models/landmarks/power";
import { fireStation } from "./models/landmarks/fire";
import { infoCentre } from "./models/landmarks/info";
import {
  PARKED_X,
  TRACK_A,
  TRACK_B,
  TRAIN_CENTRE,
  TRAIN_SPAN,
  trainCars,
  transitStation,
} from "./models/landmarks/station";
import { townHall } from "./models/landmarks/civic";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealGroup } from "./useReveal";

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
const DARK_STEEL = "#414950";
const SIGN_BLUE = "#4d8fce";
const TRANSIT_BLUE = "#4489b4";
const VERDIGRIS = "#7fb1a8";
const ENGINE_RED = mix(HAZARD_RED, "#e05540", 0.5);

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
}) {
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow={cast} receiveShadow={receive}>
      <meshStandardMaterial
        ref={materialRef}
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissiveIntensity}
        toneMapped={emissive === undefined}
      />
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
  const slots = powerPlant(state);
  const windows = useRef<MeshStandardMaterial>(null);

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
      <Part geometry={slots.cold} color={skin.tint("#6f6a64")} roughness={0.95} />
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

/** Tests as the city's emergency service (PLAN.md section 15). */
function FireStation({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const { slots, beacons } = fireStation(landmark.level);

  return (
    <group>
      <Part geometry={slots.deck} color={skin.tint(CONCRETE_GREY)} roughness={0.95} />
      <Part geometry={slots.wall} color={skin.tint(PALE)} roughness={0.78} />
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
      {beacons.map((at, i) => (
        <BlinkLight key={i} position={at} color="#ff5f52" rate={1.8} radius={0.17} />
      ))}
    </group>
  );
}

/** Documentation as the city's wayfinding (PLAN.md section 16). */
function VisitorCenter({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const { slots, lamps } = infoCentre(landmark.level);

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
          <Glow key={i} position={at} color={WINDOW_COLOR} radius={0.8} rate={0.2} strength={0.16} />
        ))}
    </group>
  );
}

/** One train, drawn from the shared geometry. */
function Train({ skin }: { skin: Skin }) {
  const cars = trainCars();
  return (
    <>
      <Part geometry={cars.body} color={skin.tint(TRANSIT_BLUE)} roughness={0.45} metalness={0.1} />
      <Part geometry={cars.gear} color={skin.tint(DARK_STEEL)} roughness={0.6} metalness={0.3} />
      <Part
        geometry={cars.glass}
        color={WINDOW_COLOR}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.35 + skin.glow}
        cast={false}
      />
    </>
  );
}

/** Releases as the city's shipping (PLAN.md section 20). */
function TransitStation({ landmark, skin }: { landmark: Landmark; skin: Skin }) {
  const level = landmark.level;
  const { slots, lamps, tracks } = transitStation(level);
  const train = useRef<Group>(null);
  const speed = level === 0 ? 0 : 1.2 + level * 1.1;

  useFrame(({ clock }, delta) => {
    const group = train.current;
    if (!group || speed === 0) return;
    const t = clock.elapsedTime * speed * 0.18;
    group.position.x = TRAIN_CENTRE + Math.sin(t) * TRAIN_SPAN;
    // The set turns round at each end rather than running backwards, which is
    // what a terminus does and what stops the locomotive reading as a caboose.
    const heading = Math.cos(t) >= 0 ? 0 : Math.PI;
    group.rotation.y += (heading - group.rotation.y) * Math.min(1, delta * 3.5);
  });

  return (
    <group>
      <Part geometry={slots.deck} color={skin.tint(CONCRETE_GREY)} roughness={0.95} />
      <Part geometry={slots.wall} color={skin.tint(PALE)} roughness={0.78} />
      <Part geometry={slots.roof} color={skin.tint(SLATE)} roughness={0.82} />
      <Part geometry={slots.steel} color={skin.tint(STEEL)} roughness={0.5} metalness={0.35} />
      <Part geometry={slots.accent} color={skin.tint(TRANSIT_BLUE)} roughness={0.6} />
      <Part
        geometry={slots.glass}
        color={WINDOW_COLOR}
        emissive={WINDOW_COLOR}
        emissiveIntensity={0.3 + skin.glow}
        cast={false}
      />

      <group ref={train} position={[TRAIN_CENTRE, 0, TRACK_A]}>
        <Train skin={skin} />
      </group>
      {tracks === 2 && (
        <group position={[PARKED_X, 0, TRACK_B]} rotation-y={Math.PI}>
          <Train skin={skin} />
        </group>
      )}

      {skin.glow > 0.45 &&
        lamps.map((at, i) => (
          <Glow key={i} position={at} color={WINDOW_COLOR} radius={0.9} rate={0.2} strength={0.18} />
        ))}
    </group>
  );
}

/** The repository itself, at the centre of the city (PLAN.md section 23). */
function TownHall({ skin }: { skin: Skin }) {
  const { slots, lantern } = townHall();

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

export default function LandmarkPiece({
  landmark,
  atmosphere,
}: {
  landmark: Landmark;
  atmosphere: SceneAtmosphere;
}) {
  const { hovered, selected } = useEntityState(landmark.id);
  const handlers = useEntityHandlers(landmark.id);
  const reveal = useRevealGroup(landmark.appearAt);

  const natural = NATURAL_LANDMARK_SIZE[landmark.landmarkType];
  const fit = landmark.size
    ? Math.min(landmark.size[0] / natural[0], landmark.size[2] / natural[2])
    : 1;

  const tint = useCallback(
    (hex: string) => stateTint(desaturate(hex, atmosphere.desaturation), hovered, selected),
    [atmosphere.desaturation, hovered, selected],
  );

  const skin: Skin = {
    wall: tint(CIVIC_COLOR),
    roof: tint(CIVIC_ROOF),
    accent: tint("#7fa9bd"),
    glow: atmosphere.windowGlow,
    tint,
  };

  return (
    <group
      ref={reveal}
      position={landmark.position}
      rotation-y={landmark.rotationY}
      {...handlers}
    >
      <group scale={fit} rotation-y={facingTurn(landmark.rotationY)}>
        {landmark.landmarkType === "power" && <PowerPlant landmark={landmark} skin={skin} />}
        {landmark.landmarkType === "fire" && <FireStation landmark={landmark} skin={skin} />}
        {landmark.landmarkType === "info" && <VisitorCenter landmark={landmark} skin={skin} />}
        {landmark.landmarkType === "station" && <TransitStation landmark={landmark} skin={skin} />}
        {landmark.landmarkType === "civic" && <TownHall skin={skin} />}
      </group>
    </group>
  );
}

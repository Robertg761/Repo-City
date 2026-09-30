"use client";

/**
 * The queue at the city limits (PLAN.md 76.8 and 76.9): a signboard reading
 * "+20,112 more open issues" and stationary gridlock on the approach roads.
 * Reads `city.overflow`, which is null when everything open is on the map.
 *
 * The queue is the honest half of "every issue shows up": a village with a
 * thousand open issues has room for a few hundred, and the rest wait here, as
 * a fact about the repository rather than a gap in the drawing.
 *
 * COST. The sign is two draws: its frame (posts, board, trim) as one merged
 * geometry, and its two faces of text as one more. The queue reuses the
 * parked-car geometry from `models/vehicles/shapes.ts`, one instanced draw per
 * body type in it, six at most. Every car is written once per city and scaled
 * in over the reveal; after that nothing moves.
 *
 * The sign and every car in the queue select the one entity, `"overflow"`.
 */

import { useNearModels } from "./models/useModels";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type InstancedMesh,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { signposted } from "@/lib/city/overflow";
import type { CityModel, Overflow as OverflowEntity } from "@/types/city";
import { nearParkedGeometry } from "./models/vehicles/near";
import { CAR_COLORS, parkedGeometry, type VehicleBody } from "./models/vehicles/shapes";
import { blenderSignFaces, blenderSignFrame } from "./models/vehicles/overflowSign";
import { BLENDER_MODELS } from "./models/modelSource";
import { mergeParts, type Part } from "./models/props/geometry";
import { CAR_PAINT_PATTERN, tintedMaterial } from "./models/props/material";
import { queueBody } from "./blockages";
import { HIGHLIGHT, desaturate, mix, stateTint, type SceneAtmosphere } from "./palette";
import { revealScale } from "./reveal";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealClock, useRevealGroup } from "./useReveal";
import { LodInstances } from "./lod";
import { useQuality } from "./quality";
import { SURFACE } from "./textures/surface-types";
import { buildingDetailMaterial } from "./models/buildings/material";
import { useTiledSurfaceDetail } from "./textures/surfaces";

const scratch = new Object3D();
const scratchColor = new Color();

/** Tyres on the carriageway, as `Traffic.tsx` stands its cars. */
const ROAD_SURFACE = 0.1;
/** Each car in the queue lands a beat after the one ahead of it. */
const QUEUE_STAGGER = 18;
/** Queued cars drawn in detail at once, per body type, and the size they must reach (`lod.tsx`). */
const QUEUE_NEAR_CARS = 12;
const QUEUE_NEAR_SIZE = 0.05;

/**
 * The signboard, in its plot's frame: `size` is `[6, 5, 1]`. The board is a
 * little narrower than the plot so the posts at its ends stay on it.
 */
export const BOARD = { width: 5.3, height: 2.7, depth: 0.22, y: 3.55 } as const;

/** The sign's copy (PLAN.md 76.10): exact totals, or "about" when estimated. */
export function signLines(overflow: Pick<OverflowEntity, "issues" | "pulls" | "exact">): string[] {
  const about = overflow.exact ? "" : "about ";
  const count = (n: number) => n.toLocaleString("en-US");
  const lines = ["QUEUE AT THE CITY LIMITS"];
  if (overflow.issues.hidden > 0) {
    lines.push(`${about}+${count(overflow.issues.hidden)} more open ${overflow.issues.hidden === 1 ? "issue" : "issues"}`);
  }
  if (overflow.pulls.hidden > 0) {
    lines.push(
      `${about}+${count(overflow.pulls.hidden)} more pull ${overflow.pulls.hidden === 1 ? "request" : "requests"}`,
    );
  }
  return lines;
}

/**
 * Where the posts stand: just outside the board's frame, one at each end, so
 * they carry it by its edges and never cross the lettering on either face.
 */
export const POST_X = BOARD.width / 2 + 0.12 + 0.13;

/** The sign's frame: the model from Blender, or the boxes it replaced (`?models=procedural`). */
export function frameGeometry(): BufferGeometry {
  return BLENDER_MODELS ? blenderSignFrame() : proceduralFrameGeometry();
}

function proceduralFrameGeometry(): BufferGeometry {
  const post = (x: number): Part => ({
    geometry: new BoxGeometry(0.26, BOARD.y + BOARD.height / 2 + 0.1, 0.26),
    color: "#6f7270",
    surface: SURFACE.metal,
    position: [x, (BOARD.y + BOARD.height / 2 + 0.1) / 2, 0],
  });
  return mergeParts([
    post(-POST_X),
    post(POST_X),
    {
      geometry: new BoxGeometry(BOARD.width + 0.24, BOARD.height + 0.24, BOARD.depth),
      color: "#e9e5d8",
      surface: SURFACE.metal,
      position: [0, BOARD.y, 0],
    },
    // Hazard stripes along the foot of the board.
    {
      geometry: new BoxGeometry(BOARD.width, 0.2, BOARD.depth + 0.04),
      color: "#e8853c",
      surface: SURFACE.metal,
      position: [0, BOARD.y - BOARD.height / 2 - 0.2, 0],
    },
    { geometry: new BoxGeometry(0.4, 0.3, 1.1), color: "#8f8b80", surface: SURFACE.concrete, position: [-POST_X, 0.15, 0] },
    { geometry: new BoxGeometry(0.4, 0.3, 1.1), color: "#8f8b80", surface: SURFACE.concrete, position: [POST_X, 0.15, 0] },
  ]);
}

/** Both faces of the board, one quad each, sharing one texture. */
export function faceGeometry(): BufferGeometry {
  return BLENDER_MODELS ? blenderSignFaces(BOARD) : proceduralFaceGeometry();
}

function proceduralFaceGeometry(): BufferGeometry {
  const front = new PlaneGeometry(BOARD.width, BOARD.height);
  front.translate(0, BOARD.y, BOARD.depth / 2 + 0.01);
  const back = new PlaneGeometry(BOARD.width, BOARD.height);
  back.rotateY(Math.PI);
  back.translate(0, BOARD.y, -BOARD.depth / 2 - 0.01);
  const merged = mergeGeometries([front, back], false);
  front.dispose();
  back.dispose();
  if (!merged) throw new Error("Overflow: sign faces could not be merged");
  return merged;
}

/** The sign's face, painted in code (PLAN.md section 4: nothing downloaded). */
function signTexture(lines: readonly string[]): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round((1024 * BOARD.height) / BOARD.width);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  ctx.fillStyle = "#1f5a46";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#f2efe6";
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  // A folded metal border and four fixings, outside the lettering's clear area.
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 3;
  ctx.strokeRect(27, 27, width - 54, height - 54);
  for (const x of [44, width - 44]) for (const y of [44, height - 44]) {
    ctx.fillStyle = "#a6b0ad";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#354640";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 1);
    ctx.lineTo(x + 3, y + 1);
    ctx.stroke();
  }
  ctx.fillStyle = "#f2efe6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const [heading, ...rest] = lines;
  ctx.font = "600 42px system-ui, sans-serif";
  ctx.fillText(heading, width / 2, height * 0.2);
  const big = rest.length > 1 ? 70 : 84;
  rest.forEach((line, i) => {
    ctx.font = `700 ${i === 0 ? big : big * 0.82}px system-ui, sans-serif`;
    // Long totals shrink to fit rather than run off the board.
    const fit = Math.min(1, (width - 90) / ctx.measureText(line).width);
    ctx.save();
    ctx.translate(width / 2, height * (rest.length > 1 ? 0.47 + i * 0.27 : 0.58));
    ctx.scale(fit, 1);
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function Signboard({ overflow, atmosphere }: { overflow: OverflowEntity; atmosphere: SceneAtmosphere }) {
  const handlers = useEntityHandlers(overflow.id);
  const { hovered, selected } = useEntityState(overflow.id);
  const ref = useRevealGroup(overflow.appearAt);

  const frame = useMemo(() => frameGeometry(), []);
  const faces = useMemo(() => faceGeometry(), []);
  const lines = useMemo(() => signLines(overflow), [overflow]);
  const texture = useMemo(() => signTexture(lines), [lines]);
  useEffect(
    () => () => {
      frame.dispose();
      faces.dispose();
    },
    [frame, faces],
  );
  useEffect(() => () => texture?.dispose(), [texture]);

  const tint = stateTint(desaturate("#ffffff", atmosphere.desaturation), hovered, selected);
  // The face lifts a little under the pointer, the way a lit sign would.
  const glow = hovered || selected ? mix("#000000", HIGHLIGHT, 0.18) : "#000000";
  const { textureSize, anisotropy } = useQuality();
  const frameMaterial = useMemo(() => buildingDetailMaterial({ color: tint, roughness: 0.7, flatShading: true }, {
    textureSize, anisotropy, surfaceAttribute: true,
  }), [tint, textureSize, anisotropy]);
  useEffect(() => () => frameMaterial.dispose(), [frameMaterial]);
  const finish = useTiledSurfaceDetail("metal", 1, 1);

  return (
    <group
      ref={ref}
      position={overflow.position}
      rotation-y={overflow.rotationY}
      {...handlers}
    >
      <mesh geometry={frame} castShadow receiveShadow>
        <primitive object={frameMaterial} attach="material" />
      </mesh>
      <mesh geometry={faces}>
        <meshStandardMaterial map={texture} bumpMap={finish.bumpMap} bumpScale={finish.bumpScale}
          roughnessMap={finish.roughnessMap} color={tint} emissive={glow} roughness={0.55} metalness={0.25} />
      </mesh>
    </group>
  );
}

interface QueueGroup {
  body: VehicleBody;
  cars: OverflowEntity["queue"];
  colors: string[];
  order: number[];
}

function queueGroups(overflow: OverflowEntity, desaturation: number): QueueGroup[] {
  const groups = new Map<VehicleBody, QueueGroup>();
  overflow.queue.forEach((car, index) => {
    const body = queueBody(car.body);
    let group = groups.get(body);
    if (!group) {
      group = { body, cars: [], colors: [], order: [] };
      groups.set(body, group);
    }
    group.cars.push(car);
    // Mostly neutrals, as a real jam is; seeded by position so it is stable.
    const pick = Math.abs(Math.round(car.position[0] * 7 + car.position[2] * 13 + index * 5));
    group.colors.push(desaturate(CAR_COLORS[pick % (CAR_COLORS.length - 1)], desaturation));
    group.order.push(index);
  });
  return [...groups.values()];
}

function QueueBody({
  group,
  appearAt,
  handlers,
}: {
  group: QueueGroup;
  appearAt: number;
  handlers: ReturnType<typeof useEntityHandlers>;
}) {
  useNearModels();
  const meshRef = useRef<InstancedMesh>(null);
  const clock = useRevealClock();
  const settled = useRef(false);
  const { textureSize, anisotropy } = useQuality();
  const material = useMemo(() => tintedMaterial({ roughness: 0.5, metalness: 0.08 }, undefined, {
    textureSize, anisotropy, surfaceAttribute: true, patternStrength: CAR_PAINT_PATTERN,
  }), [textureSize, anisotropy]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    settled.current = false;
    const mesh = meshRef.current;
    if (!mesh) return;
    group.colors.forEach((color, i) => mesh.setColorAt(i, scratchColor.set(color)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // The material follows the quality tier; a new one remounts the mesh.
  }, [group, clock, material]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || settled.current) return;
    const now = performance.now();
    let done = true;
    group.cars.forEach((car, i) => {
      const grow = revealScale(now, clock.current, appearAt + group.order[i] * QUEUE_STAGGER);
      if (grow < 1) done = false;
      scratch.position.set(car.position[0], ROAD_SURFACE, car.position[2]);
      scratch.rotation.set(0, car.rotationY, 0);
      scratch.scale.setScalar(grow > 0.002 ? grow : 0);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (done) settled.current = true;
  });

  return (
    <LodInstances
      ref={meshRef}
      geometry={parkedGeometry(group.body)}
      nearGeometry={nearParkedGeometry(group.body)}
      material={material}
      count={group.cars.length}
      maxNear={QUEUE_NEAR_CARS}
      nearSize={QUEUE_NEAR_SIZE}
      castShadow
      receiveShadow
      handlers={handlers}
    />
  );
}

export default function Overflow({
  city,
  atmosphere,
}: {
  city: CityModel;
  atmosphere: SceneAtmosphere;
}) {
  const overflow = city.overflow ?? null;
  const handlers = useEntityHandlers(overflow?.id ?? "overflow");
  const groups = useMemo(
    () => (overflow ? queueGroups(overflow, atmosphere.desaturation) : []),
    [overflow, atmosphere.desaturation],
  );

  // A trivial remainder ("+1 more open issue" of 962) keeps its counts for the
  // HUD and the inspector but stands no sign and queues no cars (S4's
  // `signposted`).
  if (!overflow || !signposted(overflow)) return null;

  return (
    <group>
      <Signboard overflow={overflow} atmosphere={atmosphere} />
      {groups.map((group) => (
        <QueueBody key={group.body} group={group} appearAt={overflow.appearAt} handlers={handlers} />
      ))}
    </group>
  );
}

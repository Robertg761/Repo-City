"use client";

/**
 * Pull requests as construction (PLAN.md section 13). Four states:
 *
 *   active     crane with a slowly rotating jib, scaffolding, a mixer, an
 *              excavator, stacked materials, a hut and a crew in yellow
 *   slow       the same site with one worker left and the crane idle
 *   abandoned  weathered, unfenced, the crane stopped and leaning, weeds
 *              through the hardstanding and a sign nobody took away
 *   completed  a finished building, a swept forecourt and a ribbon; in a
 *              village or a town, the settlement's own house just finished,
 *              at the plot and height S4 sized it to, with bunting and
 *              balloons (`FinishedHouse`, PLAN.md 76.5)
 *
 * At most eight of these, so they are plain meshes with their own handlers.
 *
 * The assembly is modelled on an eleven unit square plot; `site.size` is the
 * plot the generator actually cleared for it, and the whole thing is scaled
 * uniformly into that, so a crane never grows through the building next door.
 *
 * COST. The dressing is one merged geometry per state and tone
 * (`models/props/constructionDecor.ts`) and the crane is two more -- tower and
 * jib. Every part is drawn from the city's shared pools (`Batch.tsx`), so ten
 * sites cost about a dozen draw calls between them, not a hundred (PLAN.md
 * 76.13), however much is going on inside each.
 *
 * TWO LEVELS. A site is 8,000 to 20,000 triangles for the whole city. The few
 * the camera is within `SITE_NEAR` of are drawn from the near models instead
 * (`blender/scenes_near/`: a lattice crane with a ladder and hoist, scaffold
 * with couplers, hoarding on its feet, the plant with its tracks and hoses, the
 * crew in detail; 30,000 to 60,000 triangles), at most `SITE_CAP` at a time
 * (`sceneLod.ts`). A site is drawn a handful of times, so the choice is the
 * whole scene at once, not per part: the two levels share every frame and pivot,
 * the crane still slews on the same group, and the shell, slabs and ground are
 * the same in both.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  type BufferGeometry,
  type Group,
} from "three";
import type { SettlementTier } from "@/types/analysis";
import type { ConstructionSite } from "@/types/city";
import {
  HIGHLIGHT,
  desaturate,
  mix,
  stateTint,
  type SceneAtmosphere,
} from "./palette";
import {
  SHELL_HEIGHT,
  SITE,
  constructionDecor,
  craneJibGeometry,
  craneMastGeometry,
} from "./models/props/constructionDecor";
import {
  FINISHED,
  finishedDressingGeometry,
  finishedHouseGeometry,
  finishedTier,
  type FinishedTier,
} from "./models/props/finishedHouse";
import { BatchEntity, BatchPart } from "./Batch";
import { batchKind, type BatchKind } from "./batching";
import { FACADES } from "./models/buildings/facades";
import { craneSwing } from "./reveal";
import { useEntityHandlers, useEntityState } from "./useEntity";
import { useRevealClock, useRevealGroup } from "./useReveal";
import { buildingDetailMaterial } from "./models/buildings/material";
import { qualitySettings, useQuality } from "./quality";
import { useSceneNear } from "./sceneLod";
import type { DetailLevel } from "./models/detailLevel";

/**
 * The camera distance inside which a site is drawn near. A site is about
 * eight units across the diagonal, so from 55 it covers a tenth of the
 * screen's height and its scaffold ties and hoarding screws begin to read.
 */
const SITE_NEAR = 55;
/** How many sites may be near at once. */
const SITE_CAP = 3;

/** One pool per merged shape; `receive` as the mesh it replaces had it. */
function mergedKind(
  name: string,
  geometry: BufferGeometry,
  surface: { roughness: number; metalness?: number },
  receiveShadow: boolean,
): BatchKind {
  const { textureSize, anisotropy } = qualitySettings();
  return batchKind(`site:${name}:${geometry.uuid}:${textureSize}`, () => ({
    geometry: () => geometry,
    material: () => buildingDetailMaterial({ vertexColors: true, ...surface }, {
      textureSize, anisotropy, surfaceAttribute: geometry.hasAttribute("surface"), surface: 7,
    }),
    castShadow: true,
    receiveShadow,
  }));
}

const CRANE_SURFACE = { roughness: 0.6, metalness: 0.15 };

/** The cleared plot, `SITE` square. */
const GROUND = batchKind("site:ground", () => ({
  geometry: () => new PlaneGeometry(SITE, SITE),
  material: () => buildingDetailMaterial({ color: "#ffffff", vertexColors: false, roughness: 1 }, { ...qualitySettings(), surface: 11 }),
  receiveShadow: true,
}));

/** The unit box every shell and slab is scaled from. */
const unitBox = () => new BoxGeometry(1, 1, 1);

const SHELL = batchKind("site:shell", () => ({
  geometry: unitBox,
  material: () => buildingDetailMaterial({ color: "#ffffff", vertexColors: false, roughness: 0.95 }, { ...qualitySettings(), surface: 11 }),
  castShadow: true,
  receiveShadow: true,
}));

/** A finished building's shell is a little smoother than a bare frame's. */
const SHELL_DONE = batchKind("site:shell-done", () => ({
  geometry: unitBox,
  material: () => buildingDetailMaterial({ color: "#ffffff", vertexColors: false, roughness: 0.7 }, { ...qualitySettings(), surface: 0 }),
  castShadow: true,
  receiveShadow: true,
}));

const SLAB = batchKind("site:slab", () => ({
  geometry: unitBox,
  material: () => buildingDetailMaterial({ color: "#ffffff", vertexColors: false, roughness: 0.95 }, { ...qualitySettings(), surface: 11 }),
}));

/**
 * A finished building's walls, one of the city's own facades (`facades.ts`),
 * by the site: its windows, door and roof edge are the decor's.
 */
const DONE_FACADES = [
  ...FACADES.brick.slice(0, 2),
  FACADES.render[0],
  FACADES.stone[1],
  FACADES.render[4],
  FACADES.render[3],
];
function doneFacade(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DONE_FACADES[h % DONE_FACADES.length].hex;
}

const RIBBON = batchKind("site:ribbon", () => ({
  geometry: () => new RingGeometry(SITE * 0.38, SITE * 0.41, 40),
  material: () =>
    new MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, toneMapped: false }),
}));

/** Where a crane's opening sweep starts, in radians. */
const SWING_FROM = -1.5;

function Crane({
  state,
  atmosphere,
  appearAt,
  level,
}: {
  state: ConstructionSite["state"];
  atmosphere: SceneAtmosphere;
  /** The site's slot in the reveal, so the opening sweep lands with it. */
  appearAt: number;
  level: DetailLevel;
}) {
  const jib = useRef<Group>(null);
  const moving = state === "active";
  const revealClock = useRevealClock();

  useFrame(({ clock }) => {
    if (!jib.current) return;
    // Construction is the last thing to arrive (PLAN.md section 43, step 7):
    // every crane sweeps once as its site lands, which is what makes the
    // reveal end on movement rather than on a set of frozen toys. After the
    // sweep an active crane keeps turning slowly and the rest hold still.
    const swing = craneSwing(performance.now(), revealClock.current, appearAt);
    const idle = moving ? clock.elapsedTime * 0.22 : 0.9;
    // The sweep eases from a quarter turn back into wherever the idle
    // behaviour has reached, so it never jumps when it hands over.
    jib.current.rotation.y = swing >= 1 ? idle : SWING_FROM + swing * (idle - SWING_FROM);
  });

  const lean = state === "abandoned" ? 0.09 : 0;

  return (
    <group position={[-SITE * 0.32, 0, -SITE * 0.3]} rotation-z={lean}>
      <BatchPart
        kind={mergedKind("mast", craneMastGeometry(state, atmosphere.desaturation, level), CRANE_SURFACE, true)}
      />
      <group ref={jib} position={[0, 12.6, 0]}>
        <BatchPart
          kind={mergedKind("jib", craneJibGeometry(state, atmosphere.desaturation, level), CRANE_SURFACE, false)}
        />
      </group>
    </group>
  );
}

/**
 * The finished house's own look: a plain vertex-coloured pool per shape,
 * flat shaded as the settlement's buildings are (`Buildings.tsx`), which the
 * archetypes' faces are modelled for.
 */
function finishedKind(name: string, geometry: BufferGeometry): BatchKind {
  const { textureSize, anisotropy } = qualitySettings();
  return batchKind(`site:${name}:${geometry.uuid}:${textureSize}`, () => ({
    geometry: () => geometry,
    material: () => buildingDetailMaterial({ vertexColors: true, flatShading: true, roughness: 0.84, metalness: 0 }, {
      textureSize, anisotropy, surfaceAttribute: geometry.hasAttribute("surface"),
    }),
    castShadow: true,
    receiveShadow: true,
  }));
}

/**
 * A merged pull request in a village or a town: the settlement's own house,
 * just finished, drawn at the plot and height S4 sized it to (`size`), with
 * its bunting, board and balloons (`models/props/finishedHouse.ts`).
 */
function FinishedHouse({
  site,
  tier,
  atmosphere,
  hovered,
  selected,
  level,
}: {
  site: ConstructionSite;
  tier: FinishedTier;
  atmosphere: SceneAtmosphere;
  hovered: boolean;
  selected: boolean;
  level: DetailLevel;
}) {
  const spec = FINISHED[tier];
  // Uniform: a plot squeezed smaller keeps the house's proportions, and its
  // height is then exactly `size[1]`.
  const fit = site.size ? Math.min(site.size[0], site.size[2]) / spec.plot : 1;
  const ground = stateTint(desaturate(spec.ground, atmosphere.desaturation), hovered, selected);
  const tint = mix("#ffffff", stateTint("#ffffff", hovered, selected), 0.5);
  return (
    <group scale={fit}>
      <BatchPart
        kind={GROUND}
        rotation-x={-Math.PI / 2}
        position-y={0.05}
        scale={spec.plot / SITE}
        color={ground}
      />
      <BatchPart
        kind={finishedKind(`house-${tier}`, finishedHouseGeometry(tier, atmosphere.desaturation, level))}
        position={[0, 0.04, -spec.setBack]}
        scale={[spec.footprint[0], spec.height, spec.footprint[1]]}
        color={tint}
      />
      <BatchPart
        kind={finishedKind(`finish-${tier}`, finishedDressingGeometry(tier, atmosphere.desaturation, level))}
        color={tint}
      />
    </group>
  );
}

export default function ConstructionSitePiece({
  site,
  atmosphere,
  settlement,
}: {
  site: ConstructionSite;
  atmosphere: SceneAtmosphere;
  /** The settlement tier; absent means the city. */
  settlement?: SettlementTier;
}) {
  useQuality();
  const { hovered, selected } = useEntityState(site.id);
  const handlers = useEntityHandlers(site.id);
  const reveal = useRevealGroup(site.appearAt);
  const level: DetailLevel = useSceneNear(reveal, SITE_NEAR, SITE_CAP) ? "near" : "lean";

  const done = site.state === "completed";
  const finished = done ? finishedTier(settlement) : null;
  if (finished) {
    return (
      <group ref={reveal} position={site.position} rotation-y={site.rotationY} {...handlers}>
        <BatchEntity id={site.id}>
          <FinishedHouse site={site} tier={finished} atmosphere={atmosphere} hovered={hovered} selected={selected} level={level} />
        </BatchEntity>
      </group>
    );
  }

  // 11 x 11 is what the meshes below are drawn at; see `SITE`.
  const fit = site.size ? Math.min(site.size[0], site.size[2]) / SITE : 1;

  const weathered = site.state === "abandoned";
  const shellHeight = SHELL_HEIGHT[site.state];
  const shell = stateTint(
    desaturate(
      done ? doneFacade(site.id) : weathered ? mix("#cfcabd", "#9a7b5f", 0.35) : "#cfcabd",
      atmosphere.desaturation,
    ),
    hovered,
    selected,
  );
  const ground = desaturate(weathered ? "#8f8a7c" : "#a89f8c", atmosphere.desaturation);
  // The dressing carries its own colours; hover and selection multiply them,
  // at half strength so a site never turns into a gold model of itself.
  const tint = mix("#ffffff", stateTint("#ffffff", hovered, selected), 0.5);

  return (
    <group ref={reveal} position={site.position} rotation-y={site.rotationY} {...handlers}>
      <BatchEntity id={site.id}>
        <group scale={fit}>
          <BatchPart kind={GROUND} rotation-x={-Math.PI / 2} position-y={0.05} color={ground} />

          {/* The structure under construction, or the finished one. */}
          <BatchPart
            kind={done ? SHELL_DONE : SHELL}
            position={[SITE * 0.12, shellHeight / 2, SITE * 0.1]}
            scale={[5.4, shellHeight, 5.4]}
            color={shell}
          />

          <BatchPart
            kind={mergedKind(
              "decor",
              constructionDecor(site.state, atmosphere.desaturation, level),
              { roughness: 0.85 },
              true,
            )}
            color={tint}
          />

          {done ? (
            <>
              <BatchPart kind={RIBBON} rotation-x={-Math.PI / 2} position-y={0.08} color={HIGHLIGHT} />
            </>
          ) : (
            <>
              {/* Exposed floor slabs read as "unfinished" from a distance. */}
              {[0.45, 0.78].map((f) => (
                <BatchPart
                  key={f}
                  kind={SLAB}
                  position={[SITE * 0.12, shellHeight * f, SITE * 0.1]}
                  scale={[5.8, 0.18, 5.8]}
                  color={mix(shell, "#ffffff", 0.18)}
                />
              ))}
              <Crane state={site.state} atmosphere={atmosphere} appearAt={site.appearAt} level={level} />
            </>
          )}
        </group>
      </BatchEntity>
    </group>
  );
}

import { BoxGeometry, CapsuleGeometry, SphereGeometry, type BufferGeometry } from "three";
import { mergeParts, surfacePanel, type Part, type Triple } from "./geometry";
import { SURFACE } from "../../textures/surface-types";
import { importedParts } from "../imported";
import { BLENDER_MODELS } from "../modelSource";
import { MODEL as WALKER } from "./walker.model";
import { MODEL as WALKER_NEAR } from "./walkerNear.model";

/** The colours the Blender figure (`blender/props/walker.py`) is modelled in. */
const MODEL_PAINT = "#ffffff";
const MODEL_SKIN = "#c99f7d";
const MODEL_HAIR = "#4a3830";

/**
 * The Blender body: the clothes are its paint and take `clothes`, the hands
 * take `skin`, trousers and shoes keep their own colours. Same frame as the
 * procedural body (origin at the crowd's chest height).
 */
export function blenderWalkerBodyParts(clothes = "#ffffff", skin = "#c99f7d"): Part[] {
  return importedParts(WALKER, "WalkerBody", (hex) => (hex === MODEL_PAINT ? clothes : hex === MODEL_SKIN ? skin : hex));
}

/** The Blender head, its skin the paint; `hair: false` leaves the hair off for a helmet. */
export function blenderWalkerHeadParts(skin = "#ffffff", { hair = true } = {}): Part[] {
  return importedParts(WALKER, "WalkerHead", (hex) => (hex === MODEL_PAINT ? skin : hex))
    .filter((part) => hair || part.color !== MODEL_HAIR);
}

let body: BufferGeometry | undefined;
let head: BufferGeometry | undefined;

/** Body origin is the crowd's chest height, 0.44 above the pavement. */
export function walkerBodyParts(clothes = "#ffffff", skin = "#c99f7d"): Part[] {
  if (BLENDER_MODELS) return blenderWalkerBodyParts(clothes, skin);
  const parts: Part[] = [{
    geometry: new CapsuleGeometry(0.15, 0.25, 1, 6),
    color: clothes,
    paint: true,
    surface: SURFACE.fabric,
    position: [0, 0.065, 0],
    scale: [1, 1, 0.78],
  }];
  for (const side of [-1, 1]) {
    const box = (size: Triple, position: Triple, color: string, paint = false): Part => ({
      geometry: new BoxGeometry(...size), position, color, paint,
      surface: color === skin ? SURFACE.plaster : SURFACE.fabric,
    });
    parts.push(
      box([0.105, 0.3, 0.13], [side * 0.076, -0.235, 0], "#35404b"),
      box([0.112, 0.075, 0.18], [side * 0.076, -0.4025, 0.035], "#292b2e"),
      box([0.075, 0.26, 0.11], [side * 0.187, 0.065, 0], clothes, true),
      box([0.065, 0.07, 0.075], [side * 0.187, -0.09, 0.01], skin),
    );
  }
  return parts;
}

/** Fixed trousers, shoes and hands keep their colours under the clothing tint. */
export function walkerBodyGeometry(): BufferGeometry {
  return body ??= mergeParts(walkerBodyParts());
}

export function walkerHeadParts(skin = "#ffffff", { hair = true } = {}): Part[] {
  if (BLENDER_MODELS) return blenderWalkerHeadParts(skin, { hair });
  return ([
    { geometry: new SphereGeometry(0.15, 7, 5), color: skin, paint: true, surface: SURFACE.plaster },
    {
      geometry: new SphereGeometry(0.154, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.48),
      color: "#4a3830",
      surface: SURFACE.metal,
      position: [0, 0.008, -0.01],
    },
    ...[-1, 1].map((side) => surfacePanel(0.018, 0.018, [side * 0.045, 0.02, 0.154], "#302d29", [0, 0, 0], false, SURFACE.glass)),
    surfacePanel(0.035, 0.012, [0, -0.057, 0.148], "#ad8272", [0, 0, 0], false, SURFACE.plaster),
  ] as Part[]).filter((_, index) => hair || index !== 1);
}

/** Skin takes the instance tint while the hair stays dark. */
export function walkerHeadGeometry(): BufferGeometry {
  return head ??= mergeParts(walkerHeadParts());
}

/** The near body's parts, coloured as the lean Blender body's. */
export function blenderWalkerBodyNearParts(): Part[] {
  return importedParts(WALKER_NEAR, "WalkerBodyNear", (hex) => hex);
}

/** The near head's parts: the skin is the paint, hair and face keep their colours. */
export function blenderWalkerHeadNearParts(): Part[] {
  return importedParts(WALKER_NEAR, "WalkerHeadNear", (hex) => hex);
}

let bodyNear: BufferGeometry | undefined;
let headNear: BufferGeometry | undefined;

/**
 * The close-up figure (`blender/props/walker_near.py`): jacket layers,
 * backpack, hands with fingers, shoes with soles. Same frames and colour roles
 * as the lean body, so the crowd's matrices and tints apply unchanged. Null
 * on the procedural models, which have no near level.
 */
export function walkerBodyNearGeometry(): BufferGeometry | null {
  if (!BLENDER_MODELS) return null;
  return bodyNear ??= mergeParts(blenderWalkerBodyNearParts());
}

/** The close-up head, neck and hair; skin is the paint, as on the lean head. */
export function walkerHeadNearGeometry(): BufferGeometry | null {
  if (!BLENDER_MODELS) return null;
  return headNear ??= mergeParts(blenderWalkerHeadNearParts());
}

import { BoxGeometry, CapsuleGeometry, SphereGeometry, type BufferGeometry } from "three";
import { mergeParts, surfacePanel, type Part, type Triple } from "./geometry";
import { SURFACE } from "../../textures/surface-types";

let body: BufferGeometry | undefined;
let head: BufferGeometry | undefined;

/** Body origin is the crowd's chest height, 0.44 above the pavement. */
export function walkerBodyParts(clothes = "#ffffff", skin = "#c99f7d"): Part[] {
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

export function walkerHeadParts(skin = "#ffffff"): Part[] {
  return [
    { geometry: new SphereGeometry(0.15, 7, 5), color: skin, paint: true, surface: SURFACE.plaster },
    {
      geometry: new SphereGeometry(0.154, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.48),
      color: "#4a3830",
      surface: SURFACE.metal,
      position: [0, 0.008, -0.01],
    },
    ...[-1, 1].map((side) => surfacePanel(0.018, 0.018, [side * 0.045, 0.02, 0.154], "#302d29", [0, 0, 0], false, SURFACE.glass)),
    surfacePanel(0.035, 0.012, [0, -0.057, 0.148], "#ad8272", [0, 0, 0], false, SURFACE.plaster),
  ];
}

/** Skin takes the instance tint while the hair stays dark. */
export function walkerHeadGeometry(): BufferGeometry {
  return head ??= mergeParts(walkerHeadParts());
}

/**
 * What a pane of glass reflects, shared by every building material.
 *
 * The scene has no environment map: the lights are a sun and a hemisphere, so
 * a glazed surface used to be a dark panel with a rare glint. The building
 * shaders (`model-detail.ts`) add the sky and the street to every glass
 * fragment instead, from these uniforms: the dome's zenith and horizon, a
 * ground tone for what a downward reflection meets, and the sun's glint. One
 * set of uniform objects, written from the live sky (`sky.tsx`) and read by
 * every compiled program, so an hour changes them without a recompile.
 *
 * Pure apart from writing into the shared objects; unit tested.
 */

import { Color, Vector3 } from "three";
import { mix, type SceneAtmosphere } from "../palette";

export interface SkyReflection {
  rcSkyZenith: { value: Color };
  rcSkyHorizon: { value: Color };
  rcSkyGround: { value: Color };
  rcSunColor: { value: Color };
  rcSunDirection: { value: Vector3 };
  /** 0..1: how much of the reflection reaches the glass. Fades to nothing with the daylight. */
  rcGlassSky: { value: number };
}

export const SKY_REFLECTION: SkyReflection = {
  rcSkyZenith: { value: new Color("#6fa3d8") },
  rcSkyHorizon: { value: new Color("#c9dcec") },
  rcSkyGround: { value: new Color("#8b9088") },
  rcSunColor: { value: new Color("#fff3de") },
  rcSunDirection: { value: new Vector3(0.4, 0.8, 0.4).normalize() },
  rcGlassSky: { value: 1 },
};

/** What the ground and the street's other buildings put into a glass pane looking down. */
const STREET_TONE = "#7f8683";

/** Points the shared uniforms at an hour's sky. */
export function setSkyReflection(atmosphere: SceneAtmosphere, target: SkyReflection = SKY_REFLECTION): void {
  target.rcSkyZenith.value.set(atmosphere.skyZenithColor);
  target.rcSkyHorizon.value.set(atmosphere.skyHorizonColor);
  target.rcSkyGround.value.set(mix(atmosphere.skyHorizonColor, STREET_TONE, 0.55));
  target.rcSunColor.value.set(atmosphere.sunColor);
  const [x, y, z] = atmosphere.sunDirection;
  target.rcSunDirection.value.set(x, y, z).normalize();
  // The moon is a key light too, but the night sky it reflects is already
  // dark; this only keeps a moonlit pane from taking a daytime glint.
  target.rcGlassSky.value = 1 - 0.5 * Math.min(1, Math.max(0, atmosphere.nightness));
}

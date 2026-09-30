"use client";

/**
 * A toe for the grade: a floor under the shadows, added after the tone
 * mapping. Shaded faces at the golden hour and after dark used to land within
 * a few levels of black, so the mouldings, the roof tiles and the doors
 * behind them were gone. The lift is weighted by `(1 - c)^p`, so it is
 * strongest at black and gone by the mid-tones: afternoon contrast and the
 * lit faces are not touched, only the floor moves. The lift is bluish, like
 * the sky light that fills a real shadow.
 */

import { forwardRef, useMemo } from "react";
import { Effect } from "postprocessing";
import { Uniform } from "three";

const FRAGMENT = /* glsl */ `
uniform float uLift;
uniform vec3 uTint;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float weight = pow(clamp(1.0 - luma * 4.0, 0.0, 1.0), 2.0);
  // Deep shades of a saturated paint clip a channel to zero after the grade's
  // saturation and contrast; bleed a little of their grey back so brick and
  // roof stay legible rather than reading as flat blood-red or black.
  c = mix(c, vec3(luma), 0.45 * weight);
  outputColor = vec4(c + uTint * uLift * weight, inputColor.a);
}
`;

export class ShadowToeEffect extends Effect {
  constructor(lift = 0.012) {
    super("ShadowToeEffect", FRAGMENT, {
      uniforms: new Map<string, Uniform>([
        ["uLift", new Uniform(lift)],
        ["uTint", new Uniform([0.8, 0.95, 1.25])],
      ]),
    });
  }
  set lift(value: number) {
    (this.uniforms.get("uLift") as Uniform).value = value;
  }
  get lift(): number {
    return (this.uniforms.get("uLift") as Uniform).value as number;
  }
}

/** The floor for an hour, in linear light: a little by day, more at dusk and night. */
export function toeLift(evening: number, nightness: number): number {
  return 0.010 + evening * 0.007 + nightness * 0.006;
}

export const ShadowToe = forwardRef<ShadowToeEffect, { lift?: number }>(function ShadowToe({ lift = 0.012 }, ref) {
  const effect = useMemo(() => new ShadowToeEffect(lift), [lift]);
  return <primitive ref={ref} object={effect} dispose={null} />;
});

/**
 * FLAGS IN THE WIND.
 *
 * A flag's cloth is a node of its own in the landmark models
 * (`blender/animkit.py`): a thin two-sided sheet hoisted at a pole. It waves
 * in the vertex shader, so it costs nothing on the CPU. Every cloth vertex
 * carries three attributes made once from the model's markers (`flapAttributes`):
 *
 *   flapData    x: how far from the hoist, 0 on the pole to 1 at the free
 *               edge; y: the flag's own phase, so a row of flags ripples out
 *               of step instead of nodding together
 *   flapNormal  the cloth's normal times the flag's length: which way it
 *               waves, and how much (a long flag swings further)
 *   flapFly     the unit direction the cloth flies in
 *
 * The wave travels from the hoist to the fly edge with an envelope that grows
 * from nothing at the pole (`flagEnvelope`), so the hoist vertices never move
 * and the cloth cannot come away from its pole. A faster, smaller flutter
 * rides on it, and a slow gust breathes the whole thing in and out. The shader
 * and `flagWave` below are one formula (the GLSL is written from the same
 * constants), so the tests hold the shader to what they can check in node.
 *
 * It shares the city's wind clock (`WIND_CLOCK`, the one the trees sway on) and
 * its reduced-motion switch. Shadows do not wave: a flag's shadow is a few
 * hundredths of a unit off, and not worth a second program.
 */

import { BufferGeometry, Float32BufferAttribute, type MeshStandardMaterial } from "three";
import { WIND_CLOCK } from "./models/props/material";

const TAU = Math.PI * 2;

/** The wave's constants, in cloth lengths and radians per second. */
export const FLAG_WAVE = {
  /** The travelling wave: its amplitude, cycles along the cloth, and speed. */
  amplitude: 0.085,
  cycles: 1.15,
  speed: 3.1,
  /** The flutter on top of it. */
  flutterAmplitude: 0.022,
  flutterCycles: 2.7,
  flutterSpeed: 7.3,
  /** The gust: how much the amplitude breathes, and how slowly. */
  gust: 0.25,
  gustSpeed: 0.37,
} as const;

/** The attribute names the shader reads. */
export const FLAP_DATA = "flapData";
export const FLAP_NORMAL = "flapNormal";
export const FLAP_FLY = "flapFly";

/** How far the cloth lies off its flat rest at `s` along it: nothing at the hoist, growing to the fly edge. */
export function flagEnvelope(s: number): number {
  return s * (0.4 + 0.6 * s);
}

/** The envelope's slope. */
export function flagEnvelopeSlope(s: number): number {
  return 0.4 + 1.2 * s;
}

export interface FlagSample {
  /** Sideways displacement, in cloth lengths. */
  offset: number;
  /** Its slope along the cloth (d offset / d s), which tilts the normal. */
  slope: number;
}

/** The wave at `s` along a flag (0..1) at time `t` seconds, for a flag of phase `phase`. */
export function flagWave(s: number, t: number, phase: number, out: FlagSample = { offset: 0, slope: 0 }): FlagSample {
  const w = FLAG_WAVE;
  const a = TAU * w.cycles * s - w.speed * t + phase;
  const b = TAU * w.flutterCycles * s - w.flutterSpeed * t + phase * 1.7;
  const gust = 1 + w.gust * Math.sin(w.gustSpeed * t + phase * 0.5);
  const wave = w.amplitude * Math.sin(a) + w.flutterAmplitude * Math.sin(b);
  const waveSlope = w.amplitude * TAU * w.cycles * Math.cos(a) + w.flutterAmplitude * TAU * w.flutterCycles * Math.cos(b);
  const env = flagEnvelope(s);
  out.offset = env * wave * gust;
  out.slope = (flagEnvelopeSlope(s) * wave + env * waveSlope) * gust;
  return out;
}

/** A flag's phase from where its hoist stands: stable, and different for every flag. */
export function flagPhase(pivot: readonly number[]): number {
  const h = Math.sin(pivot[0] * 12.9898 + pivot[1] * 78.233 + pivot[2] * 37.719) * 43758.5453;
  return (h - Math.floor(h)) * TAU;
}

/** Vertices this close to the hoist (in cloth lengths) are on the pole and stay put. */
const HOIST_SNAP = 1e-3;

/**
 * Writes a cloth's wave attributes. `pivot` is the hoist and `tip` the middle
 * of the free edge, in the geometry's own frame; the geometry must be in that
 * same frame (the model frame, for the landmarks).
 */
export function flapAttributes(geometry: BufferGeometry, pivot: readonly number[], tip: readonly number[], phase = flagPhase(pivot)): void {
  const position = geometry.getAttribute("position");
  const count = position.count;
  let fx = tip[0] - pivot[0];
  const fy = 0;
  let fz = tip[2] - pivot[2];
  const length = Math.hypot(fx, fz) || 1;
  fx /= length;
  fz /= length;
  // fly x up: the cloth's normal.
  const nx = -fz;
  const nz = fx;
  const data = new Float32Array(count * 2);
  const normal = new Float32Array(count * 3);
  const fly = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const along = ((position.getX(i) - pivot[0]) * fx + (position.getZ(i) - pivot[2]) * fz) / length;
    const s = along < HOIST_SNAP ? 0 : Math.min(1, along);
    data[i * 2] = s;
    data[i * 2 + 1] = phase;
    normal[i * 3] = nx * length;
    normal[i * 3 + 2] = nz * length;
    fly[i * 3] = fx;
    fly[i * 3 + 1] = fy;
    fly[i * 3 + 2] = fz;
  }
  geometry.setAttribute(FLAP_DATA, new Float32BufferAttribute(data, 2));
  geometry.setAttribute(FLAP_NORMAL, new Float32BufferAttribute(normal, 3));
  geometry.setAttribute(FLAP_FLY, new Float32BufferAttribute(fly, 3));
}

const f = (n: number): string => n.toFixed(5);

/** The shader's wave, from `FLAG_WAVE`: declares `rcFlagOffset` and `rcFlagSlope`. */
export function flagWaveGlsl(): string {
  const w = FLAG_WAVE;
  return `
float rcFlagS = ${FLAP_DATA}.x;
float rcFlagPhase = ${FLAP_DATA}.y;
float rcFlagA = ${f(TAU * w.cycles)} * rcFlagS - ${f(w.speed)} * uFlagTime + rcFlagPhase;
float rcFlagB = ${f(TAU * w.flutterCycles)} * rcFlagS - ${f(w.flutterSpeed)} * uFlagTime + rcFlagPhase * 1.7;
float rcFlagGust = 1.0 + ${f(w.gust)} * sin( ${f(w.gustSpeed)} * uFlagTime + rcFlagPhase * 0.5 );
float rcFlagWave = ${f(w.amplitude)} * sin( rcFlagA ) + ${f(w.flutterAmplitude)} * sin( rcFlagB );
float rcFlagWaveSlope = ${f(w.amplitude * TAU * w.cycles)} * cos( rcFlagA ) + ${f(w.flutterAmplitude * TAU * w.flutterCycles)} * cos( rcFlagB );
float rcFlagEnv = rcFlagS * ( 0.4 + 0.6 * rcFlagS );
float rcFlagEnvSlope = 0.4 + 1.2 * rcFlagS;
float rcFlagOffset = rcFlagEnv * rcFlagWave * rcFlagGust * uFlagAmount;
float rcFlagSlope = ( rcFlagEnvSlope * rcFlagWave + rcFlagEnv * rcFlagWaveSlope ) * rcFlagGust * uFlagAmount;
`;
}

const prefersStill = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The program key suffix, so every waving material shares one program per base. */
const KEY = "-flag-wave";

/**
 * Makes `material` wave the vertices of any geometry carrying the flap
 * attributes: it keeps whatever `onBeforeCompile` and program key the material
 * already had and adds the wave after them. The shared wind clock drives it.
 */
export function waveFlag<T extends MeshStandardMaterial>(material: T, still = prefersStill()): T {
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.uFlagTime = WIND_CLOCK;
    shader.uniforms.uFlagAmount = { value: still ? 0 : 1 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nattribute vec2 ${FLAP_DATA};\nattribute vec3 ${FLAP_NORMAL};\nattribute vec3 ${FLAP_FLY};\nuniform float uFlagTime;\nuniform float uFlagAmount;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        // The surface p(s) = s fly + D(s) n has the normal n - D' fly: tilt the
        // vertex normal along the cloth by the slope, whichever side it faces.
        `#include <beginnormal_vertex>\n${flagWaveGlsl()}\nobjectNormal = normalize( objectNormal - rcFlagSlope * dot( objectNormal, normalize( ${FLAP_NORMAL} ) ) * ${FLAP_FLY} );`,
      )
      .replace("#include <begin_vertex>", `#include <begin_vertex>\ntransformed += ${FLAP_NORMAL} * rcFlagOffset;`);
  };
  material.customProgramCacheKey = () => `${key()}${KEY}${still ? "-still" : ""}`;
  return material;
}

/**
 * The parts of a landmark that move: clock hands and flag cloth.
 *
 * The Blender models export them as nodes of their own (`blender/animkit.py`)
 * and leave them out of the merged mesh, so the renderer can turn a hand about
 * its clock's centre and wave a flag from its pole without touching the
 * building. This reads them back:
 *
 *   <scope>.Clock.<k>.Hour | Minute | Second   a hand, modelled at twelve,
 *                                              its origin the clock's centre
 *   <scope>.Clock.<k>.pivot | .normal          markers: the centre, and a
 *                                              point one unit out of the face
 *   <scope>.Flag.<k>                           the cloth, its origin the hoist
 *   <scope>.Flag.<k>.pivot | .tip              markers: the hoist, and the
 *                                              middle of the free edge
 *
 * A hand's geometry is in its own frame about the pivot (the renderer puts a
 * group at the pivot and turns it); a flag's is moved into the model's frame,
 * with the wave's attributes (`flapAttributes`) already on it. Colours stay the
 * landmark's slots, merged per slot like the rest of the model.
 */

import type { BufferGeometry } from "three";
import { flapAttributes } from "../../flagWave";
import { importedMarker, importedOrigin, type ImportedModel } from "../imported";
import type { Slots, V3 } from "./assembly";
import { blenderSlots } from "./blenderSlots";

export type HandKind = "hour" | "minute" | "second";

export interface ClockHand {
  kind: HandKind;
  /** The hand, modelled pointing at twelve, in a frame centred on the clock. */
  slots: Slots<string>;
}

export interface ClockLife {
  /** The clock's centre, in the model's frame. */
  pivot: V3;
  /** The unit vector out of the face. */
  normal: V3;
  hands: ClockHand[];
}

export interface FlagLife {
  pivot: V3;
  tip: V3;
  /** The cloth in the model's frame, with the wave's attributes. */
  slots: Slots<string>;
}

export interface LandmarkLife {
  clocks: ClockLife[];
  flags: FlagLife[];
}

const KINDS: readonly [string, HandKind][] = [
  ["Hour", "hour"],
  ["Minute", "minute"],
  ["Second", "second"],
];

const hasNode = (model: ImportedModel, name: string): boolean => model.nodes.some((n) => n.name === name);

/** One clock from its `prefix` (`<scope>.Clock.<k>`, or the civic kit's `Clock`). */
export function clockLife(model: ImportedModel, prefix: string): ClockLife {
  const pivot = importedMarker(model, `${prefix}.pivot`);
  const out = importedMarker(model, `${prefix}.normal`);
  const length = Math.hypot(out[0] - pivot[0], out[1] - pivot[1], out[2] - pivot[2]) || 1;
  const hands: ClockHand[] = [];
  for (const [suffix, kind] of KINDS) {
    const node = `${prefix}.${suffix}`;
    if (hasNode(model, node)) hands.push({ kind, slots: blenderSlots<string>(model, [node]) });
  }
  return { pivot, normal: [(out[0] - pivot[0]) / length, (out[1] - pivot[1]) / length, (out[2] - pivot[2]) / length], hands };
}

/** One flag from its node name: the cloth moved to the model's frame, ready to wave. */
export function flagLife(model: ImportedModel, name: string): FlagLife {
  const pivot = importedMarker(model, `${name}.pivot`);
  const tip = importedMarker(model, `${name}.tip`);
  const origin = importedOrigin(model, name);
  const slots = blenderSlots<string>(model, [{ node: name, offsets: [origin] }]);
  for (const geometry of Object.values(slots) as BufferGeometry[]) flapAttributes(geometry, pivot, tip);
  return { pivot, tip, slots };
}

/** Everything in `scope` that moves: its clocks and its flags, in id order. */
export function landmarkLife(model: ImportedModel, scope: string): LandmarkLife {
  const clock = new RegExp(`^${scope.replace(/\./g, "\\.")}\\.Clock\\.(\\d+)\\.Minute$`);
  const flag = new RegExp(`^${scope.replace(/\./g, "\\.")}\\.Flag\\.(\\d+)$`);
  const ids = (re: RegExp): number[] =>
    model.nodes
      .map((n) => re.exec(n.name))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
  return {
    clocks: ids(clock).map((k) => clockLife(model, `${scope}.Clock.${k}`)),
    flags: ids(flag).map((k) => flagLife(model, `${scope}.Flag.${k}`)),
  };
}

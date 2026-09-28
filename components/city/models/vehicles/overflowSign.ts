/**
 * The signboard at the city limits, modelled in Blender
 * (`blender/vehicles2/overflow.py`): the posts, footings, board and hazard
 * rail as one coloured frame, and the two sheets the sign's text is painted
 * on as bare quads. `Overflow.tsx` draws these by default and its own boxes
 * with `?models=procedural`; the footprint, board size and posts are the
 * same (`BOARD` and `POST_X` there), which `blender-vehicles2.test.ts` holds
 * the model to.
 */

import { Float32BufferAttribute, type BufferGeometry } from "three";
import { importedMarker, importedParts } from "../imported";
import { mergeParts } from "../props/geometry";
import { MODEL } from "./overflowSign.model";

/** The board's size, as `BOARD` in `Overflow.tsx`. */
export interface SignBoard {
  width: number;
  height: number;
  depth: number;
  y: number;
}

/** Posts, footings, board, its raised border and the striped rail, merged. */
export function blenderSignFrame(): BufferGeometry {
  return mergeParts(importedParts(MODEL, "Frame", (hex) => hex));
}

/**
 * Both sheets of the board, front (`+z`) and back, with UVs so one canvas
 * texture reads correctly from either side, as a `PlaneGeometry` and its
 * half-turn twin would: the front's `u` runs along `+x`, the back's along `-x`.
 */
export function blenderSignFaces(board: SignBoard): BufferGeometry {
  const geometry = mergeParts(importedParts(MODEL, "Faces", (hex) => hex));
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const u = (position.getX(i) + board.width / 2) / board.width;
    uv[i * 2] = position.getZ(i) >= 0 ? u : 1 - u;
    uv[i * 2 + 1] = (position.getY(i) - (board.y - board.height / 2)) / board.height;
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return geometry;
}

/** Where the text's sheets are centred: the front's and the back's. */
export function blenderSignAnchors() {
  return { front: importedMarker(MODEL, "board.front"), back: importedMarker(MODEL, "board.back") };
}

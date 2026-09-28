import type { BufferGeometry } from "three";
import type { ModelKey } from "../archetypes";

/** Near levels of detail for the towers archetypes; see `archetypeNearGeometry`. */
export const NEAR_TOWERS: Partial<Record<ModelKey, () => BufferGeometry | null>> = {};

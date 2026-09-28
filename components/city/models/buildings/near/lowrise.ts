import type { BufferGeometry } from "three";
import type { ModelKey } from "../archetypes";

/** Near levels of detail for the lowrise archetypes; see `archetypeNearGeometry`. */
export const NEAR_LOWRISE: Partial<Record<ModelKey, () => BufferGeometry | null>> = {};

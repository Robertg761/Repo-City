/**
 * One id -> entity map per city (PLAN.md 76.9, "Inspector path").
 *
 * `resolveEntity`, `focusTargetFor` and `SelectionRing` used to search the
 * entity arrays linearly. That is fine for a few hundred objects, and cleaner
 * as a shared index once a metropolis carries 1,500 crowd objects too.
 *
 * The index is memoised per `CityModel` object in a `WeakMap`, so every
 * caller shares one build and a replaced city is collected with its index. A
 * `CityModel` is treated as immutable once generated: the store always swaps
 * in a new object rather than editing one, which is what makes this safe.
 *
 * Districts are not in the index: they are not `CityEntity` values and they
 * are selected by a different path.
 */

import type { CityModel, SelectableEntity } from "@/types/city";

const cache = new WeakMap<CityModel, ReadonlyMap<string, SelectableEntity>>();

/**
 * Every selectable entity keyed by id. When two entities share an id, which
 * the generator never produces, the first one in this order wins: hero
 * incidents, hero sites, landmarks, buildings, crowd incidents, crowd sites,
 * the overflow. That is the order `resolveEntity` searched in, so switching
 * it to the index changes no answer.
 */
export function indexEntities(city: CityModel): ReadonlyMap<string, SelectableEntity> {
  const hit = cache.get(city);
  if (hit) return hit;

  const index = new Map<string, SelectableEntity>();
  const add = (entity: SelectableEntity): void => {
    if (!index.has(entity.id)) index.set(entity.id, entity);
  };

  city.incidents.forEach(add);
  city.constructionSites.forEach(add);
  city.landmarks.forEach(add);
  city.buildings.forEach(add);
  city.backlog?.incidents.forEach(add);
  city.backlog?.constructionSites.forEach(add);
  if (city.overflow) add(city.overflow);

  cache.set(city, index);
  return index;
}

/** Convenience lookup; `null` for an unknown id or no city. */
export function entityById(city: CityModel | null, id: string | null): SelectableEntity | null {
  if (!city || id === null) return null;
  return indexEntities(city).get(id) ?? null;
}

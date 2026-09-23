/**
 * A city's traffic, set up once per city (PLAN.md sections 17, 18, 37, 76.5):
 * how many vehicles, which bodies, which are tractors, where they start, and
 * the simulation that drives them. `Traffic.tsx` draws what this returns; the
 * tests drive exactly the same thing.
 *
 * Pure, no three.js scene objects: unit tested.
 */

import { prngFor } from "@/lib/city/seed";
import { DEFAULT_SETTLEMENT_TIER, SETTLEMENT_PARAMS } from "@/lib/city/settlement";
import type { CityModel } from "@/types/city";
import { blockedStretches, cityObstacles } from "./blockages";
import { BODY_SPECS, TRACTOR_SPEC, fleetLooks, type BodySpec, type VehicleBody } from "./models/vehicles/shapes";
import { TRACTOR_PACE, carCap, createTraffic, roadGraph, spawnCars, tractorsFor, type Traffic } from "./traffic";

/** A body in the fleet: one of the city's cars, or a village tractor. */
export type FleetBody = VehicleBody | "tractor";

export const specOf = (body: FleetBody): BodySpec => (body === "tractor" ? TRACTOR_SPEC : BODY_SPECS[body]);

/** A little over half a body's length: the distance the traffic keeps for it. */
export const halfLengthOf = (body: FleetBody): number => specOf(body).length / 2 + 0.05;

export interface FleetLook {
  body: FleetBody;
  colorIndex: number;
  tractor: boolean;
}

export interface CityFleet {
  traffic: Traffic;
  /** Per car, in the order of `traffic.cars`. */
  looks: FleetLook[];
}

export function cityFleet(city: CityModel): CityFleet {
  const rng = prngFor(city.seed, "traffic");
  // The settlement's own cap: a village runs ten cars, a metropolis 64.
  const wanted = Math.max(0, Math.min(city.vehicles.count, carCap(city.settlement?.tier)));
  const graph = roadGraph(city.roads);
  // Incidents, any site that reaches a lane, crowd objects standing in a
  // lane and the queue at the city limits, once per city.
  const closures = blockedStretches(graph, cityObstacles(city));
  // A separate stream, so adding body types cannot change where the cars
  // spawn or which way they drive (PLAN.md section 35).
  const shapes = fleetLooks(wanted, prngFor(city.seed, "fleet"));
  // A village's lanes carry a few tractors, trundling along at half pace.
  // Their own stream again, so a city's fleet is exactly as it was.
  const tier = city.settlement?.tier ?? DEFAULT_SETTLEMENT_TIER;
  const tractor = tractorsFor(wanted, SETTLEMENT_PARAMS[tier].vehicles.tractors, prngFor(city.seed, "tractors"));
  const bodies: FleetBody[] = shapes.map((look, i) => (tractor[i] ? "tractor" : look.body));
  // Junction boxes and stop lines are drawn for the longest body in this
  // fleet, which in a village of narrow lanes is seldom a bus; each car keeps
  // its own body's distance from the next.
  const longest = Math.max(0, ...bodies.map(halfLengthOf));
  const cars = spawnCars(graph, wanted, rng, closures, longest);
  cars.forEach((car, i) => {
    car.half = halfLengthOf(bodies[i]);
    if (!tractor[i]) return;
    car.speed *= TRACTOR_PACE;
    car.v = car.speed;
  });
  return {
    traffic: createTraffic(graph, cars, rng, closures, longest),
    looks: cars.map((_, i) => ({ body: bodies[i], colorIndex: shapes[i].colorIndex, tractor: tractor[i] })),
  };
}

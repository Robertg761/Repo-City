import { describe, expect, it } from "vitest";
import {
  BED_LAYERS,
  EVENT_LAYERS,
  NEAR_DISTANCE,
  approach,
  cameraAltitude,
  liveliness,
  mixFor,
  timeWeights,
  wrapPhase,
  type Mix,
  type MixScene,
} from "./audioMix";

const scene = (over: Partial<MixScene> = {}): MixScene => ({
  tier: "city",
  phase: 1,
  health: 72,
  activity: 0.6,
  archived: false,
  traffic: 0.6,
  ...over,
});

const MORNING = 0;
const AFTERNOON = 1;
const EVENING = 2;
const NIGHT = 3;

const everyGain = (mix: Mix) => [
  ...BED_LAYERS.map((layer) => mix.beds[layer]),
  ...EVENT_LAYERS.map((layer) => mix.events[layer].gain),
  mix.local,
];

describe("timeWeights", () => {
  it("is all one hour at each preset", () => {
    expect(timeWeights(MORNING)).toEqual({ morning: 1, afternoon: 0, evening: 0, night: 0 });
    expect(timeWeights(NIGHT)).toEqual({ morning: 0, afternoon: 0, evening: 0, night: 1 });
  });

  it("shares a point between its two neighbours and always sums to one", () => {
    for (let p = -4; p <= 8; p += 0.137) {
      const w = timeWeights(p);
      expect(w.morning + w.afternoon + w.evening + w.night).toBeCloseTo(1, 9);
    }
    const dawn = timeWeights(3.5);
    expect(dawn.night).toBeCloseTo(0.5);
    expect(dawn.morning).toBeCloseTo(0.5);
    expect(timeWeights(1.8).evening).toBeCloseTo(0.8);
  });

  it("wraps the loop, and treats nonsense as the afternoon", () => {
    expect(wrapPhase(4.5)).toBeCloseTo(0.5);
    expect(wrapPhase(-1)).toBeCloseTo(3);
    expect(wrapPhase(Number.NaN)).toBe(1);
  });
});

describe("cameraAltitude", () => {
  it("is 0 on the ground and 1 at the overview, and never outside", () => {
    expect(cameraAltitude(NEAR_DISTANCE, 160)).toBe(0);
    expect(cameraAltitude(3, 160)).toBe(0);
    expect(cameraAltitude(240, 160)).toBe(1);
    expect(cameraAltitude(10_000, 160)).toBe(1);
    expect(cameraAltitude(Number.NaN, 160)).toBe(0);
  });

  it("rises with distance, logarithmically", () => {
    const a = cameraAltitude(24, 160);
    const b = cameraAltitude(48, 160);
    const c = cameraAltitude(96, 160);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(b - a).toBeCloseTo(c - b, 9);
  });

  it("lets a bigger city be seen from further before it counts as the overview", () => {
    expect(cameraAltitude(200, 300)).toBeLessThan(cameraAltitude(200, 120));
  });
});

describe("liveliness", () => {
  it("is quiet for an archived repository whatever its score", () => {
    expect(liveliness({ health: 100, activity: 1, archived: true })).toBeLessThan(0.2);
  });

  it("rises with health and activity", () => {
    const struggling = liveliness({ health: 20, activity: 0.1, archived: false });
    const thriving = liveliness({ health: 95, activity: 0.9, archived: false });
    expect(thriving).toBeGreaterThan(struggling);
    expect(thriving).toBeLessThanOrEqual(1);
  });
});

describe("mixFor: the hour", () => {
  it("sings in the morning and falls silent of birds at night", () => {
    const morning = mixFor(scene({ tier: "town", phase: MORNING }), 1);
    const night = mixFor(scene({ tier: "town", phase: NIGHT }), 1);
    expect(morning.events.birds.rate).toBeGreaterThan(0.5);
    expect(night.events.birds.gain).toBe(0);
    expect(night.events.birds.rate).toBe(0);
  });

  it("brings the crickets out at night, and none by day", () => {
    expect(mixFor(scene({ phase: NIGHT }), 1).events.crickets.rate).toBeGreaterThan(0.5);
    expect(mixFor(scene({ phase: AFTERNOON }), 1).events.crickets.rate).toBe(0);
    expect(mixFor(scene({ phase: MORNING }), 1).events.crickets.rate).toBe(0);
  });

  it("hums loudest in the afternoon, softer in the evening, least at night", () => {
    const hum = (phase: number) => mixFor(scene({ phase }), 1).beds.hum;
    expect(hum(AFTERNOON)).toBeGreaterThan(hum(EVENING));
    expect(hum(EVENING)).toBeGreaterThan(hum(NIGHT));
    expect(hum(MORNING)).toBeGreaterThan(hum(NIGHT));
  });

  it("keeps a few birds in the evening", () => {
    const evening = mixFor(scene({ tier: "town", phase: EVENING }), 1).events.birds;
    const morning = mixFor(scene({ tier: "town", phase: MORNING }), 1).events.birds;
    expect(evening.rate).toBeGreaterThan(0);
    expect(evening.rate).toBeLessThan(morning.rate / 2);
  });

  it("passes the odd car at night in a city, not by day", () => {
    expect(mixFor(scene({ phase: NIGHT }), 1).events.cars.rate).toBeGreaterThan(0);
    expect(mixFor(scene({ phase: AFTERNOON }), 1).events.cars.rate).toBe(0);
  });

  it("crossfades: a sky halfway between two hours sounds halfway between them", () => {
    const a = mixFor(scene({ phase: AFTERNOON }), 1).beds.hum;
    const b = mixFor(scene({ phase: EVENING }), 1).beds.hum;
    const mid = mixFor(scene({ phase: 1.5 }), 1).beds.hum;
    expect(mid).toBeGreaterThan(Math.min(a, b));
    expect(mid).toBeLessThan(Math.max(a, b));
  });
});

describe("mixFor: the settlement", () => {
  it("makes a village rural and a metropolis dense", () => {
    const village = mixFor(scene({ tier: "village" }), 1);
    const metropolis = mixFor(scene({ tier: "metropolis" }), 1);
    expect(village.beds.wind).toBeGreaterThan(metropolis.beds.wind);
    expect(metropolis.beds.hum).toBeGreaterThan(village.beds.hum * 4);
    expect(metropolis.beds.rumble).toBeGreaterThan(village.beds.rumble * 10);
    expect(village.events.birds.rate).toBeGreaterThan(metropolis.events.birds.rate);
  });

  it("orders the hum by size", () => {
    const hum = (tier: MixScene["tier"]) => mixFor(scene({ tier }), 1).beds.hum;
    expect(hum("village")).toBeLessThan(hum("town"));
    expect(hum("town")).toBeLessThan(hum("city"));
    expect(hum("city")).toBeLessThan(hum("metropolis"));
  });

  it("keeps the tractor and the animals to the village", () => {
    for (const tier of ["town", "city", "metropolis", null] as const) {
      const mix = mixFor(scene({ tier }), 1);
      expect(mix.events.tractor.rate).toBe(0);
      expect(mix.events.livestock.rate).toBe(0);
    }
    const village = mixFor(scene({ tier: "village", phase: AFTERNOON }), 1);
    expect(village.events.tractor.rate).toBeGreaterThan(0);
    expect(village.events.livestock.rate).toBeGreaterThan(0);
    // Sparingly: well under one a minute.
    expect(village.events.livestock.rate).toBeLessThan(1 / 45);
  });

  it("sounds the horn in a metropolis only, and rarely", () => {
    expect(mixFor(scene({ tier: "town" }), 1).events.horns.rate).toBe(0);
    const metro = mixFor(scene({ tier: "metropolis", health: 100, activity: 1 }), 1).events.horns;
    expect(metro.rate).toBeGreaterThan(0);
    expect(metro.rate).toBeLessThan(1 / 12);
  });

  it("gives the empty stage a gentle bed and no farm", () => {
    const empty = mixFor(scene({ tier: null, phase: MORNING }), 1);
    expect(empty.beds.wind).toBeGreaterThan(0);
    expect(empty.beds.hum).toBe(0);
    expect(empty.events.birds.rate).toBeGreaterThan(0);
  });
});

describe("mixFor: health", () => {
  it("makes an archived repository eerily quiet", () => {
    const live = mixFor(scene({ tier: "metropolis" }), 1);
    const archived = mixFor(scene({ tier: "metropolis", archived: true }), 1);
    expect(archived.beds.hum).toBeLessThan(live.beds.hum / 3);
    expect(archived.events.horns.rate).toBeLessThan(live.events.horns.rate / 3);
    expect(archived.beds.wind).toBeGreaterThan(live.beds.wind);
  });

  it("makes a thriving repository livelier than a struggling one", () => {
    const struggling = mixFor(scene({ health: 20, activity: 0.1 }), 1);
    const thriving = mixFor(scene({ health: 95, activity: 0.9 }), 1);
    expect(thriving.beds.hum).toBeGreaterThan(struggling.beds.hum);
    expect(thriving.events.horns.rate).toBeGreaterThanOrEqual(struggling.events.horns.rate);
  });
});

describe("mixFor: the camera", () => {
  it("opens the local sources near the ground and closes them at the overview", () => {
    expect(mixFor(scene(), 0).local).toBe(1);
    expect(mixFor(scene(), 1).local).toBe(0);
    expect(mixFor(scene(), 0.4).local).toBeGreaterThan(0);
  });

  it("steps the bed back for them, and lets the wind up high", () => {
    const low = mixFor(scene(), 0);
    const high = mixFor(scene(), 1);
    expect(low.beds.hum).toBeLessThan(high.beds.hum);
    expect(low.beds.wind).toBeLessThan(high.beds.wind);
  });
});

describe("mixFor: bounds", () => {
  it("keeps every gain in 0..1 and every rate modest, across the whole space", () => {
    const tiers = [null, "village", "town", "city", "metropolis"] as const;
    for (const tier of tiers) {
      for (let phase = 0; phase < 4; phase += 0.25) {
        for (const archived of [false, true]) {
          for (const altitude of [0, 0.3, 0.7, 1]) {
            const mix = mixFor(
              scene({ tier, phase, archived, health: 100, activity: 1, traffic: 1 }),
              altitude,
            );
            for (const gain of everyGain(mix)) {
              expect(gain).toBeGreaterThanOrEqual(0);
              expect(gain).toBeLessThanOrEqual(1);
            }
            for (const layer of EVENT_LAYERS) {
              expect(mix.events[layer].rate).toBeLessThan(2.5);
            }
          }
        }
      }
    }
  });

  it("is a pure function", () => {
    expect(mixFor(scene(), 0.5)).toEqual(mixFor(scene(), 0.5));
  });
});

describe("approach", () => {
  it("moves towards the target by the time constant", () => {
    expect(approach(0, 1, 1, 1)).toBeCloseTo(1 - Math.exp(-1));
    expect(approach(0, 1, 100, 1)).toBeCloseTo(1);
    expect(approach(0.3, 1, 0, 1)).toBeCloseTo(0.3, 12);
    expect(approach(0, 1, 1, 0)).toBe(1);
  });
});

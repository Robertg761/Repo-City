/**
 * WHAT TIME THE TOWN CLOCKS SHOW.
 *
 * Every clock in the city (the town hall's, the chapel's, the station's and
 * the civic kit's clock hall) reads the scene's own hour: the sky's phase
 * (`sky.tsx`), which is where the viewer's `?time=` setting, the HUD's four
 * hours and Auto's inferred hour all end up. So the clocks agree with the sun
 * and with each other, and they sweep to the new time while the sky changes
 * over `TRANSITION_MS`, instead of jumping.
 *
 * The phase is a loop of four stretches (`timeOfDay.ts`): morning 0,
 * afternoon 1, evening 2, night 3. Each preset sits on a wall-clock time
 * chosen to match its light, a little off the hour so a still clock has hands
 * in different places (it is never "ten past ten" twice), and the phase maps
 * between them piecewise-linearly:
 *
 *   morning    07:42   a low sun from the east
 *   afternoon  13:12   the clean midday look
 *   evening    18:24   the golden hour
 *   night      23:36   moonlight
 *   morning    31:42   (= 07:42 the next day, so the loop closes)
 *
 * Auto sits between afternoon and the golden hour, so it reads between 13:12
 * and about 17:00.
 *
 * Once the hour has settled the clock runs at the real rate, a smooth
 * sweep: the minute hand turns six degrees a minute without ticking, the hour
 * hand follows it, and a second hand (on the near levels, where the dial is
 * big enough to see one) goes round once a minute. `elapsed` is the scene's
 * clock in seconds, so it starts from the preset's time when the page opens.
 *
 * Pure: no three.js, no React. Unit tested in `clockTime.test.ts`.
 */

import { DAY_LOOP, wrapPhase } from "./timeOfDay";

/** Wall-clock hours at phase 0, 1, 2, 3 and 4 (the morning again, a day on). */
export const CLOCK_ANCHORS: readonly number[] = [7.7, 13.2, 18.4, 23.6, 31.7];

const TAU = Math.PI * 2;

/**
 * The hour of the day, in hours since midnight (unwrapped, so it can pass 24),
 * at sky phase `phase` and `elapsed` seconds of scene time.
 */
export function clockHours(phase: number, elapsed = 0): number {
  const p = wrapPhase(phase);
  const lo = Math.min(DAY_LOOP - 1, Math.floor(p));
  const along = p - lo;
  const base = CLOCK_ANCHORS[lo] + (CLOCK_ANCHORS[lo + 1] - CLOCK_ANCHORS[lo]) * along;
  return base + elapsed / 3600;
}

export interface HandAngles {
  /** Radians clockwise from twelve, as seen from in front of the face. */
  hour: number;
  minute: number;
  second: number;
}

const frac = (x: number): number => x - Math.floor(x);

/** The hands' angles for a time in hours since midnight, all smooth. */
export function handAngles(hours: number, out: HandAngles = { hour: 0, minute: 0, second: 0 }): HandAngles {
  out.hour = frac(hours / 12) * TAU;
  out.minute = frac(hours) * TAU;
  out.second = frac(hours * 60) * TAU;
  return out;
}

/**
 * The turn, in radians about the face's outward normal, that takes a hand
 * modelled at twelve to `angle` (clockwise from twelve, seen from outside).
 *
 * A right-handed turn about the outward normal is anticlockwise to a viewer
 * in front of the face, so clockwise is its negative. When the face is drawn
 * through a mirrored transform (a negative determinant) the hand's local turn
 * comes out reversed on screen, so the sign flips back: that is what keeps
 * every face of a clock tower reading the same time.
 */
export function handTurn(angle: number, mirrored = false): number {
  return mirrored ? angle : -angle;
}

/** `clockHours` formatted `H:MM`, for logs and tests. */
export function clockLabel(hours: number): string {
  const total = Math.floor(((hours % 24) + 24) % 24 * 60 + 1e-6);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

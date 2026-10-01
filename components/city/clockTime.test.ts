import { describe, expect, it } from "vitest";
import { Object3D, Quaternion, Vector3 } from "three";
import { CLOCK_ANCHORS, clockHours, clockLabel, handAngles, handTurn } from "./clockTime";
import { PRESET_PHASE, autoPhase, wrapPhase } from "./timeOfDay";

const TAU = Math.PI * 2;
const deg = (radians: number) => (radians * 180) / Math.PI;

describe("what time the clocks show", () => {
  it("reads each preset's own time of day", () => {
    expect(clockLabel(clockHours(PRESET_PHASE.morning))).toBe("7:42");
    expect(clockLabel(clockHours(PRESET_PHASE.afternoon))).toBe("13:12");
    expect(clockLabel(clockHours(PRESET_PHASE.evening))).toBe("18:24");
    expect(clockLabel(clockHours(PRESET_PHASE.night))).toBe("23:36");
  });

  it("runs forwards through the day, and the loop closes on the same morning", () => {
    let last = -Infinity;
    for (let phase = 0; phase < 4; phase += 0.05) {
      const hours = clockHours(phase);
      expect(hours).toBeGreaterThan(last);
      last = hours;
    }
    // Phase 4 is phase 0 again: the same time modulo a day, so the sweep
    // from night to morning passes through midnight without a jump.
    expect(clockHours(4) % 24).toBeCloseTo(clockHours(0) % 24, 9);
    expect(CLOCK_ANCHORS[4] - CLOCK_ANCHORS[0]).toBe(24);
    expect(clockHours(3.999) % 24).toBeCloseTo(clockHours(0) % 24 - 0.0, 1);
  });

  it("puts Auto between the afternoon and the golden hour", () => {
    const auto = clockHours(autoPhase({ warmth: 0.7, saturation: 0.9, fog: 0.1, trafficDensity: 0.5, pedestrianDensity: 0.5, litWindowShare: 1 }, false));
    expect(auto).toBeGreaterThanOrEqual(clockHours(PRESET_PHASE.afternoon));
    expect(auto).toBeLessThanOrEqual(clockHours(PRESET_PHASE.evening));
  });

  it("wraps a phase like the sky does", () => {
    expect(clockHours(5.5)).toBeCloseTo(clockHours(wrapPhase(5.5)), 9);
    expect(clockHours(-0.5)).toBeCloseTo(clockHours(3.5), 9);
  });

  it("creeps on at the real rate once the hour has settled", () => {
    expect(clockHours(1, 3600) - clockHours(1, 0)).toBeCloseTo(1, 9);
    expect(deg(handAngles(clockHours(1, 60)).minute - handAngles(clockHours(1, 0)).minute)).toBeCloseTo(6, 6);
  });
});

describe("the hands' angles", () => {
  it("puts the hands where a clock would for a given time", () => {
    // 3:00: the hour hand at 90 degrees, the minute hand at twelve.
    let a = handAngles(3);
    expect(deg(a.hour)).toBeCloseTo(90, 6);
    expect(deg(a.minute)).toBeCloseTo(0, 6);
    // 10:10: the clockmaker's hour. The hour hand has moved a sixth of the way on.
    a = handAngles(10 + 10 / 60);
    expect(deg(a.hour)).toBeCloseTo(305, 6);
    expect(deg(a.minute)).toBeCloseTo(60, 6);
    // 13:45 reads as 1:45, the hour hand three quarters of the way to two.
    a = handAngles(13.75);
    expect(deg(a.hour)).toBeCloseTo(52.5, 6);
    expect(deg(a.minute)).toBeCloseTo(270, 6);
    // Half a second past: the second hand is at three degrees.
    expect(deg(handAngles(1 + 0.5 / 3600).second)).toBeCloseTo(3, 6);
  });

  it("moves the minute hand smoothly, six degrees a minute, without ticking", () => {
    let previous = handAngles(7.7).minute;
    for (let second = 1; second <= 120; second++) {
      const now = handAngles(7.7 + second / 3600).minute;
      expect(deg(now - previous)).toBeCloseTo(0.1, 6);
      previous = now;
    }
  });

  it("carries the hour hand with the minute hand", () => {
    const at = handAngles(9 + 30 / 60);
    expect(deg(at.hour)).toBeCloseTo(285, 6);
    expect(handAngles(9.5 + 1e-6).hour).toBeGreaterThan(at.hour);
  });
});

describe("turning a hand about its face", () => {
  /** Where the tip of a hand modelled at twelve points, in the world, for a face with a transform. */
  function tip(angle: number, yaw: number, mirror: boolean): Vector3 {
    const pivot = new Object3D();
    pivot.rotation.y = yaw;
    if (mirror) pivot.scale.x = -1;
    const hand = new Object3D();
    pivot.add(hand);
    pivot.updateMatrixWorld(true);
    const mirrored = pivot.matrixWorld.determinant() < 0;
    hand.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), handTurn(angle, mirrored)));
    hand.updateMatrixWorld(true);
    return new Vector3(0, 1, 0).transformDirection(hand.matrixWorld);
  }

  /** To a viewer in front of a face that looks along (sin yaw, 0, cos yaw): their right-hand direction. */
  const right = (yaw: number) => new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  it("turns clockwise as the viewer sees it, on every face of a tower", () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      expect(tip(0, yaw, false).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-9); // twelve is up
      expect(tip(TAU / 4, yaw, false).distanceTo(right(yaw))).toBeLessThan(1e-9); // three is on the viewer's right
      expect(tip(TAU / 2, yaw, false).distanceTo(new Vector3(0, -1, 0))).toBeLessThan(1e-9); // six is down
      expect(tip(TAU * 0.75, yaw, false).distanceTo(right(yaw).negate())).toBeLessThan(1e-9); // nine is on the left
    }
  });

  it("turns the other way in local space on a mirrored face, so it still reads clockwise", () => {
    expect(handTurn(1, false)).toBe(-1);
    expect(handTurn(1, true)).toBe(1);
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      // The mirror flips the face's own x, so on the screen the hand's three o'clock
      // must still land on the viewer's right.
      const mirroredRight = right(yaw).clone();
      const probe = new Object3D();
      probe.rotation.y = yaw;
      probe.scale.x = -1;
      probe.updateMatrixWorld(true);
      // The viewer's right in the mirrored frame is the world's x flipped back.
      const expected = new Vector3(-1, 0, 0).transformDirection(probe.matrixWorld);
      expect(expected.distanceTo(mirroredRight)).toBeLessThan(1e-9);
      expect(tip(TAU / 4, yaw, true).distanceTo(expected)).toBeLessThan(1e-9);
      expect(tip(TAU * 0.75, yaw, true).distanceTo(expected.negate())).toBeLessThan(1e-9);
    }
  });
});

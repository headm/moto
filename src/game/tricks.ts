import * as THREE from 'three';
import { T } from '../core/tunables';
import { wrapAngle } from '../bike/physics';
import type { BikeState } from '../bike/state';

/**
 * Rotation accumulators → named tricks.
 *
 * Detection deliberately lives outside physics. Nothing here touches the
 * simulation: it only watches the orientation the integrator already produced,
 * which means a trick can be renamed, re-valued or dropped without any risk of
 * changing how the bike rides.
 *
 * Everything accumulates as a **shortest-arc delta**, so the wrapping physics
 * applies to pitch and roll is invisible here — a backflip reads as a continuous
 * +360, not as a jump from +180 to -180 and back.
 *
 * Rotation is counted *signed*. That single choice is what separates a spin from
 * a whip: a 360 sums to 360, while a whip out and back sums to roughly zero even
 * though the bike passed through the same angles.
 *
 * `step()` must be called exactly once per physics step, immediately after
 * `stepBike`. It reads `prevPitch`/`prevYaw`/`prevRoll`, which are only the
 * previous step's values in that window.
 */

export interface TrickTally {
  /**
   * Completed flips, **signed**: positive is a backflip (pull back), negative a
   * frontflip. Spins and rolls are unsigned — a 360 is a 360 either way round.
   */
  flips: number;
  spins: number;
  rolls: number;
  whip: boolean;
  /** Flight time these tricks were taken in, seconds. */
  airTime: number;
  /** Display name, e.g. `Backflip 360 Whip`. Empty when nothing has completed. */
  label: string;
  /** Trick points, before airtime and the combo multiplier. */
  points: number;
}

function emptyTally(): TrickTally {
  return { flips: 0, spins: 0, rolls: 0, whip: false, airTime: 0, label: '', points: 0 };
}

function clearTally(t: TrickTally) {
  t.flips = 0;
  t.spins = 0;
  t.rolls = 0;
  t.whip = false;
  t.airTime = 0;
  t.label = '';
  t.points = 0;
}

/**
 * Revolutions completed from a signed degree total.
 *
 * The first revolution lands early — at `rev` degrees rather than a full 360 —
 * because the bike leaves the lip already pitched up and lands on a downslope,
 * so a flip that reads as complete to the rider is a few degrees short of a
 * geometric turn. Every revolution *after* the first still costs a full 360,
 * which is why this is not simply `floor(deg / rev)`: that would call 700
 * degrees a double.
 */
function revolutions(deg: number, rev: number): number {
  const a = Math.abs(deg);
  return a < rev ? 0 : Math.floor((a - rev) / 360) + 1;
}

function revName(n: number, one: string): string {
  if (n <= 1) return one;
  if (n === 2) return `Double ${one}`;
  if (n === 3) return `Triple ${one}`;
  return `${n}x ${one}`;
}

/** Combined rotations name themselves: "Backflip 360 Whip". */
function buildLabel(t: TrickTally): string {
  const parts: string[] = [];
  if (t.flips !== 0) parts.push(revName(Math.abs(t.flips), t.flips > 0 ? 'Backflip' : 'Frontflip'));
  if (t.spins > 0) parts.push(String(t.spins * 360));
  if (t.rolls > 0) parts.push(revName(t.rolls, 'Barrel Roll'));
  if (t.whip) parts.push('Whip');
  return parts.join(' ');
}

export class Tricks {
  /** Signed degrees turned this flight, per axis. */
  pitchDeg = 0;
  yawDeg = 0;
  rollDeg = 0;
  /** Seconds airborne this flight. Matches the physics' own `airTime`. */
  airTime = 0;
  /** How far the bike currently points off its direction of travel, degrees. */
  yawOffDeg = 0;
  /** A whip was held long enough this flight. It still has to be brought back. */
  whipped = false;

  /** What has completed so far this flight — what the HUD shows in the air. */
  readonly live: TrickTally = emptyTally();
  /**
   * The tally for the touchdown that just happened, or null. Set on the single
   * step the bike lands and cleared on the next one, so whoever scores it has to
   * run at physics rate too.
   */
  landed: TrickTally | null = null;

  private readonly landedTally: TrickTally = emptyTally();
  private whipHold = 0;
  private wasGrounded = true;

  reset() {
    this.beginFlight();
    this.landed = null;
    this.wasGrounded = true;
    clearTally(this.live);
  }

  private beginFlight() {
    this.pitchDeg = 0;
    this.yawDeg = 0;
    this.rollDeg = 0;
    this.airTime = 0;
    this.yawOffDeg = 0;
    this.whipped = false;
    this.whipHold = 0;
    clearTally(this.live);
  }

  step(s: BikeState, dt: number) {
    this.landed = null;

    if (!s.grounded) {
      if (this.wasGrounded) this.beginFlight();
      this.accumulate(s, dt);
      this.fill(this.live, false);
    } else if (!this.wasGrounded) {
      this.fill(this.landedTally, true);
      this.landed = this.landedTally;
      clearTally(this.live);
    }

    this.wasGrounded = s.grounded;
  }

  private accumulate(s: BikeState, dt: number) {
    const sc = T.score;
    const deg = THREE.MathUtils.radToDeg;

    this.pitchDeg += deg(wrapAngle(s.pitch - s.prevPitch));
    this.yawDeg += deg(wrapAngle(s.yaw - s.prevYaw));
    this.rollDeg += deg(wrapAngle(s.roll - s.prevRoll));
    this.airTime += dt;

    // A whip is the bike kicked sideways of where it is actually going, so it is
    // measured against the velocity vector rather than against the launch
    // heading — throwing it out on a curving flight is still a whip.
    const speed = Math.hypot(s.vel.x, s.vel.z);
    this.yawOffDeg = speed > 4 ? deg(wrapAngle(s.yaw - Math.atan2(s.vel.x, s.vel.z))) : 0;

    if (Math.abs(this.yawOffDeg) > sc.whipAngle) this.whipHold += dt;
    else this.whipHold = 0;
    if (this.whipHold >= sc.whipHold) this.whipped = true;
  }

  private fill(dst: TrickTally, atLanding: boolean) {
    const sc = T.score;
    const flipSign = this.pitchDeg < 0 ? -1 : 1;
    const flips = flipSign * revolutions(this.pitchDeg, sc.rotationDeg);
    const spins = revolutions(this.yawDeg, sc.rotationDeg);
    const rolls = revolutions(this.rollDeg, sc.rotationDeg);

    // A completed spin passes through every angle a whip does, for far longer
    // than the hold requires — without this, every 360 would also bank a whip.
    // At landing the bike must also have been brought back straight: a whip left
    // hanging out is just a sideways landing, and the landing rating deals with
    // that on its own.
    const whip =
      this.whipped && spins === 0 && (!atLanding || Math.abs(this.yawOffDeg) <= sc.whipAngle);

    const changed =
      dst.flips !== flips || dst.spins !== spins || dst.rolls !== rolls || dst.whip !== whip;

    dst.flips = flips;
    dst.spins = spins;
    dst.rolls = rolls;
    dst.whip = whip;
    dst.airTime = this.airTime;
    dst.points =
      Math.abs(flips) * sc.flip + spins * sc.spin + rolls * sc.roll + (whip ? sc.whip : 0);
    // Rebuilding the label every step would allocate a string 120 times a second
    // for a readout that changes a handful of times per flight.
    if (changed) dst.label = buildLabel(dst);
  }
}

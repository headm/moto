import * as THREE from 'three';
import { T } from '../core/tunables';
import type { Heightfield } from '../world/heightfield';

/**
 * The bike is one body with two probe points, not two constrained wheels.
 * That simplification is what makes the feel tunable — see physics.ts.
 *
 * The `prev*` fields are the previous physics step's transform, held so the
 * renderer can interpolate and stay smooth at any refresh rate.
 */
export interface BikeState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;

  /** Heading, radians. Forward is (sin yaw, 0, cos yaw). */
  yaw: number;
  /** Nose-up positive, radians. */
  pitch: number;
  /** Lean-right positive, radians. */
  roll: number;

  yawRate: number;
  wheelSpin: number;
  /** Wheel angular rate, retained through air so the wheels keep turning. */
  wheelRate: number;
  /** Current suspension compression, metres. */
  susp: number;

  grounded: boolean;
  /** Seconds of boost burst left. Greater than zero means boosting. */
  boostRemaining: number;
  /** Seconds until another boost may be started. */
  boostCooldown: number;
  /**
   * Whether a jump is available. Set on every landing and spent on jumping, so
   * you get exactly one hop per ground contact however the key is held or mashed.
   */
  jumpArmed: boolean;
  airTime: number;
  groundTime: number;
  /** Peak airborne height above the ground below, metres. */
  airPeak: number;
  /** Downward speed of the most recent impact; consumed by camera/audio. */
  lastImpact: number;

  prevPos: THREE.Vector3;
  prevYaw: number;
  prevPitch: number;
  prevRoll: number;
  prevSusp: number;
  prevWheelSpin: number;
}

export function createBikeState(): BikeState {
  return {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    roll: 0,
    yawRate: 0,
    wheelSpin: 0,
    wheelRate: 0,
    susp: 0,
    grounded: true,
    boostRemaining: 0,
    boostCooldown: 0,
    jumpArmed: true,
    airTime: 0,
    groundTime: 0,
    airPeak: 0,
    lastImpact: 0,
    prevPos: new THREE.Vector3(),
    prevYaw: 0,
    prevPitch: 0,
    prevRoll: 0,
    prevSusp: 0,
    prevWheelSpin: 0,
  };
}

export function resetBike(s: BikeState, hf: Heightfield) {
  s.pos.set(hf.spawn.x, hf.spawn.y + T.susp.restHeight, hf.spawn.z);
  s.vel.set(0, 0, 0);
  s.yaw = hf.spawnYaw;
  s.pitch = 0;
  s.roll = 0;
  s.yawRate = 0;
  s.wheelSpin = 0;
  s.wheelRate = 0;
  s.susp = 0;
  s.grounded = true;
  s.boostRemaining = 0;
  s.boostCooldown = 0;
  s.jumpArmed = true;
  s.airTime = 0;
  s.groundTime = 0;
  s.airPeak = 0;
  s.lastImpact = 0;

  s.prevPos.copy(s.pos);
  s.prevYaw = s.yaw;
  s.prevPitch = s.pitch;
  s.prevRoll = s.roll;
  s.prevSusp = 0;
  s.prevWheelSpin = 0;
}

/** True while a boost burst is running. */
export function isBoosting(s: BikeState): boolean {
  return s.boostRemaining > 0;
}

/** Horizontal speed, m/s. */
export function groundSpeed(s: BikeState): number {
  return Math.hypot(s.vel.x, s.vel.z);
}

import * as THREE from 'three';
import { T } from '../core/tunables';
import type { InputState } from '../core/input';
import type { Heightfield } from '../world/heightfield';
import type { BikeState } from './state';
import { classifyLanding, bandKeepSpeed, bandShake, bandSnap } from './landing';

/**
 * Arcade motocross physics. No rigid-body engine, no wheel constraints.
 *
 * The model:
 *   - One body, two ground probes (front axle, rear axle).
 *   - A spring-damper at each probe midpoint absorbs landings instead of
 *     stopping the bike dead. This is the suspension.
 *   - Pitch is *derived* from the front/rear ground height difference. That one
 *     line is what makes riding up a slope feel right: the bike noses up the
 *     face and points you at the sky at the lip.
 *   - Roll is derived too: terrain cross-slope plus a visual lean from
 *     (yaw rate x speed). Free-looking cornering for zero physics complexity.
 *   - Airborne, only gravity and drag touch velocity. Rotation is fully manual
 *     with no auto-level, so flip timing becomes learnable muscle memory.
 *
 * Landing tolerance and crashes are M2. For now a landing just snaps the
 * orientation back to the ground along the shortest path.
 *
 * Nothing here allocates. The scratch vectors below are module-level singletons
 * because a per-frame allocation in this function is the difference between
 * smooth and a GC hitch every few seconds.
 *
 * SIGN CONVENTIONS — get these wrong and everything still looks plausible:
 *
 *   forward = ( sin yaw, 0,  cos yaw)   the way the bike points
 *   right   = (-cos yaw, 0,  sin yaw)   the rider's right, = cross(forward, up)
 *
 * Rotation about +Y is counter-clockwise seen from above, so **increasing yaw
 * turns LEFT**. Steering right therefore has to *decrease* yaw. Note also that
 * the model is authored nose-toward +Z while Three's own convention is -Z, so
 * the model's local +X is the rider's left, not their right.
 *
 *   pitch > 0  nose up      roll > 0  leaning to the rider's right
 */

const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const nrm = new THREE.Vector3();

/** Wrap to (-PI, PI]. */
function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Exponential approach along the shortest arc — framerate independent. */
function approachAngle(cur: number, target: number, k: number, dt: number): number {
  return cur + wrapAngle(target - cur) * (1 - Math.exp(-k * dt));
}

/**
 * Rate a touchdown and apply its consequence.
 *
 * The errors are *wrapped* differences, so landing inverted reads as ~180 deg
 * rather than as a small number — which is exactly the bug that would hide if
 * these were plain subtractions.
 *
 * There is no crash: every band recovers and keeps riding. Lost speed is the
 * whole penalty, and camera shake rides the existing impact channel so no new
 * plumbing is needed to make a bad landing feel bad.
 */
function rateLanding(s: BikeState, groundPitch: number, groundRoll: number) {
  const pitchErr = Math.abs(THREE.MathUtils.radToDeg(wrapAngle(s.pitch - groundPitch)));
  const rollErr = Math.abs(THREE.MathUtils.radToDeg(wrapAngle(s.roll - groundRoll)));
  const band = classifyLanding(pitchErr, rollErr);
  const keep = bandKeepSpeed(band);

  s.vel.x *= keep;
  s.vel.z *= keep;
  s.lastImpact *= bandShake(band);
  s.recovering = T.landing.snapTime;
  s.recoverSnap = bandSnap(band);

  const r = s.landing;
  r.pending = true;
  r.band = band;
  r.pitchErrDeg = pitchErr;
  r.rollErrDeg = rollErr;
  r.airTime = s.airTime;
  r.keptSpeed = keep;
}

export function stepBike(s: BikeState, hf: Heightfield, input: InputState, dt: number) {
  // Snapshot for render interpolation.
  s.prevPos.copy(s.pos);
  s.prevYaw = s.yaw;
  s.prevPitch = s.pitch;
  s.prevRoll = s.roll;
  s.prevSusp = s.susp;
  s.prevWheelSpin = s.wheelSpin;

  const b = T.bike;
  const su = T.susp;
  const st = T.steer;
  const ai = T.air;
  const bo = T.boost;

  // Boost timers run everywhere, not just on the ground: a burst started on the
  // ground keeps counting through the air, so launching mid-boost isn't punished.
  // Drive force only applies while grounded anyway, so it costs nothing to let it
  // run, and you land still boosting.
  if (s.boostRemaining > 0) {
    s.boostRemaining = Math.max(0, s.boostRemaining - dt);
    if (s.boostRemaining === 0) s.boostCooldown = bo.cooldown;
  } else if (s.boostCooldown > 0) {
    s.boostCooldown = Math.max(0, s.boostCooldown - dt);
  }

  fwd.set(Math.sin(s.yaw), 0, Math.cos(s.yaw));
  right.set(-Math.cos(s.yaw), 0, Math.sin(s.yaw));

  // ---- ground query -------------------------------------------------------
  const halfWB = b.wheelBase * 0.5;
  const hFront = hf.height(s.pos.x + fwd.x * halfWB, s.pos.z + fwd.z * halfWB);
  const hRear = hf.height(s.pos.x - fwd.x * halfWB, s.pos.z - fwd.z * halfWB);
  const groundY = (hFront + hRear) * 0.5;

  // Ground orientation is computed up front rather than inside the grounded
  // branch, because the landing rating needs it on the very frame of touchdown.
  // Two extra height samples while airborne is a rounding error.
  const groundPitch = Math.atan2(hFront - hRear, b.wheelBase);
  const track = b.trackSample;
  const hLeft = hf.height(s.pos.x - right.x * track, s.pos.z - right.z * track);
  const hRight = hf.height(s.pos.x + right.x * track, s.pos.z + right.z * track);
  const groundRoll = Math.atan2(hLeft - hRight, 2 * track);

  const pen = groundY + su.restHeight - s.pos.y;
  const contact = pen > 0;
  const wasGrounded = s.grounded;
  // Ground stick: a gap this shallow still counts as grounded. The bike is in
  // equilibrium a few centimetres into its travel, so without a tolerance here
  // it detaches and re-attaches over every small bump and airTime becomes noise.
  s.grounded = pen > -su.stickDistance;

  // Gravity is unconditional; the spring provides the normal force.
  s.vel.y -= b.gravity * dt;

  if (s.grounded && !wasGrounded) {
    if (s.vel.y < 0) s.lastImpact = Math.max(s.lastImpact, -s.vel.y);
    // Re-arm on landing rather than on a timer: one hop per ground contact, no
    // matter how the key is held or mashed.
    s.jumpArmed = true;
    // airTime is still the flight duration here; the grounded branch below zeroes
    // it. Short hops go unrated so rolling terrain doesn't spam the readout.
    if (s.airTime >= T.landing.minAirTime) rateLanding(s, groundPitch, groundRoll);
  }

  if (s.recovering > 0) s.recovering = Math.max(0, s.recovering - dt);

  if (s.grounded) {
    hf.normal(s.pos.x, s.pos.z, nrm);

    // How fast the ground under the bike is itself rising or falling, from the
    // terrain gradient and the bike's horizontal velocity. Computed analytically
    // rather than by differencing the last two samples, so it can't blow up on a
    // short timestep.
    const groundVelY = -(nrm.x * s.vel.x + nrm.z * s.vel.z) / Math.max(0.05, nrm.y);

    // ---- suspension -------------------------------------------------------
    if (contact) {
      // The damper opposes the *compression* rate, which is the ground coming up
      // minus the chassis rising. Using only -vel.y here leaves the damper blind
      // to a rising slope: climbing at speed, the terrain arrives at several m/s
      // and the spring alone needs more travel than exists, so the bike rides
      // permanently bottomed out.
      const penRate = THREE.MathUtils.clamp(groundVelY - s.vel.y, -40, 40);
      // Never negative: a wheel can push the chassis up but cannot pull it down
      // toward the ground. Allowing negative force lets the damper suck the bike
      // over crests — it tracks the terrain beautifully and never gets air.
      // Damping still bleeds rebound energy by reducing the upward force.
      const accel = Math.min(su.maxAccel, Math.max(0, su.springK * pen + su.springC * penRate));
      s.vel.y += accel * dt;
      s.susp = Math.min(pen, su.maxTravel);
    } else {
      // Within stick range but not touching: no spring force, gravity brings it
      // back down on its own. Drive and steering keep working, so cresting a
      // small bump doesn't cut the throttle.
      s.susp *= Math.exp(-10 * dt);
    }

    // ---- jump -------------------------------------------------------------
    if (input.jump && s.jumpArmed) {
      // Spends whatever the suspension currently has stored, so a hop taken just
      // after a compression goes higher than one from a settled bike.
      const preload = su.maxTravel > 0 ? Math.min(1, s.susp / su.maxTravel) : 0;
      // Clamped rather than added, so hopping while already dropping still gives
      // a predictable height instead of being eaten by downward velocity.
      s.vel.y = Math.max(0, s.vel.y) + b.jumpImpulse + preload * b.jumpPreload;
      s.susp = 0;
      s.jumpArmed = false;
    }

    // ---- gravity along the slope -----------------------------------------
    // A world-up spring gives no downhill pull on its own, so add the
    // tangential gravity component explicitly. Gain is exposed because this is
    // the main "does the terrain feel heavy" dial.
    const gn = b.gravity * nrm.y * b.slopeGain * dt;
    s.vel.x += gn * nrm.x;
    s.vel.z += gn * nrm.z;

    // ---- boost ------------------------------------------------------------
    // Ground only. An airborne press is ignored rather than consumed: losing a
    // boost to a mis-tap in mid-air feels awful.
    if (input.boost && s.boostRemaining <= 0 && s.boostCooldown <= 0) {
      s.boostRemaining = bo.duration;
    }
    const boosting = s.boostRemaining > 0;

    // ---- drive, brake, grip ----------------------------------------------
    let along = s.vel.x * fwd.x + s.vel.z * fwd.z;
    let lat = s.vel.x * right.x + s.vel.z * right.z;

    // Boosting implies wide open, so a burst still works while coasting.
    const throttle = boosting ? 1 : input.throttle;
    if (throttle > 0) {
      const maxSpeed = boosting ? b.maxSpeed * bo.maxSpeedMul : b.maxSpeed;
      const accel = boosting ? b.engineAccel * bo.accelMul : b.engineAccel;
      const headroom = Math.max(0, 1 - Math.max(0, along) / maxSpeed);
      along += throttle * accel * headroom * dt;
    }

    if (input.brake > 0) {
      if (along > 0) {
        along = Math.max(0, along - input.brake * b.brakeAccel * dt);
      } else if (throttle === 0) {
        // Reverse, purely so you can unstick yourself from a hollow.
        along = Math.max(-b.maxReverse, along - input.brake * b.reverseAccel * dt);
      }
    }

    along -= along * b.rollDrag * dt;
    lat *= Math.exp(-b.lateralGrip * dt);

    s.vel.x = fwd.x * along + right.x * lat;
    s.vel.z = fwd.z * along + right.z * lat;

    // ---- steering ---------------------------------------------------------
    const speed = Math.abs(along);
    const lowSpeed = Math.min(1, speed / st.refSpeed);
    const highSpeed = 1 - (1 - st.highSpeedFalloff) * Math.min(1, Math.max(0, (speed - 14) / 20));
    const authority = lowSpeed * highSpeed;
    const reversing = along < -0.5 ? -1 : 1;

    // Negated: steering right is a *decrease* in yaw (see conventions above).
    const yawTarget = -input.steer * st.maxYawRate * authority * reversing;
    s.yawRate += (yawTarget - s.yawRate) * (1 - Math.exp(-st.yawResponse * dt));
    s.yaw += s.yawRate * dt;

    // ---- derived orientation ---------------------------------------------
    // Turning right means yawRate < 0, and leaning right means roll > 0.
    const lean = THREE.MathUtils.clamp(-s.yawRate * speed * st.leanGain, -st.maxLean, st.maxLean);

    // Just after a landing the band's own snap rate takes over, so a bad one
    // visibly scrambles back upright instead of teleporting level.
    const recovering = s.recovering > 0;
    const pitchSnap = recovering ? s.recoverSnap : st.pitchResponse;
    const rollSnap = recovering ? s.recoverSnap : st.rollResponse;

    s.pitch = approachAngle(s.pitch, groundPitch, pitchSnap, dt);
    s.roll = approachAngle(s.roll, groundRoll + lean, rollSnap, dt);

    s.wheelRate = along / b.wheelRadius;
    s.airTime = 0;
    s.airPeak = 0;
    s.groundTime += dt;
  } else {
    // ---- airborne ---------------------------------------------------------
    const speed = s.vel.length();
    s.vel.multiplyScalar(1 / (1 + ai.drag * speed * dt));

    // Explicit rotation, no auto-level. Pull back to loop backwards.
    s.pitch = wrapAngle(s.pitch + input.pitch * ai.pitchRate * dt);
    s.roll = wrapAngle(s.roll + input.roll * ai.rollRate * dt);
    s.yaw -= input.steer * ai.yawRate * dt;
    s.yawRate *= Math.exp(-2 * dt);

    s.susp *= Math.exp(-8 * dt);
    s.wheelRate *= Math.exp(-0.4 * dt);

    s.airTime += dt;
    s.airPeak = Math.max(s.airPeak, s.pos.y - groundY - su.restHeight);
    s.groundTime = 0;
  }

  s.wheelSpin += s.wheelRate * dt;

  // ---- integrate ----------------------------------------------------------
  s.pos.x += s.vel.x * dt;
  s.pos.y += s.vel.y * dt;
  s.pos.z += s.vel.z * dt;

  // ---- hard constraints ---------------------------------------------------
  // Re-sample at the new position: the spring is a soft constraint and can be
  // outrun on a hard landing, so bound penetration to the suspension travel.
  const hF2 = hf.height(s.pos.x + fwd.x * halfWB, s.pos.z + fwd.z * halfWB);
  const hR2 = hf.height(s.pos.x - fwd.x * halfWB, s.pos.z - fwd.z * halfWB);
  const floor = (hF2 + hR2) * 0.5 + su.restHeight - su.maxTravel;
  if (s.pos.y < floor) {
    s.pos.y = floor;
    if (s.vel.y < 0) {
      s.lastImpact = Math.max(s.lastImpact, -s.vel.y);
      s.vel.y = 0;
    }
    s.susp = su.maxTravel;
    s.grounded = true;
  }

  const limit = hf.half - 24;
  if (Math.abs(s.pos.x) > limit) {
    s.pos.x = Math.sign(s.pos.x) * limit;
    s.vel.x *= -0.3;
  }
  if (Math.abs(s.pos.z) > limit) {
    s.pos.z = Math.sign(s.pos.z) * limit;
    s.vel.z *= -0.3;
  }
}

/**
 * Headless physics harness — `npm run sim`.
 *
 * The M1 gate is "driving on rolling terrain feels good", and feel is judged in
 * the browser. But feel is impossible to judge on top of a model that is quietly
 * unstable, so this runs the real physics with scripted input and reports the
 * numbers that would otherwise take an hour of riding to notice: terminal speed,
 * suspension recovery after a hard landing, whether pitch actually tracks the
 * ground, and whether anything ever goes NaN.
 *
 * It imports the same modules the game does. No mocks.
 */

import * as THREE from 'three';
import { T } from '../src/core/tunables';
import type { InputState } from '../src/core/input';
import { Heightfield } from '../src/world/heightfield';
import { applyPark, featureLipHeight, featureLength, lipCurvature, launchRange } from '../src/world/ramps';
import type { Kicker, Causeway, Berm, Gap, Jump, Feature } from '../src/world/ramps';
import { arcPoint } from '../src/world/ramps';
import { PARK, SETPIECE, TRACKS, SIDE_FEATURES, RIDEABLE, HANDOVERS } from '../src/world/park';
import { createBikeState, resetBike, groundSpeed, type BikeState } from '../src/bike/state';
import { stepBike } from '../src/bike/physics';
import { Tricks, type TrickTally } from '../src/game/tricks';
import { Scoring, type ScoreEvent } from '../src/game/scoring';

const STEP = 1 / 120;

const idle = (): InputState => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  pitch: 0,
  roll: 0,
  jump: false,
  boost: false,
  respawn: false,
});

/**
 * Fraction of the world that can throw the bike at a given speed. A wheel leaves
 * the ground when the upward acceleration needed to follow a convex crest exceeds
 * gravity, i.e. v^2 * curvature > g — so this scales with the *square* of speed,
 * which is why boost converts terrain into ramps rather than just going faster.
 */
function launchableFraction(hf: Heightfield, v: number): number {
  const ds = 2.5;
  let hits = 0;
  let total = 0;
  for (let x = -300; x <= 300; x += 7) {
    for (let z = -300; z <= 300; z += ds) {
      const curvature =
        (hf.height(x, z + ds) - 2 * hf.height(x, z) + hf.height(x, z - ds)) / (ds * ds);
      if (-curvature * v * v > T.bike.gravity) hits++;
      total++;
    }
  }
  return hits / total;
}

/** Fraction along an arc sweep, wrapped, clamped to [0, 1]. */
function wrap01(angle: number, start: number, end: number): number {
  const d = Math.atan2(Math.sin(angle - start), Math.cos(angle - start));
  const t = d / (end - start);
  return Math.max(0, Math.min(1, t));
}

let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  const tag = ok ? '  ok  ' : ' FAIL ';
  if (!ok) failures++;
  console.log(`[${tag}] ${label.padEnd(38)} ${detail}`);
}

function finite(s: BikeState): boolean {
  return (
    Number.isFinite(s.pos.x) &&
    Number.isFinite(s.pos.y) &&
    Number.isFinite(s.pos.z) &&
    Number.isFinite(s.vel.x) &&
    Number.isFinite(s.vel.y) &&
    Number.isFinite(s.vel.z) &&
    Number.isFinite(s.yaw) &&
    Number.isFinite(s.pitch) &&
    Number.isFinite(s.roll)
  );
}

interface RunResult {
  topSpeed: number;
  finalSpeed: number;
  airFraction: number;
  longestAir: number;
  maxPenetration: number;
  maxSpeedAny: number;
  finiteThroughout: boolean;
  pitchError: { mean: number; max: number };
  /** Fraction of steps spent fully bottomed out on the suspension stop. */
  bottomOutFraction: number;
  /** Airborne stints longer than a quarter second — real air, not chatter. */
  realHops: number;
}

function run(hf: Heightfield, seconds: number, drive: (t: number, input: InputState) => void): RunResult {
  const s = createBikeState();
  resetBike(s, hf);
  const input = idle();
  const nrm = new THREE.Vector3();

  let topSpeed = 0;
  let maxSpeedAny = 0;
  let airSteps = 0;
  let longestAir = 0;
  let maxPen = 0;
  let bottomOutSteps = 0;
  let realHops = 0;
  let finiteThroughout = true;
  let pitchErrSum = 0;
  let pitchErrMax = 0;
  let pitchSamples = 0;

  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    drive(i * STEP, input);
    stepBike(s, hf, input, STEP);

    if (!finite(s)) {
      finiteThroughout = false;
      break;
    }

    topSpeed = Math.max(topSpeed, groundSpeed(s));
    maxSpeedAny = Math.max(maxSpeedAny, s.vel.length());

    if (s.grounded) {
      // Measure compression the same way the physics does — from the average of
      // the two axle probes, not the chassis centre. Sampling at the centre
      // over-reads on a crest and under-reads in a dip.
      const halfWB = T.bike.wheelBase * 0.5;
      const fx = Math.sin(s.yaw) * halfWB;
      const fz = Math.cos(s.yaw) * halfWB;
      const gy =
        (hf.height(s.pos.x + fx, s.pos.z + fz) + hf.height(s.pos.x - fx, s.pos.z - fz)) * 0.5;
      maxPen = Math.max(maxPen, gy + T.susp.restHeight - s.pos.y);
      bottomOutSteps += s.susp >= T.susp.maxTravel - 1e-4 ? 1 : 0;

      // Pitch should track the slope along the direction of travel.
      if (groundSpeed(s) > 3) {
        hf.normal(s.pos.x, s.pos.z, nrm);
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        // Slope angle of the surface measured along the heading.
        const slope = Math.atan2(-(nrm.x * fx + nrm.z * fz), nrm.y);
        const err = Math.abs(THREE.MathUtils.radToDeg(s.pitch - slope));
        pitchErrSum += err;
        pitchErrMax = Math.max(pitchErrMax, err);
        pitchSamples++;
      }
    } else {
      airSteps++;
    }
    // Count the stint on the step it crosses a quarter second, so each hop is
    // tallied exactly once.
    if (s.airTime >= 0.25 && s.airTime - STEP < 0.25) realHops++;
    longestAir = Math.max(longestAir, s.airTime);
  }

  return {
    topSpeed,
    finalSpeed: groundSpeed(s),
    airFraction: airSteps / steps,
    longestAir,
    maxPenetration: maxPen,
    maxSpeedAny,
    finiteThroughout,
    pitchError: {
      mean: pitchSamples ? pitchErrSum / pitchSamples : 0,
      max: pitchErrMax,
    },
    bottomOutFraction: bottomOutSteps / steps,
    realHops,
  };
}

// ---------------------------------------------------------------------------

console.log('\nmoto — headless physics check\n' + '-'.repeat(62));

// Bike-physics checks run on bare terrain: they are about the model, not the
// park, and features in the way would quietly change what they measure.
const genStart = Date.now();
const hf = new Heightfield(T.world);
const genMs = Date.now() - genStart;
console.log(
  `world  ${hf.size} m,  ${hf.res}^2 samples,  cell ${hf.cell} m,  ` +
    `spawn y ${hf.spawn.y.toFixed(2)},  generated in ${genMs} ms\n`,
);

// --- 1. flat-out acceleration ---------------------------------------------
{
  const r = run(hf, 20, (_t, i) => {
    i.throttle = 1;
    i.brake = 0;
    i.steer = 0;
  });
  const kmh = r.topSpeed * 3.6;
  check('reaches a usable top speed', kmh > 60 && kmh < 160, `${kmh.toFixed(0)} km/h`);
  check('stays finite under full throttle', r.finiteThroughout, r.finiteThroughout ? 'no NaN' : 'diverged');
  check(
    'suspension has travel left in reserve',
    r.bottomOutFraction < 0.02,
    `bottomed out ${(r.bottomOutFraction * 100).toFixed(2)}% of steps, ` +
      `peak ${r.maxPenetration.toFixed(3)} m of ${T.susp.maxTravel} m`,
  );
  check(
    'pitch tracks the ground it rides on',
    r.pitchError.mean < 6,
    `mean ${r.pitchError.mean.toFixed(1)} deg, max ${r.pitchError.max.toFixed(1)} deg`,
  );
  check(
    'contact does not flicker',
    r.airFraction < 0.1,
    `airborne ${(r.airFraction * 100).toFixed(1)}% of the run`,
  );
  check(
    'terrain launches the bike at speed',
    r.realHops >= 1 && r.longestAir > 0.3,
    `${r.realHops} hop(s) over 0.25 s, longest ${r.longestAir.toFixed(2)} s`,
  );
  console.log('');
}

// --- 2. sustained cornering ------------------------------------------------
{
  const s = createBikeState();
  resetBike(s, hf);
  const input = idle();
  input.throttle = 1;

  // Get up to speed straight, then hold full lock.
  for (let i = 0; i < 480; i++) stepBike(s, hf, input, STEP);
  const entrySpeed = groundSpeed(s);
  const startYaw = s.yaw;
  input.steer = 1;

  let peakLean = 0;
  let rollSum = 0;
  let yawTravelled = 0;
  let yawSigned = 0;
  let prevYaw = s.yaw;
  for (let i = 0; i < 720; i++) {
    stepBike(s, hf, input, STEP);
    peakLean = Math.max(peakLean, Math.abs(s.roll));
    rollSum += s.roll;
    const d = Math.atan2(Math.sin(s.yaw - prevYaw), Math.cos(s.yaw - prevYaw));
    yawTravelled += Math.abs(d);
    yawSigned += d;
    prevYaw = s.yaw;
  }
  const meanRoll = rollSum / 720;

  check('full lock actually turns the bike', yawTravelled > 2, `${THREE.MathUtils.radToDeg(yawTravelled).toFixed(0)} deg over 6 s`);
  // Rotation about +Y is counter-clockwise from above, so a right turn is a
  // *negative* yaw change. The first version of this check asserted the opposite
  // and passed happily while the controls were mirrored — it was comparing roll
  // against yaw, both in the same flipped frame, so it validated consistency
  // rather than direction.
  check('steer right turns right', yawSigned < -1, `${THREE.MathUtils.radToDeg(yawSigned).toFixed(0)} deg net`);
  check(
    'leans into the corner, not out of it',
    meanRoll > 0.05,
    `mean lean ${THREE.MathUtils.radToDeg(meanRoll).toFixed(0)} deg, peak ${THREE.MathUtils.radToDeg(peakLean).toFixed(0)} deg`,
  );
  check(
    'holds speed through the corner',
    groundSpeed(s) > entrySpeed * 0.5,
    `${(entrySpeed * 3.6).toFixed(0)} -> ${(groundSpeed(s) * 3.6).toFixed(0)} km/h`,
  );
  check('cornering stays finite', finite(s), finite(s) ? 'no NaN' : 'diverged');
  void startYaw;
  console.log('');
}

// --- 3. hard landing recovery ---------------------------------------------
{
  const s = createBikeState();
  resetBike(s, hf);
  const input = idle();

  // Drop it from 25 m with forward speed — harder than anything the M2 ramps
  // will produce, so the suspension clamp has to hold.
  s.pos.y += 25;
  s.vel.set(0, 0, -18);
  s.yaw = Math.PI;

  let touchdownStep = -1;
  let peakImpact = 0;
  let peakBounce = 0;
  for (let i = 0; i < 1200; i++) {
    stepBike(s, hf, input, STEP);
    peakImpact = Math.max(peakImpact, s.lastImpact);
    s.lastImpact = 0;
    if (touchdownStep < 0 && s.grounded) touchdownStep = i;
    if (touchdownStep >= 0) peakBounce = Math.max(peakBounce, s.vel.y);
    if (!finite(s)) break;
  }

  const settled = hf.height(s.pos.x, s.pos.z) + T.susp.restHeight - s.pos.y;
  check('survives a 25 m drop', finite(s), finite(s) ? 'no NaN' : 'diverged');
  check('does not launch back off the ground', peakBounce < 6, `rebound ${peakBounce.toFixed(1)} m/s`);
  check(
    'settles back to ride height',
    Math.abs(settled) < 0.2,
    `resting compression ${settled.toFixed(3)} m`,
  );
  console.log(`        impact speed ${peakImpact.toFixed(1)} m/s\n`);
}

// --- 4. spacebar jump ------------------------------------------------------
{
  /** Settle on the spawn pad, pulse jump for one step, then observe. */
  function hop(holdJumpInAir: boolean) {
    const s = createBikeState();
    resetBike(s, hf);
    const input = idle();
    for (let i = 0; i < 120; i++) stepBike(s, hf, input, STEP);
    const restY = s.pos.y;

    // Exactly one step of jump — the same single frame the edge-triggered input
    // delivers for a key press.
    input.jump = true;
    stepBike(s, hf, input, STEP);
    input.jump = holdJumpInAir;

    let peak = 0;
    let airSteps = 0;
    let landedAfter = -1;
    for (let i = 0; i < 600; i++) {
      stepBike(s, hf, input, STEP);
      peak = Math.max(peak, s.pos.y - restY);
      if (!s.grounded) airSteps++;
      else if (airSteps > 10 && landedAfter < 0) landedAfter = i * STEP;
    }
    return { peak, landedAfter, airSteps };
  }

  const single = hop(false);
  check('spacebar gets the bike airborne', single.peak > 0.8, `peak ${single.peak.toFixed(2)} m`);
  check(
    'jump height stays in a sane band',
    single.peak < 3,
    `peak ${single.peak.toFixed(2)} m, ${(single.airSteps * STEP).toFixed(2)} s of air`,
  );
  check(
    'and comes back down',
    single.landedAfter > 0,
    single.landedAfter > 0 ? `landed after ${single.landedAfter.toFixed(2)} s` : 'never landed',
  );

  // The invariant that matters: one jump per ground contact. Holding the key
  // through the air must not stack a second impulse on the first.
  const held = hop(true);
  check(
    'cannot double jump in mid-air',
    Math.abs(held.peak - single.peak) < 0.05,
    `held ${held.peak.toFixed(2)} m vs pulsed ${single.peak.toFixed(2)} m`,
  );
  console.log('');
}

// --- 5. boost --------------------------------------------------------------
{
  /** Run to terminal speed, then optionally tap boost and keep driving. */
  function drive(seconds: number, opts: { boostAt?: number; airborneTap?: boolean } = {}) {
    const s = createBikeState();
    resetBike(s, hf);
    const input = idle();
    input.throttle = 1;
    for (let i = 0; i < 900; i++) stepBike(s, hf, input, STEP);
    const baseSpeed = groundSpeed(s);

    if (opts.airborneTap) {
      // Put it in the air first, then tap: the press must be ignored outright,
      // not swallowed.
      s.vel.y = 14;
      for (let i = 0; i < 12; i++) stepBike(s, hf, input, STEP);
    }

    let peak = baseSpeed;
    let tapped = false;
    let startedBoost = false;
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) {
      const t = i * STEP;
      input.boost = opts.boostAt !== undefined && !tapped && t >= opts.boostAt;
      if (input.boost) tapped = true;
      stepBike(s, hf, input, STEP);
      if (s.boostRemaining > 0) startedBoost = true;
      peak = Math.max(peak, groundSpeed(s));
    }
    return { baseSpeed, peak, startedBoost, endSpeed: groundSpeed(s), state: s };
  }

  const base = drive(4);
  const boosted = drive(4, { boostAt: 0.2 });
  const gain = boosted.peak / base.peak;

  check(
    'boost meaningfully raises top speed',
    gain > 1.2,
    `${(base.peak * 3.6).toFixed(0)} -> ${(boosted.peak * 3.6).toFixed(0)} km/h (${gain.toFixed(2)}x)`,
  );
  check(
    'and it wears off',
    boosted.endSpeed < boosted.peak * 0.95,
    `${(boosted.peak * 3.6).toFixed(0)} peak -> ${(boosted.endSpeed * 3.6).toFixed(0)} km/h after ${T.boost.duration + T.boost.cooldown}s`,
  );

  const inAir = drive(1.5, { boostAt: 0.05, airborneTap: true });
  check('airborne tap is ignored, not consumed', !inAir.startedBoost, 'no burst started in the air');

  // Cooldown: a second tap immediately after the first burst ends must do nothing.
  {
    const s = createBikeState();
    resetBike(s, hf);
    const input = idle();
    input.throttle = 1;
    for (let i = 0; i < 600; i++) stepBike(s, hf, input, STEP);

    let bursts = 0;
    let wasBoosting = false;
    // Mash the key every other step for the whole window.
    for (let i = 0; i < Math.round((T.boost.duration + T.boost.cooldown + 1) / STEP); i++) {
      input.boost = i % 2 === 0;
      stepBike(s, hf, input, STEP);
      const now = s.boostRemaining > 0;
      if (now && !wasBoosting) bursts++;
      wasBoosting = now;
    }
    check(
      'mashing cannot stack bursts',
      bursts <= 2,
      `${bursts} burst(s) over ${(T.boost.duration + T.boost.cooldown + 1).toFixed(1)}s of mashing`,
    );
  }

  // The reason boost belongs in before ramps do.
  const baseLaunch = launchableFraction(hf, base.peak);
  const boostLaunch = launchableFraction(hf, boosted.peak);
  check(
    'boost turns terrain into ramps',
    boostLaunch > baseLaunch * 1.4,
    `${(baseLaunch * 100).toFixed(1)}% -> ${(boostLaunch * 100).toFixed(1)}% of the map can launch you`,
  );
  console.log('');
}

// --- 6. landings -----------------------------------------------------------
{
  /**
   * Hop, force a pitch error mid-flight, and see how the landing is rated.
   * Returns the report plus enough state to prove the run was never reset.
   */
  function landWithPitchError(errorDeg: number) {
    const s = createBikeState();
    resetBike(s, hf);
    const input = idle();
    input.throttle = 1;
    for (let i = 0; i < 420; i++) stepBike(s, hf, input, STEP);

    // Launch, then set the attitude directly — this is about the landing rating,
    // not about whether the air controls can reach a given angle.
    s.vel.y = 13;
    for (let i = 0; i < 30; i++) stepBike(s, hf, input, STEP);
    const speedBefore = groundSpeed(s);
    const groundPitchAtLaunch = 0;
    s.pitch = THREE.MathUtils.degToRad(errorDeg) + groundPitchAtLaunch;

    let report = null as null | { band: string; pitchErrDeg: number; keptSpeed: number };
    for (let i = 0; i < 400; i++) {
      stepBike(s, hf, input, STEP);
      if (s.landing.pending) {
        s.landing.pending = false;
        report = {
          band: s.landing.band,
          pitchErrDeg: s.landing.pitchErrDeg,
          keptSpeed: s.landing.keptSpeed,
        };
        break;
      }
    }
    return { report, speedBefore, state: s };
  }

  const shallow = landWithPitchError(10);
  const middling = landWithPitchError(40);
  const inverted = landWithPitchError(170);

  check(
    'a square landing rates clean',
    shallow.report?.band === 'clean',
    `${shallow.report?.pitchErrDeg.toFixed(0)}deg -> ${shallow.report?.band}`,
  );
  check(
    'an off-angle landing rates sketchy',
    middling.report?.band === 'sketchy',
    `${middling.report?.pitchErrDeg.toFixed(0)}deg -> ${middling.report?.band}`,
  );
  check(
    'landing inverted rates bad',
    inverted.report?.band === 'bad',
    `${inverted.report?.pitchErrDeg.toFixed(0)}deg -> ${inverted.report?.band}`,
  );
  check(
    'clean keeps its speed, bad does not',
    shallow.report!.keptSpeed === 1 && inverted.report!.keptSpeed < 0.6,
    `clean x${shallow.report!.keptSpeed}, bad x${inverted.report!.keptSpeed}`,
  );

  // The whole point of this design: nothing ever resets the run.
  {
    const s = inverted.state;
    const before = s.pos.clone();
    const input = idle();
    input.throttle = 1;
    for (let i = 0; i < 360; i++) stepBike(s, hf, input, STEP);
    const moved = s.pos.distanceTo(before);
    const uprightDeg = Math.abs(THREE.MathUtils.radToDeg(s.pitch));
    check(
      'a bad landing never resets the run',
      moved > 5 && s.pos.distanceTo(hf.spawn) > 20,
      `carried on ${moved.toFixed(0)} m from where it landed`,
    );
    check(
      'and the bike snaps back upright',
      uprightDeg < 20 && finite(s),
      `pitch settled to ${uprightDeg.toFixed(0)}deg`,
    );
  }

  // Rolling terrain must not spam the readout with micro-hops.
  {
    const s = createBikeState();
    resetBike(s, hf);
    const input = idle();
    input.throttle = 1;
    let rated = 0;
    for (let i = 0; i < 1800; i++) {
      stepBike(s, hf, input, STEP);
      if (s.landing.pending) {
        s.landing.pending = false;
        rated++;
      }
    }
    check(
      'micro-hops go unrated',
      rated <= 4,
      `${rated} landing(s) rated over 15 s of driving`,
    );
  }
  console.log('');
}

// --- 7. long random session -----------------------------------------------
{
  // Deterministic pseudo-random rider, changing input four times a second.
  let seed = 20260812;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Holds throttle most of the time and changes its mind less often than a
  // seizure, so it actually reaches speed — a rider that brakes four times a
  // second never leaves the ground and tests nothing but the standstill case.
  let next = 0;
  const r = run(hf, 180, (t, i) => {
    if (t >= next) {
      next = t + 0.6;
      i.throttle = rand() < 0.88 ? 1 : 0;
      i.brake = rand() < 0.08 ? 1 : 0;
      i.steer = rand() < 0.5 ? Math.round(rand() * 2 - 1) : 0;
      i.pitch = rand() < 0.3 ? Math.round(rand() * 2 - 1) : 0;
      i.roll = rand() < 0.15 ? Math.round(rand() * 2 - 1) : 0;
    }
  });

  check('3 minutes of chaos stays finite', r.finiteThroughout, r.finiteThroughout ? 'no NaN' : 'diverged');
  check('velocity never explodes', r.maxSpeedAny < 80, `peak |v| ${r.maxSpeedAny.toFixed(1)} m/s`);
  check(
    'never bottoms out for long',
    r.bottomOutFraction < 0.02,
    `${(r.bottomOutFraction * 100).toFixed(2)}% of steps on the stop`,
  );
  console.log(
    `        ${r.realHops} hop(s) over 0.25 s, longest ${r.longestAir.toFixed(2)} s, ` +
      `airborne ${(r.airFraction * 100).toFixed(1)}% of the time\n`,
  );
}

// --- 8. park validator -----------------------------------------------------
{
  const parkField = new Heightfield(T.world);
  applyPark(parkField, PARK);

  /** Start on the feature's approach at a given speed and ride straight over it. */
  function ride(f: Jump, speed: number, boost: boolean) {
    const s = createBikeState();
    resetBike(s, parkField);

    const axisX = Math.sin(f.yaw);
    const axisZ = Math.cos(f.yaw);
    const fwdX = axisX;
    const fwdZ = axisZ;
    const u = -(f.approach - 3);
    s.pos.x = f.x + fwdX * u;
    s.pos.z = f.z + fwdZ * u;
    s.pos.y = parkField.height(s.pos.x, s.pos.z) + T.susp.restHeight;
    s.yaw = f.yaw;
    s.vel.set(fwdX * speed, 0, fwdZ * speed);
    s.landing.pending = false;
    if (boost) s.boostRemaining = T.boost.duration;

    const input = idle();
    input.throttle = 1;

    let peakAir = 0;
    let peakHeight = 0;
    let peakSusp = 0;
    let band = 'none';
    let pitchErr = 0;
    let launched = false;

    // Measure only the flight that leaves *this* feature's own face, and stop when
    // it lands. Reporting peak values over a longer run credited each feature with
    // whatever came next: a tabletop that had been flattened to a 0.21 s speed bump
    // was reported at 1.40 s, borrowed from the jump after it. The `u > 0` guard
    // rejects hops taken on the run-in, which for closely spaced features is the
    // previous feature's landing.
    for (let i = 0; i < 900; i++) {
      const wasGrounded = s.grounded;
      stepBike(s, parkField, input, STEP);
      if (!finite(s)) break;
      peakSusp = Math.max(peakSusp, s.susp);

      const u = (s.pos.x - f.x) * axisX + (s.pos.z - f.z) * axisZ;
      if (wasGrounded && !s.grounded && !launched && u > 0) launched = true;

      if (launched) {
        if (!s.grounded) {
          peakAir = Math.max(peakAir, s.airTime);
          peakHeight = Math.max(peakHeight, s.airPeak);
        } else if (!wasGrounded) {
          if (s.landing.pending) {
            band = s.landing.band;
            pitchErr = s.landing.pitchErrDeg;
          }
          break;
        }
      }
    }
    return { peakAir, peakHeight, peakSusp, band, pitchErr, finite: finite(s) };
  }

  // Number every feature by its PARK index so the harness, the in-world flags and
  // conversation all refer to the same thing.
  const numbered = PARK.map((f, i) => ({ f, n: i + 1 }));
  const jumps = numbered.filter(
    (e): e is { f: Jump; n: number } =>
      e.f.kind === 'kicker' || e.f.kind === 'tabletop' || e.f.kind === 'gap',
  );

  console.log(
    '        park: ' +
      numbered.map((e) => `#${e.n} ${e.f.name}`).join(', ').replace(/(.{88}) /g, '$1\n              ') +
      '\n',
  );

  for (const { f, n } of jumps) {
    const H = featureLipHeight(f);
    const curv = lipCurvature(f);
    const base = ride(f, 25, false);
    const boosted = ride(f, 25, true);

    check(
      `#${n} ${f.name}: launches`,
      base.peakAir > 0.45 && base.finite,
      `lip ${H.toFixed(1)} m, ${base.peakAir.toFixed(2)} s air, ${base.peakHeight.toFixed(1)} m up, ` +
        `pop ${(curv * 625).toFixed(0)} m/s2, susp ${base.peakSusp.toFixed(2)}/${T.susp.maxTravel} m`,
    );
    check(
      `#${n} ${f.name}: lands`,
      base.band !== 'none' && boosted.band !== 'none',
      `base ${base.band} (${base.pitchErr.toFixed(0)}deg), boosted ${boosted.band} (${boosted.pitchErr.toFixed(0)}deg)`,
    );
    // The ballistic range formula needs a launch angle, which a `crest` face does
    // not have — it throws you off convex curvature, not off an angled lip. Printing
    // "0-0 m" there would look like a bug rather than an inapplicable measure.
    const crest = f.kind !== 'tabletop' && f.face === 'crest';
    console.log(
      `        boosted: ${boosted.peakAir.toFixed(2)} s air, ${boosted.peakHeight.toFixed(1)} m up` +
        (crest
          ? ', crest launch (no lip angle)'
          : `, nominal range ${launchRange(f.angleDeg, 25, T.bike.gravity).toFixed(0)}-` +
            `${launchRange(f.angleDeg, 34, T.bike.gravity).toFixed(0)} m`),
    );
  }

  // Every feature must be survivable with no input at all. Framed as "nothing
  // rates bad" rather than "these specific angles land clean", because the latter
  // filtered on angleDeg <= 24 and silently stopped testing anything the moment
  // the ramps were made poppier — a check that passes by matching nothing is
  // worse than no check.
  // The check that would have caught a flattened tabletop. A jump that no longer
  // jumps is the failure mode that hid longest, precisely because nothing asserted
  // the one thing every jump exists to do.
  const airborne = jumps.map((e) => ({ n: e.n, air: ride(e.f, 25, false).peakAir }));
  check(
    'every jump actually launches the bike',
    airborne.every((a) => a.air > 0.5),
    airborne.map((a) => `#${a.n}=${a.air.toFixed(2)}s`).join(' '),
  );

  const doNothing = jumps
    .filter((e) => !e.f.demandsBoost)
    .map((e) => ({ n: e.n, band: ride(e.f, 25, false).band }));
  check(
    'no feature is unlandable with no input',
    doNothing.every((d) => d.band !== 'bad'),
    doNothing.map((d) => `#${d.n}=${d.band}`).join(' ') + '  (boost-only features excluded)',
  );

  // --- the pits and plateaus are actually there ----------------------------
  // A `gap` is defined by two heights that are easy to author and easy to lose:
  // the pit floor you have to clear, and the plateau you land on. Both can be
  // silently erased, because an approach corridor declines to *cut* into another
  // feature's dirt but will happily *fill* it — so a pit that ends up inside the
  // next feature's run-in is levelled flat, and the feature becomes a speed bump
  // with a name. This measures the ground rather than trusting the parameters.
  {
    const gaps = numbered.filter((e): e is { f: Gap; n: number } => e.f.kind === 'gap');
    const report: string[] = [];
    const backReport: string[] = [];
    let ok = true;
    let backOk = true;
    const nrm = new THREE.Vector3();
    for (const { f, n } of gaps) {
      const fx = Math.sin(f.yaw);
      const fz = Math.cos(f.yaw);
      const base = f.baseY!;
      const at = (u: number) => parkField.height(f.x + fx * u, f.z + fz * u) - base;

      // The back side has to carry the lip *plus* the pit, which is the sizing
      // trap in this shape: `back` looks right against a lip of two metres and is
      // a cliff once three more are dug out under it. Smoothstep peaks at 1.5x its
      // average slope, so a 4.6 m drop over 5 m draws as 65 degrees — past both
      // the mesh's 45 degree limit and `climbSlopeDeg`, which is the exact recipe
      // for the wall-trampoline in §10.16.
      let backSlope = 0;
      for (let u = f.length; u <= f.length + f.back; u += 0.5) {
        parkField.normal(f.x + fx * u, f.z + fz * u, nrm);
        backSlope = Math.max(backSlope, (Math.acos(Math.min(1, Math.abs(nrm.y))) * 180) / Math.PI);
      }
      if (backSlope >= 45) backOk = false;
      backReport.push(`#${n} ${backSlope.toFixed(0)}`);

      // Middle of the void, and a third of the way along the level plateau.
      const pitU = f.length + f.back + f.pit * 0.5;
      const landU = f.length + f.back + f.pit + f.rise + f.landing * 0.3;
      const pit = at(pitU);
      const land = at(landU);
      const pitOk = Math.abs(pit - f.pitY) < 0.6;
      const landOk = Math.abs(land - f.landY) < 0.6;
      if (!pitOk || !landOk) ok = false;
      report.push(
        `#${n} pit ${pit.toFixed(1)}/${f.pitY}${pitOk ? '' : ' !'} ` +
          `land ${land.toFixed(1)}/${f.landY}${landOk ? '' : ' !'}`,
      );
    }
    check('every pit and plateau survived stamping', ok, report.join('  '));
    check(
      'and no pit is dug into a cliff',
      backOk,
      `steepest back side per feature: ${backReport.join(' ')} deg (mesh limit 45)`,
    );
  }
  console.log('');
}

// --- 8b. the banked turns --------------------------------------------------
// A berm is the one feature that is not judged by how far it throws you. What it
// has to do is let a corner be taken without giving the speed back, and it has to
// stay inside the two slope limits everything else here obeys: past ~45 degrees
// the mesh draws something other than what the bike hits, and past
// `susp.climbSlopeDeg` the suspension stops pushing the bike up it at all.
{
  const parkField = new Heightfield(T.world);
  applyPark(parkField, PARK);
  const berms = PARK.filter((f): f is Berm => f.kind === 'berm');

  const nrm = new THREE.Vector3();
  for (const b of berms) {
    // --- the bank is drawable ------------------------------------------------
    let maxSlope = 0;
    for (let t = 0.05; t <= 0.95; t += 0.05) {
      const p = arcPoint(b, t);
      const a = Math.atan2(p.z - b.cz, p.x - b.cx);
      for (let u = -b.innerRun; u <= b.rideHalfWidth + b.bankRun + 6; u += 1) {
        parkField.normal(p.x + Math.cos(a) * u, p.z + Math.sin(a) * u, nrm);
        maxSlope = Math.max(maxSlope, (Math.acos(Math.min(1, Math.abs(nrm.y))) * 180) / Math.PI);
      }
    }
    check(
      `${b.name}: its bank stays drawable`,
      maxSlope < 45,
      `steepest ${maxSlope.toFixed(0)} deg across the section (mesh limit 45, ` +
        `climbSlopeDeg ${T.susp.climbSlopeDeg})`,
    );

    // --- and it can be taken without losing the run --------------------------
    // Driven the way a rider takes a corner: aim a little further round, throttle
    // when below the entry speed. What is measured is how much of the sweep gets
    // finished and what is left at the exit.
    const entry = 24;
    const s = createBikeState();
    resetBike(s, parkField);
    const p0 = arcPoint(b, 0);
    // Start on the straight before the turn so the entry is a real one.
    s.pos.set(p0.x - Math.sin(p0.yaw) * 20, 0, p0.z - Math.cos(p0.yaw) * 20);
    s.pos.y = parkField.height(s.pos.x, s.pos.z) + T.susp.restHeight;
    s.yaw = p0.yaw;
    s.vel.set(Math.sin(p0.yaw) * entry, 0, Math.cos(p0.yaw) * entry);
    const input = idle();

    let reached = 0;
    let fellOff = false;
    for (let i = 0; i < 120 * 20; i++) {
      const ahead = arcPoint(b, Math.min(1, reached + 0.12));
      const want = Math.atan2(ahead.x - s.pos.x, ahead.z - s.pos.z);
      const err = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw));
      input.steer = Math.max(-1, Math.min(1, -err * 2.5));
      input.throttle = groundSpeed(s) < entry ? 1 : 0;
      stepBike(s, parkField, input, STEP);
      if (!finite(s)) break;

      const r = Math.hypot(s.pos.x - b.cx, s.pos.z - b.cz);
      const t = wrap01(
        Math.atan2(s.pos.z - b.cz, s.pos.x - b.cx),
        b.startAngle,
        b.endAngle,
      );
      // Off the top of the bank or down onto the flat inside both count as lost.
      if (t > 0.05 && Math.abs(r - b.radius) > b.rideHalfWidth + b.bankRun) fellOff = true;
      if (t > reached) reached = t;
      if (reached > 0.97) break;
    }
    const exit = groundSpeed(s);
    check(
      `${b.name}: holds speed round the corner`,
      reached > 0.9 && !fellOff && exit > entry * 0.7,
      `${(reached * 100).toFixed(0)}% of the sweep, ${(entry * 3.6).toFixed(0)} -> ` +
        `${(exit * 3.6).toFixed(0)} km/h${fellOff ? ', LEFT THE BANK' : ''}`,
    );
  }
  console.log('');
}

// --- 8c. the tracks, ridden end to end -------------------------------------
// Every check so far measures one feature, started on its own approach at a
// speed handed to it. That is the right way to ask "does this ramp work" and it
// cannot answer the question the park exists for: ride the *whole* line and does
// one landing put you on the run-up to the next, close enough that the combo is
// still alive when you leave the ground again?
//
// The multiplier resets after `comboWindow` seconds on the ground, so the answer
// is a distance divided by a speed, and it is not guessable from the feature
// list. This rides each stretch with a waypoint autopilot — steer at the next
// point, throttle, boost whenever it is off cooldown — and reports what a run is
// actually worth.
{
  const parkField = new Heightfield(T.world);
  applyPark(parkField, PARK);
  const byName = new Map(PARK.map((f) => [f.name, f]));

  // Coverage first: a feature missing from every line is a feature nothing rides.
  {
    const listed = new Set<string>([...TRACKS.flatMap((t) => t.line), ...SIDE_FEATURES]);
    const missing = PARK.filter((f) => !listed.has(f.name)).map((f) => f.name);
    const unknown = [...listed].filter((n) => !byName.has(n));
    check(
      'every feature is on a named track',
      missing.length === 0 && unknown.length === 0,
      missing.length || unknown.length
        ? `unlisted: ${missing.join(', ') || 'none'}; unknown: ${unknown.join(', ') || 'none'}`
        : `${PARK.length} features across ${TRACKS.length} tracks ` +
          `(${TRACKS.map((t) => `${t.name} ${t.line.length}`).join(', ')})`,
    );
  }

  /** The line through a feature, as points to steer at. */
  function waypoints(f: Feature): { x: number; z: number }[] {
    if (f.kind === 'berm' || f.kind === 'causeway') {
      return [0.15, 0.4, 0.65, 0.9, 1].map((t) => arcPoint(f, t));
    }
    const fx = Math.sin(f.yaw);
    const fz = Math.cos(f.yaw);
    // The origin, then a point past the face — enough to hold a straight line and
    // few enough that the autopilot never steers backwards to hit one.
    const span = featureLength(f);
    return [
      { x: f.x, z: f.z },
      { x: f.x + fx * span * 0.7, z: f.z + fz * span * 0.7 },
    ];
  }

  // --- and the three of them are one lap ----------------------------------
  // Each track ending where the next begins is what turns three tracks into a
  // circuit, and it is a claim about two things being in the same place — which
  // is exactly the kind of claim that rots silently when either end is retuned.
  {
    /** A feature's line, densified so a distance to it means something. */
    function dense(f: Feature): { x: number; z: number }[] {
      const pts = waypoints(f);
      const out: { x: number; z: number }[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
        for (let k = 0; k < steps; k++) {
          out.push({ x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps });
        }
      }
      out.push(pts[pts.length - 1]);
      return out;
    }

    /** Where a line stops: the far end of its last feature. */
    function lineEnd(track: readonly string[]): { x: number; z: number } {
      const f = byName.get(track[track.length - 1])!;
      if (f.kind === 'berm' || f.kind === 'causeway') return arcPoint(f, 1);
      return {
        x: f.x + Math.sin(f.yaw) * featureLength(f),
        z: f.z + Math.cos(f.yaw) * featureLength(f),
      };
    }

    const report: string[] = [];
    let joined = true;
    for (const h of HANDOVERS) {
      const from = TRACKS.find((t) => t.name === h.from)!;
      const end = lineEnd(from.line);
      let gap: number;
      if (h.to === null) {
        gap = Math.hypot(end.x - parkField.spawn.x, end.z - parkField.spawn.z);
      } else {
        const to = TRACKS.find((t) => t.name === h.to)!;
        gap = Infinity;
        for (const name of to.line) {
          const f = byName.get(name)!;
          if (f.kind === 'motte') {
            // A mound is ridden from anywhere on its flank, so reaching its outer
            // radius *is* reaching it. Measuring to the centre instead would call
            // a run that ends on the skirt a 99 m miss.
            gap = Math.min(gap, Math.max(0, Math.hypot(end.x - f.x, end.z - f.z) - f.outerRadius));
            continue;
          }
          for (const p of dense(f)) {
            gap = Math.min(gap, Math.hypot(end.x - p.x, end.z - p.z));
          }
        }
      }
      if (gap > h.within) joined = false;
      report.push(`${h.from} -> ${h.to ?? 'the spawn pad'} ${gap.toFixed(0)}m/${h.within}`);
    }
    check('the three tracks close into one lap', joined, report.join(', '));
  }

  for (const run of RIDEABLE) {
    const feats = run.line.map((n) => byName.get(n)!);
    const pts = feats.flatMap(waypoints);
    const first = feats[0];
    const fx = Math.sin(first.yaw);
    const fz = Math.cos(first.yaw);

    const s = createBikeState();
    resetBike(s, parkField);
    const lead = first.approach + 6;
    s.pos.set(first.x - fx * lead, 0, first.z - fz * lead);
    s.pos.y = parkField.height(s.pos.x, s.pos.z) + T.susp.restHeight;
    s.yaw = first.yaw;
    s.vel.set(fx * 22, 0, fz * 22);

    const tricks = new Tricks();
    const score = new Scoring();
    const input = idle();

    let wp = 0;
    let landings = 0;
    let bestCombo = 0;
    let longestGround = 0;
    let ground = 0;
    let airborneTotal = 0;
    // The last feature's flight finishes *past* the last waypoint, so the run has
    // to carry on for a few seconds after the line runs out — otherwise the run
    // ends in mid-air and the final landing is never scored.
    let tail = 4;

    for (let i = 0; i < 120 * 120; i++) {
      while (
        wp < pts.length &&
        Math.hypot(pts[wp].x - s.pos.x, pts[wp].z - s.pos.z) < 20
      ) {
        wp++;
      }
      if (wp < pts.length) {
        const want = Math.atan2(pts[wp].x - s.pos.x, pts[wp].z - s.pos.z);
        const err = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw));
        input.steer = Math.max(-1, Math.min(1, -err * 2.2));
      } else {
        input.steer = 0;
        tail -= STEP;
        if (tail <= 0) break;
      }
      input.throttle = 1;
      input.boost = s.grounded && s.boostRemaining <= 0 && s.boostCooldown <= 0;

      stepBike(s, parkField, input, STEP);
      if (!finite(s)) break;
      tricks.step(s, STEP);
      score.step(s, tricks);
      if (score.event) {
        landings++;
        bestCombo = Math.max(bestCombo, score.event.multiplier);
        score.event = null;
      }

      if (s.grounded) {
        ground += STEP;
        // Only after the first landing: the harness drops the bike onto the
        // approach some way back from the first lip, and that run-in is the
        // harness's, not the track's.
        if (landings > 0) longestGround = Math.max(longestGround, ground);
      } else {
        ground = 0;
        airborneTotal += STEP;
      }
    }

    const done = wp / pts.length;
    // The combo is the whole point: a track that scores every jump at x1 is a
    // list of ramps, not a run. Three consecutive clean landings is the floor —
    // below that the gaps are too long for the window and the line needs
    // tightening, not the scoring loosening.
    check(
      `${run.name}: rides as one run`,
      done > 0.9 && landings >= 3 && bestCombo >= 3,
      `${(done * 100).toFixed(0)}% of the line, ${landings} scored landing(s), ` +
        `best combo x${bestCombo}, ${score.total.toLocaleString('en-US')} points, ` +
        `${airborneTotal.toFixed(1)} s airborne, longest spell on the ground ` +
        `${longestGround.toFixed(1)} s (window ${T.score.comboWindow} s)`,
    );
  }
  console.log('');
}

// --- 9. the set piece ------------------------------------------------------
{
  const parkField = new Heightfield(T.world);
  applyPark(parkField, PARK);

  const gauntlet = PARK.find((f) => f.name === 'the gauntlet') as Kicker;
  const loop = SETPIECE.loop;
  const axisX = Math.sin(loop.yaw);
  const axisZ = Math.cos(loop.yaw);

  /** Ride #7 and report water contact plus the closest pass to the ring centre. */
  function runGauntlet(boost: boolean) {
    const s = createBikeState();
    resetBike(s, parkField);
    const u = -(gauntlet.approach - 4);
    s.pos.set(gauntlet.x + axisX * u, 0, gauntlet.z + axisZ * u);
    s.pos.y = parkField.height(s.pos.x, s.pos.z) + T.susp.restHeight;
    s.yaw = gauntlet.yaw;
    s.vel.set(axisX * 25, 0, axisZ * 25);
    if (boost) s.boostRemaining = T.boost.duration;

    const input = idle();
    input.throttle = 1;

    let wetSteps = 0;
    let air = 0;
    let ringMiss = Infinity;
    let prevSide = 0;
    let prevX = s.pos.x;
    let prevY = s.pos.y;
    let prevZ = s.pos.z;

    for (let i = 0; i < 1200; i++) {
      stepBike(s, parkField, input, STEP);
      if (!finite(s)) break;
      if (s.inWater) wetSteps++;
      air = Math.max(air, s.airTime);

      // Signed distance along the ring's axis; a sign change means the flight
      // crossed the ring's plane, and that is the moment to measure the miss.
      const side =
        (s.pos.x - loop.x) * axisX + (s.pos.z - loop.z) * axisZ;
      if (prevSide !== 0 && Math.sign(side) !== Math.sign(prevSide)) {
        // Interpolate to the crossing and measure in the ring's own plane.
        const t = prevSide / (prevSide - side);
        const cx = prevX + (s.pos.x - prevX) * t - loop.x;
        const cy = prevY + (s.pos.y - prevY) * t - loop.y;
        const cz = prevZ + (s.pos.z - prevZ) * t - loop.z;
        const alongAxis = cx * axisX + cz * axisZ;
        const inPlaneX = cx - axisX * alongAxis;
        const inPlaneZ = cz - axisZ * alongAxis;
        ringMiss = Math.min(ringMiss, Math.hypot(Math.hypot(inPlaneX, inPlaneZ), cy));
      }
      prevSide = side;
      prevX = s.pos.x;
      prevY = s.pos.y;
      prevZ = s.pos.z;
    }
    return { wetSteps, air, ringMiss, finite: finite(s) };
  }

  const base = runGauntlet(false);
  const boosted = runGauntlet(true);

  check(
    '#7 boosted clears the water',
    boosted.wetSteps === 0 && boosted.finite,
    `${boosted.air.toFixed(2)} s air, dry the whole way`,
  );
  check(
    '#7 unboosted gets wet — boost or swim',
    base.wetSteps > 0,
    `${base.air.toFixed(2)} s air, ${(base.wetSteps * STEP).toFixed(2)} s submerged`,
  );
  check(
    'the loop is actually on the flight path',
    boosted.ringMiss < loop.radius - 1.5,
    `passes ${boosted.ringMiss.toFixed(1)} m from centre of a ${loop.radius} m ring`,
  );
  check(
    'water robs speed instead of ending the run',
    base.finite,
    'still finite and rideable after a swim',
  );
  console.log('');
}

// --- 10. the motte ---------------------------------------------------------
{
  const parkField = new Heightfield(T.world);
  applyPark(parkField, PARK);

  const motte = PARK.find((f) => f.name === 'the motte')!;
  const drop = PARK.find((f) => f.name === 'the drop') as Kicker;
  if (motte.kind !== 'motte') throw new Error('the motte changed kind');

  const flankDeg =
    (Math.atan2(motte.height, motte.outerRadius - motte.innerRadius) * 180) / Math.PI;
  check(
    'the motte can be ridden up',
    (() => {
      const s = createBikeState();
      resetBike(s, parkField);
      const r0 = motte.outerRadius + 6;
      s.pos.set(motte.x + r0, 0, motte.z);
      s.pos.y = parkField.height(s.pos.x, s.pos.z) + T.susp.restHeight;
      s.yaw = -Math.PI / 2; // heading -X, straight at the centre
      s.vel.set(-22, 0, 0);
      const input = idle();
      input.throttle = 1;
      for (let i = 0; i < 120 * 40; i++) {
        stepBike(s, parkField, input, STEP);
        if (!finite(s)) return false;
        if (Math.hypot(s.pos.x - motte.x, s.pos.z - motte.z) <= motte.innerRadius) return true;
      }
      return false;
    })(),
    `${flankDeg.toFixed(0)} deg flank, ${motte.height} m to the summit`,
  );

  // The payoff: boosted, the launch has to clear the whole mound and land on the
  // desert. Landing back on the flank is what an under-powered version does.
  const launched = (() => {
    const s = createBikeState();
    resetBike(s, parkField);
    const fx = Math.sin(drop.yaw);
    const fz = Math.cos(drop.yaw);
    const u = -(drop.approach - 3);
    s.pos.set(drop.x + fx * u, 0, drop.z + fz * u);
    s.pos.y = parkField.height(s.pos.x, s.pos.z) + T.susp.restHeight;
    s.yaw = drop.yaw;
    s.vel.set(fx * 16, 0, fz * 16);
    s.boostRemaining = T.boost.duration;
    const input = idle();
    input.throttle = 1;

    let air = 0;
    let peak = 0;
    let seen = false;
    for (let i = 0; i < 2400; i++) {
      const wasGrounded = s.grounded;
      stepBike(s, parkField, input, STEP);
      if (!finite(s)) break;
      const uu = (s.pos.x - drop.x) * fx + (s.pos.z - drop.z) * fz;
      if (wasGrounded && !s.grounded && !seen && uu > 0) seen = true;
      if (seen && !s.grounded) {
        air = s.airTime;
        peak = Math.max(peak, s.airPeak);
      }
      if (seen && !wasGrounded && s.grounded) {
        return { air, peak, r: Math.hypot(s.pos.x - motte.x, s.pos.z - motte.z) };
      }
    }
    return { air, peak, r: 0 };
  })();

  // Peak to peak. The far summit is the target; the saddle between is what you get
  // for coming up short.
  const farPeak = PARK.find((f) => f.name === 'the far peak')!;
  if (farPeak.kind !== 'motte') throw new Error('the far peak changed kind');
  const crossing = (boost: boolean) => {
    const s = createBikeState();
    resetBike(s, parkField);
    const fx = Math.sin(drop.yaw);
    const fz = Math.cos(drop.yaw);
    const u = -(drop.approach - 3);
    s.pos.set(drop.x + fx * u, 0, drop.z + fz * u);
    s.pos.y = parkField.height(s.pos.x, s.pos.z) + T.susp.restHeight;
    s.yaw = drop.yaw;
    s.vel.set(fx * 16, 0, fz * 16);
    if (boost) s.boostRemaining = T.boost.duration;
    const input = idle();
    input.throttle = 1;
    let seen = false;
    for (let i = 0; i < 2400; i++) {
      const wasGrounded = s.grounded;
      stepBike(s, parkField, input, STEP);
      if (!finite(s)) break;
      const uu = (s.pos.x - drop.x) * fx + (s.pos.z - drop.z) * fz;
      if (wasGrounded && !s.grounded && !seen && uu > 0) seen = true;
      if (seen && !wasGrounded && s.grounded) {
        return { r: Math.hypot(s.pos.x - farPeak.x, s.pos.z - farPeak.z), y: s.pos.y };
      }
    }
    return { r: Infinity, y: 0 };
  };
  const far = crossing(true);
  const short = crossing(false);
  const summitY = farPeak.baseY! + farPeak.height;
  check(
    'boosted, the gap jump makes the far summit',
    far.r <= farPeak.innerRadius + 2 && far.y > summitY - 1.5,
    `landed ${far.r.toFixed(0)} m from its centre (summit is ${farPeak.innerRadius} m), y=${far.y.toFixed(1)} vs summit ${summitY}`,
  );
  check(
    'unboosted, the gap jump comes up short',
    short.y < summitY - 1.5,
    `landed short on the flank at y=${short.y.toFixed(1)}`,
  );

  // The rim, not the outer radius. A terraced flank is 100 m wide and the launch
  // is not meant to clear all of it any more — the far peak is the target, which
  // the check above measures. What still matters here is that the launch actually
  // leaves the summit rather than dribbling off the edge.
  check(
    'boosted, the summit launch clears the rim',
    launched.r > motte.innerRadius + 20 && launched.peak > 10,
    `${launched.air.toFixed(2)} s air, ${launched.peak.toFixed(1)} m clearance, ` +
      `${launched.r.toFixed(0)} m out from a ${motte.innerRadius} m rim`,
  );
  console.log('');
}

// --- 11. the ziggurat ------------------------------------------------------
{
  const parkField = new Heightfield(T.world);
  applyPark(parkField, PARK);

  const zig = PARK.find((f) => f.name === 'the ziggurat')!;
  if (zig.kind !== 'staircase') throw new Error('the ziggurat changed kind');
  const summitY = zig.baseY! + (zig.tiers - 1) * zig.rise;

  const s = createBikeState();
  resetBike(s, parkField);
  s.pos.set(zig.x, 0, zig.z + 30);
  s.pos.y = parkField.height(s.pos.x, s.pos.z) + T.susp.restHeight;
  s.yaw = zig.yaw;
  s.vel.set(0, 0, -20);
  const input = idle();
  input.throttle = 1;

  let reached = -1e9;
  let tiersCleared = 0;
  let nextTier = 1;
  for (let i = 0; i < 120 * 60; i++) {
    // Boost whenever it is available, as a player working up the tiers would.
    if (s.grounded && s.boostRemaining <= 0 && s.boostCooldown <= 0) {
      s.boostRemaining = T.boost.duration;
    }
    stepBike(s, parkField, input, STEP);
    if (!finite(s)) break;
    reached = Math.max(reached, s.pos.y);
    // Count a tier once the bike is standing on it.
    if (s.grounded && nextTier < zig.tiers && s.pos.y > zig.baseY! + nextTier * zig.rise - 1) {
      tiersCleared = nextTier;
      nextTier++;
    }
    if (s.pos.z < zig.z - 300) break;
  }

  check(
    'the ziggurat can be jumped up',
    tiersCleared >= zig.tiers - 1,
    `${tiersCleared} of ${zig.tiers - 1} steps cleared, reached y=${reached.toFixed(1)} (summit ${summitY})`,
  );

  // --- and cannot be climbed up the wrong side ------------------------------
  // The suspension pushes along world +Y rather than along the surface normal,
  // which on a near-vertical face converts horizontal speed into launch: both
  // spring terms saturate `maxAccel` for many steps in a row. Charged broadside
  // at its steepest risers the ziggurat threw the bike 41 m up at 47 m/s —
  // twice its own summit, and far past anything the park's best jump gives.
  //
  // `susp.climbSlopeDeg` fades that push out on ground too steep to be intentional
  // geometry, and the floor clamp resolves along the surface normal instead of
  // straight up. The legitimate stepped climbs are untouched to the centisecond;
  // only the wall case changes.
  {
    const charge = (zOff: number, boost: boolean) => {
      const s = createBikeState();
      resetBike(s, parkField);
      s.pos.set(zig.x + zig.halfWidth + 45, 0, zig.z - zOff);
      s.pos.y = parkField.height(s.pos.x, s.pos.z) + T.susp.restHeight;
      s.yaw = -Math.PI / 2;
      s.vel.set(-25, 0, 0);
      if (boost) s.boostRemaining = T.boost.duration;
      const input = idle();
      input.throttle = 1;
      let peakVy = 0;
      let peakY = -Infinity;
      for (let i = 0; i < 120 * 12; i++) {
        stepBike(s, parkField, input, STEP);
        if (!finite(s)) break;
        peakVy = Math.max(peakVy, s.vel.y);
        peakY = Math.max(peakY, s.pos.y);
      }
      return { peakVy, peakY };
    };

    let worstVy = 0;
    let worstY = -Infinity;
    for (const zOff of [40, 90, 130]) {
      for (const boost of [false, true]) {
        const r = charge(zOff, boost);
        worstVy = Math.max(worstVy, r.peakVy);
        worstY = Math.max(worstY, r.peakY);
      }
    }
    check(
      'and cannot be climbed up the wrong side',
      worstY - summitY < 10 && worstVy < 38,
      `broadside charge tops out at y=${worstY.toFixed(0)} against a ${summitY} m summit, ` +
        `${worstVy.toFixed(0)} m/s climb`,
    );
  }
  console.log('');
}

// --- 12. tricks and scoring -------------------------------------------------
{
  /**
   * Fly a scripted set of inputs and report what was detected and banked.
   *
   * The bike is *dropped from height* rather than launched off a feature: every
   * trick then gets the same generous air budget, so these checks measure
   * detection and scoring rather than whether a given ramp is big enough to fit
   * a double backflip into. `drive` gets the state as well as the input so a
   * check can force an attitude directly, the way section 6 does.
   */
  function fly(
    drive: (t: number, i: InputState, s: BikeState) => void,
    height = 110,
  ): { tally: TrickTally | null; event: ScoreEvent | null; score: Scoring; state: BikeState } {
    const s = createBikeState();
    resetBike(s, hf);
    const tricks = new Tricks();
    const score = new Scoring();
    const input = idle();

    for (let i = 0; i < 60; i++) {
      stepBike(s, hf, input, STEP);
      tricks.step(s, STEP);
      score.step(s, tricks);
    }

    s.pos.y += height;
    s.vel.set(0, 0, -15);
    s.yaw = Math.PI;

    let tally: TrickTally | null = null;
    for (let i = 0; i < 120 * 30; i++) {
      drive(i * STEP, input, s);
      stepBike(s, hf, input, STEP);
      tricks.step(s, STEP);
      // The tally is only valid on the step it lands, so it has to be copied.
      if (tricks.landed && !tally) tally = { ...tricks.landed };
      score.step(s, tricks);
      if (score.event) break;
      if (!finite(s)) break;
    }
    return { tally, event: score.event, score, state: s };
  }

  /** Hold one air axis for `seconds`, then let go and ride it out. */
  const holdFor = (axis: 'pitch' | 'roll' | 'steer', dir: number, seconds: number) =>
    (t: number, i: InputState) => {
      i.pitch = 0;
      i.roll = 0;
      i.steer = 0;
      if (t < seconds) i[axis] = dir;
    };

  // Air rates are 4.2 / 3.4 / 2.6 rad/s for pitch / roll / yaw, so a revolution
  // costs 1.50 / 1.85 / 2.42 s. These holds clear one turn with a little margin.
  const back = fly(holdFor('pitch', 1, 1.6));
  const front = fly(holdFor('pitch', -1, 1.6));
  const double = fly(holdFor('pitch', 1, 3.1));
  const spin = fly(holdFor('steer', 1, 2.5));
  const barrel = fly(holdFor('roll', 1, 2.0));

  check('a backflip is detected', back.tally?.label === 'Backflip', `${back.tally?.label || 'nothing'} (${back.tally?.flips} flip)`);
  check('a frontflip is told apart from it', front.tally?.label === 'Frontflip', `${front.tally?.label || 'nothing'} (${front.tally?.flips} flip)`);
  check(
    'two turns is a double, not two singles',
    double.tally?.label === 'Double Backflip',
    `${double.tally?.label || 'nothing'} over ${double.tally?.airTime.toFixed(2)}s`,
  );
  check('a spin is detected', spin.tally?.label === '360', `${spin.tally?.label || 'nothing'}`);
  check('a barrel roll is detected', barrel.tally?.label === 'Barrel Roll', `${barrel.tally?.label || 'nothing'}`);

  // Combined rotations have to name themselves, or every mixed trick reads as
  // whichever axis the detector happened to check first.
  const mixed = fly((t, i) => {
    i.pitch = t < 1.6 ? 1 : 0;
    i.steer = t < 2.5 ? 1 : 0;
  });
  check('combined rotations name themselves', mixed.tally?.label === 'Backflip 360', `${mixed.tally?.label || 'nothing'}`);

  // A whip is the trick a signed accumulator exists to distinguish: it passes
  // through the same angles a spin does and has to sum back to nothing.
  const whip = fly((t, i) => {
    i.steer = t < 0.8 ? 1 : t < 1.6 ? -1 : 0;
  });
  check(
    'a whip is not a spin',
    whip.tally?.whip === true && whip.tally?.spins === 0,
    `${whip.tally?.label || 'nothing'}, yaw summed to ${whip.tally?.spins} spin(s)`,
  );
  // ...and the converse: a full rotation must not also bank a whip, even though
  // it spends far longer than the hold sideways of its travel direction.
  check(
    'a spin does not also bank a whip',
    spin.tally?.whip === false,
    spin.tally?.whip === false ? 'spin scored as a spin alone' : 'double-counted',
  );

  // Airtime is the base reward — a plain jump with nothing done in it still pays.
  const plain = fly(() => {});
  check(
    'airtime alone is worth something',
    plain.event !== null && plain.event.risked > 0 && plain.tally?.label === '',
    `${plain.tally?.airTime.toFixed(2)}s of air, ${plain.event?.risked} points, no trick`,
  );
  // Squared, so the big jump is worth disproportionately more than the safe one.
  check(
    'airtime pays back more than linearly',
    plain.event !== null &&
      Math.abs(plain.event.risked - plain.tally!.airTime ** 2 * T.score.airGain) < 1,
    `${plain.tally?.airTime.toFixed(2)}s -> ${plain.event?.risked}, ` +
      `vs ${(plain.tally!.airTime * T.score.airGain).toFixed(0)} if it were linear`,
  );

  // The rule the whole thing turns on: points are banked by landings, not by air.
  const landAt = (errorDeg: number) =>
    fly((t, i, s) => {
      i.pitch = 0;
      // Force the attitude once, on the way down, rather than flying to it.
      if (Math.abs(t - 1.2) < STEP * 0.6) s.pitch = THREE.MathUtils.degToRad(errorDeg);
    });

  const clean = landAt(5);
  const sketchy = landAt(40);
  const bad = landAt(170);

  check(
    'a clean landing banks the lot',
    clean.event?.band === 'clean' && clean.event.gained === clean.event.risked,
    `${clean.event?.gained} of ${clean.event?.risked} banked`,
  );
  check(
    'a sketchy landing salvages part of it',
    sketchy.event?.band === 'sketchy' &&
      sketchy.event.gained === Math.round(sketchy.event.risked * T.score.keepSketchy),
    `${sketchy.event?.gained} of ${sketchy.event?.risked} banked`,
  );
  check(
    'a bad landing loses everything riding on it',
    bad.event?.band === 'bad' && bad.event.gained === 0 && bad.score.total === 0,
    `risked ${bad.event?.risked}, banked ${bad.event?.gained}, session total ${bad.score.total}`,
  );

  /** Hop on the spot `times` times, sitting on the ground for `rest` between. */
  function bounce(times: number, rest: number) {
    const s = createBikeState();
    resetBike(s, hf);
    const tricks = new Tricks();
    const score = new Scoring();
    const input = idle();
    const events: ScoreEvent[] = [];

    const advance = (steps: number, until?: () => boolean) => {
      for (let i = 0; i < steps; i++) {
        stepBike(s, hf, input, STEP);
        tricks.step(s, STEP);
        score.step(s, tricks);
        if (score.event) {
          events.push(score.event);
          score.event = null;
        }
        if (until?.()) return;
      }
    };

    advance(120);
    for (let n = 0; n < times; n++) {
      const before = events.length;
      s.vel.y = 12;
      advance(600, () => events.length > before);
      advance(Math.round(rest / STEP));
    }
    return { events, score };
  }

  const chained = bounce(4, 0.4);
  const spaced = bounce(4, T.score.comboWindow + 1);

  check(
    'the combo climbs over consecutive clean landings',
    chained.events.length === 4 && chained.events.every((e, i) => e.multiplier === i + 1),
    `multipliers ${chained.events.map((e) => `x${e.multiplier}`).join(' ')}`,
  );
  check(
    'and the same hop is worth more each time',
    chained.events.every((e, i) => i === 0 || e.gained > chained.events[i - 1].gained),
    chained.events.map((e) => e.gained).join(' -> '),
  );
  check(
    'sitting still drops the combo',
    spaced.events.length === 4 && spaced.events.every((e) => e.multiplier === 1),
    `multipliers ${spaced.events.map((e) => `x${e.multiplier}`).join(' ')} ` +
      `after ${(T.score.comboWindow + 1).toFixed(1)}s idle between hops`,
  );

  // A bad landing has to actually cost the streak, not just the flight.
  {
    const b = bounce(2, 0.4);
    check(
      'a clean landing is what raises it',
      b.score.multiplier === 3,
      `x${b.score.multiplier} after 2 clean landings`,
    );
  }

  // Nothing above should be able to run the score backwards or to NaN.
  {
    let seed = 20260813;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const s = createBikeState();
    resetBike(s, hf);
    const tricks = new Tricks();
    const score = new Scoring();
    const input = idle();
    let next = 0;
    let monotonic = true;
    let prevTotal = 0;
    let landings = 0;
    let bestTrick = '';
    for (let i = 0; i < 120 * 180; i++) {
      const t = i * STEP;
      if (t >= next) {
        next = t + 0.6;
        input.throttle = rand() < 0.88 ? 1 : 0;
        input.brake = rand() < 0.08 ? 1 : 0;
        input.steer = rand() < 0.5 ? Math.round(rand() * 2 - 1) : 0;
        input.pitch = rand() < 0.3 ? Math.round(rand() * 2 - 1) : 0;
        input.roll = rand() < 0.15 ? Math.round(rand() * 2 - 1) : 0;
        input.boost = rand() < 0.2;
      }
      stepBike(s, hf, input, STEP);
      tricks.step(s, STEP);
      if (tricks.landed?.label) bestTrick = tricks.landed.label;
      score.step(s, tricks);
      if (score.event) {
        landings++;
        score.event = null;
      }
      if (score.total < prevTotal) monotonic = false;
      prevTotal = score.total;
    }
    check(
      '3 minutes of chaos keeps a sane score',
      monotonic && Number.isFinite(score.total) && score.total >= 0,
      `${score.total.toLocaleString('en-US')} points over ${landings} scored landing(s), ` +
        `combo x${score.multiplier}` + (bestTrick ? `, last trick "${bestTrick}"` : ''),
    );
  }
  console.log('');
}

// --- 12. the ribbon ---------------------------------------------------------
{
  const parkField = new Heightfield(T.world);
  applyPark(parkField, PARK);
  const bare = new Heightfield(T.world);

  const rib = PARK.find((f) => f.name === 'the ribbon') as Causeway;
  const farPeak = PARK.find((f) => f.name === 'the far peak')!;
  if (rib.kind !== 'causeway') throw new Error('the ribbon changed kind');
  if (farPeak.kind !== 'motte') throw new Error('the far peak changed kind');

  const deckAt = (t: number) => {
    const p = arcPoint(rib, t);
    return parkField.height(p.x, p.z);
  };

  // --- it is actually a raised ribbon, and drawable ------------------------
  {
    const n = new THREE.Vector3();
    let minLift = Infinity;
    let maxSlope = 0;
    // Stop before the exit fade, where the deck is *meant* to come down to meet
    // the desert so you can ride off the end.
    const last = 1 - rib.exitFade - 0.02;
    for (let t = 0.02; t <= last; t += 0.02) {
      const p = arcPoint(rib, t);
      minLift = Math.min(minLift, parkField.height(p.x, p.z) - bare.height(p.x, p.z));
      // Sample across the ribbon's *own* cross-section only. Reaching wider picks
      // up whatever it happens to be crossing rather than the ribbon itself.
      const lift = parkField.height(p.x, p.z) - bare.height(p.x, p.z);
      const span = rib.rideHalfWidth + lift * rib.shoulderRatio;
      for (let u = -span; u <= span; u += 1) {
        const ox = Math.cos(Math.atan2(p.z - rib.cz, p.x - rib.cx)) * u;
        const oz = Math.sin(Math.atan2(p.z - rib.cz, p.x - rib.cx)) * u;
        parkField.normal(p.x + ox, p.z + oz, n);
        maxSlope = Math.max(maxSlope, (Math.acos(Math.min(1, Math.abs(n.y))) * 180) / Math.PI);
      }
    }
    check(
      'the ribbon stands clear of the desert',
      minLift > 1.5,
      `lowest point of the deck is ${minLift.toFixed(1)} m above natural ground ` +
        `(measured to t=${(1 - rib.exitFade).toFixed(2)}, where the exit ramp begins)`,
    );
    // Both engine limits at once: past ~45 deg the mesh draws a face as something
    // other than what the bike hits, and past climbSlopeDeg the suspension stops
    // pushing the bike up it at all.
    check(
      'and its banks stay drawable',
      maxSlope < 45,
      `steepest bank ${maxSlope.toFixed(0)} deg (mesh limit 45, ` +
        `climbSlopeDeg ${T.susp.climbSlopeDeg}, by design ` +
        `${((Math.atan(1 / rib.shoulderRatio) * 180) / Math.PI).toFixed(0)})`,
    );
  }

  // --- the jump off the far peak reaches it --------------------------------
  {
    const start = arcPoint(rib, 0);
    const gap = Math.hypot(start.x - farPeak.x, start.z - farPeak.z) - farPeak.innerRadius;
    const hits: number[] = [];
    const report: string[] = [];

    for (const speed of [14, 18, 22, 26, 30]) {
      const s = createBikeState();
      resetBike(s, parkField);
      // Run at the summit rim heading -X, over #14, the way you arrive off the
      // #9 gap jump.
      s.pos.set(farPeak.x + farPeak.innerRadius - 4, 0, farPeak.z);
      s.pos.y = parkField.height(s.pos.x, s.pos.z) + T.susp.restHeight;
      s.yaw = -Math.PI / 2;
      s.vel.set(-speed, 0, 0);
      const input = idle();
      input.throttle = 1;
      let airborne = false;
      let landedR = 0;
      let onSweep = false;
      for (let i = 0; i < 120 * 10; i++) {
        const wasGrounded = s.grounded;
        stepBike(s, parkField, input, STEP);
        if (!finite(s)) break;
        if (wasGrounded && !s.grounded) airborne = true;
        if (airborne && s.grounded) {
          landedR = Math.hypot(s.pos.x - rib.cx, s.pos.z - rib.cz);
          // Being at the right radius is not enough — the arc has to actually be
          // there. Outside the sweep you are on open desert at exactly the radius
          // the ribbon would have had.
          onSweep =
            wrap01(Math.atan2(s.pos.z - rib.cz, s.pos.x - rib.cx), rib.startAngle, rib.endAngle) >
              0 &&
            s.pos.y > bare.height(s.pos.x, s.pos.z) + 1;
          break;
        }
      }
      // Signed: negative is short of the ribbon, positive is past it.
      const off = landedR - rib.radius;
      if (onSweep && Math.abs(off) < rib.rideHalfWidth) hits.push(speed);
      report.push(`${speed}:${onSweep ? `${off > 0 ? '+' : ''}${off.toFixed(0)}` : 'off'}`);
    }

    check(
      'the far peak can be jumped onto the ribbon',
      hits.length >= 2,
      `${gap.toFixed(0)} m gap; lands on it at ${hits.join(', ') || 'no'} m/s ` +
        `(metres short/past the ribbon by speed: ${report.join(' ')})`,
    );
  }

  // --- and it can be ridden round ------------------------------------------
  {
    let bestT = 0;
    let bestSpeed = 0;
    for (const speed of [14, 18, 22, 26]) {
      const s = createBikeState();
      resetBike(s, parkField);
      const p0 = arcPoint(rib, 0.02);
      s.pos.set(p0.x, parkField.height(p0.x, p0.z) + T.susp.restHeight, p0.z);
      s.yaw = p0.yaw;
      s.vel.set(Math.sin(p0.yaw) * speed, 0, Math.cos(p0.yaw) * speed);
      const input = idle();
      let reached = 0;
      for (let i = 0; i < 120 * 40; i++) {
        // Aim a little way further along the ribbon, like a rider would.
        const ahead = arcPoint(rib, Math.min(1, reached + 0.06));
        const want = Math.atan2(ahead.x - s.pos.x, ahead.z - s.pos.z);
        const err = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw));
        input.steer = Math.max(-1, Math.min(1, -err * 2.5));
        input.throttle = groundSpeed(s) < speed ? 1 : 0;
        stepBike(s, parkField, input, STEP);
        if (!finite(s)) break;
        const off = Math.abs(Math.hypot(s.pos.x - rib.cx, s.pos.z - rib.cz) - rib.radius);
        const t = wrap01(
          Math.atan2(s.pos.z - rib.cz, s.pos.x - rib.cx),
          rib.startAngle,
          rib.endAngle,
        );
        if (off < rib.rideHalfWidth + 3 && t > reached) reached = t;
        // Fallen off the side and down to the desert.
        if (s.grounded && s.pos.y < deckAt(Math.min(0.98, reached)) - 4) break;
        if (reached > 0.97) break;
      }
      if (reached > bestT) {
        bestT = reached;
        bestSpeed = speed;
      }
    }
    check(
      'the ribbon can be ridden round without falling off',
      bestT > 0.9,
      `${(bestT * 100).toFixed(0)}% of the sweep at ${bestSpeed} m/s`,
    );
  }

  // --- it points you home --------------------------------------------------
  {
    const end = arcPoint(rib, 1);
    const toSpawn = Math.atan2(0 - end.x, 235 - end.z);
    const err = Math.abs(
      (Math.atan2(Math.sin(toSpawn - end.yaw), Math.cos(toSpawn - end.yaw)) * 180) / Math.PI,
    );
    check(
      'and spits you out facing the spawn area',
      err < 20,
      `exit at (${end.x.toFixed(0)}, ${end.z.toFixed(0)}) heading ${err.toFixed(0)} deg off the spawn pad`,
    );
  }
  console.log('');
}

console.log('-'.repeat(62));
console.log(failures === 0 ? 'all checks passed\n' : `${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);

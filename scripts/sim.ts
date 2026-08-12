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
import { createBikeState, resetBike, groundSpeed, type BikeState } from '../src/bike/state';
import { stepBike } from '../src/bike/physics';

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

const hf = new Heightfield(T.world);
console.log(
  `world  ${hf.size} m,  ${hf.res}^2 samples,  cell ${hf.cell} m,  ` +
    `spawn y ${hf.spawn.y.toFixed(2)}\n`,
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

// --- 6. long random session -----------------------------------------------
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

console.log('-'.repeat(62));
console.log(failures === 0 ? 'all checks passed\n' : `${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);

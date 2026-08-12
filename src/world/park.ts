import type { Feature } from './ramps';

/**
 * The proving strip: a handful of features laid out in a straight line from the
 * spawn pad, running toward the bowl.
 *
 * Deliberately not a park. The point is to answer "does hitting a lip feel good"
 * before authoring fifteen features against untested geometry — the same reason
 * boost went in before ramps and landings went in before both.
 *
 * Spawn is at (0, 235) facing -Z, so every feature shares `yaw: π` and they are
 * encountered in order of decreasing z. Ride straight ahead and you meet all of
 * them.
 *
 * Angles are chosen against the landing bands rather than for realism. Leaving a
 * lip, the bike keeps the lip's own pitch and there is no auto-level, so a rider
 * who does nothing arrives nose-up by the launch angle. Landing flat, that means
 * the pitch error *is* the launch angle:
 *
 *   - 22 deg  -> under the 25 deg clean threshold. Do nothing, land clean.
 *   - 30 deg  -> sketchy unless you tuck the nose down on the way in.
 *
 * So the small jumps are free and the big one has to be ridden. Both reward
 * finishing a rotation rather than bailing halfway.
 */

const SOUTH = Math.PI;

export const PARK: readonly Feature[] = [
  {
    kind: 'rollers',
    name: 'warmup whoops',
    x: 0,
    z: 205,
    yaw: SOUTH,
    halfWidth: 9,
    approach: 12,
    count: 5,
    spacing: 9,
    height: 1.1,
  },
  {
    // The friendly one, but poppy. A cubic face over 11 m rather than a 12 m
    // parabola triples the curvature at the lip, so it kicks properly while
    // staying the easiest jump on the strip to land.
    kind: 'kicker',
    name: 'first kicker',
    x: 0,
    z: 135,
    yaw: SOUTH,
    halfWidth: 7,
    approach: 25,
    length: 11,
    angleDeg: 28,
    exponent: 3,
    back: 4,
    landing: 70,
  },
  {
    // Clearable at full base speed with nothing to spare — the deck is flat, so
    // coming up short is survivable rather than punished.
    kind: 'tabletop',
    name: 'tabletop',
    x: 0,
    z: 75,
    yaw: SOUTH,
    halfWidth: 8,
    approach: 25,
    length: 12,
    angleDeg: 30,
    exponent: 3,
    deck: 12,
    down: 10,
    runout: 38,
  },
  {
    // Boost this one. ~4.8 m lip, ~1.9 s of air boosted, which is enough time for
    // a full backflip at the 4.2 rad/s air pitch rate.
    kind: 'kicker',
    name: 'big air',
    x: 0,
    z: 0,
    yaw: SOUTH,
    halfWidth: 9,
    approach: 30,
    // Cubic at 38 deg over 20 m gives the same 5.2 m lip as the old 30 deg
    // parabola over 18 m, at roughly 2.5x the curvature — identical height, far
    // more kick, and a steeper launch for the airtime.
    length: 20,
    angleDeg: 38,
    exponent: 3,
    back: 7,
    landing: 105,
  },
  {
    // The sharp one. Sits alongside the first kicker so the two can be ridden
    // back to back: same idea, a third of the height, far more pop.
    //
    // Short face, exponent 3, steep lip. Curvature at the lip is roughly 5x the
    // first kicker's, so the suspension loads hard up the face and fires at the
    // top — the same thing that makes riding the mellow kicker *backwards* fun,
    // except aimed forwards and on purpose. Being lower, it also costs almost no
    // speed to climb.
    //
    // Measured, it still lands clean with no input, despite the 32 deg lip: the
    // face is short enough that pitch (which lags at `pitchResponse`) never fully
    // catches the ramp, so the bike leaves flatter than the geometry suggests.
    kind: 'kicker',
    name: 'sharp kicker',
    x: -48,
    z: 142,
    yaw: SOUTH,
    halfWidth: 6,
    approach: 30,
    length: 8,
    angleDeg: 32,
    exponent: 3,
    back: 3,
    landing: 74,
  },
  {
    // Off to one side and turned 30 deg, so it throws you off-axis rather than
    // straight ahead. Reachable by peeling right off the tabletop runout.
    kind: 'kicker',
    name: 'side hip',
    x: 52,
    z: 40,
    yaw: SOUTH - 0.52,
    halfWidth: 6,
    approach: 22,
    length: 10,
    angleDeg: 26,
    back: 5,
    landing: 52,
  },

  // ---- #7/#8: the set piece -------------------------------------------------
  {
    // Huge and poppy: 45 deg off a cubic face gives a 5 m lip at 94 m/s2 of pop,
    // just under the ~120 the suspension can absorb before it runs out of travel.
    // Note H*pop = tan^2(theta)*(n-1)/n is independent of face length, so length
    // only trades height against kick — the angle and exponent set the ceiling.
    kind: 'kicker',
    name: 'the gauntlet',
    x: 0,
    z: -170,
    yaw: SOUTH,
    halfWidth: 10,
    approach: 40,
    length: 20,
    angleDeg: 45,
    exponent: 4,
    back: 8,
    landing: 110,
  },
  {
    // Stamped after the ramp so it wins where they overlap. Base speed lands in
    // the water; boosted clears it. Water takes your momentum, nothing else — the
    // same rule the landing bands follow.
    kind: 'pond',
    name: 'gator pond',
    x: 0,
    z: -198,
    yaw: SOUTH,
    halfWidth: 24,
    approach: 0,
    length: 36,
    depth: 2.6,
    freeboard: 0.4,
  },
];

/**
 * Props for the #7/#8 set piece.
 *
 * The loop sits on the *measured* apex of a boosted run over #7 — traced with the
 * real physics rather than derived from the ballistic formula, because the ramp
 * kicks harder than an ideal projectile and the formula lands you several metres
 * low. `npm run sim` asserts the bike still passes inside the ring, so this stops
 * being true loudly rather than silently if the ramp is ever retuned.
 */
export const SETPIECE = {
  loop: { x: 0, y: 3.8, z: -216, yaw: SOUTH, radius: 7.5, tube: 0.55 },
  gatorCount: 6,
};

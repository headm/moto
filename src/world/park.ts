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
    // 22 deg: the "do nothing and still land clean" jump. ~2.4 m lip.
    kind: 'kicker',
    name: 'first kicker',
    x: 0,
    z: 135,
    yaw: SOUTH,
    halfWidth: 7,
    approach: 25,
    length: 12,
    angleDeg: 22,
    back: 5,
    landing: 50,
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
    length: 13,
    angleDeg: 24,
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
    length: 18,
    angleDeg: 30,
    back: 7,
    landing: 92,
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
];

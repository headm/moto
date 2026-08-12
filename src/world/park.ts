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

/**
 * Shared datum for the main southbound line (#1-#4 and #7).
 *
 * Every feature otherwise sits at its own local ground height, and the step
 * between consecutive pads has to be absorbed by the lead-in fade — a 3.5 m
 * difference into #4 became a 12 deg climb that cost speed, and the 9 m one into
 * #7 became a drop you landed on hard and arrived with nothing left. Pinning the
 * run to a single plane removes every step instead of smoothing it.
 *
 * Chosen as #4's natural height, so the cut and fill either side stay modest —
 * except in the bowl around #7, where it becomes the 11 m platform that gets the
 * fire ring clear of the surrounding terrain.
 */
const LINE_Y = -7;

export const PARK: readonly Feature[] = [
  {
    kind: 'rollers',
    name: 'warmup whoops',
    x: 0,
    z: 205,
    yaw: SOUTH,
    halfWidth: 9,
    baseY: LINE_Y,
    // Long enough to reach back past the spawn pad, so the run starts on the line
    // rather than stepping up onto it.
    approach: 34,
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
    baseY: LINE_Y,
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
    baseY: LINE_Y,
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
    baseY: LINE_Y,
    // 55 rather than 30: #3's runout taper and a 30 m approach used to leave a
    // 2.2 m trough around z=42 — actually *below* natural ground, because the two
    // fades compounded. A longer approach is stamped over the whole gap, so the
    // run-in to #4 is one continuous level pad.
    approach: 55,
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
  // Faces NORTH, back toward the bowl and the spawn, which is the whole point:
  // the land falls 21 m over the next 140 m, so the flight goes out over ground
  // dropping away beneath it. Pointed the other way — level pad cut across rising
  // ground — this same ramp gave 19.6 m of clearance and still felt sunken,
  // because the pad was a trench 16 m below the surrounding desert and the ring
  // sat level with the hillsides instead of against sky.
  {
    kind: 'kicker',
    // Faces SOUTH, continuing the run: spawn, ride #1-#4, then straight into this.
    //
    // Sited at the end of #4's runout on purpose. #4's landing pad holds the ground
    // at -7 where the natural bowl floor here is -18, so launching off the pad
    // rather than off the low point is 11 m of world height for free — which is
    // what makes the ring clear the surrounding terrain despite riding *into*
    // rising ground. An earlier southbound version launched from the bowl floor
    // and the ring ended up level with the hillsides.
    name: 'the gauntlet',
    x: 0,
    z: -128,
    yaw: SOUTH,
    halfWidth: 10,
    // Same datum as everything before it: flush, no drop to land on, arriving with
    // all your speed. Here the datum is 11 m above the bowl floor, and that
    // platform is what gets the ring clear of the surrounding terrain.
    baseY: LINE_Y,
    // Long, so it bridges #4's runout into one continuous pad and leaves room to
    // rebuild speed and clear the boost cooldown after landing #4.
    approach: 60,
    // A `crest` face, which is the back side of #4 turned into a ramp on purpose.
    // Riding #4 backwards was the most fun jump in the park: the spring driven to
    // its stop, and you leave nearly level instead of angled. Steepest mid-face,
    // flat on top, throwing you off convex curvature rather than off an edge.
    face: 'crest',
    length: 8,
    height: 5.6,
    angleDeg: 0,
    back: 8,
    landing: 100,
  },
  {
    kind: 'pond',
    name: 'gator pond',
    x: 0,
    // Moved north with the bigger flight: the crest launcher lands a boosted run
    // around z=-210, so the water has to finish short of that or clearing it
    // becomes impossible rather than merely demanding.
    // Sized to the gap between where an unboosted run lands (z=-175) and a boosted
    // one does (z=-186): wide enough to matter, narrow enough that boost genuinely
    // clears it, with margin for arriving at less than a clean 25 m/s.
    z: -158,
    yaw: SOUTH,
    halfWidth: 34,
    approach: 0,
    length: 20,
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
  // On the climb at z=-150, still going up at ~13 m/s, rather than at the apex
  // (z=-163) where vertical speed is zero and it would drift past. 28 m above the
  // natural desert floor, on legs standing off the pinned platform.
  //
  // Positioned so an unboosted run passes through it too — 1.5 m below centre,
  // comfortably inside the ring — and then lands in the water.
  loop: { x: 0, y: 11.2, z: -150, yaw: SOUTH, radius: 7.5, tube: 0.55 },
  gatorCount: 6,
};

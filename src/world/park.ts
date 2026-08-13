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
/** Yaw values for the cardinal directions: forward = (sin yaw, 0, cos yaw). */
const PLUS_X = Math.PI / 2;
const MINUS_X = -Math.PI / 2;

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

  // ---- #9/#10: the motte ----------------------------------------------------
  {
    // A cone with a flat summit 22 m up, flank at 23 degrees. Traverse it and the
    // grade under your wheels is gentle; charge straight up and the slope pull
    // (about 5 m/s2) bleeds you down to a crawl. The banners mark the fast line.
    kind: 'motte',
    name: 'the motte',
    x: -150,
    z: -40,
    yaw: PLUS_X,
    baseY: -14,
    halfWidth: 0,
    approach: 0,
    // The summit is large on purpose. To land on the desert rather than back on
    // the hillside, the launch has to clear the entire flank — so a wide summit
    // (run-up) and a narrow flank (less to clear) are both required. 68 m of
    // summit against 38 m of flank works; 40 against 52 did not.
    // Widened from 72 so the flank has room to terrace. Real step-up tiers would
    // need ~90 m of flank (10 m treads to land on, 5 m rises to jump) and that
    // would swallow the far peak — so this is banks-and-crests instead: four
    // near-flat treads separated by 44 degree banks, each cresting hard enough to
    // throw the bike on the way up.
    outerRadius: 100,
    innerRadius: 34,
    height: 30,
    steps: 4,
    stepStrength: 1.15,
    turns: 2,
    // atan2 angle, not yaw: 0 puts the entry on the +X side, facing the park.
    entryAngle: 0,
    skirt: 14,
  },
  {
    // The far peak. Lower than #9 (summit y=2 against y=8) so the crossing is
    // slightly downhill and therefore landable, and close enough that the two
    // bases merge into one massif with a saddle between them.
    //
    // They have to merge. A launch off #9's rim reaches barely past #9's own outer
    // edge — 79 m of range against the 120+ m a separate mound would need — so
    // "two towers with a chasm between" is not reachable at this bike's speeds.
    // Overlapping cones composed by max are.
    kind: 'motte',
    name: 'the far peak',
    x: -244,
    z: -40,
    yaw: PLUS_X,
    baseY: -14,
    halfWidth: 0,
    approach: 0,
    // Small and steep, deliberately. A's flank now reaches past here, so the far
    // peak has to stand well above it to still read as a separate summit and to
    // still be a target worth aiming at — a wide shallow cone would just be
    // absorbed into A's shoulder.
    outerRadius: 44,
    innerRadius: 22,
    height: 26,
    turns: 2,
    entryAngle: Math.PI,
    skirt: 12,
  },
  {
    // On the summit, firing off the edge. Launching from 24 m up over ground that
    // is 24 m lower does the work — the ramp only has to point you.
    //
    // `landing` is deliberately tiny: a normal landing pad would level 100 m of
    // ground at summit height and turn the drop into a causeway, which is the
    // whole point of being up here.
    kind: 'kicker',
    name: 'the drop',
    // Set out so the crest sits on the summit *rim*, not at the centre. Launching
    // from the middle left the whole summit still to cross before the flank even
    // began, and every jump landed back on the hillside.
    //
    // Boosted it clears the mound completely (3.0 s air, 22.6 m of clearance,
    // landing clean on the desert). Unboosted it comes up just short and you land
    // badly on the flank — deliberate, and the same bargain the gator pond offers.
    demandsBoost: true,
    x: -176,
    z: -40,
    // Fires away from the park, out over 260 m of open desert, so you are not
    // launching back over the ramp you just climbed.
    yaw: MINUS_X,
    baseY: 16,
    halfWidth: 9,
    approach: 26,
    face: 'crest',
    length: 8,
    height: 3.4,
    angleDeg: 0,
    back: 5,
    landing: 6,
  },

  // ---- #12/#13: the ziggurat -------------------------------------------------
  {
    // Five tiers, 5 m each, jumped one at a time to a summit 20 m up. The only
    // structure here you gain height on by *jumping* rather than by climbing.
    //
    // Sited east of everything on the flattest 250 m corridor available (7.9 m of
    // spread) and pinned to a datum, so the tiers are true rather than following
    // the ground.
    kind: 'staircase',
    name: 'the ziggurat',
    x: 185,
    z: 150,
    yaw: SOUTH,
    // The whole block: 88 m wide, stepped and stone-shaded. The stairway is only
    // 15 m of it, cut up the middle. This is where the monument read comes from —
    // the along-axis profile can never be steep enough (see the type comment).
    halfWidth: 44,
    rampHalfWidth: 15,
    baseY: -4,
    approach: 40,
    surface: 'stone',
    tiers: 5,
    rise: 6,
    // 40 degrees: as steep as the mesh can draw. A riser cannot be a hard gate
    // regardless — the bike climbs to ~60 — so it is a momentum gate, not a wall.
    riserLength: 7,
    platform: 12,
    lipLength: 5,
    lipHeight: 2.6,
    back: 3,
    gap: 7,
    summit: 26,
  },
  {
    // Off the top, 20 m up, with the whole flank falling away beneath.
    kind: 'kicker',
    name: 'the pinnacle',
    x: 185,
    z: 150 - (4 * (7 + 12 + 5 + 3 + 7) + 7 + 18),
    yaw: SOUTH,
    baseY: 20,
    halfWidth: 9,
    approach: 20,
    face: 'crest',
    length: 8,
    height: 3,
    angleDeg: 0,
    back: 5,
    landing: 6,
    demandsBoost: true,
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
  mottes: [
  {
    x: -150,
    z: -40,
    baseY: -14,
    summitY: 16,
    outerRadius: 100,
    innerRadius: 34,
    height: 30,
    turns: 2,
    entryAngle: 0,
    // A gatehouse straddling the launch run rather than a keep beside it: you ride
    // through the arch and off the rim beyond. Decoration, like the fire ring, so
    // the arch has to *line up* with the ride line to read correctly — it is at
    // z=-40 because that is where the run is.
    gate: { x: -168, z: -40, archWidth: 15, wallHeight: 11, towerHeight: 18, spanZ: 34 },
  },
  {
    // The far peak gets a smaller gatehouse, so the two summits read as different
    // places rather than as the same asset twice.
    x: -244,
    z: -40,
    baseY: -14,
    summitY: 12,
    outerRadius: 44,
    innerRadius: 22,
    height: 26,
    turns: 2,
    entryAngle: Math.PI,
    // A gatehouse across this summit's ride line too — you land off the gap jump
    // heading -X and pass straight through it. Slightly smaller than #9's, so the
    // two peaks still read as major and minor.
    gate: { x: -246, z: -40, archWidth: 13, wallHeight: 9, towerHeight: 13, spanZ: 26 },
  },
  ],
};

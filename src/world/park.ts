import { arcPoint, type Arc, type Feature } from './ramps';

/**
 * The park: **three tracks joined into one lap**, each a continuous run you ride
 * start to finish rather than a strip you drive past.
 *
 *   1. **The dirt track** — south out of the spawn over the whoops, the kickers
 *      and the tabletop, across the gauntlet's fire ring and the gator pond, then
 *      hard right through a banked turn into a westbound rhythm section: whoops,
 *      a true double with a pit in it, a step-down, and a last kicker off the low
 *      side. It finishes with a banked corner in the south-west and a back road
 *      that runs up behind both mounds to join the castle at the ribbon.
 *   2. **The castle** — the motte's terraced flank to a summit 30 m up, out
 *      through the gatehouse and off the rim, the gap jump to the far peak, off
 *      *its* rim onto the ribbon, round 150 degrees of banked stone, and home
 *      down a four-feature straight that finishes beside the spawn pad.
 *   3. **The ziggurat** — a warm-up section, then six stone tiers jumped one at a
 *      time to a summit 26 m up, the pinnacle off the top, and a turn west onto a
 *      slip road that merges into the dirt track's westbound leg.
 *
 * So the three of them close: the ziggurat feeds the dirt track, the dirt track
 * runs up behind the mounds and joins the castle at the ribbon, and the castle
 * finishes where the dirt track began.
 * `HANDOVERS` writes those three joins down and the harness measures them, because
 * each one is a claim about two things being in the same place — the kind that
 * rots silently the moment either end is retuned.
 *
 * Each track is long enough to hold a combo through and varied enough that holding
 * it is a decision rather than a formality: the multiplier climbs on clean landings
 * and dies after two seconds on the ground (§6), so what makes a score is finding
 * the line that never stops jumping. The two corners are where it dies — 130 m of
 * arc is six seconds on the ground — which makes a lap a series of runs rather than
 * one unbroken one, and makes the corner the place you cash in.
 *
 * Angles are chosen against the landing bands rather than for realism. Leaving a
 * lip, the bike keeps the lip's own pitch and there is no auto-level, so a rider
 * who does nothing arrives nose-up by the launch angle. Landing flat, that means
 * the pitch error *is* the launch angle:
 *
 *   - 22 deg  -> under the 25 deg clean threshold. Do nothing, land clean.
 *   - 30 deg  -> sketchy unless you tuck the nose down on the way in.
 *
 * So the small jumps are free and the big ones have to be ridden. Both reward
 * finishing a rotation rather than bailing halfway.
 *
 * **Order in this array is stamping order**, and it matters in one specific way.
 * An approach corridor refuses to *cut* into dirt another feature has already
 * shaped, but it will happily *fill* it — so a pit or a void must never fall
 * inside the next feature's approach (its length plus the 26 m lead-in fade), or
 * it is quietly levelled away. That is why every plateau after a step-up is long
 * enough to hold the following feature's whole run-in, and why `npm run sim`
 * measures each pit's floor rather than trusting that it is there.
 */

const SOUTH = Math.PI;
/** Yaw values for the cardinal directions: forward = (sin yaw, 0, cos yaw). */
const PLUS_X = Math.PI / 2;
const MINUS_X = -Math.PI / 2;
const DEG = Math.PI / 180;

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

/**
 * Datum and centreline for the dirt track's westbound leg, the second half of
 * track 1.
 *
 * The desert here runs from +8 on a broad ridge around x=-200 down to -2 out
 * west, so a single datum means cutting into the ridge and filling beyond it.
 * That is the right trade: pinned, the whole leg is one plane and the height
 * changes on it are the *features* — a pit you jump over and a step down off the
 * ridge — rather than grades you climb. Following the ground instead would put a
 * 9 m hump in the middle of a rhythm section, which is the failure §10.5 records.
 */
const WEST_Y = 1;
const WEST_Z = -253;

/** Datum for the whole ziggurat run, warm-up section included. */
const ZIG_Y = -4;

/**
 * Every straight that leaves a curve is *derived* from where that curve actually
 * spits you out, rather than authored alongside it and left to drift. Retune an
 * arc and the run out of it moves with it — which matters most for the two
 * connectors, whose only job is to arrive somewhere specific.
 */
function beyond(arc: Arc, s: number): { x: number; z: number; yaw: number } {
  const exit = arcPoint(arc, 1);
  return {
    x: exit.x + Math.sin(exit.yaw) * s,
    z: exit.z + Math.cos(exit.yaw) * s,
    yaw: exit.yaw,
  };
}

const RIBBON: Arc = {
  cx: -292,
  cz: 35,
  radius: 75,
  startAngle: -90 * DEG,
  endAngle: -240 * DEG,
};

/** A point `s` metres along the castle's run home from the ribbon's exit. */
const home = (s: number) => beyond(RIBBON, s);

/**
 * The hairpin that turns the dirt track north, and the run out of it.
 *
 * 107 degrees, swept to come out pointing just east of north, so the run off it
 * goes up the *back* of the castle rather than into it. An earlier version turned
 * 166 degrees and aimed east-north-east at the mounds, which put the run into the
 * motte's south-west skirt and, from anywhere you could see it, looked like it
 * was driving at the far peak. The mounds are not something to arrive at from
 * behind: their only rideable entrance is the motte's east flank, and everything
 * past it is reached by jumping.
 *
 * So the connector passes west of both of them and joins the castle where the
 * castle comes back to the ground — the ribbon, 180 m north, about a fifth of the
 * way round its sweep.
 */
const FAR_TURN: Arc = {
  cx: -348,
  cz: -208,
  radius: 45,
  startAngle: -90 * DEG,
  endAngle: -197 * DEG,
};

/**
 * The turn that folds the ziggurat's tail back west, and the slip road off it.
 *
 * Aimed, not just pointed: the exit heading is chosen so that 168 m of straight
 * arrives at (-30, -253), which is on the south turn's own ride line three
 * quarters of the way round it. The ziggurat therefore joins the dirt track the
 * way a slip road joins a bend, rather than stopping near it.
 */
const ZIG_TURN: Arc = {
  cx: 143,
  cz: -260,
  radius: 42,
  startAngle: 0,
  endAngle: -106.3 * DEG,
};

export const PARK: readonly Feature[] = [
  // ===========================================================================
  // TRACK 1 — the dirt track
  //
  // South out of the spawn on one datum, then a banked right-hander into a
  // westbound rhythm section. Nothing here is masonry and nothing here needs
  // boost: it is the track you learn the bike on and the one a long combo is
  // easiest to hold, because every landing runs straight into the next run-up.
  // ===========================================================================

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

  // ---- the south turn, and everything west of it ----------------------------
  {
    // The first banked turn in the park, and the thing that makes track 1 a
    // track: the southbound line has run out of desert (the ground climbs 13 m
    // over the next 130 m and the rim is not far past that), so instead of
    // stopping, it turns.
    //
    // It is also the climb. The westbound leg sits 8 m above the gauntlet's
    // landing pad; taken as a step on a 26 m lead-in fade that is a 17 degree
    // wall, and taken across 75 m of arc it is 6 degrees you barely notice while
    // you are busy leaning on the bank.
    kind: 'berm',
    name: 'the south turn',
    // Entry on the gauntlet's landing pad, 20 m past where a boosted run touches
    // down, so there is room to gather it up before turning in.
    x: 0,
    z: -205,
    yaw: SOUTH,
    halfWidth: 0,
    approach: 0,
    cx: -48,
    cz: -205,
    radius: 48,
    // atan2 terms: the entry sits on the +X side of the centre and the sweep runs
    // clockwise to the -Z side, which is a right-hander from a southbound heading.
    startAngle: 0,
    endAngle: -90 * DEG,
    rideHalfWidth: 11,
    // 4.5 m of bank over 15 m is 27 degrees at the top and shallower below, so
    // the line you take is a choice: low and short, or high and fast.
    bankHeight: 4.5,
    bankRun: 15,
    innerRun: 10,
    endFade: 0.16,
    startY: LINE_Y,
    endY: WEST_Y,
  },
  {
    // Rhythm first, the way the track opened. Tighter and taller than #1's warmup
    // whoops because you arrive here at speed rather than from a standstill.
    kind: 'rollers',
    name: 'the west whoops',
    x: -82,
    z: WEST_Z,
    yaw: MINUS_X,
    halfWidth: 9,
    baseY: WEST_Y,
    approach: 28,
    count: 6,
    spacing: 8.5,
    height: 1.2,
  },
  {
    // A true double: take-off, a pit dug below the datum, then the far wall.
    // Everything before it in the park has been either a kicker (miss it and you
    // land on dirt) or a tabletop (miss it and you land on the deck). This is the
    // first feature where coming up short puts you somewhere you have to climb
    // out of, and it costs exactly what water and a bad landing cost: momentum.
    kind: 'gap',
    name: 'the trench',
    x: -146,
    z: WEST_Z,
    yaw: MINUS_X,
    halfWidth: 8,
    baseY: WEST_Y,
    approach: 22,
    length: 11,
    angleDeg: 30,
    exponent: 3,
    back: 9,
    pit: 13,
    pitY: -2.5,
    rise: 8,
    landY: 0,
    landing: 34,
  },
  {
    // The step-down off the ridge. Same take-off as a small kicker, but the
    // ground it lands on is 5 m lower, so the flight is half again as long and
    // you arrive while still climbing — the most forgiving big-air shape there
    // is, and the only place on this track a double flip fits.
    //
    // A long landing on purpose: it has to cover the whole flight *and* leave the
    // next feature's run-in on level plateau, because an approach corridor fills
    // any pit it reaches back over (see the header).
    kind: 'gap',
    name: 'the drop-off',
    x: -232,
    z: WEST_Z,
    yaw: MINUS_X,
    halfWidth: 9,
    baseY: WEST_Y,
    approach: 24,
    length: 12,
    angleDeg: 30,
    exponent: 3,
    back: 14,
    pit: 8,
    pitY: -5,
    rise: 7,
    landY: -5,
    landing: 64,
  },
  {
    // The finish. Sits on the drop-off's lower plateau, which is why its datum is
    // WEST_Y - 5 rather than WEST_Y: a feature standing on another feature's
    // landing has to share its height or the lead-in fade rebuilds the step the
    // step-down just gave you.
    //
    // The steepest lip on the track at 33 degrees, so unlike everything before it
    // this one does *not* land itself — you have to bring the nose down.
    kind: 'kicker',
    name: 'the last kicker',
    x: -288,
    z: WEST_Z,
    yaw: MINUS_X,
    baseY: WEST_Y - 5,
    halfWidth: 9,
    approach: 16,
    length: 14,
    angleDeg: 33,
    exponent: 3,
    back: 6,
    landing: 58,
  },
  {
    // The far turn — the corner at the bottom-left of the world, and the thing
    // that makes the park a circuit rather than three dead ends.
    //
    // A little over a right angle, which is what it takes to get from westbound
    // to northbound with the rim 50 m past the outside of the bank. The bank's
    // outer edge runs into that rim, which is welcome: the world boundary becomes
    // the outside wall of the turn instead of a thing you notice.
    kind: 'berm',
    name: 'the far turn',
    x: -348,
    z: WEST_Z,
    yaw: MINUS_X,
    halfWidth: 0,
    approach: 0,
    ...FAR_TURN,
    rideHalfWidth: 12,
    bankHeight: 4.5,
    bankRun: 15,
    innerRun: 10,
    endFade: 0.12,
    // Flat through the whole turn, on the drop-off's lower plateau, so the only
    // thing the corner asks of you is the corner.
    startY: WEST_Y - 5,
    endY: WEST_Y - 5,
  },
  {
    // Out of the corner and pointing north. A tabletop rather than anything
    // sharper because you leave a turn slower than you enter it, and the friendly
    // shape is the one that still works at whatever speed you kept.
    kind: 'tabletop',
    name: 'the hairpin table',
    ...beyond(FAR_TURN, 40),
    halfWidth: 8,
    baseY: -4,
    approach: 22,
    length: 12,
    angleDeg: 30,
    exponent: 3,
    deck: 12,
    down: 10,
    runout: 22,
  },
  {
    // The back road: the last feature of the dirt track, running up behind both
    // mounds with the castle's whole silhouette on your right, and finishing
    // alongside the ribbon about a fifth of the way round its sweep.
    //
    // The desert falls 8 m over this run, so it sits a datum lower than the table
    // before it — a 4 m step across the lead-in fade, which is 9 degrees downhill
    // and costs nothing.
    //
    // It ends *beside* the ribbon rather than on it, because the ribbon is a deck
    // on legs 7 m up: the last thing this track asks of you is to ride its bank.
    // The ribbon is stamped after this and only ever raises ground, so its
    // shoulder grows out of the end of this pad rather than fighting it.
    kind: 'gap',
    name: 'the back road',
    ...beyond(FAR_TURN, 105),
    halfWidth: 8,
    baseY: -8,
    approach: 22,
    length: 10,
    angleDeg: 28,
    exponent: 3,
    back: 8,
    pit: 12,
    pitY: -2.5,
    rise: 7,
    landY: 0,
    landing: 30,
  },

  // ===========================================================================
  // TRACK 2 — the castle
  //
  // Ride west across the bowl to the motte's flank and everything from here to
  // the spawn pad is one run: two summits, two gatehouses, a gap jump between
  // them, a banked ribbon on legs, and a straight home.
  // ===========================================================================

  // ---- the motte ------------------------------------------------------------
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

  {
    // The far drop. What "the drop" is to the motte, this is to the far peak: a
    // crest on the summit rim that fires you off the far side, here at the ribbon.
    //
    // Everything is smaller because the summit is. The far peak's platform is
    // 44 m across against the motte's 68, so the approach is 14 m rather than 26
    // and the face 6 m rather than 8 — enough to load the spring on a short run
    // without the corridor reaching back over the rim and shaving the flank you
    // just climbed.
    //
    // Lower than the drop too, at 2.4 m. The ribbon's deck sits 16 m below this lip and
    // only 12 m wide, so the useful thing here is a flat, committed launch rather
    // than maximum loft — too much height and you arrive steep, on a target with
    // no room to correct.
    kind: 'kicker',
    name: 'the far drop',
    x: -252,
    z: -40,
    // Fires -X at the ribbon's start, which sits 36 m out from the summit rim.
    yaw: MINUS_X,
    baseY: 12,
    halfWidth: 8,
    approach: 14,
    face: 'crest',
    length: 6,
    height: 2.4,
    angleDeg: 0,
    back: 4,
    landing: 5,
  },
  {
    // Land the gap jump onto the far peak, then drop off it onto this: a thin
    // ribbon curving left through 150 degrees and pointing you back at the spawn
    // area, 350 m away across the park.
    //
    // The arc is built around the far peak. It starts 58 m out from its centre —
    // clear of the peak's own skirt, so the two never fight over the same dirt —
    // which leaves a 36 m gap from the summit rim. Falling 20 m to the deck, that
    // gap needs about 22 m/s off the top, so it is a jump you have to carry speed
    // into rather than one you dribble off the edge.
    //
    // Turning *left* from a heading of -X means the arc centre sits at +Z of the
    // start, and the sweep runs from -90 to -240 degrees in atan2 terms. It ends
    // heading (0.87, 0.50), which is within about 8 degrees of pointing straight
    // at the spawn pad.
    //
    // `rideHalfWidth` 6 is the skinny dial: a 12 m ribbon, three mesh quads wide,
    // which is the narrowest that can be drawn honestly at `meshStride` 4.
    // `shoulderRatio` 1.3 is a 38 degree bank, comfortably inside both the 45
    // degree draw limit and `susp.climbSlopeDeg`.
    kind: 'causeway',
    name: 'the ribbon',
    // The arc starts 48 m out from the far peak's centre — a 26 m gap from the
    // summit rim, and just inside the peak's own skirt so the ribbon's first few
    // metres blend into the flank rather than starting as a free-standing tip.
    // Ten metres further out (the first attempt) and every launch landed *before*
    // the sweep began: at the right radius, but on desert, because the arc simply
    // was not there yet. Landing short of an arc's start reads exactly like
    // landing short of the jump.
    x: -292,
    z: -40,
    yaw: MINUS_X,
    halfWidth: 0,
    approach: 0,
    ...RIBBON,
    rideHalfWidth: 6,
    shoulderRatio: 1.3,
    // Chosen to clear the dunes the arc crosses: they swell to -7.5 across its
    // middle third, and an earlier deck of -8 to -11 was underground there, which
    // shows up as the path simply not existing rather than as a visible fault.
    startY: -4,
    endY: -6,
    exitFade: 0.18,
    minClearance: 2,
    surface: 'stone',
  },

  // ---- the run home ---------------------------------------------------------
  // The ribbon already spits you out within 8 degrees of the spawn pad, 250 m
  // away, and until now that was 250 m of nothing. Four features on that heading
  // turn the exit into a finishing straight and close the castle into a loop:
  // spawn, bowl, motte, far peak, ribbon, home.
  //
  // Positions come from `home(s)`, which is derived from the ribbon's own arc, so
  // retuning the ribbon carries the whole straight with it instead of leaving it
  // pointing at where the exit used to be.
  {
    kind: 'rollers',
    name: 'the home whoops',
    ...home(30),
    halfWidth: 9,
    // The ribbon's exit ramp comes down onto natural ground around -10 here and
    // the desert climbs to -3 over the next 100 m, so the straight is pinned
    // between the two and the whoops absorb the difference.
    baseY: -6,
    approach: 26,
    count: 5,
    spacing: 9,
    height: 1.1,
  },
  {
    kind: 'tabletop',
    name: 'the home table',
    ...home(82),
    halfWidth: 8,
    baseY: -6,
    approach: 24,
    length: 12,
    angleDeg: 30,
    exponent: 3,
    deck: 12,
    down: 10,
    runout: 26,
  },
  {
    // A step-up, the mirror of track 1's step-down: clear the pit and you keep
    // 4 m of height, which is what the last kicker then launches from. Come up
    // short and you are in the pit with the far wall to climb, arriving at the
    // finish with nothing.
    //
    // The landing is 76 m for one reason: the kicker after it needs its whole
    // run-in (16 m of approach plus the 26 m lead-in fade) to sit on level
    // plateau, or that corridor reaches back and fills this feature's own pit.
    kind: 'gap',
    name: 'the last step',
    ...home(150),
    halfWidth: 8,
    baseY: -6,
    approach: 24,
    length: 12,
    angleDeg: 26,
    exponent: 3,
    back: 8,
    pit: 12,
    pitY: -2,
    rise: 18,
    landY: 4,
    landing: 76,
  },
  {
    // The finish line, landing you beside the spawn pad 9 m below — so the last
    // thing the castle does is drop you back where the dirt track starts.
    kind: 'kicker',
    name: 'the finish',
    ...home(242),
    baseY: -2,
    halfWidth: 9,
    approach: 12,
    length: 13,
    angleDeg: 32,
    exponent: 3,
    back: 5,
    landing: 50,
  },

  // ===========================================================================
  // TRACK 3 — the ziggurat
  //
  // The only track that gains its height by *jumping*. A warm-up section on the
  // flat, six stone tiers to a summit 26 m up, the pinnacle off the top, and a
  // straight south under its shadow to finish.
  // ===========================================================================
  {
    // The warm-up, all three features of it pinned to the ziggurat's own datum so
    // the run from here to the first riser is one continuous plane.
    kind: 'kicker',
    name: 'the ziggurat kicker',
    x: 185,
    z: 320,
    yaw: SOUTH,
    halfWidth: 8,
    baseY: ZIG_Y,
    approach: 25,
    length: 11,
    angleDeg: 30,
    exponent: 3,
    back: 4,
    landing: 52,
  },
  {
    kind: 'tabletop',
    name: 'the stone table',
    x: 185,
    z: 246,
    yaw: SOUTH,
    halfWidth: 8,
    baseY: ZIG_Y,
    approach: 24,
    length: 12,
    angleDeg: 30,
    exponent: 3,
    deck: 12,
    down: 10,
    runout: 26,
  },
  {
    // Whoops rather than a jump as the last thing before the tiers, and that is
    // deliberate: a kicker here lands you *on* the first riser, which is a 40
    // degree face and the one place on this track a landing is genuinely nasty.
    // Rhythm hands you to the climb with speed instead of with a flight to time.
    //
    // The ziggurat's own approach corridor is stamped over these afterwards and
    // leaves them intact, because a corridor declines to cut into shaped dirt and
    // whoops are never below the datum.
    kind: 'rollers',
    name: 'the ziggurat whoops',
    x: 185,
    z: 186,
    yaw: SOUTH,
    halfWidth: 9,
    baseY: ZIG_Y,
    approach: 24,
    count: 4,
    spacing: 8.5,
    height: 1.15,
  },
  {
    // Six tiers, 6 m each, jumped one at a time to a summit 26 m up. The only
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
    baseY: ZIG_Y,
    approach: 40,
    surface: 'stone',
    tiers: 6,
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
    // Off the top, 26 m up, with the whole flank falling away beneath. Both the
    // position and the datum are derived from the tier count, because they are
    // the two numbers that silently stop agreeing with it.
    kind: 'kicker',
    name: 'the pinnacle',
    x: 185,
    z: 150 - (5 * (7 + 12 + 5 + 3 + 7) + 7 + 18),
    yaw: SOUTH,
    baseY: ZIG_Y + 5 * 6,
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
  {
    // Where the pinnacle puts you. A long approach rather than a landing pad,
    // because the touchdown is 100 m of desert wide depending on how much speed
    // you took off the summit with — so the corridor is sized to catch all of it
    // and the table sits at the far end of it.
    kind: 'tabletop',
    name: 'the shadow table',
    x: 185,
    z: -190,
    yaw: SOUTH,
    halfWidth: 9,
    baseY: 0,
    approach: 44,
    length: 12,
    angleDeg: 30,
    exponent: 3,
    deck: 12,
    down: 10,
    runout: 30,
  },
  {
    // The ziggurat's tail folds back west here, and everything past this point
    // exists to hand you to the dirt track rather than to stand on its own.
    //
    // An earlier version ran straight south to the rim and stopped. It rode fine
    // and it finished nowhere, which is the difference between a track and a
    // circuit: the tracks only become a lap if each one's end is somebody else's
    // beginning.
    kind: 'berm',
    name: 'the ziggurat turn',
    x: 185,
    z: -260,
    yaw: SOUTH,
    halfWidth: 0,
    approach: 0,
    ...ZIG_TURN,
    rideHalfWidth: 11,
    bankHeight: 4,
    bankRun: 14,
    innerRun: 10,
    endFade: 0.14,
    // The whole connector sits on the shadow table's datum. The desert under it
    // rolls between -4.5 and +5.4, so this is a cut through the ridge in the
    // middle and fill at both ends — the same bargain the westbound leg makes,
    // and for the same reason: a rhythm section wants one plane, not a grade.
    startY: 0,
    endY: 0,
  },
  {
    kind: 'kicker',
    name: 'the shadow kicker',
    ...beyond(ZIG_TURN, 38),
    halfWidth: 9,
    baseY: 0,
    approach: 20,
    length: 13,
    angleDeg: 32,
    exponent: 3,
    back: 5,
    landing: 42,
  },
  {
    // The slip road. Its landing runs out at (-30, -253), which is on the south
    // turn's ride line three quarters of the way through it — so the ziggurat
    // does not end near the dirt track, it joins it, and you carry whatever combo
    // you have straight onto the westbound leg.
    //
    // A double rather than a kicker because it is the last feature before a merge
    // and nothing follows it with an approach corridor: the one place in the park
    // a pit is safe from being quietly filled in.
    kind: 'gap',
    name: 'the slip road',
    ...beyond(ZIG_TURN, 105),
    halfWidth: 8,
    baseY: 0,
    approach: 24,
    length: 10,
    angleDeg: 28,
    exponent: 3,
    back: 8,
    pit: 12,
    pitY: -2.5,
    rise: 7,
    landY: 0,
    landing: 26,
  },
];

/**
 * The ride order of each track, as the line a rider actually takes.
 *
 * Written down rather than left implicit in the array order for two reasons.
 * `PARK` is a *stamping* order — it has to be, because approach corridors
 * overwrite each other — and stamping order is not always ride order. And a
 * track is a claim about flow: that landing one feature puts you on the run-up
 * to the next, close enough that the combo window has not expired. `npm run sim`
 * rides these lists and reports what a run down each one is actually worth,
 * which is the only way that claim stays true as features are retuned.
 *
 * Every feature must appear in exactly one of these or in `SIDE_FEATURES`; the
 * harness checks it, so a feature cannot be added to the park and quietly left
 * off every line through it.
 */
export const TRACKS: readonly { name: string; line: readonly string[] }[] = [
  {
    name: 'the dirt track',
    line: [
      'warmup whoops',
      'first kicker',
      'tabletop',
      'big air',
      'the gauntlet',
      'gator pond',
      'the south turn',
      'the west whoops',
      'the trench',
      'the drop-off',
      'the last kicker',
      'the far turn',
      'the hairpin table',
      'the back road',
    ],
  },
  {
    name: 'the castle',
    line: [
      'the motte',
      'the drop',
      'the far peak',
      'the far drop',
      'the ribbon',
      'the home whoops',
      'the home table',
      'the last step',
      'the finish',
    ],
  },
  {
    name: 'the ziggurat',
    line: [
      'the ziggurat kicker',
      'the stone table',
      'the ziggurat whoops',
      'the ziggurat',
      'the pinnacle',
      'the shadow table',
      'the ziggurat turn',
      'the shadow kicker',
      'the slip road',
    ],
  },
];

/**
 * Where one track hands over to the next.
 *
 * The three tracks are meant to be one lap: the ziggurat's slip road joins the
 * dirt track's westbound leg, the dirt track's back road comes up behind the
 * mounds onto the ribbon, and the castle's finish lands beside the spawn pad.
 *
 * Behind the mounds rather than at them, and that is forced rather than chosen:
 * the only rideable way into the castle from the ground is the motte's east
 * flank, and everything past it — the far peak, the ribbon — is reached by
 * jumping. A connector arriving from the south-west has nothing to join until the
 * castle comes back down to the desert, which it does at the ribbon. Each of those is a
 * claim about two things being in the same place, which drifts the moment either
 * end is retuned — so the harness measures the distance from where one line ends
 * to the nearest point of the next, and `to: null` means the spawn pad.
 */
export const HANDOVERS: readonly { from: string; to: string | null; within: number }[] = [
  { from: 'the ziggurat', to: 'the dirt track', within: 30 },
  { from: 'the dirt track', to: 'the castle', within: 40 },
  { from: 'the castle', to: null, within: 90 },
];

/**
 * Features that are deliberately *off* the main line — alternates you peel onto
 * rather than meet in sequence. Listed so the coverage check above stays strict.
 */
export const SIDE_FEATURES: readonly string[] = ['sharp kicker', 'side hip'];

/**
 * The stretches a headless autopilot can drive, and therefore the stretches the
 * flow report covers.
 *
 * The gaps are honest rather than arbitrary: climbing the motte means traversing
 * a cone at an angle chosen by eye, and jumping the tiers means timing a boost
 * off each lip. Both are ridden fine by a person and neither is expressible as
 * "steer at the next waypoint", so they are measured by their own checks instead
 * of being faked here.
 */
export const RIDEABLE: readonly { name: string; line: readonly string[] }[] = [
  { name: 'track 1, spawn to the castle', line: TRACKS[0].line },
  { name: 'track 2, the ribbon home', line: TRACKS[1].line.slice(5) },
  { name: 'track 3, the warm-up', line: TRACKS[2].line.slice(0, 3) },
  { name: 'track 3, the pinnacle out', line: TRACKS[2].line.slice(5) },
];

/**
 * Props for the gauntlet set piece.
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

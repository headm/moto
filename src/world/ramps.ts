import type { Heightfield } from './heightfield';

/**
 * Ramps as height *stamps* written into the same heightfield as the terrain, so
 * ground contact stays an O(1) sample — no meshes, no colliders, no raycasts,
 * nothing to desync.
 *
 * Stamps **mask-blend** rather than add: each one computes a target height and a
 * 0..1 weight, then `h = lerp(h, target, w)`. Adding would make a ramp inherit
 * whatever slope it sat on, so the same feature would launch differently
 * depending on where it was placed. Blending to a target levels it, which means a
 * kicker rides identically anywhere on the map.
 *
 * Every feature also carves a level **approach corridor** in front of itself, so
 * you never hit a lip off-camber.
 *
 * Face profile is `H·tⁿ`, not a smoothstep. Smoothstep flattens at t=1, which
 * kills exactly the thing a kicker exists to do; `tⁿ` is flat where it meets the
 * ground and steepest at the lip.
 *
 * The exponent is where "pop" lives. Suspension compresses at a rate set by
 * `v² × curvature`, then releases at the lip, so how hard a ramp throws you is
 * governed by the curvature it carries *at the lip* — which for `H·tⁿ` with a
 * fixed lip angle works out to `tanθ·(n−1)/L`. A long gentle parabola (n=2,
 * large L) spreads that thin; a short face with n=3 concentrates it. Same launch
 * angle, completely different kick.
 */

export interface FeatureBase {
  name: string;
  /** World position of the base of the ramp face. */
  x: number;
  z: number;
  /** Direction the feature is ridden, same convention as bike yaw. */
  yaw: number;
  halfWidth: number;
  /** Metres of level run-up carved in front of the face. */
  approach: number;
  /**
   * Pin the feature's plane to this height instead of sampling the ground under
   * its origin.
   *
   * Consecutive features otherwise each sit at their own local ground height, and
   * the step between two pads has to be absorbed by the lead-in fade — which is
   * how a 9 m difference became a 48 degree drop you land on hard, arriving at the
   * next ramp with no speed. Pinning a run of features to one datum makes the
   * whole sequence continuous.
   */
  baseY?: number;
  /**
   * Set when a feature is *meant* to be unlandable without boost. Keeps the
   * "every feature is survivable with no input" check strict for everything else
   * rather than weakening it globally to accommodate one deliberate exception.
   */
  demandsBoost?: boolean;
  /** Surface shading. Earthworks are dirt; structures are masonry. */
  surface?: 'dirt' | 'stone';
}

export interface Kicker extends FeatureBase {
  kind: 'kicker';
  /** Face length along travel. */
  length: number;
  /**
   * Slope at the lip, degrees — the launch angle for a `power` face. A `crest`
   * face is flat on top, so this is ignored there and `height` sets the size.
   */
  angleDeg: number;
  /**
   * Face shape.
   *
   * `power` (default) is `H·tⁿ`: concave all the way up, steepest at the lip. It
   * loads the suspension progressively and releases it at an angled edge.
   *
   * `crest` is `H·smoothstep(t)`: steepest in the *middle* and flat on top, so it
   * throws you off convex curvature instead of off an edge. Utterly different
   * feel — you leave nearly level, get lofted rather than angled, and the spring
   * goes to its stop on the way up. This is the shape of the back side of a
   * kicker, which is why riding one backwards is more fun than riding it forwards.
   */
  face?: 'power' | 'crest';
  /**
   * Explicit lip height. Required for `crest` faces (there is no lip angle to
   * derive it from); an override for `power` faces.
   */
  height?: number;
  /**
   * Face profile exponent. 2 is a mellow parabola with curvature spread evenly;
   * 3+ stacks the curvature at the lip for a sharp, poppy launch off a shorter,
   * lower ramp. Defaults to 2.
   */
  exponent?: number;
  /** Length of the back side, which descends from the lip to ground level. */
  back: number;
  /** Level landing area carved past the back side. */
  landing: number;
}

/**
 * Take-off, a **void**, then a landing at whatever height you like. One shape
 * covering the whole `stepUp` / `stepDown` / double family from §5 of the plan,
 * because they differ only in where the far side sits:
 *
 * - **double** — `pitY` dug below the datum, `landY` back at it. Clear it and
 *   nothing happens; come up short and you drop into the pit and grind out of it.
 * - **step-up** — `landY` above the datum. Clear it and you *keep* the height for
 *   whatever comes next, which is the only way a straight gains altitude without
 *   a climb.
 * - **step-down** — `landY` below it. Same jump, far more air, and the landing
 *   arrives while you are still going up.
 *
 * The pit is what separates this from a tabletop. A tabletop's deck is level at
 * lip height, so coming up short is a non-event — that is what makes it the
 * friendly shape. Here the far wall (`rise`) is pointing at you, and the same
 * currency the rest of the game uses applies: no reset, just the speed you lose
 * climbing out.
 */
export interface Gap extends FeatureBase {
  kind: 'gap';
  /** Take-off face, same profile family as a kicker. */
  length: number;
  angleDeg: number;
  exponent?: number;
  face?: 'power' | 'crest';
  height?: number;
  /** Back side of the take-off, descending to the pit floor. */
  back: number;
  /** Level void between the two sides, and how far below the datum it sits. */
  pit: number;
  pitY: number;
  /** Face climbing out of the pit to the landing plateau. */
  rise: number;
  /** Landing plateau height relative to the datum, and its level extent. */
  landY: number;
  landing: number;
}

export interface Tabletop extends FeatureBase {
  kind: 'tabletop';
  length: number;
  angleDeg: number;
  exponent?: number;
  /** Flat deck at lip height. Clear it, or land on it — both are survivable. */
  deck: number;
  /** Landing ramp descending from deck height back to ground. */
  down: number;
  /** Level runout past the landing. */
  runout: number;
}

/**
 * A water hazard. Carves a basin and registers a water body, so coming up short
 * costs you almost all your speed instead of ending the run — the same "lose
 * momentum, never reset" rule the landing bands follow.
 */
export interface Pond extends FeatureBase {
  kind: 'pond';
  /** Extent along travel. `halfWidth` is the extent across it. */
  length: number;
  depth: number;
  /** How far the water surface sits below the surrounding ground. */
  freeboard: number;
}

export interface Rollers extends FeatureBase {
  kind: 'rollers';
  count: number;
  spacing: number;
  height: number;
}

/**
 * A motte: a conical mound with a flat summit, ridden by traversing up its flank.
 *
 * The surface is a **cone**, not a spiral ramp, and that is forced rather than
 * chosen. A heightfield stores one height per point, so the surface cannot gain
 * height around a closed loop: ride a terrace at constant radius through a full
 * revolution and you arrive back at the same (x, z), which must be the same
 * height. The climb has to be given back somewhere.
 *
 * Building it as a helicoid made that concrete and unrideable — concentric
 * terraces separated by risers of `height / turns` that the bike simply fell off,
 * orbiting forever without ever summiting. Along a real spiral's centre-line the
 * height depends only on *radius*, which is a cone. So the cone is the honest
 * form, and the spiral is a *line across it* rather than built geometry — marked
 * by the banners, and taken because traversing keeps your speed where charging
 * straight up does not.
 *
 * `turns` and `entryAngle` therefore describe the suggested route for the props,
 * not the surface. Flank slope is `height / (outer - inner)`; keep it under about
 * 25 degrees or a direct assault stops being possible at all.
 */
export interface Motte extends FeatureBase {
  kind: 'motte';
  /** Where the ramp meets the ground, at the entry. */
  outerRadius: number;
  /** Flat summit platform radius. */
  innerRadius: number;
  /** Summit height above the base. */
  height: number;
  /** Turns of the suggested spiral line, for banner placement. */
  turns: number;
  /**
   * Where the entry sits around the mound, as an **atan2(dz, dx) angle** — 0 is
   * the +X side, PI/2 the +Z side. Deliberately *not* the yaw convention used
   * elsewhere: yaw measures from +Z toward +X, atan2 from +X toward +Z, and the
   * two differ by PI/2. Mixing them silently rotates the whole structure.
   */
  entryAngle: number;
  /** Outer wall taper. Short reads as masonry; long reads as a hill. */
  skirt: number;
  /**
   * Terrace the flank into this many banks, each ending in a crest that throws
   * you. 0 leaves a smooth cone.
   *
   * Implemented as a sine superimposed on the cone rather than as hard steps, and
   * that is deliberate: hard steps on a flank this steep produce risers narrower
   * than a mesh quad, which draw as vertical fins. A sine with the right amplitude
   * flattens the treads and doubles the bank slope while staying smooth, so it
   * terraces without any cliff to draw. The endpoints are untouched, so the outer
   * edge and the summit rim stay where the cone put them.
   */
  steps?: number;
  /**
   * How hard the terracing bites. 1 exactly flattens each tread; above 1 the
   * treads tip back slightly, which gives each bank a lip to launch from.
   */
  stepStrength?: number;
}

/**
 * A stepped monument you jump *up*, one tier at a time: platform, crest kicker,
 * void, then the front face of the next tier `rise` metres higher.
 *
 * The rideable stairway is unavoidably shallow. Each tier needs horizontal run to
 * be jumpable, and the height a single jump can gain is capped by how much the
 * suspension can throw at the speed a short platform allows — so the along-axis
 * profile can never be steeper than about 10 degrees overall. The *monument* read
 * therefore comes from the cross-section: `halfWidth` is the whole block, stepped
 * and stone-shaded, and `rampHalfWidth` is the narrow stairway cut up the middle
 * of it. Viewed from the side it is a terraced platform; ridden, it is a stairway.
 *
 * Note what the riser can and cannot do. The bike climbs anything up to roughly 60
 * degrees, and a face steeper than about 45 degrees cannot be drawn at all at this
 * mesh resolution — so a riser can never be a hard gate. It is a **momentum** gate
 * instead, which is the rule the rest of the game already follows: clear the tier
 * and you keep everything, come up short and you grind up a 35 degree face having
 * lost your flow. Same currency as water and as a bad landing.
 */
export interface Staircase extends FeatureBase {
  kind: 'staircase';
  tiers: number;
  /** Height gained per tier. */
  rise: number;
  /** Front face of each tier. Steep, but wide enough for the mesh to draw. */
  riserLength: number;
  /** Flat run on each tier, before its kicker. */
  platform: number;
  /** Crest kicker at the end of each tier, and its back side. */
  lipLength: number;
  lipHeight: number;
  back: number;
  /** Void between one tier's kicker and the next tier's face. */
  gap: number;
  /**
   * Half-width of the rideable stairway. `halfWidth` is the whole block; outside
   * the stairway the surface is plain stepped terrace with no kickers or voids.
   */
  rampHalfWidth: number;
  /** Flat platform on the top tier. */
  summit: number;
}

/**
 * A curved elevated ribbon: jumped onto, ridden round, and ridden off.
 *
 * The shoulder is **derived from the deck's height above the ground it crosses**,
 * not authored. That is the whole trick, and it comes from two limits this engine
 * imposes: terrain collides at 1 m cells but renders at `meshStride` 4, so a face
 * steeper than about 45 degrees is drawn as something other than what the bike
 * hits; and past `susp.climbSlopeDeg` the suspension's vertical push is faded out
 * to stop walls acting as trampolines. Tying the shoulder to the height keeps
 * every cross-section inside both limits automatically, and gives the shape for
 * free: a broad embankment where it leaves the motte high up, tapering to a thin
 * ribbon as it descends. Authoring a fixed width instead would either be
 * undrawable at the high end or absurdly wide at the low one.
 *
 * The arc is swept from `startAngle` to `endAngle` in **atan2(dz, dx)** terms —
 * the same convention as `Motte.entryAngle`, and deliberately not the yaw
 * convention, which differs by PI/2.
 */
export interface Causeway extends FeatureBase, Arc {
  kind: 'causeway';
  /** Half-width of the level rideable ribbon. This is the "skinny" dial. */
  rideHalfWidth: number;
  /**
   * Shoulder run as a multiple of the deck's height above local ground. 1 is a
   * 45 degree bank — the absolute limit of what the mesh can draw. Above that is
   * shallower and safer.
   */
  shoulderRatio: number;
  /** Deck height at the start of the sweep, and at the end. */
  startY: number;
  endY: number;
  /** Fraction of the sweep over which the deck fades down to meet the desert. */
  exitFade: number;
  /**
   * Floor on how far the deck sits above whatever ground it crosses.
   *
   * The stamp only ever raises, so anywhere the desert rises above the authored
   * deck the ribbon simply is not there — a hole in the path rather than a visible
   * fault. The dunes under this arc swell by 6 m across its middle third and did
   * exactly that. Lifting the deck to clear them fixes it for this terrain; this
   * keeps it fixed if the terrain is ever reseeded.
   */
  minClearance: number;
}

/**
 * A banked turn: the thing that makes a *track* out of a straight strip.
 *
 * Swept along an arc like a causeway, but carved rather than raised — the ride
 * line is levelled onto a datum and the ground *outside* it is banked up, so the
 * faster you enter the higher up the bank you ride and the more of the corner the
 * geometry does for you. Nothing enforces the line: fall off the top of the bank
 * and you are on open desert, drop to the bottom and you scrub speed on the flat.
 *
 * The bank profile is `h · (u/run)^1.7` rather than a straight wedge. A constant
 * slope makes riding higher no different from riding low; a face that steepens
 * with height gives the corner a lip to lean on and, at the very top, an edge to
 * jump off — which is the second thing a berm is for.
 *
 * `startY` / `endY` let the turn also be the climb or the descent between two
 * straights sitting at different datums. Spread over an arc, a step that would be
 * a wall on a lead-in fade becomes a grade you barely notice.
 *
 * Angles are **atan2(dz, dx)**, the same convention as `Motte.entryAngle` and
 * `Causeway` — not the yaw convention, which differs by PI/2.
 */
export interface Berm extends FeatureBase, Arc {
  kind: 'berm';
  /** Half-width of the level band, centred on `radius`. */
  rideHalfWidth: number;
  /** The bank outside the ride line: how high it gets, and over what run. */
  bankHeight: number;
  bankRun: number;
  /** How far inside the ride line the level band runs before it fades out. */
  innerRun: number;
  /** Datum at the entry and at the exit; the turn ramps between them. */
  startY?: number;
  endY?: number;
  /** Fraction of the sweep the stamp fades in over at each end. */
  endFade: number;
}

export type Feature =
  | Kicker
  | Gap
  | Tabletop
  | Rollers
  | Pond
  | Motte
  | Staircase
  | Causeway
  | Berm;

/** The two arc-swept features share a centreline, so they share this. */
export interface Arc {
  cx: number;
  cz: number;
  radius: number;
  startAngle: number;
  endAngle: number;
}

/** Where an arc's centreline is at sweep fraction `t`, and which way it runs. */
export function arcPoint(f: Arc, t: number): { x: number; z: number; yaw: number } {
  const a = f.startAngle + (f.endAngle - f.startAngle) * t;
  // Tangent of the arc, converted from atan2 terms into the yaw convention.
  const dir = f.endAngle > f.startAngle ? 1 : -1;
  return {
    x: f.cx + Math.cos(a) * f.radius,
    z: f.cz + Math.sin(a) * f.radius,
    // forward = (sin yaw, cos yaw), and the arc's tangent is dir * (-sin a, cos a).
    yaw: Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir),
  };
}

/**
 * Lip height that produces the requested launch angle. For h = H·tⁿ the lip slope
 * is nH/L, so H = L·tanθ/n — meaning a sharper exponent gives a *lower* ramp for
 * the same launch angle, which also costs less speed to climb.
 */
export function lipHeight(length: number, angleDeg: number, exponent = 2): number {
  return (length * Math.tan((angleDeg * Math.PI) / 180)) / exponent;
}

/** Everything with a take-off face, which is everything the validator rides. */
export type Jump = Kicker | Gap | Tabletop;

export function featureLipHeight(f: Jump): number {
  if ('height' in f && f.height !== undefined) return f.height;
  return lipHeight(f.length, f.angleDeg, f.exponent ?? 2);
}

/**
 * Face curvature at the lip — the number that predicts pop. Multiply by v² for
 * the upward acceleration the ramp demands; anything far above gravity throws the
 * bike hard and works the suspension to its stop on the way.
 */
export function lipCurvature(f: Jump): number {
  if (f.kind !== 'tabletop' && f.face === 'crest') {
    // A smoothstep crest is *convex* at the top: h'' = -6H/L². You are thrown
    // because the ground drops away faster than gravity can follow, which is the
    // same criterion as terrain launchability rather than a spring release.
    return (6 * featureLipHeight(f)) / (f.length * f.length);
  }
  const n = f.exponent ?? 2;
  return (Math.tan((f.angleDeg * Math.PI) / 180) * (n - 1)) / f.length;
}

/** Ideal range for a launch at this angle and speed, returning to launch height. */
export function launchRange(angleDeg: number, speed: number, gravity: number): number {
  const th = (angleDeg * Math.PI) / 180;
  return (speed * speed * Math.sin(2 * th)) / gravity;
}

function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Wrap to (-PI, PI]. Local copy: world code does not depend on bike code. */
function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Surface height of a motte above its base. Radial only — see the type comment. */
function motteHeight(f: Motte, r: number): number {
  if (r <= f.innerRadius) return f.height;
  if (r >= f.outerRadius) return 0;

  const span = f.outerRadius - f.innerRadius;
  const inward = f.outerRadius - r;
  // Linear base, so the flank has one average slope to judge and traverse.
  const cone = (f.height * inward) / span;

  const steps = f.steps ?? 0;
  if (steps <= 0) return cone;

  // Amplitude chosen so the ripple's peak slope exactly equals the cone's: at
  // strength 1 the treads come out flat and the banks come out twice as steep.
  const wavelength = span / steps;
  const grade = f.height / span;
  const amp = ((grade * wavelength) / (2 * Math.PI)) * (f.stepStrength ?? 1);
  return cone + amp * Math.sin((2 * Math.PI * inward) / wavelength);
}

/** One tier's worth of length, for every tier except the last. */
function staircaseCell(f: Staircase): number {
  return f.riserLength + f.platform + f.lipLength + f.back + f.gap;
}

/** The block's terrace level — no kickers, no voids. Everything off the stairway. */
function staircaseBlock(f: Staircase, u: number): number {
  if (u <= 0) return 0;
  const cell = staircaseCell(f);
  const i = Math.min(f.tiers - 1, Math.floor(u / cell));
  const local = u - i * cell;
  const tierY = i * f.rise;
  const belowY = i === 0 ? 0 : (i - 1) * f.rise;
  if (local < f.riserLength) {
    return belowY + (tierY - belowY) * smoothstep01(local / f.riserLength);
  }
  return tierY;
}

/** Height above base along a staircase, at distance `u` from its origin. */
function staircaseHeight(f: Staircase, u: number): number {
  if (u <= 0) return 0;
  const cell = staircaseCell(f);
  const i = Math.min(f.tiers - 1, Math.floor(u / cell));
  const local = u - i * cell;
  const tierY = i * f.rise;
  const belowY = i === 0 ? 0 : (i - 1) * f.rise;

  if (local < f.riserLength) {
    const t = local / f.riserLength;
    return belowY + (tierY - belowY) * smoothstep01(t);
  }
  let o = f.riserLength;

  // The top tier is a summit platform rather than another kicker.
  if (i === f.tiers - 1) return tierY;

  if (local < o + f.platform) return tierY;
  o += f.platform;
  if (local < o + f.lipLength) {
    const t = (local - o) / f.lipLength;
    return tierY + f.lipHeight * smoothstep01(t);
  }
  o += f.lipLength;
  if (local < o + f.back) {
    const t = (local - o) / f.back;
    return tierY + f.lipHeight * (1 - smoothstep01(t));
  }
  // The void: still at this tier's height, so you fly over it and the next tier's
  // face is what you have to clear.
  return tierY;
}

/** Total distance a feature occupies past its origin. */
export function featureLength(f: Feature): number {
  switch (f.kind) {
    case 'kicker':
      return f.length + f.back + f.landing;
    case 'gap':
      return f.length + f.back + f.pit + f.rise + f.landing;
    case 'tabletop':
      return f.length + f.deck + f.down + f.runout;
    case 'rollers':
      return f.count * f.spacing;
    case 'pond':
      return f.length;
    case 'motte':
      return f.outerRadius + f.skirt;
    case 'causeway':
    case 'berm':
      return f.radius * Math.abs(f.endAngle - f.startAngle);
    case 'staircase':
      return (f.tiers - 1) * staircaseCell(f) + f.riserLength + f.summit;
  }
}

/**
 * Height above the feature's base plane at distance `u` along travel.
 * `u` is negative through the approach corridor, which is simply level.
 */
function profile(f: Feature, u: number, v: number): number {
  if (u <= 0) return 0;

  switch (f.kind) {
    case 'kicker': {
      const H = featureLipHeight(f);
      if (u <= f.length) {
        const t = u / f.length;
        return f.face === 'crest' ? H * smoothstep01(t) : H * Math.pow(t, f.exponent ?? 2);
      }
      if (u <= f.length + f.back) {
        // Back side, in case you don't clear the lip. Smooth at both ends so
        // there's no edge to catch.
        const t = (u - f.length) / f.back;
        return H * (1 - smoothstep01(t));
      }
      return 0;
    }

    case 'gap': {
      const H = featureLipHeight(f);
      if (u <= f.length) {
        const t = u / f.length;
        return f.face === 'crest' ? H * smoothstep01(t) : H * Math.pow(t, f.exponent ?? 2);
      }
      let o = f.length;
      if (u <= o + f.back) {
        // Back side, down into the pit rather than back to the datum.
        const t = (u - o) / f.back;
        return f.pitY + (H - f.pitY) * (1 - smoothstep01(t));
      }
      o += f.back;
      if (u <= o + f.pit) return f.pitY;
      o += f.pit;
      if (u <= o + f.rise) {
        // The far wall. Smoothstepped, so its top rolls over into the plateau and
        // a landing arriving a little short still meets dirt going the right way.
        const t = (u - o) / f.rise;
        return f.pitY + (f.landY - f.pitY) * smoothstep01(t);
      }
      return f.landY;
    }

    case 'tabletop': {
      const H = featureLipHeight(f);
      if (u <= f.length) {
        const t = u / f.length;
        return H * Math.pow(t, f.exponent ?? 2);
      }

      if (u <= f.length + f.deck) return H;
      if (u <= f.length + f.deck + f.down) {
        // Landing ramp: gentle at the deck edge, steepest in the middle where
        // the arc actually arrives, easing flat into the runout.
        const t = (u - f.length - f.deck) / f.down;
        return H * (1 - smoothstep01(t));
      }
      return 0;
    }

    case 'rollers': {
      const span = f.count * f.spacing;
      if (u >= span) return 0;
      return f.height * 0.5 * (1 - Math.cos((2 * Math.PI * u) / f.spacing));
    }

    case 'motte':
      // Radial, so it never uses the corridor path; applyMotte handles it.
      return 0;

    case 'causeway':
    case 'berm':
      // Swept along an arc, so these have their own paths too.
      return 0;

    case 'staircase':
      // The stairway only exists up the middle; the rest is terraced block.
      return Math.abs(v) <= f.rampHalfWidth ? staircaseHeight(f, u) : staircaseBlock(f, u);

    case 'pond': {
      if (u >= f.length) return 0;
      // Eased in both axes so the banks are rideable rather than a pit you cannot
      // climb out of — but not too eased. The water surface is only the part of the
      // basin that lies below the water line, so generous easing shrinks the
      // *visible* pond well inside its nominal footprint.
      const t = u / f.length;
      const along = smoothstep01(Math.min(1, Math.min(t, 1 - t) / 0.16));
      const across = smoothstep01(Math.min(1, (1 - Math.abs(v) / f.halfWidth) / 0.18));
      return -f.depth * along * across;
    }
  }
}

/**
 * Blend widths, in metres. These must span several *mesh* quads, not several
 * heightfield cells: at `meshStride` 4 the rendered quads are 4 m, so a 3 m fade
 * is narrower than one quad and cannot be represented — it renders as a cliff
 * along the edge of the corridor instead of a slope.
 */
const LATERAL_FADE = 14;
const END_FADE = 8;
/**
 * The lead-in at the mouth of an approach, which is where a pad meets whatever
 * came before it. Much longer than END_FADE because any height difference between
 * consecutive pads gets absorbed here: over 8 m a 3.5 m step is a 24 degree wall,
 * over 26 m it is a gentle 8 degree ramp that costs no speed.
 */
const APPROACH_FADE = 26;

/**
 * How far the trailing flat blends back into natural ground.
 *
 * Without this a landing levelled to the feature's origin height stands proud of
 * terrain that falls away — the whole strip becomes a raised causeway with cliff
 * edges. Tapering the *weight* rather than the target means the near part of the
 * landing, where the bike actually touches down, stays level and predictable,
 * while the far end reconnects to the hillside.
 */
function tailFade(f: Feature): number {
  switch (f.kind) {
    // Kept to a minority of the landing on purpose. A ramp kicks harder than an
    // ideal projectile — the suspension releases at the lip, so measured apex runs
    // well above what `launchRange` predicts — and the level part has to cover the
    // real range, or the bike touches down on the taper and reads off-angle.
    case 'kicker':
      return f.landing * 0.38;
    case 'gap':
      return f.landing * 0.38;
    case 'tabletop':
      return f.runout * 0.5;
    case 'rollers':
      return END_FADE;
    case 'pond':
      return f.length * 0.2;
    case 'motte':
      return END_FADE;
    case 'causeway':
    case 'berm':
      return END_FADE;
    case 'staircase':
      return END_FADE;
  }
}

/**
 * Stamp one feature. Reads the untouched terrain height at the origin first, so
 * the whole feature — approach, face, landing — sits on one level plane.
 */
/** Stamp a motte. Radial rather than corridor-shaped, so it has its own path. */
function applyMotte(hf: Heightfield, f: Motte) {
  const base = f.baseY ?? hf.height(f.x, f.z);
  const outer = f.outerRadius + f.skirt;
  const { res, cell, half, data, mark } = hf;

  const i0 = Math.max(0, Math.floor((f.x - outer + half) / cell));
  const i1 = Math.min(res - 1, Math.ceil((f.x + outer + half) / cell));
  const j0 = Math.max(0, Math.floor((f.z - outer + half) / cell));
  const j1 = Math.min(res - 1, Math.ceil((f.z + outer + half) / cell));

  for (let j = j0; j <= j1; j++) {
    const wz = -half + j * cell;
    for (let i = i0; i <= i1; i++) {
      const wx = -half + i * cell;
      const dx = wx - f.x;
      const dz = wz - f.z;
      const r = Math.hypot(dx, dz);
      if (r > outer) continue;

      let h = motteHeight(f, r);
      let w = 1;
      if (r > f.outerRadius) {
        // Skirt: the cone already reaches zero at outerRadius, so this only fades
        // the stamp out into whatever the surrounding ground is doing.
        const t = (r - f.outerRadius) / f.skirt;
        w = 1 - smoothstep01(t);
        h = 0;
      }

      const k = j * res + i;
      const target = base + h;
      // Mottes compose by *max*, not by replacement. Two overlapping cones then
      // form one massif with a natural saddle between their peaks, which is the
      // only way to get two summits close enough to jump between: a launch off one
      // reaches barely past its own outer edge, nowhere near a separate mound.
      // Replacement would have the second cone carve a bite out of the first.
      if (w >= 1) {
        if (target > data[k]) data[k] = target;
      } else {
        const blended = Math.max(data[k], target);
        data[k] += (blended - data[k]) * w;
      }
      // 2 = masonry, shaded as stone rather than as worked dirt.
      if (w > 0.45 && h > 0.5) mark[k] = 2;
    }
  }
}

/**
 * Stamp a causeway. Swept along an arc rather than down a corridor.
 *
 * Only ever *raises* ground. A ribbon crossing a dune higher than its own deck
 * would otherwise cut a trench through it, which reads as a slot rather than as a
 * path on legs — and, worse, would leave the trench walls vertical.
 */
function applyCauseway(hf: Heightfield, f: Causeway) {
  const { res, cell, half, data, mark } = hf;
  const sweep = f.endAngle - f.startAngle;

  // Bound the work to the arc's annulus plus the widest shoulder it could throw.
  const maxLift = Math.max(f.startY, f.endY) + 40;
  const reach = f.rideHalfWidth + maxLift * f.shoulderRatio;
  const outer = f.radius + reach;

  const i0 = Math.max(0, Math.floor((f.cx - outer + half) / cell));
  const i1 = Math.min(res - 1, Math.ceil((f.cx + outer + half) / cell));
  const j0 = Math.max(0, Math.floor((f.cz - outer + half) / cell));
  const j1 = Math.min(res - 1, Math.ceil((f.cz + outer + half) / cell));

  for (let j = j0; j <= j1; j++) {
    const wz = -half + j * cell;
    for (let i = i0; i <= i1; i++) {
      const wx = -half + i * cell;
      const dx = wx - f.cx;
      const dz = wz - f.cz;
      const r = Math.hypot(dx, dz);
      if (r < f.radius - reach || r > outer) continue;

      // Where along the sweep this cell sits. Wrapped, so the arc may cross PI.
      const t = wrapAngle(Math.atan2(dz, dx) - f.startAngle) / sweep;
      if (t < 0 || t > 1) continue;

      const k = j * res + i;
      const ground = data[k];

      let deck = Math.max(f.startY + (f.endY - f.startY) * t, ground + f.minClearance);
      // Ride off the end onto the desert rather than off a cliff.
      if (t > 1 - f.exitFade) {
        const e = (t - (1 - f.exitFade)) / f.exitFade;
        deck += (ground - deck) * smoothstep01(e);
      }

      const lift = deck - ground;
      if (lift <= 0) continue;

      const u = Math.abs(r - f.radius);
      const shoulder = lift * f.shoulderRatio;
      let target: number;
      if (u <= f.rideHalfWidth) {
        target = deck;
      } else if (u <= f.rideHalfWidth + shoulder) {
        // Straight bank down to whatever the ground is doing, so the drawn slope
        // is exactly `1 / shoulderRatio` and never steeper.
        target = deck - lift * ((u - f.rideHalfWidth) / shoulder);
      } else {
        continue;
      }

      if (target > data[k]) data[k] = target;
      if (target - ground > 0.5) mark[k] = f.surface === 'dirt' ? 1 : 2;
    }
  }
}

/**
 * Stamp a berm. Carved rather than raised: the ride line is *replaced* with a
 * level band on the datum, and the bank grows out of the ground outside it.
 *
 * Replacement, not max, is the point. A turn has to be level under the wheels
 * whatever it is crossing, or the line through it changes with the dune it
 * happens to sit on — the same reason every other stamp blends to a target
 * rather than adding to one.
 */
function applyBerm(hf: Heightfield, f: Berm) {
  const { res, cell, half, data, mark } = hf;
  const sweep = f.endAngle - f.startAngle;

  const start = arcPoint(f, 0);
  const startY = f.startY ?? f.baseY ?? hf.height(start.x, start.z);
  const endY = f.endY ?? startY;

  const outward = f.rideHalfWidth + f.bankRun + LATERAL_FADE;
  const inward = f.rideHalfWidth + f.innerRun + LATERAL_FADE;
  const outer = f.radius + outward;

  const i0 = Math.max(0, Math.floor((f.cx - outer + half) / cell));
  const i1 = Math.min(res - 1, Math.ceil((f.cx + outer + half) / cell));
  const j0 = Math.max(0, Math.floor((f.cz - outer + half) / cell));
  const j1 = Math.min(res - 1, Math.ceil((f.cz + outer + half) / cell));

  for (let j = j0; j <= j1; j++) {
    const wz = -half + j * cell;
    for (let i = i0; i <= i1; i++) {
      const wx = -half + i * cell;
      const dx = wx - f.cx;
      const dz = wz - f.cz;
      const r = Math.hypot(dx, dz);
      if (r < f.radius - inward || r > outer) continue;

      const t = wrapAngle(Math.atan2(dz, dx) - f.startAngle) / sweep;
      if (t < 0 || t > 1) continue;

      // Signed offset from the ride line: positive is outward, up the bank.
      const u = r - f.radius;
      const deck = startY + (endY - startY) * t;

      let target = deck;
      let lat = 1;
      if (u > f.rideHalfWidth) {
        const b = u - f.rideHalfWidth;
        // Steepening with height, so the top of the bank is a lip rather than the
        // same slope you were already on. Held flat past `bankRun` so the fade has
        // level ground to blend from instead of a ridge.
        target = deck + f.bankHeight * Math.pow(Math.min(1, b / f.bankRun), 1.7);
        if (b > f.bankRun) lat = 1 - smoothstep01((b - f.bankRun) / LATERAL_FADE);
      } else if (u < -f.rideHalfWidth) {
        const b = -u - f.rideHalfWidth;
        if (b > f.innerRun) lat = 1 - smoothstep01((b - f.innerRun) / LATERAL_FADE);
      }

      // Both ends fade, because a berm has a straight on either side of it and
      // neither one is its own approach corridor.
      let lon = 1;
      if (t < f.endFade) lon = smoothstep01(t / f.endFade);
      else if (t > 1 - f.endFade) lon = smoothstep01((1 - t) / f.endFade);

      const w = lat * lon;
      if (w <= 0.001) continue;

      const k = j * res + i;
      data[k] += (target - data[k]) * w;
      if (w > 0.45) mark[k] = f.surface === 'stone' ? 2 : 1;
    }
  }
}

export function applyFeature(hf: Heightfield, f: Feature) {
  if (f.kind === 'motte') {
    applyMotte(hf, f);
    return;
  }

  if (f.kind === 'causeway') {
    applyCauseway(hf, f);
    return;
  }

  if (f.kind === 'berm') {
    applyBerm(hf, f);
    return;
  }


  const base = f.baseY ?? hf.height(f.x, f.z);

  if (f.kind === 'pond') {
    // Registered before the dig, so the level is measured against the original
    // ground rather than the hole about to be cut into it.
    hf.waters.push({
      x: f.x + Math.sin(f.yaw) * (f.length / 2),
      z: f.z + Math.cos(f.yaw) * (f.length / 2),
      yaw: f.yaw,
      halfLength: f.length / 2,
      halfWidth: f.halfWidth,
      level: base - f.freeboard,
    });
  }

  const fwdX = Math.sin(f.yaw);
  const fwdZ = Math.cos(f.yaw);
  const rightX = -Math.cos(f.yaw);
  const rightZ = Math.sin(f.yaw);

  const uMin = -f.approach - APPROACH_FADE;
  const uMax = featureLength(f) + END_FADE;
  const vMax = f.halfWidth + LATERAL_FADE;

  // World AABB of the rotated footprint.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const u of [uMin, uMax]) {
    for (const v of [-vMax, vMax]) {
      const wx = f.x + fwdX * u + rightX * v;
      const wz = f.z + fwdZ * u + rightZ * v;
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wz < minZ) minZ = wz;
      if (wz > maxZ) maxZ = wz;
    }
  }

  const { res, cell, half, data, mark } = hf;
  const i0 = Math.max(0, Math.floor((minX + half) / cell));
  const i1 = Math.min(res - 1, Math.ceil((maxX + half) / cell));
  const j0 = Math.max(0, Math.floor((minZ + half) / cell));
  const j1 = Math.min(res - 1, Math.ceil((maxZ + half) / cell));

  for (let j = j0; j <= j1; j++) {
    const wz = -half + j * cell;
    for (let i = i0; i <= i1; i++) {
      const wx = -half + i * cell;

      const dx = wx - f.x;
      const dz = wz - f.z;
      const u = dx * fwdX + dz * fwdZ;
      const v = dx * rightX + dz * rightZ;

      if (u < uMin || u > uMax) continue;

      const av = Math.abs(v);
      if (av > vMax) continue;

      // Full weight across the width, fading at the edges and the two ends.
      const lat = av <= f.halfWidth ? 1 : 1 - smoothstep01((av - f.halfWidth) / LATERAL_FADE);
      let lon = 1;
      if (u < -f.approach) {
        lon = 1 - smoothstep01((-f.approach - u) / APPROACH_FADE);
      } else {
        const total = featureLength(f);
        const tail = tailFade(f);
        const fadeStart = total - tail;
        if (u > fadeStart) lon = 1 - smoothstep01((u - fadeStart) / (tail + END_FADE));
      }

      const w = lat * lon;
      if (w <= 0.001) continue;

      const target = base + profile(f, u, v);
      const k = j * res + i;

      // An approach corridor levels the run-in, and it may cut into natural
      // terrain to do it. What it must never do is cut into dirt another feature
      // has already shaped: approaches reach a long way back (approach length plus
      // the 26 m lead-in), so without this guard each feature quietly flattens the
      // tail of the one before it. That had erased most of a tabletop's face —
      // 2.31 m of lip reduced to 0.45 m — and part of the whoops, which reads as
      // dead space where a jump used to be.
      // Any shaped surface, not just worked dirt: the motte marks itself as
      // masonry, and checking only for dirt let a summit ramp's approach cut a
      // channel straight through the spiral below it.
      if (u < 0 && mark[k] !== 0 && data[k] > target) continue;

      data[k] += (target - data[k]) * w;
      // Marked cells are shaded as groomed dirt, which is what makes a feature
      // visible against open desert before there are any props to signpost it.
      if (w > 0.45) mark[k] = f.surface === 'stone' ? 2 : 1;
    }
  }
}

export function applyPark(hf: Heightfield, park: readonly Feature[]) {
  for (const f of park) applyFeature(hf, f);
  // The spawn pad is levelled during terrain generation, before any of this ran.
  // A feature pinned with `baseY` can raise the ground under the spawn, and the
  // bike would then start buried in it.
  hf.spawn.y = hf.height(hf.spawn.x, hf.spawn.z);
}

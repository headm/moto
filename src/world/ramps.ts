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
}

export type Feature = Kicker | Tabletop | Rollers | Pond | Motte;

/**
 * Lip height that produces the requested launch angle. For h = H·tⁿ the lip slope
 * is nH/L, so H = L·tanθ/n — meaning a sharper exponent gives a *lower* ramp for
 * the same launch angle, which also costs less speed to climb.
 */
export function lipHeight(length: number, angleDeg: number, exponent = 2): number {
  return (length * Math.tan((angleDeg * Math.PI) / 180)) / exponent;
}

export function featureLipHeight(f: Kicker | Tabletop): number {
  if ('height' in f && f.height !== undefined) return f.height;
  return lipHeight(f.length, f.angleDeg, f.exponent ?? 2);
}

/**
 * Face curvature at the lip — the number that predicts pop. Multiply by v² for
 * the upward acceleration the ramp demands; anything far above gravity throws the
 * bike hard and works the suspension to its stop on the way.
 */
export function lipCurvature(f: Kicker | Tabletop): number {
  if (f.kind === 'kicker' && f.face === 'crest') {
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

/** Surface height of a motte above its base. Radial only — see the type comment. */
function motteHeight(f: Motte, r: number): number {
  if (r <= f.innerRadius) return f.height;
  if (r >= f.outerRadius) return 0;
  const t = (f.outerRadius - r) / (f.outerRadius - f.innerRadius);
  // Linear, so the flank has one constant slope to judge and traverse. An eased
  // profile would make the middle half again as steep as the average.
  return f.height * t;
}

/** Total distance a feature occupies past its origin. */
function featureLength(f: Feature): number {
  switch (f.kind) {
    case 'kicker':
      return f.length + f.back + f.landing;
    case 'tabletop':
      return f.length + f.deck + f.down + f.runout;
    case 'rollers':
      return f.count * f.spacing;
    case 'pond':
      return f.length;
    case 'motte':
      return f.outerRadius + f.skirt;
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
    case 'tabletop':
      return f.runout * 0.5;
    case 'rollers':
      return END_FADE;
    case 'pond':
      return f.length * 0.2;
    case 'motte':
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
      data[k] += (target - data[k]) * w;
      // 2 = masonry, shaded as stone rather than as worked dirt.
      if (w > 0.45) mark[k] = 2;
    }
  }
}

export function applyFeature(hf: Heightfield, f: Feature) {
  if (f.kind === 'motte') {
    applyMotte(hf, f);
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
      if (w > 0.45) mark[k] = 1;
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

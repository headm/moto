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
 * Face profile is `H·t²`, not a smoothstep. Smoothstep flattens at t=1, which
 * kills exactly the thing a kicker exists to do; `t²` is a parabola — flat where
 * it meets the ground, steepest at the lip.
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
}

export interface Kicker extends FeatureBase {
  kind: 'kicker';
  /** Face length along travel. */
  length: number;
  /** Slope at the lip, degrees — this is the launch angle. */
  angleDeg: number;
  /** Length of the back side, which descends from the lip to ground level. */
  back: number;
  /** Level landing area carved past the back side. */
  landing: number;
}

export interface Tabletop extends FeatureBase {
  kind: 'tabletop';
  length: number;
  angleDeg: number;
  /** Flat deck at lip height. Clear it, or land on it — both are survivable. */
  deck: number;
  /** Landing ramp descending from deck height back to ground. */
  down: number;
  /** Level runout past the landing. */
  runout: number;
}

export interface Rollers extends FeatureBase {
  kind: 'rollers';
  count: number;
  spacing: number;
  height: number;
}

export type Feature = Kicker | Tabletop | Rollers;

/** Lip height that produces the requested launch angle: h = H(u/L)², so H = L·tanθ/2. */
export function lipHeight(length: number, angleDeg: number): number {
  return (length * Math.tan((angleDeg * Math.PI) / 180)) / 2;
}

/** Ideal range for a launch at this angle and speed, returning to launch height. */
export function launchRange(angleDeg: number, speed: number, gravity: number): number {
  const th = (angleDeg * Math.PI) / 180;
  return (speed * speed * Math.sin(2 * th)) / gravity;
}

function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
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
  }
}

/**
 * Height above the feature's base plane at distance `u` along travel.
 * `u` is negative through the approach corridor, which is simply level.
 */
function profile(f: Feature, u: number): number {
  if (u <= 0) return 0;

  switch (f.kind) {
    case 'kicker': {
      const H = lipHeight(f.length, f.angleDeg);
      if (u <= f.length) {
        const t = u / f.length;
        return H * t * t;
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
      const H = lipHeight(f.length, f.angleDeg);
      if (u <= f.length) {
        const t = u / f.length;
        return H * t * t;
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
  }
}

/**
 * Stamp one feature. Reads the untouched terrain height at the origin first, so
 * the whole feature — approach, face, landing — sits on one level plane.
 */
export function applyFeature(hf: Heightfield, f: Feature) {
  const base = hf.height(f.x, f.z);

  const fwdX = Math.sin(f.yaw);
  const fwdZ = Math.cos(f.yaw);
  const rightX = -Math.cos(f.yaw);
  const rightZ = Math.sin(f.yaw);

  const uMin = -f.approach - END_FADE;
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
        lon = 1 - smoothstep01((-f.approach - u) / END_FADE);
      } else {
        const total = featureLength(f);
        const tail = tailFade(f);
        const fadeStart = total - tail;
        if (u > fadeStart) lon = 1 - smoothstep01((u - fadeStart) / (tail + END_FADE));
      }

      const w = lat * lon;
      if (w <= 0.001) continue;

      const target = base + profile(f, u);
      const k = j * res + i;
      data[k] += (target - data[k]) * w;
      // Marked cells are shaded as groomed dirt, which is what makes a feature
      // visible against open desert before there are any props to signpost it.
      if (w > 0.45) mark[k] = 1;
    }
  }
}

export function applyPark(hf: Heightfield, park: readonly Feature[]) {
  for (const f of park) applyFeature(hf, f);
}

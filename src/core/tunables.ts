/**
 * Every magic number in the game lives here, and only here.
 *
 * M1's whole purpose is finding values in this file that feel good, so nothing
 * downstream is allowed to hardcode a constant that affects feel. `T` is mutated
 * live by the lil-gui panel, so read fields off it per-step rather than
 * destructuring them into module scope at import time.
 */

export const DEFAULTS = {
  world: {
    seed: 1337,
    /** World is a square this many metres on a side, centred on the origin. */
    size: 1024,
    /** Heightfield samples per side. (res - 1) must be divisible by meshStride. */
    res: 513,
    /** Render one terrain quad per this many heightfield cells. */
    meshStride: 2,
    broadAmp: 16,
    midAmp: 6,
    /**
     * The launch band: ~38 m crests, which are what get you air in M1.
     * A bike leaves the ground when v^2 * curvature > gravity. At this amplitude
     * roughly 5% of the world can throw you at top speed, with slopes topping out
     * near 29 deg — still rolling dunes. Raising `fineAmp` instead would add air
     * off short sharp bumps, which reads as suspension chatter, not as a jump.
     */
    rollAmp: 6,
    /** Keep small — fine detail here reads as suspension chatter, not texture. */
    fineAmp: 0.4,
    bowlDepth: 9,
    rimHeight: 45,
  },

  bike: {
    gravity: 16, // arcade-heavy; real 9.81 feels floaty at these speeds
    engineAccel: 16,
    maxSpeed: 34,
    brakeAccel: 22,
    reverseAccel: 5,
    maxReverse: 6,
    rollDrag: 0.16,
    /** How much gravity pulls the bike down a slope. 1 = physically honest. */
    slopeGain: 0.85,
    /** Per-second decay of sideways velocity. High = the bike rails. */
    lateralGrip: 7,
    /**
     * Bunny hop. At gravity 16 an impulse of 6.5 m/s is about 1.3 m of air —
     * enough to clear something or to set up a rotation, not enough to replace
     * the ramps M2 brings.
     */
    jumpImpulse: 6.5,
    /**
     * Extra impulse at full suspension compression. A hop taken just after a
     * landing spends stored spring energy and goes noticeably higher, which makes
     * the timing worth learning.
     */
    jumpPreload: 3,
    wheelBase: 1.45,
    wheelRadius: 0.33,
    /** Lateral offset used to read terrain cross-slope for roll. */
    trackSample: 1.1,
  },

  susp: {
    /** Chassis centre height above ground with the suspension fully extended. */
    restHeight: 0.62,
    springK: 160,
    springC: 20,
    maxTravel: 0.4,
    /** Cap on spring acceleration, so a hard landing can't launch the bike. */
    maxAccel: 420,
    /**
     * Gap that still counts as grounded. Without this the bike flickers in and
     * out of contact over every small bump, which turns airTime — and, in M2,
     * trick detection and the combo counter — into noise.
     */
    stickDistance: 0.09,
  },

  steer: {
    maxYawRate: 2.2,
    yawResponse: 9,
    /** Speed at which steering reaches full authority. */
    refSpeed: 8,
    /** Steering authority retained at very high speed. */
    highSpeedFalloff: 0.45,
    /**
     * Visual lean per unit of (yawRate * speed). Kept low enough that full lock
     * only saturates `maxLean` at high speed — at higher gains the bike is pinned
     * at maximum lean through every corner and stops reading as expressive.
     */
    leanGain: 0.018,
    maxLean: 0.65,
    pitchResponse: 13,
    rollResponse: 11,
  },

  air: {
    drag: 0.02,
    pitchRate: 4.2,
    yawRate: 2.6,
    rollRate: 3.4,
  },

  cam: {
    distGround: 7.2,
    heightGround: 2.9,
    distAir: 9.8,
    heightAir: 4.2,
    posDampGround: 7,
    posDampAir: 4.2,
    lookLead: 6,
    lookHeight: 1.4,
    /** How fast the camera's idea of "forward" chases actual travel direction. */
    travelDamp: 5,
    fovBase: 62,
    fovGain: 0.42,
    fovMax: 82,
    shakeGain: 0.06,
    shakeDecay: 6,
    minClearance: 1.6,
  },

  light: {
    /**
     * Three's lighting is physically based, so intensities are not 0..1 —
     * anything that pushes irradiance past 1 clips, and the whole world turns
     * into one flat blown-out tone. These are balanced against the tone mapper.
     */
    sunIntensity: 2.8,
    hemiIntensity: 0.75,
    /** Low sun: long shadows and strong slope contrast, so dunes read as dunes. */
    sunElevationDeg: 28,
    sunAzimuthDeg: 35,
    exposure: 1,
  },

  render: {
    terrainShadows: true,
    wireframe: false,
    /**
     * Deliberately light. Fog matches the sky's horizon band so the terrain edge
     * dissolves instead of ending, but at high density everything collapses into
     * one tone and the world stops reading as having depth.
     */
    fogDensity: 0.0009,
  },
};

export type Tunables = typeof DEFAULTS;
export type WorldConfig = Tunables['world'];

function clone(src: Tunables): Tunables {
  return JSON.parse(JSON.stringify(src)) as Tunables;
}

export const T: Tunables = clone(DEFAULTS);

const STORAGE_KEY = 'moto.tunables.v1';

/** Deep-assigns only keys that already exist, so stale saves can't inject junk. */
function merge(target: Record<string, unknown>, src: Record<string, unknown>) {
  for (const key of Object.keys(target)) {
    const a = target[key];
    const b = src[key];
    if (b === undefined) continue;
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      merge(a as Record<string, unknown>, b as Record<string, unknown>);
    } else if (typeof a === typeof b) {
      target[key] = b;
    }
  }
}

export function saveTunables() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(T));
}

export function loadTunables(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    merge(T as unknown as Record<string, unknown>, JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

export function resetTunables() {
  merge(T as unknown as Record<string, unknown>, clone(DEFAULTS) as unknown as Record<string, unknown>);
  localStorage.removeItem(STORAGE_KEY);
}

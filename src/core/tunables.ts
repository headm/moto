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
    /**
     * Heightfield samples per side. (res - 1) must be divisible by meshStride.
     * 1025 gives 1 m cells. Ramps need it: at 2 m the final span before a lip is
     * a single bilinear interpolation, which rounds off the one feature that the
     * whole jump depends on.
     */
    res: 1025,
    /** Render one terrain quad per this many heightfield cells. */
    meshStride: 4,
    /** Stamp the park's features into the heightfield. */
    ramps: true,
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

  boost: {
    /** Seconds the burst lasts. */
    duration: 2.5,
    /**
     * Seconds after a burst ends before another can start. Charges earned from
     * clean landings replace this later; for now the cooldown is the only supply
     * limit, and it exists so bursts can't be stacked into one absurd launch.
     */
    cooldown: 1.5,
    /**
     * Multipliers on engineAccel and maxSpeed while boosting — multipliers rather
     * than absolutes so they survive retuning the base bike. Raising maxSpeed is
     * not optional: engine force is scaled by `1 - along/maxSpeed`, so extra
     * acceleration alone does nothing at the point you most want it.
     *
     * 1.65x / 1.35x takes terminal speed from ~26 to ~36 m/s. Launchability goes
     * as v^2, so that is roughly a 1.8x curvature budget — a lot more of the map
     * becomes a jump.
     */
    accelMul: 1.65,
    maxSpeedMul: 1.35,
    /** Extra camera FOV while boosting, so it reads as speed and not as a number. */
    fovBonus: 4,

    /** Exhaust flame length multiplier. */
    flameLength: 1,
    /**
     * The exhaust light is the effect that sells the boost — a moving pool of
     * orange on the dirt, which no amount of additive sprite work can fake. It is
     * also the easiest one to overdo: `range` controls how wide the pool spreads,
     * and a wide pool reads as a floodlight rather than an exhaust.
     */
    lightIntensity: 7,
    lightRange: 4.5,
    /**
     * Embers per second out of the pipes, and dust per second off the rear wheel.
     * These govern the ignition burst too, so zero really is zero — the flames and
     * the exhaust light carry the effect on their own.
     */
    emberRate: 0,
    dustRate: 0,
    /** Camera punch when a burst ignites. */
    ignitionPunch: 0.22,
  },

  water: {
    /**
     * Per-second decay of horizontal speed below the water line. Deliberately
     * brutal: water is the punishment for coming up short, and it punishes the
     * same way everything else in this game does — by taking your momentum, never
     * by ending the run.
     */
    drag: 3.2,
    /** Vertical damping, so the bike settles into the water instead of plunging. */
    sink: 4.5,
  },

  landing: {
    /**
     * Landings are rated, never fatal. The bike always snaps back and keeps
     * going, so these thresholds are a feedback and speed dial rather than a
     * difficulty gate — which is also why the sketchy band is deliberately wide.
     *
     * Errors are the angle between the bike and the ground it touches, in degrees.
     */
    cleanPitch: 25,
    cleanRoll: 30,
    sketchyPitch: 50,
    sketchyRoll: 60,

    /** Fraction of horizontal speed kept. This is the whole consequence. */
    keepClean: 1,
    keepSketchy: 0.8,
    keepBad: 0.45,

    /** Camera shake multiplier, applied through the existing impact channel. */
    shakeClean: 1,
    shakeSketchy: 1.6,
    shakeBad: 2.4,

    /**
     * How fast orientation snaps back to the ground, per band. A slower snap on a
     * bad landing reads as a scramble rather than a teleport.
     */
    snapClean: 13,
    snapSketchy: 9,
    snapBad: 6,
    /** Seconds the band's snap rate stays in effect after touchdown. */
    snapTime: 0.45,

    /**
     * Flights shorter than this aren't rated at all. Without it, every micro-hop
     * over rolling terrain fires a landing banner.
     */
    minAirTime: 0.25,
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
    /** Headroom above the ~73 deg an unboosted top speed reaches, so boost isn't clipped. */
    fovMax: 92,
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
    /** Numbered flags at each feature. The numbers match `npm run sim` output. */
    showMarkers: true,
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

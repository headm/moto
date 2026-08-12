import { T } from '../core/tunables';

/**
 * Landing quality, shared by the physics that rates a real touchdown, the
 * trajectory overlay that predicts one, and the HUD that reports it.
 *
 * There is no crash band on purpose. The bike always recovers and keeps going;
 * the only consequence of a bad landing is lost speed. That keeps a freeride
 * session in flow, and it turns tolerance into a feedback dial rather than the
 * difficulty gate it would be if a bad landing ended the run.
 */
export type LandingBand = 'clean' | 'sketchy' | 'bad';

export interface LandingReport {
  /** Set when a landing is rated; cleared by whoever displays it. */
  pending: boolean;
  band: LandingBand;
  /** Angle between the bike and the ground it touched, degrees. */
  pitchErrDeg: number;
  rollErrDeg: number;
  /** Flight time that preceded this landing, seconds. */
  airTime: number;
  /** Fraction of horizontal speed kept. */
  keptSpeed: number;
}

export function createLandingReport(): LandingReport {
  return {
    pending: false,
    band: 'clean',
    pitchErrDeg: 0,
    rollErrDeg: 0,
    airTime: 0,
    keptSpeed: 1,
  };
}

/**
 * Both axes must be inside a band to earn it — landing square but sideways is
 * not a clean landing.
 */
export function classifyLanding(pitchErrDeg: number, rollErrDeg: number): LandingBand {
  const l = T.landing;
  if (pitchErrDeg <= l.cleanPitch && rollErrDeg <= l.cleanRoll) return 'clean';
  if (pitchErrDeg <= l.sketchyPitch && rollErrDeg <= l.sketchyRoll) return 'sketchy';
  return 'bad';
}

export function bandKeepSpeed(band: LandingBand): number {
  const l = T.landing;
  return band === 'clean' ? l.keepClean : band === 'sketchy' ? l.keepSketchy : l.keepBad;
}

export function bandShake(band: LandingBand): number {
  const l = T.landing;
  return band === 'clean' ? l.shakeClean : band === 'sketchy' ? l.shakeSketchy : l.shakeBad;
}

export function bandSnap(band: LandingBand): number {
  const l = T.landing;
  return band === 'clean' ? l.snapClean : band === 'sketchy' ? l.snapSketchy : l.snapBad;
}

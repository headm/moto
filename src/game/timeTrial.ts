import { T } from '../core/tunables';
import type { BikeState } from '../bike/state';
import type { Scoring } from './scoring';

/**
 * A timed run: three minutes to bank as much as you can, then a number to beat.
 *
 * Free riding has no shape — the session total only ever goes up, so there is
 * never a moment where a run is *finished*. A clock supplies the missing half of
 * the scoring loop: it makes the combo worth gambling on (there is not time to
 * rebuild it), it makes the route a decision (the ziggurat's tiers are the
 * biggest points in the park and cost 40 seconds to reach), and it makes a score
 * comparable to the last one.
 *
 * **Three minutes, and that number is measured rather than picked.** A lap of the
 * circuit — spawn, the dirt track, the back road, the ribbon, home — takes 84 s
 * driven flat out by the harness's autopilot, and a person riding it is slower.
 * Three minutes is therefore a lap and most of another: long enough that the
 * route matters and a lost combo can be rebuilt, short enough to start again
 * immediately, which is the thing a time trial lives or dies on.
 *
 * Two rules do most of the work:
 *
 * - **The last flight counts.** If the clock reaches zero while you are in the
 *   air, the run stays open until you land. Points are banked by landings and
 *   never by air (§6), so ending mid-flight would silently delete whatever was
 *   riding on it — and the interesting last ten seconds are exactly the ones
 *   where a rider throws everything at one more jump.
 * - **Respawning does not stop the clock.** `R` is how you cross the park, and
 *   travelling is part of the route decision rather than an escape from it.
 */

export type TrialPhase = 'idle' | 'running' | 'over';

const BEST_KEY = 'moto.trialbest.v1';

/** Separate from the free-ride best: an unlimited session always beats a timed
 *  one, so scoring them against each other would make the trial pointless. */
function loadBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveBest(value: number) {
  try {
    localStorage.setItem(BEST_KEY, String(Math.round(value)));
  } catch {
    // A session that can't persist its best still plays fine.
  }
}

/** `m:ss`, which is how a countdown is read. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export class TimeTrial {
  phase: TrialPhase = 'idle';
  /** Seconds left, clamped at zero through the last flight. */
  remaining = 0;
  /** The total the last completed run finished on. */
  result = 0;
  best = loadBest();
  /** True on the step the run ends, for whoever wants to react to it. */
  justEnded = false;

  /**
   * Scoring is frozen once a run is over, so the number on screen is the number
   * the run earned. Nothing else stops — the bike still rides, which is the rule
   * the whole game follows.
   */
  get frozen(): boolean {
    return this.phase === 'over';
  }

  /** Begin a run. The caller resets the bike and the score; this owns the clock. */
  start() {
    this.phase = 'running';
    this.remaining = T.trial.duration;
    this.justEnded = false;
  }

  /** Abandon a run without recording it — used when dropping back to free ride. */
  cancel() {
    this.phase = 'idle';
    this.remaining = 0;
    this.justEnded = false;
  }

  /**
   * Physics rate, like everything else that reads a landing: the run can end on
   * any of the eight steps a frame may contain, and ending it on the frame would
   * hand the rider up to a sixtieth of a second of free scoring.
   */
  step(s: BikeState, scoring: Scoring, dt: number) {
    if (this.phase !== 'running') return;

    if (this.remaining > 0) {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining > 0) return;
    }

    // Time is up. Airborne, the run stays open until the wheels are down — the
    // flight's points do not exist until it is landed, and cutting it off here
    // would take them away for nothing the rider did.
    if (!s.grounded) return;

    this.phase = 'over';
    this.justEnded = true;
    this.result = scoring.total;
    if (this.result > this.best) {
      this.best = this.result;
      saveBest(this.best);
    }
  }
}

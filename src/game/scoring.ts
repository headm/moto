import { T } from '../core/tunables';
import type { LandingBand } from '../bike/landing';
import type { BikeState } from '../bike/state';
import type { Tricks, TrickTally } from './tricks';

/**
 * Airtime and tricks → points, and points → a reason to go again.
 *
 * The one rule that makes the whole thing a game: **points are only banked by a
 * clean landing.** Everything earned in the air is at risk until the wheels are
 * down, so a huge run is a real gamble rather than a formality. A sketchy
 * landing salvages part of it and holds the combo; a bad one loses the lot and
 * puts the multiplier back to one.
 *
 * Airtime is squared, so two seconds is four times one. That is the arithmetic
 * behind design pillar #1 — a bigger jump has to be worth disproportionately
 * more than a safe one, or nobody takes the big jump.
 *
 * Like `Tricks`, this must be stepped at physics rate: two landings can happen
 * inside a single rendered frame, and the second one must not overwrite the
 * first's effect on the combo.
 */

export interface ScoreEvent {
  band: LandingBand;
  /** Trick names for this flight, e.g. `Backflip 360`. Empty for a plain jump. */
  label: string;
  /** What was riding on the flight, multiplier included. */
  risked: number;
  /** What actually reached the session total. Zero on a bad landing. */
  gained: number;
  /** The multiplier the flight was scored at — not the one now in effect. */
  multiplier: number;
  airTime: number;
}

const BEST_KEY = 'moto.best.v1';

/** localStorage is absent in the headless harness, and a quota-full or
 *  privacy-mode browser throws on write rather than failing quietly. */
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

export class Scoring {
  /** Session total. Only clean and sketchy landings move it. */
  total = 0;
  /** Highest session total ever reached on this machine. */
  best = loadBest();
  multiplier = 1;
  /** Points riding on the current flight. Lost unless it is landed. */
  pending = 0;
  /**
   * The landing that just resolved. Set here, cleared by whoever displays it —
   * the same hand-off `LandingReport.pending` uses, so a landing can't be missed
   * on a frame where several physics steps ran.
   */
  event: ScoreEvent | null = null;

  /** Points a flight is worth before the multiplier. */
  private flightValue(t: TrickTally): number {
    return t.airTime * t.airTime * T.score.airGain + t.points;
  }

  step(s: BikeState, tricks: Tricks) {
    const sc = T.score;

    // The combo is a hot streak, not a bank balance: stop landing things and it
    // goes. `groundTime` is the physics' own count of an uninterrupted contact,
    // so rolling out of a jump keeps it and coming to a halt doesn't.
    if (s.groundTime > sc.comboWindow) this.multiplier = 1;

    this.pending = s.grounded ? 0 : Math.round(this.flightValue(tricks.live) * this.multiplier);

    const landed = tricks.landed;
    // Flights too short for the physics to rate are too short to score. Checking
    // the same threshold rather than `landing.pending` keeps the band read below
    // honest — an unrated landing leaves a stale band behind.
    if (!landed || landed.airTime < T.landing.minAirTime) return;

    const band = s.landing.band;
    const risked = Math.round(this.flightValue(landed) * this.multiplier);
    const gained = band === 'clean' ? risked : band === 'sketchy' ? Math.round(risked * sc.keepSketchy) : 0;

    this.total += gained;
    if (this.total > this.best) {
      this.best = this.total;
      saveBest(this.best);
    }

    this.event = {
      band,
      label: landed.label,
      risked,
      gained,
      multiplier: this.multiplier,
      airTime: landed.airTime,
    };

    if (band === 'clean') this.multiplier = Math.min(sc.maxMultiplier, this.multiplier + 1);
    else if (band === 'bad') this.multiplier = 1;
    // A sketchy landing holds the streak where it is: it neither rewards the
    // scramble nor throws away a run that was still, just about, landed.

    this.pending = 0;
  }

  /**
   * Respawn. The session total survives — R is how you get across the park, and
   * wiping the score every time would make travelling cost points. The combo
   * does not survive, because nothing was landed.
   */
  reset() {
    this.multiplier = 1;
    this.pending = 0;
    this.event = null;
  }
}

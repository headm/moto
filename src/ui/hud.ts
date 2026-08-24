/**
 * DOM overlay HUD. No canvas text, no UI framework — it's a few numbers.
 * Every write is guarded so we're not touching layout-affecting properties on
 * frames where nothing changed.
 */

import type { LandingReport } from '../bike/landing';
import type { ScoreEvent } from '../game/scoring';
import { formatClock, type TrialPhase } from '../game/timeTrial';
import { T } from '../core/tunables';

const BAND_LABEL = {
  clean: 'CLEAN LANDING',
  sketchy: 'SKETCHY',
  bad: 'BAD LANDING',
} as const;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`HUD element #${id} missing from index.html`);
  return node as T;
}

/** Thousands separators: a five-figure score is unreadable without them. */
function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export class Hud {
  private speedEl = el('speed');
  private airEl = el('air');
  private airTimeEl = el('airtime');
  private statsEl = el('stats');
  private hintEl = el('hint');
  private boostEl = el('boost');
  private boostFillEl = el('boostfill');
  private landingEl = el('landing');
  private landingBandEl = el('landingband');
  private landingTrickEl = el('landingtrick');
  private landingScoreEl = el('landingscore');
  private landingDetailEl = el('landingdetail');
  private trickTextEl = el('tricktext');
  private trickPointsEl = el('trickpoints');
  private scoreEl = el('scorevalue');
  private bestEl = el('scorebest');
  private comboEl = el('combo');
  private comboValueEl = el('combovalue');
  private hudEl = el('hud');
  private trialEl = el('trial');
  private trialClockEl = el('trialclock');
  private trialLabelEl = el('triallabel');
  private trialScoreEl = el('trialscore');
  private trialBestEl = el('trialbest');

  /** Seconds the landing banner stays up. */
  private landingTimer = 0;

  private lastBoostState = 'ready';
  private lastSpeed = -1;
  private lastAir = '';
  private lastTrick = '';
  private lastPending = -1;
  private lastScore = -1;
  private lastBest = -1;
  private lastMultiplier = -1;
  private airVisible = false;
  private lastClock = '';
  private lastTrialClass = '';
  private statsAccum = 0;
  private hintFaded = false;

  fadeHint() {
    if (this.hintFaded) return;
    this.hintFaded = true;
    // Give the player a moment to read it before it recedes.
    window.setTimeout(() => this.hintEl.classList.add('fade'), 4000);
  }

  /**
   * One banner for the whole touchdown: what you did, what it paid, and how
   * square you were. `score` is null only for a landing too short to be scored,
   * which is also too short to be rated — so in practice they arrive together.
   */
  private showLanding(r: LandingReport, score: ScoreEvent | null) {
    this.landingBandEl.textContent = BAND_LABEL[r.band];
    this.landingTrickEl.textContent = score?.label ?? '';
    // Losing a run reads as a number going away, not as an absence of one.
    this.landingScoreEl.textContent = score
      ? score.gained > 0
        ? `+${fmt(score.gained)}` + (score.multiplier > 1 ? `  ×${score.multiplier}` : '')
        : score.risked > 0
          ? `LOST ${fmt(score.risked)}`
          : ''
      : '';
    // The angle errors are what you tune the bands against, so they're on screen
    // rather than in the console.
    const lost = Math.round((1 - r.keptSpeed) * 100);
    this.landingDetailEl.textContent =
      `${r.pitchErrDeg.toFixed(0)}° pitch  ${r.rollErrDeg.toFixed(0)}° roll` +
      `  ·  ${r.airTime.toFixed(2)}s air` +
      (lost > 0 ? `  ·  -${lost}% speed` : '');
    this.landingEl.className = `landing show ${r.band}`;
    this.landingTimer = 1.6;
  }

  private hideLanding() {
    this.landingTimer = 0;
    this.landingEl.classList.remove('show');
  }

  update(opts: {
    speed: number;
    airTime: number;
    airPeak: number;
    grounded: boolean;
    /** 0..1 — burst remaining while active, cooldown progress while recovering. */
    boostFill: number;
    boostState: 'ready' | 'active' | 'cooling';
    /** Consumed here — `pending` is cleared once shown. */
    landing: LandingReport;
    /** Trick names completed so far in the current flight. */
    trick: string;
    /** Points riding on the current flight. */
    pending: number;
    score: number;
    best: number;
    multiplier: number;
    /** Consumed here — the caller clears it once shown. */
    scoreEvent: ScoreEvent | null;
    fps: number;
    frameDt: number;
    tris: number;
    trial: { phase: TrialPhase; remaining: number; result: number; best: number };
  }) {
    if (opts.landing.pending) {
      opts.landing.pending = false;
      this.showLanding(opts.landing, opts.scoreEvent);
    }
    if (this.landingTimer > 0) {
      this.landingTimer -= opts.frameDt;
      if (this.landingTimer <= 0) this.hideLanding();
    }

    if (opts.boostState !== this.lastBoostState) {
      this.lastBoostState = opts.boostState;
      this.boostEl.className = `boost ${opts.boostState}`;
    }
    this.boostFillEl.style.width = `${(opts.boostFill * 100).toFixed(1)}%`;

    const kmh = Math.round(opts.speed * 3.6);
    if (kmh !== this.lastSpeed) {
      this.lastSpeed = kmh;
      this.speedEl.textContent = String(kmh);
    }

    // Show the airtime readout only once it's a real jump, not every bump.
    const show = !opts.grounded && opts.airTime > 0.25;
    if (show !== this.airVisible) {
      this.airVisible = show;
      this.airEl.classList.toggle('on', show);
      // The two share a slot, so the new flight evicts the last one's result.
      // That is the right precedence: what you are doing now outranks what you
      // did a second ago, and the score and combo top-right keep the record.
      // The banner survives the first 0.25 s of a flight, which is what makes a
      // rolled-out landing still readable.
      if (show) this.hideLanding();
    }
    if (show) {
      const text = opts.airTime.toFixed(2);
      if (text !== this.lastAir) {
        this.lastAir = text;
        this.airTimeEl.textContent = text;
      }
      if (opts.trick !== this.lastTrick) {
        this.lastTrick = opts.trick;
        this.trickTextEl.textContent = opts.trick;
      }
      // Rounded to ten so the counter reads as a rising figure rather than as a
      // blur of digits — airtime alone moves it several points a frame.
      const pending = Math.round(opts.pending / 10) * 10;
      if (pending !== this.lastPending) {
        this.lastPending = pending;
        this.trickPointsEl.textContent = pending > 0 ? `+${fmt(pending)}` : '';
      }
    }

    if (opts.score !== this.lastScore) {
      this.lastScore = opts.score;
      this.scoreEl.textContent = fmt(opts.score);
    }
    if (opts.best !== this.lastBest) {
      this.lastBest = opts.best;
      this.bestEl.textContent = fmt(opts.best);
    }
    if (opts.multiplier !== this.lastMultiplier) {
      this.lastMultiplier = opts.multiplier;
      this.comboValueEl.textContent = String(opts.multiplier);
      this.comboEl.classList.toggle('on', opts.multiplier > 1);
    }

    // ---- time trial --------------------------------------------------------
    const tr = opts.trial;
    // `low` is on the class rather than the text so the colour change is a
    // repaint of one element and not a rewrite of the countdown every frame.
    const trialClass =
      tr.phase === 'running'
        ? `trial on${tr.remaining <= T.trial.warnAt ? ' low' : ''}`
        : tr.phase === 'over'
          ? 'trial over'
          : 'trial';
    if (trialClass !== this.lastTrialClass) {
      this.lastTrialClass = trialClass;
      this.trialEl.className = trialClass;
      this.hudEl.classList.toggle('trialover', tr.phase === 'over');
      if (tr.phase === 'over') {
        // The airtime slot is going away, so its state has to go with it or the
        // next flight after a restart inherits a stale banner.
        this.hideLanding();
        this.airVisible = false;
        this.airEl.classList.remove('on');
        this.trialScoreEl.textContent = fmt(tr.result);
        this.trialBestEl.textContent =
          tr.result >= tr.best && tr.result > 0 ? 'NEW BEST' : `BEST ${fmt(tr.best)}`;
      }
      this.trialLabelEl.textContent = 'TIME TRIAL';
    }
    if (tr.phase === 'running') {
      const clock = formatClock(tr.remaining);
      if (clock !== this.lastClock) {
        this.lastClock = clock;
        this.trialClockEl.textContent = clock;
      }
    }

    this.statsAccum += opts.frameDt;
    if (this.statsAccum > 0.25) {
      this.statsAccum = 0;
      this.statsEl.textContent =
        `${opts.fps.toFixed(0)} fps  ${(opts.frameDt * 1000).toFixed(1)} ms\n` +
        `${(opts.tris / 1000).toFixed(0)}k tris\n` +
        `peak air ${opts.airPeak.toFixed(1)} m`;
    }
  }
}

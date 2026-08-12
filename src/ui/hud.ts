/**
 * DOM overlay HUD. No canvas text, no UI framework — it's a few numbers.
 * Every write is guarded so we're not touching layout-affecting properties on
 * frames where nothing changed.
 */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`HUD element #${id} missing from index.html`);
  return node as T;
}

export class Hud {
  private speedEl = el('speed');
  private airEl = el('air');
  private airTimeEl = el('airtime');
  private statsEl = el('stats');
  private hintEl = el('hint');
  private boostEl = el('boost');
  private boostFillEl = el('boostfill');

  private lastBoostState = 'ready';
  private lastSpeed = -1;
  private lastAir = '';
  private airVisible = false;
  private statsAccum = 0;
  private hintFaded = false;

  fadeHint() {
    if (this.hintFaded) return;
    this.hintFaded = true;
    // Give the player a moment to read it before it recedes.
    window.setTimeout(() => this.hintEl.classList.add('fade'), 4000);
  }

  update(opts: {
    speed: number;
    airTime: number;
    airPeak: number;
    grounded: boolean;
    /** 0..1 — burst remaining while active, cooldown progress while recovering. */
    boostFill: number;
    boostState: 'ready' | 'active' | 'cooling';
    fps: number;
    frameDt: number;
    tris: number;
  }) {
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
    }
    if (show) {
      const text = opts.airTime.toFixed(2);
      if (text !== this.lastAir) {
        this.lastAir = text;
        this.airTimeEl.textContent = text;
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

/**
 * Fixed-timestep game loop with render interpolation.
 *
 * Physics must never see a variable dt — that is how jump heights end up
 * depending on framerate. The accumulator is capped so a backgrounded tab
 * doesn't come back and simulate thirty seconds in one frame.
 */

export interface LoopHooks {
  /** Seconds per physics step. */
  step: number;
  /** Hard cap on physics steps per rendered frame. */
  maxSubSteps?: number;
  /** Called once per rendered frame, before any physics steps (input polling). */
  onFrameStart?: (frameDt: number) => void;
  onStep: (dt: number) => void;
  /**
   * @param alpha  0..1 blend between the previous and current physics state.
   * @param frameDt Real elapsed wall-clock seconds, for camera/UI smoothing.
   */
  onRender: (alpha: number, frameDt: number) => void;
}

export interface Loop {
  start(): void;
  stop(): void;
  /** Smoothed frames per second, for the stats readout. */
  readonly fps: number;
}

export function createLoop(hooks: LoopHooks): Loop {
  const step = hooks.step;
  const maxSubSteps = hooks.maxSubSteps ?? 8;

  let running = false;
  let raf = 0;
  let last = 0;
  let accumulator = 0;
  let fps = 0;

  const frame = (now: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    const nowSec = now / 1000;
    let frameDt = nowSec - last;
    last = nowSec;

    // First frame, or a tab that just woke up.
    if (!(frameDt > 0) || frameDt > 0.5) frameDt = step;

    fps += (1 / frameDt - fps) * 0.08;

    hooks.onFrameStart?.(frameDt);

    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= step && steps < maxSubSteps) {
      hooks.onStep(step);
      accumulator -= step;
      steps++;
    }
    // Ran out of budget: drop the backlog rather than falling further behind.
    if (accumulator >= step) accumulator = 0;

    hooks.onRender(accumulator / step, frameDt);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now() / 1000;
      accumulator = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    get fps() {
      return fps;
    },
  };
}

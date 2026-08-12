/**
 * Keyboard + gamepad collapsed into one normalized snapshot.
 *
 * Physics reads only `InputState`, never the raw keys. That indirection is what
 * makes replays, ghosts and AI riders cheap to add later.
 */

export interface InputState {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  /** -1 (lean forward / frontflip) .. 1 (lean back / backflip) */
  pitch: number;
  /** -1 (roll left) .. 1 (roll right) */
  roll: number;
  /** True for exactly one frame after the jump key is pressed. */
  jump: boolean;
  /** True for exactly one frame after the respawn key is pressed. */
  respawn: boolean;
}

const AXIS_DEADZONE = 0.18;

function deadzone(v: number): number {
  const a = Math.abs(v);
  if (a < AXIS_DEADZONE) return 0;
  return Math.sign(v) * ((a - AXIS_DEADZONE) / (1 - AXIS_DEADZONE));
}

export class Input {
  readonly state: InputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    pitch: 0,
    roll: 0,
    jump: false,
    respawn: false,
  };

  /** Fires once per keydown of a bound action key — used to fade the hint card. */
  onAnyKey: (() => void) | null = null;

  private keys = new Set<string>();
  private respawnEdge = false;
  private jumpEdge = false;
  private padJumpWasDown = false;
  private gamepadIndex: number | null = null;

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('gamepadconnected', this.handleGamepad);
    window.addEventListener('gamepaddisconnected', this.handleGamepadGone);
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('gamepadconnected', this.handleGamepad);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadGone);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Arrows and space would otherwise scroll the page.
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (!this.keys.has(e.code)) {
      if (e.code === 'KeyR') this.respawnEdge = true;
      // Edge-triggered, so holding the key down is one jump, not a hover.
      if (e.code === 'Space') this.jumpEdge = true;
      this.onAnyKey?.();
    }
    this.keys.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private handleBlur = () => {
    this.keys.clear();
  };

  private handleGamepad = (e: Event) => {
    this.gamepadIndex = (e as GamepadEvent).gamepad.index;
  };

  private handleGamepadGone = () => {
    this.gamepadIndex = null;
  };

  private held(...codes: string[]): number {
    for (const c of codes) if (this.keys.has(c)) return 1;
    return 0;
  }

  /** Call once per rendered frame, before physics steps. */
  poll() {
    const s = this.state;

    s.throttle = this.held('KeyW');
    s.brake = this.held('KeyS');
    // WASD rides, the arrow cluster rotates: up/down pitches, left/right rolls.
    s.steer = this.held('KeyD') - this.held('KeyA');
    // Pull back to loop backwards, like every MX game ever made.
    s.pitch = this.held('ArrowDown', 'KeyK') - this.held('ArrowUp', 'KeyI');
    s.roll = this.held('ArrowRight', 'KeyE') - this.held('ArrowLeft', 'KeyQ');
    s.jump = this.jumpEdge;
    this.jumpEdge = false;
    s.respawn = this.respawnEdge;
    this.respawnEdge = false;

    if (this.gamepadIndex !== null) this.pollGamepad(s);
  }

  private pollGamepad(s: InputState) {
    const pad = navigator.getGamepads?.()[this.gamepadIndex!];
    if (!pad) return;

    const rt = pad.buttons[7]?.value ?? 0;
    const lt = pad.buttons[6]?.value ?? 0;
    if (rt > 0.02) s.throttle = Math.max(s.throttle, rt);
    if (lt > 0.02) s.brake = Math.max(s.brake, lt);

    const sx = deadzone(pad.axes[0] ?? 0);
    // Stick up reads negative, and stick up should mean lean forward.
    const sy = deadzone(pad.axes[1] ?? 0);
    if (sx !== 0) s.steer = sx;
    if (sy !== 0) s.pitch = sy;

    const rollAxis = (pad.buttons[5]?.pressed ? 1 : 0) - (pad.buttons[4]?.pressed ? 1 : 0);
    if (rollAxis !== 0) s.roll = rollAxis;

    // A button, edge-detected here since gamepads are polled rather than evented.
    const padJump = pad.buttons[0]?.pressed ?? false;
    if (padJump && !this.padJumpWasDown) s.jump = true;
    this.padJumpWasDown = padJump;

    if (pad.buttons[9]?.pressed) s.respawn = true;
  }
}

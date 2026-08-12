import * as THREE from 'three';
import type { WorldConfig } from '../core/tunables';

/**
 * The single source of truth for ground geometry.
 *
 * Terrain *and* (from M2) every ramp live in this one array, so ground contact
 * is an O(1) bilinear sample instead of a mesh raycast. No tunneling at speed,
 * no collider/visual desync, no raycast cost. The price is no overhangs — an
 * acceptable trade for motocross.
 */

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise, 0..1, smoothstep-interpolated. */
function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);

  const top = a + (b - a) * ux;
  const bot = c + (d - c) * ux;
  return top + (bot - top) * uz;
}

/** Fractal value noise, roughly -1..1. */
function fbm(x: number, z: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += (vnoise(x * freq, z * freq, seed + o * 71) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Value noise, exposed so surface shading can vary independently of height.
 * Coordinates are world metres divided by the feature size you want.
 */
export function sampleNoise(x: number, z: number, seed: number): number {
  return vnoise(x, z, seed);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface WaterBody {
  /** Centre of the body. */
  x: number;
  z: number;
  yaw: number;
  halfLength: number;
  halfWidth: number;
  /** World height of the water surface. */
  level: number;
}

export class Heightfield {
  readonly size: number;
  readonly res: number;
  readonly cell: number;
  readonly half: number;
  readonly seed: number;
  readonly data: Float32Array;
  /** 1 where a ramp stamp has groomed the surface, for shading. */
  readonly mark: Uint8Array;
  /** Water bodies, as oriented rectangles. Populated by pond stamps. */
  readonly waters: WaterBody[] = [];
  /** Level pad the bike starts on, facing the bowl. */
  readonly spawn = new THREE.Vector3();
  readonly spawnYaw = Math.PI;

  private cfg: WorldConfig;

  constructor(cfg: WorldConfig) {
    this.cfg = cfg;
    this.seed = cfg.seed;
    this.size = cfg.size;
    this.res = cfg.res;
    this.cell = cfg.size / (cfg.res - 1);
    this.half = cfg.size / 2;
    this.data = new Float32Array(cfg.res * cfg.res);
    this.mark = new Uint8Array(cfg.res * cfg.res);
    this.generate();
  }

  private generate() {
    const { res, cell, half } = this;

    for (let j = 0; j < res; j++) {
      const z = -half + j * cell;
      for (let i = 0; i < res; i++) {
        const x = -half + i * cell;
        this.data[j * res + i] = this.raw(x, z);
      }
    }

    // Flatten a landing pad at the spawn so the bike doesn't start mid-slope.
    const sx = 0;
    const sz = 235;
    const target = this.raw(sx, sz);
    for (let j = 0; j < res; j++) {
      const z = -half + j * cell;
      const dz = z - sz;
      if (Math.abs(dz) > 70) continue;
      for (let i = 0; i < res; i++) {
        const x = -half + i * cell;
        const d = Math.hypot(x - sx, dz);
        const f = smoothstep(62, 26, d);
        if (f <= 0) continue;
        const k = j * res + i;
        this.data[k] += (target - this.data[k]) * f;
      }
    }

    this.spawn.set(sx, target, sz);
  }

  /** Analytic base terrain, before any post-pass. */
  private raw(x: number, z: number): number {
    const c = this.cfg;
    let h = fbm(x / 380, z / 380, c.seed + 1, 4) * c.broadAmp;
    h += fbm(x / 95, z / 95, c.seed + 2, 3) * c.midAmp;
    // ~38 m wavelength: at riding speed these crests throw the bike properly,
    // which is what makes M1 worth playing before there are any ramps.
    h += fbm(x / 38, z / 38, c.seed + 5, 2) * c.rollAmp;
    h += fbm(x / 14, z / 14, c.seed + 3, 2) * c.fineAmp;

    // A shallow bowl in the middle — natural gathering point, and (in M2) where
    // the big-air ramp fires you across.
    h -= c.bowlDepth * smoothstep(330, 70, Math.hypot(x, z));

    // Raise the outer rim into a berm so the world edge reads as a boundary
    // rather than a cliff.
    const m = Math.max(Math.abs(x), Math.abs(z)) / this.half;
    h += smoothstep(0.78, 0.98, m) * c.rimHeight;

    return h;
  }

  /** Bilinear height sample in world space. Clamps outside the field. */
  height(x: number, z: number): number {
    const { res, cell, half, data } = this;
    let gx = (x + half) / cell;
    let gz = (z + half) / cell;

    if (gx < 0) gx = 0;
    else if (gx > res - 1) gx = res - 1;
    if (gz < 0) gz = 0;
    else if (gz > res - 1) gz = res - 1;

    const i0 = Math.floor(gx);
    const j0 = Math.floor(gz);
    const i1 = i0 + 1 < res ? i0 + 1 : i0;
    const j1 = j0 + 1 < res ? j0 + 1 : j0;
    const fx = gx - i0;
    const fz = gz - j0;

    const h00 = data[j0 * res + i0];
    const h10 = data[j0 * res + i1];
    const h01 = data[j1 * res + i0];
    const h11 = data[j1 * res + i1];

    const top = h00 + (h10 - h00) * fx;
    const bot = h01 + (h11 - h01) * fx;
    return top + (bot - top) * fz;
  }

  /**
   * Water surface height at this point, or null on dry land. Oriented-rectangle
   * test rather than a per-cell array: there are a handful of these at most, and
   * a full-resolution mask would cost megabytes to answer the same question.
   */
  waterLevelAt(x: number, z: number): number | null {
    for (let i = 0; i < this.waters.length; i++) {
      const w = this.waters[i];
      const dx = x - w.x;
      const dz = z - w.z;
      const u = dx * Math.sin(w.yaw) + dz * Math.cos(w.yaw);
      if (u < -w.halfLength || u > w.halfLength) continue;
      const v = -dx * Math.cos(w.yaw) + dz * Math.sin(w.yaw);
      if (v < -w.halfWidth || v > w.halfWidth) continue;
      return w.level;
    }
    return null;
  }

  /** Surface normal by central differences. */
  normal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const e = this.cell;
    const hl = this.height(x - e, z);
    const hr = this.height(x + e, z);
    const hd = this.height(x, z - e);
    const hu = this.height(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }
}

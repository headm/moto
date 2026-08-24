/**
 * Top-down map of the park — `npm run map [out.png]`.
 *
 * The park is plain data and iterating on it costs an HMR reload, but *reading*
 * it costs a ride: a feature that overlaps its neighbour, a corridor cut across
 * another track, or a landing pad standing proud of the desert as a causeway are
 * all obvious from above and nearly invisible from behind the bike. This renders
 * the same heightfield the game collides against, hillshaded, with the groomed
 * and stone masks tinted and each track's ride line drawn over the top.
 *
 * It reads `TRACKS` rather than `PARK`, so the line it draws is the line the
 * harness rides and the one the park comments describe — if those disagree, the
 * picture is what shows it.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { T } from '../src/core/tunables';
import { Heightfield } from '../src/world/heightfield';
import { applyPark, arcPoint, featureLength, type Feature } from '../src/world/ramps';
import { PARK, TRACKS } from '../src/world/park';

const out = process.argv[2] ?? 'park-map.png';

const hf = new Heightfield(T.world);
applyPark(hf, PARK);

const { res, cell, half, data, mark } = hf;
const rgb = new Uint8Array(res * res * 3);

// --- hillshade -------------------------------------------------------------
// Lit from the north-west at a low angle, which is what makes a 2 m lip and a
// 5 m cut both legible in the same image.
const LX = -0.55;
const LZ = -0.55;
const LY = 0.63;

let lo = Infinity;
let hi = -Infinity;
for (let i = 0; i < data.length; i++) {
  if (data[i] < lo) lo = data[i];
  if (data[i] > hi) hi = data[i];
}

for (let j = 0; j < res; j++) {
  for (let i = 0; i < res; i++) {
    const k = j * res + i;
    const l = data[j * res + Math.max(0, i - 1)];
    const r = data[j * res + Math.min(res - 1, i + 1)];
    const d = data[Math.max(0, j - 1) * res + i];
    const u = data[Math.min(res - 1, j + 1) * res + i];

    // Unnormalised normal, then a dot with the light.
    const nx = l - r;
    const nz = d - u;
    const ny = 2 * cell;
    const len = Math.hypot(nx, ny, nz) || 1;
    const lit = Math.max(0.12, (nx * LX + ny * LY + nz * LZ) / len);

    // Height ramp underneath, so the broad shape reads as well as the detail.
    const t = (data[k] - lo) / (hi - lo);
    let cr = 96 + 150 * t;
    let cg = 82 + 128 * t;
    let cb = 66 + 96 * t;

    if (mark[k] === 1) {
      // Groomed dirt: warmer and lighter than the desert around it.
      cr = 196;
      cg = 138;
      cb = 84;
    } else if (mark[k] === 2) {
      cr = 176;
      cg = 176;
      cb = 172;
    }

    const wx = -half + i * cell;
    const wz = -half + j * cell;
    const water = hf.waterLevelAt(wx, wz);
    if (water !== null && water > data[k]) {
      cr = 46;
      cg = 106;
      cb = 100;
    }

    rgb[k * 3] = Math.min(255, cr * lit * 1.55);
    rgb[k * 3 + 1] = Math.min(255, cg * lit * 1.55);
    rgb[k * 3 + 2] = Math.min(255, cb * lit * 1.55);
  }
}

// --- ride lines ------------------------------------------------------------
function plot(wx: number, wz: number, r: number, g: number, b: number, rad: number) {
  const ci = Math.round((wx + half) / cell);
  const cj = Math.round((wz + half) / cell);
  for (let dj = -rad; dj <= rad; dj++) {
    for (let di = -rad; di <= rad; di++) {
      if (di * di + dj * dj > rad * rad) continue;
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= res || j >= res) continue;
      const k = (j * res + i) * 3;
      rgb[k] = r;
      rgb[k + 1] = g;
      rgb[k + 2] = b;
    }
  }
}

/** The points a feature's ride line passes through, in order. */
function linePoints(f: Feature): { x: number; z: number }[] {
  if (f.kind === 'berm' || f.kind === 'causeway') {
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.02) pts.push(arcPoint(f, t));
    return pts;
  }
  const fx = Math.sin(f.yaw);
  const fz = Math.cos(f.yaw);
  const pts = [];
  // Mottes are radial and have no travel axis, so mark the summit and move on.
  const span = f.kind === 'motte' ? 0 : featureLength(f);
  for (let u = -f.approach; u <= span; u += 2) pts.push({ x: f.x + fx * u, z: f.z + fz * u });
  return pts;
}

const TRACK_COLORS: [number, number, number][] = [
  [235, 92, 72],
  [96, 176, 235],
  [236, 202, 84],
];

TRACKS.forEach((track, ti) => {
  const [r, g, b] = TRACK_COLORS[ti % TRACK_COLORS.length];
  const feats = track.line.map((n) => PARK.find((f) => f.name === n)!);
  for (let n = 0; n < feats.length; n++) {
    const pts = linePoints(feats[n]);
    for (const p of pts) plot(p.x, p.z, r, g, b, 1);
    // Join one feature's line to the next, so a gap in the drawn line is a real
    // gap in the track rather than a gap between two features' own extents.
    const next = feats[n + 1];
    if (next) {
      const a = pts[pts.length - 1] ?? feats[n];
      const steps = Math.ceil(Math.hypot(next.x - a.x, next.z - a.z) / 2);
      for (let i = 0; i <= steps; i++) {
        plot(
          a.x + ((next.x - a.x) * i) / steps,
          a.z + ((next.z - a.z) * i) / steps,
          r,
          g,
          b,
          0,
        );
      }
    }
    plot(feats[n].x, feats[n].z, 255, 255, 255, 3);
  }
});

plot(hf.spawn.x, hf.spawn.z, 60, 255, 120, 5);

// --- write -----------------------------------------------------------------
// PPM then `sips`, rather than a PNG encoder: the whole point of this file is to
// look at the park, and a dependency to do it would outlive the looking.
const header = Buffer.from(`P6\n${res} ${res}\n255\n`, 'ascii');
const ppm = out.replace(/\.png$/, '') + '.ppm';
// Row j runs from z = -half upward, and an image's first row is its top, so the
// rows go out in reverse to put north up and leave the map the same way round as
// every coordinate in `park.ts`.
const flipped = Buffer.alloc(rgb.length);
for (let j = 0; j < res; j++) {
  Buffer.from(rgb.buffer, j * res * 3, res * 3).copy(flipped, (res - 1 - j) * res * 3);
}
writeFileSync(ppm, Buffer.concat([header, flipped]));

try {
  execFileSync('sips', ['-s', 'format', 'png', ppm, '--out', out], { stdio: 'ignore' });
  unlinkSync(ppm);
  console.log(`park map -> ${out}  (${res}x${res}, ${hf.size} m across, north is up)`);
} catch {
  console.log(`park map -> ${ppm}  (sips unavailable, left as PPM)`);
}

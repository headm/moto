import * as THREE from 'three';
import { sampleNoise, type Heightfield } from './heightfield';

/**
 * Heightfield -> one flat-shaded, vertex-coloured, non-indexed mesh.
 *
 * Non-indexed so each triangle can carry a single flat colour: all three of its
 * vertices get the same value, which kills gradient banding and makes ramp lips
 * and landing slopes read unambiguously at speed. One draw call for the world.
 */

const DIRT = new THREE.Color('#b58a55');
const PACKED = new THREE.Color('#8a6b45');
const ROCK = new THREE.Color('#6b6560');
const SCRUB = new THREE.Color('#6f7a44');
/** Worked dirt on ramp faces, decks and approaches — reads as built, not natural. */
const GROOMED = new THREE.Color('#a06a42');
/** Masonry, for structures rather than earthworks. */
const STONE = new THREE.Color('#8d8779');
const STONE_DARK = new THREE.Color('#5f5b52');

const cA = new THREE.Vector3();
const cB = new THREE.Vector3();
const nrm = new THREE.Vector3();
const col = new THREE.Color();

/** Cheap deterministic jitter so large flats aren't perfectly uniform. */
function triJitter(i: number, j: number): number {
  let h = Math.imul(i, 668265263) ^ Math.imul(j, 374761393);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

function shadeTriangle(
  normalY: number,
  scrub: number,
  jitter: number,
  groomed: boolean,
  stone: boolean,
  out: THREE.Color,
) {
  const slope = 1 - normalY;

  if (stone) {
    // Walls darken sharply, so courses and the spiral's risers read as masonry.
    out.copy(STONE).lerp(STONE_DARK, Math.min(1, slope / 0.55));
  } else if (groomed) {
    // Ramps are shaped dirt: no scrub, and they darken as they steepen so a lip
    // reads against its own approach.
    out.copy(GROOMED).lerp(PACKED, Math.min(1, slope / 0.5) * 0.55);
  } else if (slope > 0.45) {
    out.copy(ROCK);
  } else if (slope > 0.22) {
    // Dune faces pack down and get rockier as they steepen.
    out.copy(PACKED).lerp(ROCK, ((slope - 0.22) / 0.23) * 0.45);
  } else {
    out.copy(DIRT);
    out.lerp(PACKED, Math.min(1, slope / 0.22) * 0.5);
    // Scrub comes in patches from its own noise field, not from absolute height.
    // Keying it to height tints the entire bowl — which is 300 m wide, so the
    // whole play area comes out uniformly olive.
    if (scrub > 0) out.lerp(SCRUB, scrub * 0.7);
  }

  const k = 1 + jitter * 0.06;
  out.setRGB(out.r * k, out.g * k, out.b * k);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface Terrain {
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  dispose(): void;
}

export function buildTerrainMesh(hf: Heightfield, stride: number): Terrain {
  const { res, cell, half, data, mark } = hf;
  const quads = Math.floor((res - 1) / stride);
  const quadSize = cell * stride;
  const triCount = quads * quads * 2;

  const positions = new Float32Array(triCount * 3 * 3);
  const colors = new Float32Array(triCount * 3 * 3);

  let p = 0;

  const emit = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    jitter: number,
    groomed: boolean,
    stone: boolean,
  ) => {
    cA.set(x1 - x0, y1 - y0, z1 - z0);
    cB.set(x2 - x0, y2 - y0, z2 - z0);
    nrm.copy(cA).cross(cB).normalize();

    // Two noise scales: broad regions of vegetation, broken up by finer patches.
    const cx = (x0 + x1 + x2) / 3;
    const cz = (z0 + z1 + z2) / 3;
    const broad = sampleNoise(cx / 210, cz / 210, hf.seed + 11);
    const fine = sampleNoise(cx / 46, cz / 46, hf.seed + 12);
    const scrub = smoothstep(0.5, 0.85, broad * 0.65 + fine * 0.35);

    shadeTriangle(Math.abs(nrm.y), scrub, jitter, groomed, stone, col);

    positions[p] = x0; positions[p + 1] = y0; positions[p + 2] = z0;
    positions[p + 3] = x1; positions[p + 4] = y1; positions[p + 5] = z1;
    positions[p + 6] = x2; positions[p + 7] = y2; positions[p + 8] = z2;

    for (let v = 0; v < 3; v++) {
      colors[p + v * 3] = col.r;
      colors[p + v * 3 + 1] = col.g;
      colors[p + v * 3 + 2] = col.b;
    }
    p += 9;
  };

  for (let j = 0; j < quads; j++) {
    const gj = j * stride;
    const z0 = -half + gj * cell;
    const z1 = z0 + quadSize;
    for (let i = 0; i < quads; i++) {
      const gi = i * stride;
      const x0 = -half + gi * cell;
      const x1 = x0 + quadSize;

      const ya = data[gj * res + gi];
      const yb = data[gj * res + gi + stride];
      const yc = data[(gj + stride) * res + gi];
      const yd = data[(gj + stride) * res + gi + stride];

      const jitter = triJitter(gi, gj);
      // A quad counts as groomed if any of its corners were stamped, so a feature
      // edge doesn't shred into a checkerboard at this mesh stride.
      const m0 = mark[gj * res + gi];
      const m1 = mark[gj * res + gi + stride];
      const m2 = mark[(gj + stride) * res + gi];
      const m3 = mark[(gj + stride) * res + gi + stride];
      const stone = m0 === 2 || m1 === 2 || m2 === 2 || m3 === 2;
      const groomed = !stone && (m0 === 1 || m1 === 1 || m2 === 1 || m3 === 1);
      // Winding (a, c, b) and (b, c, d) both give upward normals.
      emit(x0, ya, z0, x0, yc, z1, x1, yb, z0, jitter, groomed, stone);
      emit(x1, yb, z0, x0, yc, z1, x1, yd, z1, -jitter, groomed, stone);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return {
    mesh,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

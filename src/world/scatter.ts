import * as THREE from 'three';
import type { Heightfield } from './heightfield';
import { scrubAt } from './terrainMesh';
import { activeTheme } from './themes';
import { T } from '../core/tunables';

/**
 * Instanced rocks and shrubs, scattered across whatever the park has not built on.
 *
 * The world was 1024 m of bare polygons. That is fine standing still and wrong at
 * speed: with nothing between the bike and the horizon there is no parallax, so
 * 40 km/h and 80 look the same out of the corner of your eye. Scatter is the
 * cheapest parallax there is — two draw calls, no per-frame work at all.
 *
 * Placement is **derived from the same noise field the `scrub` colour band uses**,
 * so shrubs grow where the ground is already tinted for them and rocks sit on the
 * bare patches between. Keying them to their own noise would have produced bushes
 * standing on bare dirt and boulders in the middle of vegetation, which reads as
 * two systems that have never met.
 *
 * Nothing is placed on worked ground. `mark` is non-zero over every ramp,
 * corridor, deck and landing pad in the park, and a shrub in the middle of a
 * take-off is both ugly and a lie about where you can ride.
 *
 * One geometry serves both: a detail-0 icosahedron, squashed wide and low for a
 * bush and left chunky for a rock. At 20 triangles apiece and flat-shaded it
 * matches the terrain it sits on, and using one shape for two things keeps the
 * whole system to a single geometry and two materials.
 */

export interface Scatter {
  group: THREE.Group;
  /** Instances actually placed, for the perf budget. */
  counts: { rocks: number; shrubs: number };
  dispose(): void;
}

/** Deterministic 0..1 hash. Same shape as the terrain's, different constants. */
function hash(i: number, j: number, salt: number): number {
  let h = Math.imul(i, 1597334677) ^ Math.imul(j, 3812015801) ^ Math.imul(salt, 2654435761);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const dummy = new THREE.Object3D();
const nrm = new THREE.Vector3();

export function createScatter(hf: Heightfield): Scatter {
  const cfg = T.scatter;
  const theme = activeTheme().terrain;
  const group = new THREE.Group();

  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(theme.rock),
    flatShading: true,
  });
  const shrubMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(theme.scrub),
    flatShading: true,
  });

  // Two passes over the same candidate grid, because an InstancedMesh needs its
  // count up front and walking the grid is far cheaper than growing arrays.
  const rocks: number[] = [];
  const shrubs: number[] = [];

  const reach = cfg.reach;
  const step = cfg.spacing;
  for (let gz = -reach; gz <= reach; gz += step) {
    for (let gx = -reach; gx <= reach; gx += step) {
      const i = Math.round(gx / step);
      const j = Math.round(gz / step);

      // Jitter off the lattice, or the whole thing reads as a grid at distance.
      const x = gx + (hash(i, j, 1) - 0.5) * step * 1.6;
      const z = gz + (hash(i, j, 2) - 0.5) * step * 1.6;

      // Never on worked ground: `mark` covers every ramp, corridor and deck.
      const gi = Math.round((x + hf.half) / hf.cell);
      const gj = Math.round((z + hf.half) / hf.cell);
      if (gi < 0 || gj < 0 || gi >= hf.res || gj >= hf.res) continue;
      if (hf.mark[gj * hf.res + gi] !== 0) continue;

      const y = hf.height(x, z);
      // Nor in the water, nor on ground too steep to hold anything.
      if (hf.waterLevelAt(x, z) !== null) continue;
      hf.normal(x, z, nrm);
      if (nrm.y < cfg.minNormalY) continue;

      // Clear of the spawn pad, which is the one place the player looks at from
      // a standstill every time they press R.
      if (Math.hypot(x - hf.spawn.x, z - hf.spawn.z) < cfg.spawnClear) continue;

      // The terrain's own scrub field, not a second one that happens to look
      // similar — shared so a bush always stands on ground already tinted green.
      const scrub = scrubAt(x, z, hf.seed);
      const roll = hash(i, j, 3);

      if (scrub > cfg.shrubAt) {
        if (roll < cfg.shrubChance) shrubs.push(x, y, z, hash(i, j, 4), hash(i, j, 5));
      } else if (roll < cfg.rockChance) {
        rocks.push(x, y, z, hash(i, j, 6), hash(i, j, 7));
      }
    }
  }

  function build(data: number[], material: THREE.Material, rock: boolean) {
    const count = data.length / 5;
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
    mesh.count = count;
    // Small, ground-level and everywhere: shadow-casting them would multiply the
    // shadow map's workload for detail nobody looks at. They still *receive*.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    for (let n = 0; n < count; n++) {
      const x = data[n * 5];
      const y = data[n * 5 + 1];
      const z = data[n * 5 + 2];
      const a = data[n * 5 + 3];
      const b = data[n * 5 + 4];

      const size = rock
        ? cfg.rockSize * (0.45 + a * 1.1)
        : cfg.shrubSize * (0.6 + a * 0.9);
      // Sunk a little, so nothing floats on a slope the icosahedron cannot follow.
      dummy.position.set(x, y - size * cfg.sink, z);
      dummy.rotation.set(b * 0.6, a * Math.PI * 2, b * 0.4);
      // Rocks are chunky; shrubs are wide and low, which is what stops the two
      // reading as the same object in two colours.
      dummy.scale.set(size, size * (rock ? 0.7 + b * 0.5 : 0.45), size);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return count;
  }

  const counts = {
    rocks: build(rocks, rockMat, true),
    shrubs: build(shrubs, shrubMat, false),
  };

  return {
    group,
    counts,
    dispose() {
      geometry.dispose();
      rockMat.dispose();
      shrubMat.dispose();
    },
  };
}

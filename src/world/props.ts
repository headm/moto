import * as THREE from 'three';
import type { Heightfield } from './heightfield';

/**
 * Set-piece props: water surfaces, a burning loop to fly through, and the
 * alligators in the pond.
 *
 * The loop is **decoration, not collision**. Ground contact is a heightfield
 * sample, which by construction cannot represent an overhang, so there is nothing
 * to hit — you fly through the hole. That is fine as long as the hole is actually
 * on the flight path, which is why its position is taken from a measured
 * trajectory rather than guessed, and why the harness asserts the bike passes
 * inside the ring.
 *
 * Water surfaces are built from `hf.waters` rather than from duplicated data, so
 * the thing you can see and the thing that drags you are guaranteed to agree.
 */

export interface LoopSpec {
  x: number;
  y: number;
  z: number;
  yaw: number;
  radius: number;
  tube: number;
}

export interface SetPieceSpec {
  loop: LoopSpec;
  gatorCount: number;
}

interface Gator {
  group: THREE.Group;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  phase: number;
  speed: number;
  level: number;
}

export interface Props {
  group: THREE.Group;
  update(dt: number): void;
  dispose(): void;
}

const WATER = new THREE.Color('#2f6b63');

export function createProps(hf: Heightfield, spec: SetPieceSpec): Props {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const mat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // ---- water ---------------------------------------------------------------
  const waterMaterial = mat(
    new THREE.MeshLambertMaterial({
      color: WATER,
      transparent: true,
      opacity: 0.78,
      flatShading: true,
    }),
  );
  const waterPlanes: { mesh: THREE.Mesh; level: number }[] = [];
  for (const w of hf.waters) {
    const geometry = track(new THREE.PlaneGeometry(w.halfWidth * 2, w.halfLength * 2, 1, 1));
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, waterMaterial);
    mesh.position.set(w.x, w.level, w.z);
    mesh.rotation.y = w.yaw;
    mesh.receiveShadow = true;
    group.add(mesh);
    waterPlanes.push({ mesh, level: w.level });
  }

  // ---- the burning loop ----------------------------------------------------
  const loop = spec.loop;
  const loopGroup = new THREE.Group();
  loopGroup.position.set(loop.x, loop.y, loop.z);
  loopGroup.rotation.y = loop.yaw;
  group.add(loopGroup);

  const ring = new THREE.Mesh(
    track(new THREE.TorusGeometry(loop.radius, loop.tube, 8, 26)),
    mat(new THREE.MeshLambertMaterial({ color: 0x33363c, flatShading: true })),
  );
  ring.castShadow = true;
  loopGroup.add(ring);

  // Two additive shells around the ring read as flame far more cheaply than a
  // particle system, and they never wash out because they sit against sky.
  const flameOuter = new THREE.Mesh(
    track(new THREE.TorusGeometry(loop.radius, loop.tube * 3.4, 8, 26)),
    mat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ff6a12'),
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    ),
  );
  loopGroup.add(flameOuter);

  const flameInner = new THREE.Mesh(
    track(new THREE.TorusGeometry(loop.radius, loop.tube * 1.8, 8, 26)),
    mat(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffd08a'),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    ),
  );
  loopGroup.add(flameInner);

  const loopLight = new THREE.PointLight(0xff7d22, 26, 34, 2);
  loopGroup.add(loopLight);

  // Legs down to whatever is under the ring — without them a flaming hoop hangs
  // in mid-air with nothing holding it up.
  const legMaterial = mat(new THREE.MeshLambertMaterial({ color: 0x3a3d43, flatShading: true }));
  for (const side of [-1, 1]) {
    const footX = loop.x + Math.cos(loop.yaw) * -side * loop.radius * 0.82;
    const footZ = loop.z + Math.sin(loop.yaw) * side * loop.radius * 0.82;
    const groundY = hf.height(footX, footZ);
    const top = loop.y - loop.radius * 0.55;
    const height = Math.max(1, top - groundY);
    const leg = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.22, 0.34, height, 6)),
      legMaterial,
    );
    leg.position.set(footX, groundY + height / 2, footZ);
    leg.castShadow = true;
    group.add(leg);
  }

  // ---- alligators ----------------------------------------------------------
  const gatorBody = mat(new THREE.MeshLambertMaterial({ color: 0x3f5b34, flatShading: true }));
  const gatorBelly = mat(new THREE.MeshLambertMaterial({ color: 0x6d7a45, flatShading: true }));
  const gatorEye = mat(new THREE.MeshLambertMaterial({ color: 0xf2e6c2, flatShading: true }));

  const bodyGeo = track(new THREE.BoxGeometry(0.95, 0.42, 3.1));
  const snoutGeo = track(new THREE.BoxGeometry(0.62, 0.3, 1.25));
  const tailGeo = track(new THREE.BoxGeometry(0.5, 0.26, 1.7));
  const tipGeo = track(new THREE.BoxGeometry(0.24, 0.18, 1.1));
  const ridgeGeo = track(new THREE.BoxGeometry(0.16, 0.22, 0.22));
  const eyeGeo = track(new THREE.BoxGeometry(0.16, 0.14, 0.16));

  function buildGator(): THREE.Group {
    const g = new THREE.Group();

    const body = new THREE.Mesh(bodyGeo, gatorBody);
    body.castShadow = true;
    g.add(body);

    const snout = new THREE.Mesh(snoutGeo, gatorBody);
    snout.position.set(0, -0.04, 2.1);
    g.add(snout);

    const jaw = new THREE.Mesh(track(new THREE.BoxGeometry(0.5, 0.1, 1.05)), gatorBelly);
    jaw.position.set(0, -0.16, 2.15);
    g.add(jaw);

    const tail = new THREE.Mesh(tailGeo, gatorBody);
    tail.position.set(0, -0.02, -2.3);
    g.add(tail);

    const tip = new THREE.Mesh(tipGeo, gatorBody);
    tip.position.set(0, -0.02, -3.6);
    g.add(tip);

    // Ridge line along the spine — the read that says "alligator" and not "log".
    for (let i = 0; i < 6; i++) {
      const ridge = new THREE.Mesh(ridgeGeo, gatorBody);
      ridge.position.set(0, 0.28, 1.2 - i * 0.72);
      ridge.rotation.y = Math.PI / 4;
      g.add(ridge);
    }

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, gatorEye);
      eye.position.set(side * 0.24, 0.24, 1.66);
      g.add(eye);
    }

    return g;
  }

  const gators: Gator[] = [];
  const pond = hf.waters[0];
  if (pond) {
    for (let i = 0; i < spec.gatorCount; i++) {
      const g = buildGator();
      // Deterministic spread — no Math.random, so the pond looks the same every
      // load and a screenshot can be compared against the last one.
      const a = (i / spec.gatorCount) * Math.PI * 2;
      const shrink = 0.34 + 0.24 * ((i % 3) / 2);
      gators.push({
        group: g,
        cx: pond.x + Math.cos(a * 1.7) * pond.halfWidth * 0.22,
        cz: pond.z + Math.sin(a * 1.3) * pond.halfLength * 0.22,
        rx: pond.halfWidth * shrink,
        rz: pond.halfLength * shrink,
        phase: a,
        speed: 0.16 + 0.07 * ((i % 4) / 3),
        level: pond.level,
      });
      group.add(g);
    }
  }

  let clock = 0;

  return {
    group,
    update(dt: number) {
      clock += dt;

      // Two incommensurate sines again: cheap, and no two frames look alike.
      const flicker = 0.72 + 0.28 * Math.sin(clock * 11.3) * Math.sin(clock * 7.1 + 0.7);
      flameOuter.scale.setScalar(0.97 + 0.06 * flicker);
      flameInner.scale.setScalar(0.99 + 0.03 * flicker);
      (flameOuter.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.2 * flicker;
      (flameInner.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.25 * flicker;
      loopLight.intensity = 18 + 14 * flicker;

      // Surface breathes a few centimetres so the water isn't a dead flat slab.
      for (const w of waterPlanes) {
        w.mesh.position.y = w.level + Math.sin(clock * 0.85) * 0.05;
      }

      for (const g of gators) {
        const t = clock * g.speed + g.phase;
        const x = g.cx + Math.cos(t) * g.rx;
        const z = g.cz + Math.sin(t) * g.rz;
        // Tangent of the ellipse gives the heading; the model noses toward +Z, the
        // same convention the bike uses.
        const dx = -Math.sin(t) * g.rx;
        const dz = Math.cos(t) * g.rz;
        g.group.position.set(x, g.level - 0.14 + Math.sin(clock * 1.4 + g.phase) * 0.045, z);
        g.group.rotation.y = Math.atan2(dx, dz);
        g.group.rotation.z = Math.sin(clock * 1.1 + g.phase) * 0.05;
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

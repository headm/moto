import * as THREE from 'three';
import { T } from '../core/tunables';

/**
 * Provisional bike, built from primitives. Replaced by a real model in M4.
 *
 * It is more than the "box" M1 strictly needs, and that is deliberate: pitch and
 * roll are the two things being tuned in this milestone, and a shape with an
 * obvious nose, visible fork travel and spinning wheels makes them readable.
 *
 * The model is authored nose-toward +Z to match the physics convention
 * `forward = (sin yaw, 0, cos yaw)`.
 */

export interface BikeModel {
  root: THREE.Group;
  chassis: THREE.Group;
  frontWheel: THREE.Group;
  rearWheel: THREE.Group;
  fork: THREE.Mesh;
  dispose(): void;
}

const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

function mat(color: number, opts: THREE.MeshLambertMaterialParameters = {}) {
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
  disposables.push(m);
  return m;
}

function box(w: number, h: number, d: number, material: THREE.Material) {
  const g = new THREE.BoxGeometry(w, h, d);
  disposables.push(g);
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  return mesh;
}

function wheel(radius: number, width: number): THREE.Group {
  const group = new THREE.Group();

  const tyreGeo = new THREE.CylinderGeometry(radius, radius, width, 16, 1);
  tyreGeo.rotateZ(Math.PI / 2); // axis along local X so rotation.x spins it
  disposables.push(tyreGeo);
  const tyre = new THREE.Mesh(tyreGeo, mat(0x24262a));
  tyre.castShadow = true;
  group.add(tyre);

  const hubGeo = new THREE.CylinderGeometry(radius * 0.28, radius * 0.28, width * 1.15, 10, 1);
  hubGeo.rotateZ(Math.PI / 2);
  disposables.push(hubGeo);
  group.add(new THREE.Mesh(hubGeo, mat(0x9aa0a6)));

  // A single spoke, purely so wheel rotation is visible at speed.
  const spoke = box(width * 1.3, radius * 1.75, radius * 0.14, mat(0xd8dade));
  group.add(spoke);

  return group;
}

export function createBikeModel(): BikeModel {
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';

  // Everything visual hangs off `chassis`, which is offset by suspension travel
  // so the body drops toward the wheels under compression.
  const chassis = new THREE.Group();
  root.add(chassis);

  const red = mat(0xc4432c);
  const dark = mat(0x2c2f34);
  const metal = mat(0x8e949b);
  const rider = mat(0x2f5f8f);
  const skin = mat(0xd2a679);

  const body = box(0.36, 0.3, 1.35, dark);
  body.position.set(0, -0.04, -0.05);
  chassis.add(body);

  const tank = box(0.34, 0.26, 0.62, red);
  tank.position.set(0, 0.2, 0.16);
  chassis.add(tank);

  const shroud = box(0.46, 0.2, 0.34, red);
  shroud.position.set(0, 0.16, 0.46);
  chassis.add(shroud);

  const seat = box(0.26, 0.12, 0.5, dark);
  seat.position.set(0, 0.24, -0.36);
  chassis.add(seat);

  const rearFender = box(0.24, 0.08, 0.46, red);
  rearFender.position.set(0, 0.24, -0.74);
  chassis.add(rearFender);

  const swingarm = box(0.14, 0.1, 0.66, metal);
  swingarm.position.set(0, -0.16, -0.44);
  chassis.add(swingarm);

  // Fork: scaled along Y at runtime to show travel.
  const fork = box(0.2, 0.62, 0.14, metal);
  fork.position.set(0, -0.02, 0.6);
  fork.rotation.x = -0.24;
  chassis.add(fork);

  const bars = box(0.62, 0.06, 0.06, metal);
  bars.position.set(0, 0.42, 0.52);
  chassis.add(bars);

  const frontFender = box(0.3, 0.06, 0.44, red);
  frontFender.position.set(0, 0.14, 0.78);
  chassis.add(frontFender);

  // Rider: crude, but the silhouette sells orientation at distance.
  const torso = box(0.32, 0.44, 0.26, rider);
  torso.position.set(0, 0.56, -0.16);
  torso.rotation.x = -0.34;
  chassis.add(torso);

  const head = box(0.24, 0.24, 0.26, mat(0xe8e4dc));
  head.position.set(0, 0.86, -0.02);
  chassis.add(head);

  const visor = box(0.2, 0.09, 0.06, mat(0x1b1d21));
  visor.position.set(0, 0.86, 0.13);
  chassis.add(visor);

  const armL = box(0.1, 0.1, 0.52, rider);
  armL.position.set(-0.24, 0.54, 0.16);
  armL.rotation.x = 0.42;
  chassis.add(armL);

  const armR = armL.clone();
  armR.position.x = 0.24;
  chassis.add(armR);

  const legL = box(0.13, 0.4, 0.16, skin);
  legL.position.set(-0.19, 0.24, -0.3);
  legL.rotation.x = 0.5;
  chassis.add(legL);

  const legR = legL.clone();
  legR.position.x = 0.19;
  chassis.add(legR);

  const r = T.bike.wheelRadius;
  const frontWheel = wheel(r, 0.11);
  const rearWheel = wheel(r * 1.03, 0.14);
  root.add(frontWheel, rearWheel);

  return {
    root,
    chassis,
    frontWheel,
    rearWheel,
    fork,
    dispose() {
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    },
  };
}

/** Shortest-arc angle lerp, for interpolating between physics steps. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

export function syncBikeModel(
  m: BikeModel,
  pos: THREE.Vector3,
  yaw: number,
  pitch: number,
  roll: number,
  susp: number,
  wheelSpin: number,
) {
  m.root.position.copy(pos);
  // rotation.x is negated because Three's +x pitches the nose down while the
  // physics convention is nose-up positive. rotation.z is *not* negated: this
  // model is authored nose-toward +Z, so its local +X is the rider's left, and a
  // positive z-rotation lifts that left side — which is a lean to the right.
  m.root.rotation.set(-pitch, yaw, roll);

  // Ground rises toward the chassis under compression, so wheels ride up in
  // local space and the body appears to squat.
  const r = T.bike.wheelRadius;
  const axleY = r - T.susp.restHeight + susp;
  const halfWB = T.bike.wheelBase * 0.5;

  m.frontWheel.position.set(0, axleY, halfWB);
  m.rearWheel.position.set(0, axleY, -halfWB);
  m.frontWheel.rotation.x = wheelSpin;
  m.rearWheel.rotation.x = wheelSpin;

  m.chassis.position.y = -susp * 0.55;
  m.fork.scale.y = 1 - Math.min(0.5, susp / Math.max(0.001, T.susp.maxTravel) * 0.35);
}

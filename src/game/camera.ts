import * as THREE from 'three';
import { T } from '../core/tunables';
import type { Heightfield } from '../world/heightfield';

/**
 * Spring-arm chase camera — the single piece most responsible for whether air
 * feels big.
 *
 * Two decisions matter:
 *   1. It follows a *smoothed travel direction*, not the bike's yaw. Following
 *      yaw makes spins whip the camera around and is genuinely nauseating.
 *   2. Airborne, the arm extends and damping loosens, so the world falls away
 *      below you. That's the whole feeling.
 */

const desired = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const travelNow = new THREE.Vector3();

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;

  private travel = new THREE.Vector3(0, 0, 1);
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private shake = 0;
  private clock = 0;
  private fov = T.cam.fovBase;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(T.cam.fovBase, aspect, 0.15, 2000);
  }

  /** Snap behind the bike with no easing — used on spawn and respawn. */
  reset(bikePos: THREE.Vector3, yaw: number) {
    const c = T.cam;
    this.travel.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.pos.copy(bikePos).addScaledVector(this.travel, -c.distGround);
    this.pos.y += c.heightGround;
    this.look.copy(bikePos).addScaledVector(this.travel, c.lookLead);
    this.look.y += c.lookHeight;
    this.shake = 0;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  update(
    dt: number,
    bikePos: THREE.Vector3,
    yaw: number,
    vel: THREE.Vector3,
    airTime: number,
    hf: Heightfield,
    impact: number,
  ) {
    const c = T.cam;
    this.clock += dt;

    // Travel direction, falling back to heading at a standstill.
    const speed = Math.hypot(vel.x, vel.z);
    if (speed > 1.5) travelNow.set(vel.x / speed, 0, vel.z / speed);
    else travelNow.set(Math.sin(yaw), 0, Math.cos(yaw));

    const ka = 1 - Math.exp(-c.travelDamp * dt);
    this.travel.x += (travelNow.x - this.travel.x) * ka;
    this.travel.z += (travelNow.z - this.travel.z) * ka;
    this.travel.y = 0;
    if (this.travel.lengthSq() < 1e-6) this.travel.copy(travelNow);
    this.travel.normalize();

    // Airborne blend ramps in over the first fraction of a second so small
    // bumps and kerbs don't make the camera breathe.
    const airMix = THREE.MathUtils.clamp(airTime / 0.45, 0, 1);
    const dist = THREE.MathUtils.lerp(c.distGround, c.distAir, airMix);
    const height = THREE.MathUtils.lerp(c.heightGround, c.heightAir, airMix);
    const damp = THREE.MathUtils.lerp(c.posDampGround, c.posDampAir, airMix);

    desired.copy(bikePos).addScaledVector(this.travel, -dist);
    desired.y += height;
    this.pos.lerp(desired, 1 - Math.exp(-damp * dt));

    // Never clip through a hill between camera and bike.
    const clearance = hf.height(this.pos.x, this.pos.z) + c.minClearance;
    if (this.pos.y < clearance) this.pos.y = clearance;

    lookTarget.copy(bikePos).addScaledVector(this.travel, c.lookLead);
    lookTarget.y += c.lookHeight;
    this.look.lerp(lookTarget, 1 - Math.exp(-damp * 1.4 * dt));

    // Impact shake, scaled by how hard the landing was.
    if (impact > 4) this.shake = Math.min(1, this.shake + (impact - 4) * c.shakeGain);
    this.shake *= Math.exp(-c.shakeDecay * dt);

    this.camera.position.copy(this.pos);
    if (this.shake > 0.002) {
      const a = this.shake * this.shake;
      this.camera.position.x += Math.sin(this.clock * 47.3) * a * 0.55;
      this.camera.position.y += Math.sin(this.clock * 61.7 + 1.7) * a * 0.55;
      this.camera.position.z += Math.sin(this.clock * 53.1 + 3.1) * a * 0.35;
    }
    this.camera.lookAt(this.look);

    const fovTarget = Math.min(c.fovMax, c.fovBase + speed * c.fovGain + airMix * 4);
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.02) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

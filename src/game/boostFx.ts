import * as THREE from 'three';
import { T } from '../core/tunables';
import type { Heightfield } from '../world/heightfield';

/**
 * Boost visuals: twin exhaust flames, a flickering light that pools on the dirt,
 * and a trail of embers and kicked-up dust.
 *
 * The light is doing most of the work. A moving pool of orange on the ground
 * behind the bike is something no amount of additive sprite work can fake, and
 * because the terrain is MeshLambert it comes almost free. It's added to the
 * scene graph at construction with zero intensity rather than on demand, so
 * every material compiles once against one point light instead of triggering a
 * shader rebuild mid-ride.
 *
 * Particles are low-poly cubes rather than billboarded sprites — no billboard
 * maths, no soft-edge texture, and tumbling boxes suit the flat-shaded world
 * better than round puffs would. Blending is normal rather than additive on
 * purpose: this desert is a bright tan, and additive orange over it washes
 * straight to white.
 *
 * Nothing here allocates per frame.
 */

const MAX_PARTICLES = 240;

/** Exhaust mouth, in bike-local space. Bike noses toward +Z, so back is -Z. */
const EXHAUST_X = 0.13;
const EXHAUST_Y = 0.06;
const EXHAUST_Z = -0.7;

const EMBER_HOT = new THREE.Color('#ffd977');
const EMBER_COOL = new THREE.Color('#c1350c');
const DUST_HOT = new THREE.Color('#cdb896');
const DUST_COOL = new THREE.Color('#8b7a5b');

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number;
  /** 1 at spawn, 0 at death. */
  life: number;
  decay: number;
  sizeStart: number;
  sizeEnd: number;
  gravity: number;
  drag: number;
  dust: boolean;
  settled: boolean;
}

const dummy = new THREE.Object3D();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const quat = new THREE.Quaternion();
const offset = new THREE.Vector3();
const back = new THREE.Vector3();
const side = new THREE.Vector3();
const color = new THREE.Color();

export class BoostFx {
  /** World-space particles. Add to the scene. */
  readonly particles = new THREE.Group();
  /** Flames and the exhaust light. Attach to the bike chassis. */
  readonly rig = new THREE.Group();

  /** True on the frame a burst ignites, so the camera can punch. */
  justIgnited = false;

  private pool: Particle[] = [];
  private mesh: THREE.InstancedMesh;
  private colorAttr: THREE.InstancedBufferAttribute;
  private alphaAttr: THREE.InstancedBufferAttribute;

  private innerFlame: THREE.Mesh[] = [];
  private outerFlame: THREE.Mesh[] = [];
  private light: THREE.PointLight;

  private flame = 0;
  private clock = 0;
  private emberAcc = 0;
  private dustAcc = 0;
  private wasBoosting = false;
  private cursor = 0;
  private liveCount = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0,
        sx: 0, sy: 0, sz: 0,
        life: 0,
        decay: 1,
        sizeStart: 0.1,
        sizeEnd: 0.02,
        gravity: 7,
        drag: 1.2,
        dust: false,
        settled: false,
      });
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const alphas = new Float32Array(MAX_PARTICLES);
    this.colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    this.alphaAttr = new THREE.InstancedBufferAttribute(alphas, 1);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aColor', this.colorAttr);
    geometry.setAttribute('aAlpha', this.alphaAttr);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          gl_Position = projectionMatrix * modelViewMatrix * p;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(vColor, vAlpha);
          // Same reason as the sky dome: ShaderMaterial gets neither the tone
          // mapper nor the output conversion unless you ask for them, and the
          // uniforms arrive already in the linear working space.
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.particles.add(this.mesh);

    // Flames: two cones per side, a bright core inside a broader envelope. The
    // geometry is shifted so its base sits at the origin, which means scaling
    // length grows the flame backwards instead of pushing it into the engine.
    for (const sign of [-1, 1]) {
      this.innerFlame.push(this.makeFlame(sign, 0.065, 0.6, '#ffe6ad', 0.78));
      this.outerFlame.push(this.makeFlame(sign, 0.12, 1.0, '#ff7a18', 0.36));
    }

    this.light = new THREE.PointLight(0xff7d22, 0, 4.5, 2);
    this.light.position.set(0, EXHAUST_Y + 0.1, EXHAUST_Z - 0.5);
    this.rig.add(this.light);
  }

  private makeFlame(sign: number, radius: number, length: number, hex: string, opacity: number) {
    const geometry = new THREE.ConeGeometry(radius, length, 7, 1, true);
    geometry.rotateX(-Math.PI / 2); // tip toward -Z, i.e. out the back
    geometry.translate(0, 0, -length / 2); // base at the origin
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(sign * EXHAUST_X, EXHAUST_Y, EXHAUST_Z);
    mesh.visible = false;
    this.rig.add(mesh);
    return mesh;
  }

  update(
    dt: number,
    boosting: boolean,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    yaw: number,
    pitch: number,
    roll: number,
    grounded: boolean,
    hf: Heightfield,
  ) {
    const b = T.boost;
    this.clock += dt;
    this.justIgnited = boosting && !this.wasBoosting;

    // Fast attack, slower release — a boost should light instantly and trail off.
    const target = boosting ? 1 : 0;
    const rate = boosting ? 16 : 7;
    this.flame += (target - this.flame) * (1 - Math.exp(-rate * dt));

    // Two incommensurate sines read as flicker for a fraction of the cost of noise.
    const flicker =
      0.78 + 0.22 * Math.sin(this.clock * 47.3) * Math.sin(this.clock * 31.1 + 1.3);
    const shown = this.flame > 0.02;

    for (let i = 0; i < 2; i++) {
      const inner = this.innerFlame[i];
      const outer = this.outerFlame[i];
      inner.visible = shown;
      outer.visible = shown;
      if (!shown) continue;
      const len = this.flame * flicker * b.flameLength;
      const wob = 0.85 + 0.15 * Math.sin(this.clock * 39.7 + i * 2.1);
      inner.scale.set(wob, wob, len);
      outer.scale.set(wob * 1.05, wob * 1.05, len * 1.35);
    }

    this.light.intensity = this.flame * flicker * b.lightIntensity;
    this.light.distance = b.lightRange;

    // ---- emission ---------------------------------------------------------
    // Bike-local to world, matching the model's own YXZ / negated-pitch order.
    euler.set(-pitch, yaw, roll);
    quat.setFromEuler(euler);
    back.set(0, 0, -1).applyQuaternion(quat);
    side.set(1, 0, 0).applyQuaternion(quat);

    if (boosting) {
      if (this.justIgnited) {
        // Scaled off the rates rather than hardcoded, so turning a rate down to
        // zero removes its ignition puff as well as its trail.
        const emberBurst = Math.round(b.emberRate * 0.27);
        const dustBurst = Math.round(b.dustRate * 0.16);
        for (let i = 0; i < emberBurst; i++) this.spawnEmber(pos, vel, quat, back, side, 1.5);
        if (grounded) for (let i = 0; i < dustBurst; i++) this.spawnDust(pos, vel, back, side, hf);
      }
      this.emberAcc += b.emberRate * dt;
      while (this.emberAcc >= 1) {
        this.emberAcc -= 1;
        this.spawnEmber(pos, vel, quat, back, side, 1);
      }
      if (grounded) {
        this.dustAcc += b.dustRate * dt;
        while (this.dustAcc >= 1) {
          this.dustAcc -= 1;
          this.spawnDust(pos, vel, back, side, hf);
        }
      }
    } else {
      this.emberAcc = 0;
      this.dustAcc = 0;
    }

    this.simulate(dt, hf);
    this.wasBoosting = boosting;
  }

  private spawnEmber(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    q: THREE.Quaternion,
    backDir: THREE.Vector3,
    sideDir: THREE.Vector3,
    burst: number,
  ) {
    const p = this.take();
    // Alternate pipes so the trail reads as twin exhausts.
    const sign = this.cursor % 2 === 0 ? 1 : -1;
    offset.set(sign * EXHAUST_X, EXHAUST_Y, EXHAUST_Z).applyQuaternion(q);
    p.x = pos.x + offset.x;
    p.y = pos.y + offset.y;
    p.z = pos.z + offset.z;

    // Only a fraction of the bike's velocity is inherited, so the trail falls
    // behind instead of travelling along with the bike.
    const eject = (2.5 + Math.random() * 3.5) * burst;
    p.vx = vel.x * 0.15 + backDir.x * eject + sideDir.x * (Math.random() - 0.5) * 1.6;
    p.vy = vel.y * 0.15 + backDir.y * eject + 0.6 + Math.random() * 1.6;
    p.vz = vel.z * 0.15 + backDir.z * eject + sideDir.z * (Math.random() - 0.5) * 1.6;

    p.life = 1;
    p.decay = 1 / (0.3 + Math.random() * 0.26);
    p.sizeStart = 0.055 + Math.random() * 0.055;
    p.sizeEnd = 0.015;
    p.gravity = 7;
    p.drag = 1.3;
    p.dust = false;
    p.settled = false;
    this.randomSpin(p, 9);
  }

  private spawnDust(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    backDir: THREE.Vector3,
    sideDir: THREE.Vector3,
    hf: Heightfield,
  ) {
    const p = this.take();
    // Off the rear contact patch, not the pipes.
    const halfWB = T.bike.wheelBase * 0.5;
    p.x = pos.x + backDir.x * halfWB + sideDir.x * (Math.random() - 0.5) * 0.5;
    p.z = pos.z + backDir.z * halfWB + sideDir.z * (Math.random() - 0.5) * 0.5;
    p.y = hf.height(p.x, p.z) + 0.1;

    // Thrown backwards more than upwards — a rooster tail hugging the ground,
    // not a cloud floating past the rider's head.
    p.vx = vel.x * 0.1 + backDir.x * (2 + Math.random() * 3.5) + (Math.random() - 0.5) * 1.6;
    p.vy = 0.5 + Math.random() * 1.5;
    p.vz = vel.z * 0.1 + backDir.z * (2 + Math.random() * 3.5) + (Math.random() - 0.5) * 1.6;

    p.life = 1;
    p.decay = 1 / (0.42 + Math.random() * 0.34);
    // Small and many rather than large and few: big translucent boxes stack
    // their alpha where they overlap and read as floating paper.
    p.sizeStart = 0.1 + Math.random() * 0.08;
    p.sizeEnd = 0.24 + Math.random() * 0.12; // dust expands as it dissipates
    p.gravity = 2.2;
    p.drag = 1.9;
    p.dust = true;
    p.settled = false;
    this.randomSpin(p, 3);
  }

  private randomSpin(p: Particle, scale: number) {
    p.rx = Math.random() * Math.PI * 2;
    p.ry = Math.random() * Math.PI * 2;
    p.rz = Math.random() * Math.PI * 2;
    p.sx = (Math.random() - 0.5) * scale;
    p.sy = (Math.random() - 0.5) * scale;
    p.sz = (Math.random() - 0.5) * scale;
  }

  /** Ring buffer: the oldest particle is recycled once the pool is saturated. */
  private take(): Particle {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    if (p.life <= 0) this.liveCount++;
    this.mesh.visible = true;
    return p;
  }

  private simulate(dt: number, hf: Heightfield) {
    // Nothing alive: don't touch the buffers or draw the instances at all. With
    // both rates at zero this is the normal case.
    if (this.liveCount === 0) {
      this.mesh.visible = false;
      return;
    }

    const colors = this.colorAttr.array as Float32Array;
    const alphas = this.alphaAttr.array as Float32Array;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];

      if (p.life <= 0) {
        // Dead instances are scaled away rather than packed out of the draw
        // range; at this pool size that's cheaper than compacting every frame.
        alphas[i] = 0;
        dummy.scale.setScalar(0);
        dummy.position.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      p.life -= p.decay * dt;
      if (p.life <= 0) {
        p.life = 0;
        this.liveCount--;
      }

      if (!p.settled) {
        p.vy -= p.gravity * dt;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy *= d;
        p.vz *= d;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.rx += p.sx * dt;
        p.ry += p.sy * dt;
        p.rz += p.sz * dt;

        // Embers that reach the dirt settle and fizzle out instead of sinking.
        const ground = hf.height(p.x, p.z) + 0.04;
        if (p.y < ground) {
          p.y = ground;
          p.settled = true;
          p.decay = Math.max(p.decay, 3.5);
        }
      }

      const t = p.life;
      const size = p.sizeEnd + (p.sizeStart - p.sizeEnd) * t;
      const alpha = p.dust ? t * 0.22 : Math.min(1, t * 1.35);

      if (p.dust) color.copy(DUST_COOL).lerp(DUST_HOT, t);
      else color.copy(EMBER_COOL).lerp(EMBER_HOT, t);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      alphas[i] = alpha;

      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    for (const m of [...this.innerFlame, ...this.outerFlame]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}

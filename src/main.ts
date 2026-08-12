import * as THREE from 'three';
import { T, loadTunables } from './core/tunables';
import { createLoop } from './core/loop';
import { Input } from './core/input';
import { Heightfield } from './world/heightfield';
import { buildTerrainMesh, type Terrain } from './world/terrainMesh';
import { createSky, updateSky, applyLighting } from './world/sky';
import { applyPark } from './world/ramps';
import { PARK } from './world/park';
import { createBikeState, resetBike, groundSpeed } from './bike/state';
import { stepBike } from './bike/physics';
import { createBikeModel, syncBikeModel, lerpAngle } from './bike/model';
import { ChaseCamera } from './game/camera';
import { BoostFx } from './game/boostFx';
import { Hud } from './ui/hud';
import { buildGui } from './ui/debug';

loadTunables();

// ---- renderer --------------------------------------------------------------

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Neutral rather than ACES: it rolls off highlights without the desaturation
// ACES applies, which matters when the whole look is flat blocks of colour.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = T.light.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sky = createSky(scene, T.render.fogDensity);

// ---- world -----------------------------------------------------------------

function buildWorld(): Heightfield {
  const field = new Heightfield(T.world);
  if (T.world.ramps) applyPark(field, PARK);
  return field;
}

let hf = buildWorld();
let terrain: Terrain = buildTerrainMesh(hf, T.world.meshStride);
scene.add(terrain.mesh);

const bike = createBikeState();
resetBike(bike, hf);

const bikeModel = createBikeModel();
scene.add(bikeModel.root);

// Particles live in world space; the flames and exhaust light ride the chassis
// so they inherit pitch, roll and yaw for free.
const boostFx = new BoostFx();
scene.add(boostFx.particles);
bikeModel.chassis.add(boostFx.rig);

const chase = new ChaseCamera(window.innerWidth / window.innerHeight);
chase.reset(bike.pos, bike.yaw);

const input = new Input();
const hud = new Hud();
input.onAnyKey = () => hud.fadeHint();

function applyRender() {
  terrain.mesh.castShadow = T.render.terrainShadows;
  terrain.material.wireframe = T.render.wireframe;
  (scene.fog as THREE.FogExp2).density = T.render.fogDensity;
  renderer.toneMappingExposure = T.light.exposure;
  applyLighting(sky);
}

function regenerateWorld() {
  scene.remove(terrain.mesh);
  terrain.dispose();
  hf = buildWorld();
  terrain = buildTerrainMesh(hf, T.world.meshStride);
  scene.add(terrain.mesh);
  applyRender();
  respawn();
}

function respawn() {
  resetBike(bike, hf);
  chase.reset(bike.pos, bike.yaw);
}

applyRender();
buildGui({ respawn, regenerateWorld, applyRender });

// ---- resize ----------------------------------------------------------------

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  chase.setAspect(w / h);
}
window.addEventListener('resize', onResize);

// ---- loop ------------------------------------------------------------------

const interpPos = new THREE.Vector3();
const triangleCount = terrain.mesh.geometry.getAttribute('position').count / 3;

const loop = createLoop({
  step: 1 / 120,
  maxSubSteps: 8,

  onFrameStart() {
    input.poll();
    if (input.state.respawn) respawn();
  },

  onStep(dt) {
    stepBike(bike, hf, input.state, dt);
  },

  onRender(alpha, frameDt) {
    // Interpolate between the last two physics states so motion stays smooth
    // regardless of display refresh rate.
    interpPos.lerpVectors(bike.prevPos, bike.pos, alpha);
    const yaw = lerpAngle(bike.prevYaw, bike.yaw, alpha);
    const pitch = lerpAngle(bike.prevPitch, bike.pitch, alpha);
    const roll = lerpAngle(bike.prevRoll, bike.roll, alpha);
    const susp = bike.prevSusp + (bike.susp - bike.prevSusp) * alpha;
    const spin = bike.prevWheelSpin + (bike.wheelSpin - bike.prevWheelSpin) * alpha;

    syncBikeModel(bikeModel, interpPos, yaw, pitch, roll, susp, spin);

    const boosting = bike.boostRemaining > 0;
    boostFx.update(frameDt, boosting, interpPos, bike.vel, yaw, pitch, roll, bike.grounded, hf);

    chase.update(frameDt, interpPos, yaw, bike.vel, bike.airTime, hf, bike.lastImpact, boosting);
    if (boostFx.justIgnited) chase.punch(T.boost.ignitionPunch);
    bike.lastImpact = 0;

    updateSky(sky, interpPos);

    hud.update({
      speed: groundSpeed(bike),
      airTime: bike.airTime,
      airPeak: bike.airPeak,
      grounded: bike.grounded,
      boostFill: boosting
        ? bike.boostRemaining / T.boost.duration
        : bike.boostCooldown > 0
          ? 1 - bike.boostCooldown / Math.max(1e-4, T.boost.cooldown)
          : 1,
      boostState: boosting ? 'active' : bike.boostCooldown > 0 ? 'cooling' : 'ready',
      landing: bike.landing,
      fps: loop.fps,
      frameDt,
      tris: triangleCount,
    });

    renderer.render(scene, chase.camera);
  },
});

loop.start();

if (import.meta.env.DEV) {
  // Dev-only inspection handle. Lets the console (and automated checks) read
  // physics state without threading it through the HUD.
  Object.assign(window as unknown as Record<string, unknown>, {
    __moto: {
      bike,
      get hf() {
        return hf;
      },
      loop,
      input,
      chase,
      T,
      respawn,
      /**
       * Run physics forward with fixed input, without waiting for real frames.
       * Offscreen/headless contexts don't fire requestAnimationFrame, so this is
       * the only way to get the bike somewhere interesting for a screenshot.
       */
      fastForward(seconds: number, hold: Partial<typeof input.state> = {}) {
        const held = { ...input.state, ...hold, respawn: false };
        const steps = Math.round(seconds * 120);
        for (let i = 0; i < steps; i++) stepBike(bike, hf, held, 1 / 120);
        chase.reset(bike.pos, bike.yaw);
        return this.probe();
      },
      probe() {
        return {
          pos: bike.pos.toArray().map((v) => +v.toFixed(2)),
          speed: +groundSpeed(bike).toFixed(2),
          vy: +bike.vel.y.toFixed(2),
          deg: {
            yaw: +THREE.MathUtils.radToDeg(bike.yaw).toFixed(1),
            pitch: +THREE.MathUtils.radToDeg(bike.pitch).toFixed(1),
            roll: +THREE.MathUtils.radToDeg(bike.roll).toFixed(1),
          },
          grounded: bike.grounded,
          airTime: +bike.airTime.toFixed(2),
          airPeak: +bike.airPeak.toFixed(2),
          susp: +bike.susp.toFixed(3),
          groundY: +hf.height(bike.pos.x, bike.pos.z).toFixed(2),
          fps: +loop.fps.toFixed(0),
        };
      },
    },
  });
}

// Note: no visibilitychange handler. Browsers already throttle rAF in hidden
// tabs, and the loop clamps any frame longer than 0.5 s down to a single step,
// so waking up can't produce a simulation backlog. Stopping the loop outright
// also breaks headless/offscreen rendering, where the document reports hidden.

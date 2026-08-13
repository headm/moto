import GUI from 'lil-gui';
import { T, saveTunables, loadTunables, resetTunables } from '../core/tunables';

/**
 * The live tuning panel. This is not a nicety — M1 is entirely about finding
 * values that feel good, and doing that by editing source and reloading is
 * hopeless. Presets persist to localStorage so a good setup survives a reload.
 */

export interface DebugCallbacks {
  respawn(): void;
  regenerateWorld(): void;
  applyRender(): void;
}

export function buildGui(cb: DebugCallbacks): GUI {
  const gui = new GUI({ title: 'moto — tuning', width: 320 });
  gui.close();

  const actions = {
    respawn: cb.respawn,
    savePreset: () => saveTunables(),
    loadPreset: () => {
      if (loadTunables()) {
        cb.regenerateWorld();
        cb.applyRender();
        refresh(gui);
      }
    },
    resetDefaults: () => {
      resetTunables();
      cb.regenerateWorld();
      cb.applyRender();
      refresh(gui);
    },
  };

  gui.add(actions, 'respawn').name('Respawn (R)');

  const bike = gui.addFolder('Bike').close();
  bike.add(T.bike, 'gravity', 6, 30, 0.1);
  bike.add(T.bike, 'engineAccel', 2, 40, 0.5);
  bike.add(T.bike, 'maxSpeed', 8, 60, 1);
  bike.add(T.bike, 'brakeAccel', 4, 60, 0.5);
  bike.add(T.bike, 'rollDrag', 0, 1.5, 0.01);
  bike.add(T.bike, 'slopeGain', 0, 2, 0.01);
  bike.add(T.bike, 'lateralGrip', 0.5, 20, 0.1);
  bike.add(T.bike, 'jumpImpulse', 0, 20, 0.1);
  bike.add(T.bike, 'jumpPreload', 0, 12, 0.1);
  bike.add(T.bike, 'wheelBase', 0.8, 2.5, 0.01);

  const susp = gui.addFolder('Suspension').close();
  susp.add(T.susp, 'restHeight', 0.3, 1.2, 0.01);
  susp.add(T.susp, 'springK', 40, 600, 5);
  susp.add(T.susp, 'springC', 2, 90, 1);
  susp.add(T.susp, 'maxTravel', 0.05, 0.8, 0.01);
  susp.add(T.susp, 'maxAccel', 80, 1200, 10);
  susp.add(T.susp, 'stickDistance', 0, 0.4, 0.005);

  const landing = gui.addFolder('Landing').close();
  landing.add(T.landing, 'cleanPitch', 2, 90, 1);
  landing.add(T.landing, 'cleanRoll', 2, 90, 1);
  landing.add(T.landing, 'sketchyPitch', 5, 180, 1);
  landing.add(T.landing, 'sketchyRoll', 5, 180, 1);
  landing.add(T.landing, 'keepSketchy', 0, 1, 0.01);
  landing.add(T.landing, 'keepBad', 0, 1, 0.01);
  landing.add(T.landing, 'snapSketchy', 1, 30, 0.5);
  landing.add(T.landing, 'snapBad', 1, 30, 0.5);
  landing.add(T.landing, 'snapTime', 0, 2, 0.05);
  landing.add(T.landing, 'minAirTime', 0, 1.5, 0.05);

  const water = gui.addFolder('Water').close();
  water.add(T.water, 'drag', 0, 12, 0.1);
  water.add(T.water, 'sink', 0, 15, 0.1);

  const boost = gui.addFolder('Boost').close();
  boost.add(T.boost, 'duration', 0.2, 10, 0.1);
  boost.add(T.boost, 'cooldown', 0, 10, 0.1);
  boost.add(T.boost, 'accelMul', 1, 4, 0.05);
  boost.add(T.boost, 'maxSpeedMul', 1, 3, 0.05);
  boost.add(T.boost, 'fovBonus', 0, 25, 0.5);
  boost.add(T.boost, 'flameLength', 0, 3, 0.05);
  boost.add(T.boost, 'lightIntensity', 0, 80, 1);
  boost.add(T.boost, 'lightRange', 1, 20, 0.5);
  boost.add(T.boost, 'emberRate', 0, 200, 5);
  boost.add(T.boost, 'dustRate', 0, 200, 5);
  boost.add(T.boost, 'ignitionPunch', 0, 1, 0.05);

  const score = gui.addFolder('Tricks & score').close();
  score.add(T.score, 'airGain', 0, 200, 1);
  score.add(T.score, 'flip', 0, 2000, 10);
  score.add(T.score, 'spin', 0, 2000, 10);
  score.add(T.score, 'roll', 0, 2000, 10);
  score.add(T.score, 'whip', 0, 2000, 10);
  score.add(T.score, 'rotationDeg', 180, 360, 5);
  score.add(T.score, 'whipAngle', 5, 90, 1);
  score.add(T.score, 'whipHold', 0.05, 2, 0.05);
  score.add(T.score, 'keepSketchy', 0, 1, 0.05);
  score.add(T.score, 'maxMultiplier', 1, 50, 1);
  score.add(T.score, 'comboWindow', 0.5, 15, 0.5);

  const steer = gui.addFolder('Steering & lean').close();
  steer.add(T.steer, 'maxYawRate', 0.4, 5, 0.05);
  steer.add(T.steer, 'yawResponse', 1, 25, 0.5);
  steer.add(T.steer, 'refSpeed', 1, 25, 0.5);
  steer.add(T.steer, 'highSpeedFalloff', 0.1, 1, 0.01);
  steer.add(T.steer, 'leanGain', 0, 0.3, 0.001);
  steer.add(T.steer, 'maxLean', 0.1, 1.4, 0.01);
  steer.add(T.steer, 'pitchResponse', 1, 30, 0.5);
  steer.add(T.steer, 'rollResponse', 1, 30, 0.5);

  const air = gui.addFolder('Air').close();
  air.add(T.air, 'drag', 0, 0.2, 0.001);
  air.add(T.air, 'pitchRate', 0.5, 10, 0.1);
  air.add(T.air, 'yawRate', 0.5, 10, 0.1);
  air.add(T.air, 'rollRate', 0.5, 10, 0.1);

  const cam = gui.addFolder('Camera').close();
  cam.add(T.cam, 'distGround', 2, 20, 0.1);
  cam.add(T.cam, 'heightGround', 0.5, 10, 0.1);
  cam.add(T.cam, 'distAir', 2, 25, 0.1);
  cam.add(T.cam, 'heightAir', 0.5, 14, 0.1);
  cam.add(T.cam, 'posDampGround', 1, 20, 0.1);
  cam.add(T.cam, 'posDampAir', 1, 20, 0.1);
  cam.add(T.cam, 'travelDamp', 0.5, 20, 0.1);
  cam.add(T.cam, 'lookLead', 0, 20, 0.5);
  cam.add(T.cam, 'lookHeight', -2, 6, 0.1);
  cam.add(T.cam, 'fovBase', 40, 100, 1);
  cam.add(T.cam, 'fovGain', 0, 1.5, 0.01);
  cam.add(T.cam, 'fovMax', 50, 120, 1);
  cam.add(T.cam, 'shakeGain', 0, 0.3, 0.005);
  cam.add(T.cam, 'shakeDecay', 1, 20, 0.5);

  const world = gui.addFolder('World').close();
  world.add(T.world, 'seed', 0, 9999, 1);
  world.add(T.world, 'broadAmp', 0, 60, 0.5);
  world.add(T.world, 'midAmp', 0, 20, 0.1);
  world.add(T.world, 'rollAmp', 0, 12, 0.05);
  world.add(T.world, 'fineAmp', 0, 5, 0.05);
  world.add(T.world, 'bowlDepth', 0, 40, 0.5);
  world.add(T.world, 'ramps').name('ramps (regen to apply)');
  world.add({ regenerate: cb.regenerateWorld }, 'regenerate').name('Regenerate terrain');

  const light = gui.addFolder('Light').close();
  light.add(T.light, 'sunIntensity', 0, 5, 0.05).onChange(cb.applyRender);
  light.add(T.light, 'hemiIntensity', 0, 3, 0.05).onChange(cb.applyRender);
  light.add(T.light, 'sunElevationDeg', 5, 85, 1);
  light.add(T.light, 'sunAzimuthDeg', 0, 360, 1);
  light.add(T.light, 'exposure', 0.2, 2, 0.01).onChange(cb.applyRender);

  const render = gui.addFolder('Render').close();
  render.add(T.render, 'terrainShadows').onChange(cb.applyRender);
  render.add(T.render, 'wireframe').onChange(cb.applyRender);
  render.add(T.render, 'fogDensity', 0, 0.01, 0.0001).onChange(cb.applyRender);

  const presets = gui.addFolder('Presets').close();
  presets.add(actions, 'savePreset').name('Save to browser');
  presets.add(actions, 'loadPreset').name('Load saved');
  presets.add(actions, 'resetDefaults').name('Reset to defaults');

  // H toggles the panel so it can be got out of the way while riding.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && !e.metaKey && !e.ctrlKey) {
      if (gui.domElement.style.display === 'none') gui.domElement.style.display = '';
      else gui.domElement.style.display = 'none';
    }
  });

  return gui;
}

/** Pull displayed values back in sync after tunables are replaced wholesale. */
function refresh(gui: GUI) {
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}

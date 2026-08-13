import * as THREE from 'three';
import { T } from '../core/tunables';
import { activeTheme } from './themes';

/**
 * Gradient sky dome plus matching fog.
 *
 * The dome is a single inward-facing sphere with a two-stop vertical gradient —
 * cheaper and more controllable than a cubemap, and the horizon colour can be
 * handed straight to the fog so the terrain edge dissolves instead of ending.
 *
 * Every colour here comes from the active theme, and all of them can be swapped
 * in place by `applySkyTheme` — uniforms, fog and both lights. Nothing is
 * rebuilt, so switching theme costs a few colour writes on this side; only the
 * terrain mesh, whose slope colours are baked into vertices, has to be remade.
 */

const ZENITH = new THREE.Color();
const HORIZON = new THREE.Color();
const GROUND_HAZE = new THREE.Color();

export interface Sky {
  dome: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fog: THREE.FogExp2;
}

export function createSky(scene: THREE.Scene, fogDensity: number): Sky {
  const geometry = new THREE.SphereGeometry(1400, 24, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: ZENITH },
      horizon: { value: HORIZON },
      ground: { value: GROUND_HAZE },
    },
    vertexShader: /* glsl */ `
      varying float vH;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vH = normalize(world.xyz - cameraPosition).y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 ground;
      varying float vH;
      void main() {
        float up = clamp(vH, 0.0, 1.0);
        vec3 c = mix(horizon, zenith, pow(up, 0.55));
        c = mix(c, ground, clamp(-vH * 3.0, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        // ShaderMaterial does not add the output conversion for you, and the
        // uniforms arrive already converted to the linear working space. Without
        // this the sky renders dark and desaturated — a murky dusk at noon.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const dome = new THREE.Mesh(geometry, material);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);

  const fog = new THREE.FogExp2(0xffffff, fogDensity);
  scene.fog = fog;

  const sun = new THREE.DirectionalLight(0xffffff, T.light.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, T.light.hemiIntensity);
  scene.add(hemi);

  const sky: Sky = { dome, sun, hemi, fog };
  applySkyTheme(sky);
  return sky;
}

/**
 * Repaint the sky, fog and both lights from the active theme.
 *
 * The uniforms are mutated in place rather than reassigned: `ShaderMaterial`
 * uploads whatever the `THREE.Color` currently holds, so writing into the same
 * object avoids a uniform rebind, and — more importantly — keeps the sRGB to
 * linear conversion `Color.set` performs, which the shader below relies on.
 */
export function applySkyTheme(sky: Sky) {
  const t = activeTheme();

  ZENITH.set(t.sky.zenith);
  HORIZON.set(t.sky.horizon);
  GROUND_HAZE.set(t.sky.ground);

  // The fog is tinted to the horizon stop on purpose — that match is what makes
  // the terrain edge dissolve rather than end. It is why the lunar theme's near
  // black sky needs a near black fog and not simply no fog at all.
  sky.fog.color.set(t.sky.horizon);

  sky.sun.color.set(t.sun);
  sky.hemi.color.set(t.hemiSky);
  sky.hemi.groundColor.set(t.hemiGround);
}

/**
 * The shadow frustum is small and tight, so it has to ride along with the bike.
 * The sun direction is fixed in world space — only its origin follows.
 */
export function updateSky(sky: Sky, focus: THREE.Vector3) {
  const l = T.light;
  const elev = THREE.MathUtils.degToRad(l.sunElevationDeg);
  const azim = THREE.MathUtils.degToRad(l.sunAzimuthDeg);
  const horiz = Math.cos(elev) * 180;

  sky.dome.position.set(focus.x, 0, focus.z);
  sky.sun.target.position.copy(focus);
  sky.sun.target.updateMatrixWorld();
  sky.sun.position.set(
    focus.x + Math.cos(azim) * horiz,
    focus.y + Math.sin(elev) * 180,
    focus.z + Math.sin(azim) * horiz,
  );
}

export function applyLighting(sky: Sky) {
  sky.sun.intensity = T.light.sunIntensity;
  sky.hemi.intensity = T.light.hemiIntensity;
}

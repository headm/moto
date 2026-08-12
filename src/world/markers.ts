import * as THREE from 'three';
import type { Heightfield } from './heightfield';
import type { Feature } from './ramps';

/**
 * A numbered flag at the start of each feature's approach.
 *
 * The numbers match the order of `PARK` and the indices `npm run sim` prints, so
 * a feature can be named the same way in the world, in the harness output and in
 * conversation. That is the whole point — "make #3 poppier" beats describing
 * which ramp you mean.
 *
 * The digits are drawn to a small canvas rather than loaded as a font: TextGeometry
 * needs a typeface asset, and a sprite is both cheaper and always legible because
 * it faces the camera however you approach.
 */

const POLE_HEIGHT = 5.2;

function numberTexture(label: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1b1d21';
  ctx.beginPath();
  ctx.roundRect(6, 6, size - 12, size - 12, 22);
  ctx.fill();
  ctx.strokeStyle = '#ffb340';
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.fillStyle = '#ffb340';
  ctx.font = 'bold 78px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export interface Markers {
  group: THREE.Group;
  dispose(): void;
}

export function createFeatureMarkers(hf: Heightfield, park: readonly Feature[]): Markers {
  const group = new THREE.Group();
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];

  const poleGeometry = new THREE.CylinderGeometry(0.07, 0.09, POLE_HEIGHT, 6);
  poleGeometry.translate(0, POLE_HEIGHT / 2, 0);
  const poleMaterial = new THREE.MeshLambertMaterial({ color: 0xe8e4dc, flatShading: true });
  materials.push(poleMaterial);

  park.forEach((f, index) => {
    // Water needs no signpost, and numbering stays tied to the PARK index so the
    // flags and the harness output never drift apart.
    if (f.kind === 'pond') return;
    const fwdX = Math.sin(f.yaw);
    const fwdZ = Math.cos(f.yaw);
    const rightX = -Math.cos(f.yaw);
    const rightZ = Math.sin(f.yaw);

    // At the mouth of the approach, off to the right of the corridor — early
    // enough to read before you have committed to the run-in.
    const u = -f.approach;
    const v = f.halfWidth + 3.5;
    const x = f.x + fwdX * u + rightX * v;
    const z = f.z + fwdZ * u + rightZ * v;
    const y = hf.height(x, z);

    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(x, y, z);
    pole.castShadow = true;
    group.add(pole);

    const texture = numberTexture(String(index + 1));
    textures.push(texture);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    materials.push(material);

    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y + POLE_HEIGHT + 1.1, z);
    sprite.scale.set(2.4, 2.4, 1);
    group.add(sprite);
  });

  return {
    group,
    dispose() {
      poleGeometry.dispose();
      for (const t of textures) t.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

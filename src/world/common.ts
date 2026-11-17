// Gemeinsame Hilfen der Szene: Palette, Scratch-Objekte (nur innerhalb eines Aufrufs benutzen), Vertexfarbe.
import * as THREE from 'three';

export const _M = new THREE.Matrix4(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export const _c = new THREE.Color(), _q = new THREE.Quaternion(), _t = new THREE.Quaternion(), _ax = new THREE.Vector3();

// feste kleine Palette
export const PALETTE = {
  sky: 0xa9c4d6, asphalt: 0x4b4e57, gravel: 0xb89d6c, ice: 0xbfe6f2,
  body: 0xc23b2e, buggy: 0xe0a020, cabin: 0x2d3d4d, tyre: 0x1b1b1f, rim: 0x9a9aa2, pylon: 0xff7a1a,
};

export const withColor = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
  const c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};

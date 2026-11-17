// Offroad-Optik: hohe Zielfahne (immer sichtbar), Bach, Baumstämme. Je ein Mesh, unbeleuchtet bzw. Vertexfarben.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Course } from './level';
import { FREE_GOAL_R } from './run';

const col = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
  const c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g;
};

/** Zielfahne: 26 m hoher Mast mit rot-weiß kariertem Tuch, `fog:false` – überragt Bäume und Hügel, im ganzen Level zu sehen */
export function buildFlag(x: number, y: number, z: number): THREE.Mesh {
  const H = 26, parts: THREE.BufferGeometry[] = [];
  const pole = new THREE.BoxGeometry(0.4, H, 0.4).toNonIndexed(); pole.translate(0, H / 2, 0); parts.push(col(pole, 0xf2f2f2));
  const cw = 9, ch = 6, nx = 6, ny = 4;   // Tuch in 6x4 Karos, flatternd angedeutet durch leichte Wellung
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const g = new THREE.PlaneGeometry(cw / nx, ch / ny).toNonIndexed();
    g.translate(0.2 + cw / nx * (i + 0.5), H - ch / ny * (j + 0.5), 0);
    parts.push(col(g, (i + j) % 2 ? 0xd8261a : 0xffffff));
  }
  const m = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.frustumCulled = false; return m;
}

/** Bach als flaches Wasserband entlang der Mittellinie (Breite je Stelle: Rinne + weiches Ufer), Wasser knapp unter Uferhöhe */
export function buildBrook(course: Course): THREE.Mesh {
  const b = course.brook!, R = b.route, pos: number[] = [], idx: number[] = [];
  const n = Math.ceil(R.length / 2);
  for (let i = 0; i <= n; i++) {
    const s = Math.min(R.length, i * 2), a = R.at(s), hw = b.w + 0.7 * b.soft(a.x), y = b.yc(s) - 0.18;
    for (const side of [-1, 1]) { const [x, z] = R.offset(s, side * hw); pos.push(x, y, z); }
    if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 3, o, o + 3, o + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x4f8fd0, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 1; return m;
}

/** Baumstämme: liegende Achtkant-Zylinder auf dem Gelände (ein Mesh), Rinde braun mit hellem Schnitt an den Enden */
export function buildLogs(course: Course): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [], T = course.terrain;
  // Stämme in Stücken von ≤ 3 m, jedes folgt dem Gelände (Höhe + Neigung); ein langer Stamm über einer Mulde schwebte sonst
  for (const l of course.logs ?? []) {
    const n = Math.max(1, Math.ceil(l.len / 3)), seg = l.len / n, sx = Math.sin(l.yaw), cz = Math.cos(l.yaw);
    for (let i = 0; i < n; i++) {
      const d = -l.len / 2 + (i + 0.5) * seg, x = l.x + sx * d, z = l.z + cz * d;
      const ya = T.height(x - sx * seg / 2, z - cz * seg / 2), yb = T.height(x + sx * seg / 2, z + cz * seg / 2), tilt = Math.atan2(yb - ya, seg);
      const cyl = new THREE.CylinderGeometry(l.r, l.r, seg + 0.15, 8).toNonIndexed();
      cyl.rotateX(Math.PI / 2); cyl.rotateX(-tilt); cyl.rotateY(l.yaw);
      cyl.translate(x, (ya + yb) / 2 + l.r * 0.7, z);
      parts.push(col(cyl, 0x6b4a2b));
    }
  }
  return new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

let stripeTex: THREE.CanvasTexture | null = null;
/** Zielkreis: rot-weiß schräg gestreifter Kreis mit Radius FREE_GOAL_R (der Bereich, der als Ziel zählt) auf dem Gelände; ein Mesh, Polarnetz folgt der Höhe, Streifen aus einer 16-px-Pixeltextur in Weltkoordinaten */
export function buildGoalCircle(x: number, z: number, T: { height(x: number, z: number): number }): THREE.Mesh {
  if (!stripeTex) {
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d')!;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { g.fillStyle = (i + j) % 8 < 4 ? '#d8261a' : '#ffffff'; g.fillRect(i, j, 1, 1); }
    stripeTex = new THREE.CanvasTexture(c); stripeTex.colorSpace = THREE.SRGBColorSpace; stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping; stripeTex.magFilter = stripeTex.minFilter = THREE.NearestFilter;
  }
  const RING = 14, SEG = 72, TILE = 4, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const P = (r: number, a: number) => { const px = x + r * Math.cos(a), pz = z + r * Math.sin(a); pos.push(px, T.height(px, pz) + 0.1, pz); uv.push(px / TILE, pz / TILE); };
  P(0, 0);
  for (let k = 1; k <= RING; k++) for (let i = 0; i < SEG; i++) P(FREE_GOAL_R * k / RING, i / SEG * Math.PI * 2);
  for (let i = 0; i < SEG; i++) idx.push(0, 1 + i, 1 + (i + 1) % SEG);
  for (let k = 1; k < RING; k++) for (let i = 0; i < SEG; i++) {
    const a = 1 + (k - 1) * SEG + i, b = 1 + (k - 1) * SEG + (i + 1) % SEG, c = a + SEG, d = b + SEG;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: stripeTex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.frustumCulled = false; m.userData.goalCircle = FREE_GOAL_R; return m;
}

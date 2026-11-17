// Strand: Holzsteg, Sonnenuntergang, Leuchtturm, BeachScene.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Course } from '../level';
import { Soup } from './city';

// ───────────────────────── Strand ─────────────────────────
/** Holzsteg: Bohlen quer zur Strecke (leicht über dem Gelände), kleine Pfosten an den Rändern. Ein Mesh, unbeleuchtet, Farbe warm vorgetönt. */
export function buildBoardwalk(course: Course): THREE.Mesh | null {
  if (!course.boardwalk.length) return null;
  const r = course.route, T = course.terrain, half = course.roadWidth / 2, sp = new Soup(), Y = 0.07;
  const P = (s: number, l: number, dy = 0) => { const [x, z] = r.offset(s, l); return [x, T.height(x, z) + Y + dy, z]; };
  for (const [a, b] of course.boardwalk) {
    for (let s = Math.max(0, a); s + 1 < Math.min(b, r.length); s += 1) {
      const k = ((Math.floor(s) * 7919) % 5) / 5, c = [0.38 + 0.18 * k, 0.19 + 0.08 * k, 0.11 + 0.05 * k].map((v) => v ** 2.2);   // dunkles Rotbraun, hebt sich vom Sand ab
      sp.quad(P(s, half), P(s, -half), P(s + 0.8, -half), P(s + 0.8, half), c);
      sp.quad(P(s + 0.8, half), P(s + 0.8, -half), P(s + 1, -half), P(s + 1, half), [0.015, 0.006, 0.003]);   // Fuge (20 %)
    }
    for (let s = Math.max(0, a) + 2; s < Math.min(b, r.length) - 2; s += 6) for (const side of [-1, 1]) {
      const [x, z] = r.offset(s, side * (half + 0.1)), y = T.height(x, z), w = 0.14, col = [0.34, 0.15, 0.1].map((v) => v ** 2.2);
      const q = (dx: number, dz: number) => [x + dx, 0, z + dz];
      for (const [dx, dz, ex, ez] of [[-w, -w, w, -w], [w, -w, w, w], [w, w, -w, w], [-w, w, -w, -w]])
        { const A = q(dx, dz), B = q(ex, ez); sp.quad([A[0], y, A[2]], [B[0], y, B[2]], [B[0], y + 0.9, B[2]], [A[0], y + 0.9, A[2]], col); }
      sp.quad([x - w, y + 0.9, z + w], [x + w, y + 0.9, z + w], [x + w, y + 0.9, z - w], [x - w, y + 0.9, z - w], [0.5, 0.26, 0.17].map((v) => v ** 2.2));
    }
  }
  const m = new THREE.Mesh(sp.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.frustumCulled = false;
  return m;
}

function seaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a3f86'; g.fillRect(0, 0, 128, 128);
  let seed = 4242; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 70; i++) { g.fillStyle = rnd() < 0.5 ? '#6a58a8' : '#34306e'; g.fillRect(Math.floor(rnd() * 120), Math.floor(rnd() * 128), 4 + Math.floor(rnd() * 12), 2); }
  for (let i = 0; i < 26; i++) { g.fillStyle = rnd() < 0.6 ? '#ffb070' : '#ff7a9a'; g.fillRect(Math.floor(rnd() * 120), Math.floor(rnd() * 128), 3 + Math.floor(rnd() * 8), 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
  return t;
}
function glowTexture(kind: 'sun' | 'path'): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 64; c.height = kind === 'sun' ? 64 : 128;
  const g = c.getContext('2d')!;
  if (kind === 'sun') {
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,200,120,1)'); rg.addColorStop(0.25, 'rgba(255,140,70,0.55)'); rg.addColorStop(1, 'rgba(255,90,60,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  } else {   // Sonnenpfad: Glitzerbalken, längs der Strecke nach oben (Horizont) heller, zur Mitte hin breiter
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
    let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 90; i++) { const y = Math.floor(rnd() * 128), w = 4 + Math.floor(rnd() * 26); const x = Math.floor(32 - w / 2 + (rnd() - 0.5) * 14); g.fillStyle = `rgba(255,${170 + Math.floor(rnd() * 70)},${90 + Math.floor(rnd() * 80)},${0.5 + rnd() * 0.5})`; g.fillRect(x, y, w, 1 + Math.floor(rnd() * 2)); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
  return t;
}

/** Sonnenuntergang: Himmelskuppel mit Farbverlauf, tiefe Sonne mit Glühen, Meeresfläche (billig animiert: Textur wandert) + Glitzerpfad. 6 Draw Calls. */
/** Leuchtturm (Strand): ein Mesh mit flachen Farben, eine Draw Call; Sockel, weiß-rote Bänder, Galerie, gelbe Laterne */
function buildLighthouse(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, y0: number, hex: number) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(0, y0 + h / 2, 0);
    const c = new THREE.Color(hex), col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
  };
  const W = 0xf4f1ea, R = 0xd8402e, G = 0x9aa3a8, D = 0x3b3f47, Y = 0xffd84a;
  add(7, 2, 7, 0, G); add(4.6, 12, 4.6, 2, W); add(4.8, 4, 4.8, 14, R); add(4.4, 8, 4.4, 18, W);
  add(4.6, 4, 4.6, 26, R); add(4, 4, 4, 30, W); add(5, 1, 5, 34, D); add(3, 3, 3, 35, Y); add(3.6, 1, 3.6, 38, R);
  const m = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  m.scale.setScalar(0.7); m.frustumCulled = false;
  return m;
}

export class BeachScene {
  readonly group = new THREE.Group();
  private sky = new THREE.Group();
  private seaTex = seaTexture(); private pathTex = glowTexture('path');
  private sea: THREE.Mesh | null = null; private path: THREE.Mesh | null = null; private lighthouse: THREE.Mesh | null = null;
  private lhDir: [number, number] = [0, 0];
  /** Fürs Foto von oben ausblenden: Glitzerpfad und Leuchtturm hängen an der Kamera (Karte zeigte sie an beliebiger Stelle) */
  get photoHide(): (THREE.Object3D | null)[] { return [this.path, this.lighthouse]; }
  private dir: [number, number]; private level: number;
  constructor(course: Course) {
    const sun = course.sun ?? { dx: 0, dz: -1, elev: 6 };
    const l = Math.hypot(sun.dx, sun.dz) || 1; this.dir = [sun.dx / l, sun.dz / l];
    this.level = course.sea?.level ?? -1;
    const R = 300, sd = new THREE.Vector3(this.dir[0], 0, this.dir[1]);
    // Kuppel
    const dome = new THREE.SphereGeometry(R, 48, 28).toNonIndexed();
    const pos = dome.getAttribute('position'), col = new Float32Array(pos.count * 3);
    const stops: [number, number[]][] = [[0, [1, 0.72, 0.38]], [0.05, [1, 0.5, 0.3]], [0.16, [0.93, 0.34, 0.42]], [0.4, [0.55, 0.26, 0.6]], [1, [0.14, 0.14, 0.42]]];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / R, t = Math.max(0, y);
      let a = stops[0], b = stops[1];
      for (let k = 1; k < stops.length; k++) if (t <= stops[k][0]) { a = stops[k - 1]; b = stops[k]; break; } else { a = stops[k - 1]; b = stops[k]; }
      const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
      const az = (pos.getX(i) * sd.x + pos.getZ(i) * sd.z) / R, boost = Math.pow(Math.max(0, az), 6) * Math.max(0, 1 - t * 4) * 0.45;
      for (let c = 0; c < 3; c++) col[i * 3 + c] = Math.min(1, a[1][c] + (b[1][c] - a[1][c]) * f + boost * (c === 2 ? 0.3 : 1));
    }
    dome.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dm = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false }));
    dm.renderOrder = -3; dm.frustumCulled = false; this.sky.add(dm);
    // Sonne + Glühen
    const e = sun.elev * Math.PI / 180, sx = this.dir[0] * Math.cos(e) * 250, sy = Math.sin(e) * 250, sz = this.dir[1] * Math.cos(e) * 250;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(15, 20), new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false, depthWrite: false, depthTest: false }));
    disc.position.set(sx, sy, sz); disc.lookAt(0, 0, 0); disc.renderOrder = -2; disc.frustumCulled = false;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), new THREE.MeshBasicMaterial({ map: glowTexture('sun'), transparent: true, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, depthTest: false }));
    glow.position.set(sx * 0.98, sy * 0.98, sz * 0.98); glow.lookAt(0, 0, 0); glow.renderOrder = -1; glow.frustumCulled = false;
    this.sky.add(disc, glow); this.group.add(this.sky);
    if (course.sea) {
      this.seaTex.repeat.set(70, 70);
      this.sea = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.seaTex }));
      this.sea.frustumCulled = false;
      this.pathTex.repeat.set(1, 6);
      this.path = new THREE.Mesh(new THREE.PlaneGeometry(90, 1500).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.pathTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.path.rotation.order = 'YXZ'; this.path.rotation.y = Math.atan2(this.dir[0], this.dir[1]);
      this.path.frustumCulled = false; this.path.renderOrder = 2;
      this.group.add(this.sea, this.path);
      // Leuchtturm: Sonnenseite, knapp neben der Sonne (6°), am Horizont
      this.lighthouse = buildLighthouse();
      const a = -0.1, c = Math.cos(a), sn = Math.sin(a);
      this.lhDir = [this.dir[0] * c - this.dir[1] * sn, this.dir[0] * sn + this.dir[1] * c];
      this.group.add(this.lighthouse);
    }
  }
  /** Himmel folgt der Kamera, Meer hängt an der Kamera-Position (Textur bleibt in der Welt stehen, wandert langsam) */
  update(t: number, cam: THREE.Vector3): void {
    this.sky.position.copy(cam);
    if (this.sea) {
      this.sea.position.set(cam.x, this.level, cam.z);
      const rep = 70, size = 2800;
      this.seaTex.offset.set((cam.x / size * rep + t * 0.012) % 1, (-cam.z / size * rep + t * 0.007) % 1);
    }
    if (this.path) {
      const d = this.dir;
      this.path.position.set(cam.x + d[0] * 750, this.level + 0.03, cam.z + d[1] * 750);
      const along = cam.x * d[0] + cam.z * d[1];
      this.pathTex.offset.set(0, (-(along / 1500 * 6) + t * 0.05) % 1);
    }
    if (this.lighthouse) this.lighthouse.position.set(cam.x + this.lhDir[0] * 240, this.level + 0.2, cam.z + this.lhDir[1] * 240);
  }
}

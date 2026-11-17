// Rheinsteig: Reben, Dom, Burgen, Rhein mit Schiff.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Course } from '../level';
import { addTown } from '../townmesh';
import { Soup } from './city';
import { _M, _p, _s, _up, _q, withColor } from './common';

// ───────────────────────── Rheinsteig ─────────────────────────
/** Weinberg: Rebzeilen-Stücke (Hecke + zwei Pfähle), instanziert, 1 Draw Call. */
export function buildVines(course: Course): THREE.InstancedMesh {
  const hedge = new THREE.BoxGeometry(5.4, 1.1, 0.9).toNonIndexed(); hedge.translate(0, 0.75, 0);
  const post = (x: number) => { const g = new THREE.BoxGeometry(0.14, 1.5, 0.14).toNonIndexed(); g.translate(x, 0.75, 0); return withColor(g, 0x6a4a2e); };
  const geo = mergeGeometries([withColor(hedge, 0x4e9a34), post(-2.6), post(2.6)])!;
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), Math.max(1, course.vines.length));
  m.count = course.vines.length;
  course.vines.forEach(([x, z, yaw], i) => {
    _p.set(x, course.terrain.height(x, z) - 0.15, z); _q.setFromAxisAngle(_up, -yaw + ((i * 7) % 5 - 2) * 0.004); _s.set(1, 1, 1); _M.compose(_p, _q, _s); m.setMatrixAt(i, _M);
  });
  m.frustumCulled = false;
  return m;
}

/** Kölner-Dom-artige Kulisse (kein reales Bauwerk-Modell, nur Klötzchen): Langhaus mit Satteldach, Querhaus, Chor, Westwerk mit zwei gestuften Spitztürmen. Lokal: z = Längsachse (Türme bei z<0). 1 Mesh. */
export function buildDom(course: Course): THREE.Mesh {
  const sp = new Soup(), T = course.terrain;
  for (const c of course.landmarks) {
    if (c.kind !== 'dom') continue;
    const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), S = c.s;
    const W = (lx: number, lz: number, y: number) => [c.x + (cs * lx + sn * lz) * S, y, c.z + (-sn * lx + cs * lz) * S];
    let y0 = Infinity;
    for (const [lx, lz] of [[-14, -40], [14, -40], [-14, 40], [14, 40], [0, 0], [0, 60]]) { const [x, , z] = W(lx, lz, 0); y0 = Math.min(y0, T.height(x, z)); }
    y0 -= 1.0;
    const STONE = [0.2, 0.19, 0.185], DARKS = [0.125, 0.12, 0.125], ROOF = [0.15, 0.17, 0.2], WIN = [0.05, 0.05, 0.07], GLOW = [0.7, 0.55, 0.25];   // dunkel gehalten: der Nebel hellt ihn ohnehin auf
    const box = (cx: number, cz: number, hx: number, hz: number, ya: number, yb: number, base: number[]) => {
      const sh = [1.0, 0.8, 0.62, 0.72], cor: [number, number][] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
      for (let i = 0; i < 4; i++) { const [ax, az] = cor[i], [bx, bz] = cor[(i + 1) % 4], col = base.map((v) => v * sh[i]); sp.quad(W(cx + ax, cz + az, y0 + ya), W(cx + bx, cz + bz, y0 + ya), W(cx + bx, cz + bz, y0 + yb), W(cx + ax, cz + az, y0 + yb), col); }
      sp.quad(W(cx - hx, cz + hz, y0 + yb), W(cx + hx, cz + hz, y0 + yb), W(cx + hx, cz - hz, y0 + yb), W(cx - hx, cz - hz, y0 + yb), base);
    };
    const pyr = (cx: number, cz: number, h: number, ya: number, yb: number, base: number[]) => {   // vierseitige Spitze (Grundseite h, Spitze bei yb)
      const cor: [number, number][] = [[-h, -h], [h, -h], [h, h], [-h, h]], tip = W(cx, cz, y0 + yb), sh = [1.0, 0.8, 0.62, 0.72];
      for (let i = 0; i < 4; i++) { const [ax, az] = cor[i], [bx, bz] = cor[(i + 1) % 4]; sp.tri(W(cx + ax, cz + az, y0 + ya), W(cx + bx, cz + bz, y0 + ya), tip, base.map((v) => v * sh[i])); }
    };
    // Langhaus + Satteldach (First entlang z), Querhaus, Chor
    box(0, 8, 14, 38, 0, 26, STONE);
    for (const sd of [1, -1]) sp.quad(W(sd * 14, -30, y0 + 26), W(sd * 14, 46, y0 + 26), W(0, 46, y0 + 38), W(0, -30, y0 + 38), ROOF.map((v) => v * (sd > 0 ? 1 : 0.7)));
    box(0, 18, 21, 8, 0, 24, STONE); box(0, 18, 8, 21, 0, 24, STONE);   // Querhaus (Kreuzform)
    box(0, 58, 9, 8, 0, 22, DARKS); pyr(0, 58, 10, 22, 36, ROOF);       // Chor mit Dach
    pyr(0, 18, 5, 38, 62, ROOF);                                          // Dachreiter über der Vierung
    // Westwerk: Querriegel + zwei Türme in Stufen, Eckfialen, Spitzhelm
    box(0, -34, 21, 11, 0, 40, STONE);
    for (const tx of [-11, 11]) {
      box(tx, -34, 8.5, 8.5, 40, 74, STONE); box(tx, -34, 6.5, 6.5, 74, 98, STONE); box(tx, -34, 4.6, 4.6, 98, 112, DARKS);
      pyr(tx, -34, 4.6, 112, 150, ROOF);
      for (const [dx, dz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) { box(tx + dx, -34 + dz, 1.1, 1.1, 40, 56, DARKS); pyr(tx + dx, -34 + dz, 1.1, 56, 68, ROOF); }
      for (const yy of [48, 62, 82, 104]) for (const sd of [-1, 1]) sp.quad(W(tx - 1.6, -34 + sd * 8.51, y0 + yy), W(tx + 1.6, -34 + sd * 8.51, y0 + yy), W(tx + 1.6, -34 + sd * 8.51, y0 + yy + 6), W(tx - 1.6, -34 + sd * 8.51, y0 + yy + 6), WIN);
    }
    // Portal + Fenster an der Westfassade (z = -45): hohe schmale Spitzbogenfelder, leicht golden leuchtend
    for (const px of [-15, -7, 0, 7, 15]) { sp.quad(W(px - 1.8, -45.1, y0 + 2), W(px + 1.8, -45.1, y0 + 2), W(px + 1.8, -45.1, y0 + 24 + (px === 0 ? 8 : 0)), W(px - 1.8, -45.1, y0 + 24 + (px === 0 ? 8 : 0)), px === 0 ? GLOW : WIN); }
    for (let z = -22; z < 44; z += 8) for (const sd of [-1, 1]) sp.quad(W(sd * 14.1, z, y0 + 8), W(sd * 14.1, z + 3, y0 + 8), W(sd * 14.1, z + 3, y0 + 22), W(sd * 14.1, z, y0 + 22), WIN);   // Fensterbänder Langhaus
  }
  addTown(sp, course);
  const m = new THREE.Mesh(sp.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  return m;
}

/** Burgruinen: zwei Türme (einer mit Zinnen, einer abgebrochen) + Mauer mit Bresche, ein Mesh mit Vertexfarben (unbeleuchtet, Flächen vorgetönt). */
export function buildCastles(course: Course): THREE.Mesh {
  const sp = new Soup(), T = course.terrain;
  for (const c of course.castles) {
    const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), S = c.s;
    const W = (lx: number, lz: number, y: number) => [c.x + cs * lx * S + sn * lz * S, y, c.z - sn * lx * S + cs * lz * S];
    let y0 = Infinity;
    for (const [lx, lz] of [[-12, -4], [-12, 4], [12, -4], [12, 4], [0, 0], [-9, 0], [9, 0]]) { const [x, , z] = W(lx, lz, 0); y0 = Math.min(y0, T.height(x, z)); }
    y0 -= 1.5;
    const box = (cx: number, cz: number, hx: number, hz: number, ya: number, yb: number, base: number[]) => {
      const sh = [1.0, 0.82, 0.66, 0.74];
      const cor: [number, number][] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
      for (let i = 0; i < 4; i++) { const [ax, az] = cor[i], [bx, bz] = cor[(i + 1) % 4], k = sh[i], col = base.map((v) => v * k); sp.quad(W(cx + ax, cz + az, ya), W(cx + bx, cz + bz, ya), W(cx + bx, cz + bz, yb), W(cx + ax, cz + az, yb), col); }
      sp.quad(W(cx - hx, cz + hz, yb), W(cx + hx, cz + hz, yb), W(cx + hx, cz - hz, yb), W(cx - hx, cz - hz, yb), base);
    };
    const STONE = [0.55, 0.5, 0.44], DARKS = [0.42, 0.38, 0.34], WIN = [0.08, 0.07, 0.09];
    const top = y0 + 16 * S;
    // Turm A (hoch, Zinnen) – Achteck aus zwei Klötzen
    box(-9, 0, 3.0, 3.0, y0, top, STONE); box(-9, 0, 3.0 * 0.72, 3.0 * 1.05, y0, top, STONE); box(-9, 0, 3.0 * 1.05, 3.0 * 0.72, y0, top, STONE);
    for (const [dx, dz] of [[-2.4, -2.4], [0, -2.4], [2.4, -2.4], [2.4, 0], [2.4, 2.4], [0, 2.4], [-2.4, 2.4], [-2.4, 0]]) box(-9 + dx, dz, 0.7, 0.7, top, top + 1.4 * S, DARKS);
    for (const yy of [6, 11]) sp.quad(W(-9 - 0.6, -3.01, y0 + yy * S), W(-9 + 0.6, -3.01, y0 + yy * S), W(-9 + 0.6, -3.01, y0 + (yy + 1.8) * S), W(-9 - 0.6, -3.01, y0 + (yy + 1.8) * S), WIN);
    // Turm B (kleiner, abgebrochen, schräger Rand)
    box(9, 0, 2.5, 2.5, y0, y0 + 10 * S, STONE); box(9, 0, 2.5 * 0.72, 2.5 * 1.05, y0, y0 + 10 * S, STONE);
    box(9 - 1.4, 1.2, 1.0, 1.0, y0 + 10 * S, y0 + 11.6 * S, DARKS); box(9 + 1.5, -1.3, 0.8, 0.9, y0 + 10 * S, y0 + 12.4 * S, DARKS);
    // Mauer mit Bresche in der Mitte
    box(-4.2, 0, 1.7, 0.8, y0, y0 + 7 * S, STONE); box(4.5, 0, 1.4, 0.8, y0, y0 + 5.2 * S, STONE); box(0, 0, 0.7, 0.8, y0, y0 + 2.4 * S, DARKS);
    for (const x of [-5.5, -3.2]) box(x, 0, 0.55, 0.85, y0 + 7 * S, y0 + 8.1 * S, DARKS);
  }
  const m = new THREE.Mesh(sp.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  return m;
}

function rheinTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2f78c4'; g.fillRect(0, 0, 128, 128);
  let seed = 31337; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 90; i++) { g.fillStyle = rnd() < 0.5 ? '#4f97da' : '#2468b0'; g.fillRect(Math.floor(rnd() * 120), Math.floor(rnd() * 128), 6 + Math.floor(rnd() * 16), 2); }
  for (let i = 0; i < 26; i++) { g.fillStyle = '#d8f0ff'; g.fillRect(Math.floor(rnd() * 124), Math.floor(rnd() * 126), 2 + Math.floor(rnd() * 5), 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
  return t;
}

/** Rhein: Wasserband entlang der Mittellinie (1 Draw Call, Muster fließt) + Ausflugsschiff (1 Draw Call), das den Fluss hinabfährt – auch unter Brücken durch. */
export class RiverMesh {
  readonly group = new THREE.Group();
  private tex = rheinTexture(); private boat: THREE.Mesh | null = null; private river: NonNullable<Course['river']>; private len: number; private sBridge = -1;
  constructor(course: Course) {
    const rv = this.river = course.river!, rt = rv.route; this.len = rt.length;
    if (course.bridge) { let best = 1e9; for (let q = 0; q < rt.length; q += 4) { const p = rt.at(q), d = Math.hypot(p.x - course.bridge.cx, p.z - course.bridge.cz); if (d < best) { best = d; this.sBridge = q; } } }
    const pos: number[] = [], uv: number[] = [], W = rv.width + 50;
    const P = (s: number, k: number) => { const a = rt.at(s); return [a.x + a.dz * k * W / 2, rv.level, a.z - a.dx * k * W / 2]; };
    for (let s = 0; s < rt.length; s += 12) {
      const e = Math.min(rt.length, s + 12), a0 = P(s, -1), a1 = P(s, 1), b0 = P(e, -1), b1 = P(e, 1), v0 = s / 16, v1 = e / 16, u1 = W / 16;
      pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0); uv.push(0, v0, u1, v0, u1, v1, 0, v0, u1, v1, 0, v1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const water = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.tex, side: THREE.DoubleSide, fog: true })); water.frustumCulled = false;
    this.group.add(water);
    if (rv.def.boat === false) return;
    // Ausflugsschiff (Bug zeigt entlang +z lokal)
    const sp = new Soup(), WH = [0.93, 0.94, 0.96], RED = [0.8, 0.12, 0.1], NAVY = [0.1, 0.18, 0.4], DARK = [0.08, 0.1, 0.16];
    const box = (cx: number, cz: number, hx: number, hz: number, ya: number, yb: number, col: number[]) => {
      const cor: [number, number][] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
      for (let i = 0; i < 4; i++) { const [ax, az] = cor[i], [bx, bz] = cor[(i + 1) % 4], k = [0.85, 0.7, 0.85, 0.7][i]; sp.quad([cx + ax, ya, cz + az], [cx + bx, ya, cz + bz], [cx + bx, yb, cz + bz], [cx + ax, yb, cz + az], col.map((v) => v * k)); }
      sp.quad([cx - hx, yb, cz + hz], [cx + hx, yb, cz + hz], [cx + hx, yb, cz - hz], [cx - hx, yb, cz - hz], col);
    };
    box(0, 0, 2.6, 8.5, -0.5, 1.3, NAVY); box(0, -1, 2.3, 7, 1.3, 2.7, WH); box(0, -1.5, 2.0, 5, 2.7, 3.9, WH);
    for (const sd of [-1, 1]) { sp.quad([sd * 2.31, 1.6, -7], [sd * 2.31, 1.6, 5.5], [sd * 2.31, 2.4, 5.5], [sd * 2.31, 2.4, -7], DARK); sp.quad([sd * 2.01, 3.0, -6], [sd * 2.01, 3.0, 3], [sd * 2.01, 3.6, 3], [sd * 2.01, 3.6, -6], DARK); }
    box(0, -4, 0.9, 1.1, 3.9, 5.2, RED); box(0, -4, 0.95, 1.15, 4.9, 5.35, DARK); box(0, 4.2, 0.12, 0.12, 2.7, 5.2, WH);
    this.boat = new THREE.Mesh(sp.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); this.boat.frustumCulled = false;
    this.group.add(this.boat);
  }
  /** t = Uhrzeit (Wasser fließt); run = Fahrzeit seit Start: das Schiff fährt mit 3,5 m/s so, dass es bei ~42 s unter der Brücke durchfährt */
  update(t: number, run = t): void {
    this.tex.offset.y = (-t * 0.03) % 1;
    if (!this.boat) return;
    const s = this.sBridge >= 0 ? ((this.sBridge + 3.5 * (run - 42)) % this.len + this.len) % this.len : (t * 4.5 + this.len * 0.3) % this.len, a = this.river.route.at(s);
    this.boat.position.set(a.x, this.river.level + 0.1 + Math.sin(t * 1.3) * 0.05, a.z);
    this.boat.rotation.set(0, Math.atan2(a.dx, a.dz), Math.sin(t * 0.9) * 0.012);   // Bug (+z lokal) zeigt flussabwärts
  }
}

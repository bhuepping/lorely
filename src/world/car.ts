// Auto-Karosserien (Rallye, Kompakt, Jeep), Texturen und CarMesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vehicle, Pose } from '../physics/vehicle';
import type { CarParams } from '../physics/params';
import { F as GLYPH } from '../pixel';
import { _q, PALETTE, withColor } from './common';

// ───────────────────────── Rallye-Coupé ─────────────────────────
// Ein Mesh (1 Draw Call): Klötzchenkarosserie als zwei Prismen (Unterbau + Kabine), Kotflügelbacken, Zusatzscheinwerfer, Heckflügel.
// Lackierung = eine kleine Canvas-Textur (Seitenansicht links/rechts, Draufsicht, Farbfelder), per UV auf die Flächen gelegt. Keine Logos/Schriftzüge.
const TEX = { W: 512, H: 256, sideW: 256, sideH: 128, topX: 256, topW: 128, topH: 256, cellX: 384, cellW: 128, cellH: 32 };
const CELLS = { glass: 0, black: 1, white: 2, dark: 3, red: 4, lamp: 5, brown: 6, silver: 7 } as const;
const CELL_COL = ['#1c2530', '#0c0c0e', '#f4f4f2', '#3a3a40', '#d8261a', '#fff4c0', '#4a2e22', '#a8a8ae'];
const SIDE_V = 1.0;      // Höhe (m über Unterkante), die die Seitentextur abdeckt
const NUM = '4';

function rallyTexture(L: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = TEX.W; c.height = TEX.H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, TEX.W, TEX.H);
  const poly = (col: string, pts: number[][], map: (a: number, b: number) => number[]) => {
    g.fillStyle = col; g.beginPath(); pts.forEach(([a, b], i) => { const [x, y] = map(a, b); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill();
  };
  // Seite: t = 0 vorn … 1 hinten, v = Höhe in m. flip = rechte Seite (Fahrzeugfront erscheint rechts)
  const side = (oy: number, flip: boolean) => {
    const m = (t: number, v: number) => [(flip ? 1 - t : t) * TEX.sideW, oy + TEX.sideH - v / SIDE_V * TEX.sideH];
    const sh = (v: number, t: number) => t + 0.2 * (1.0 - v) / 0.8;       // Schrägstellung der Bänder nach hinten-unten
    const band = (col: string, t0: number, t1: number, vTop: number, vBot: number) =>
      poly(col, [[sh(vTop, t0), vTop], [sh(vTop, t1), vTop], [sh(vBot, t1), vBot], [sh(vBot, t0), vBot]], m);
    // vorn: roter Keil auf dem Kotflügel + silberner Streifen unter den Fenstern
    poly('#d8261a', [[0.0, 0.58], [0.26, 0.58], [0.23, 0.46], [0.0, 0.46]], m);
    poly('#a8a8ae', [[0.26, 0.58], [0.62, 0.58], [0.62, 0.52], [0.25, 0.52]], m);
    // hinten: Dreierband (rot, silber, braun) von der Dachsäule schräg nach hinten unten
    band('#d8261a', 0.62, 0.67, 1.0, 0.2); band('#a8a8ae', 0.67, 0.73, 1.0, 0.2); band('#4a2e22', 0.73, 1.2, 1.0, 0.2);
    // Seitenfenster (nur auf der Kabine)
    poly('#1c2530', [[0.33, 0.62], [0.45, 0.93], [0.62, 0.93], [0.62, 0.62]], m);
    // Schweller + Startnummernfeld (weiß, schwarze Pixelziffer)
    poly('#3a3a40', [[0, 0.05], [1, 0.05], [1, 0], [0, 0]], m);
    poly('#ffffff', [[0.40, 0.44], [0.56, 0.44], [0.56, 0.10], [0.40, 0.10]], m);
    const rows = GLYPH[NUM], [cx, cy] = m(0.48, 0.27), px = 4;
    g.fillStyle = '#000';
    rows.forEach((bits, y) => { for (let b = 0; b < 5; b++) if (bits & (16 >> b)) g.fillRect(Math.round(cx + (b - 2.5) * px), Math.round(cy + (y - 3.5) * px * 1.15), Math.ceil(px), Math.ceil(px * 1.15)); });
  };
  side(0, false); side(TEX.sideH, true);
  // Draufsicht: u = quer (0 links … 1 rechts), tv = 0 Front … 1 Heck
  const tm = (u: number, v: number) => [TEX.topX + u * TEX.topW, v * TEX.topH];
  for (const sx of [0, 1]) {
    const q = (u: number) => (sx ? 1 - u : u);
    poly('#d8261a', [[q(0), 0.01], [q(0.42), 0.01], [q(0.28), 0.13], [q(0), 0.13]], tm);
    poly('#d8261a', [[q(0), 0.47], [q(0.2), 0.47], [q(0.2), 0.52], [q(0), 0.52]], tm);
  }
  poly('#a8a8ae', [[0, 0.13], [1, 0.13], [1, 0.22], [0, 0.22]], tm);
  poly('#4a2e22', [[0, 0.22], [1, 0.22], [1, 0.30], [0, 0.30]], tm);
  poly('#4a2e22', [[0, 0.52], [1, 0.52], [1, 0.67], [0, 0.67]], tm);
  poly('#4a2e22', [[0, 0.80], [1, 0.80], [1, 1], [0, 1]], tm);
  poly('#a8a8ae', [[0.1, 0.86], [0.9, 0.86], [0.9, 0.92], [0.1, 0.92]], tm);
  CELL_COL.forEach((col, i) => { g.fillStyle = col; g.fillRect(TEX.cellX, i * TEX.cellH, TEX.cellW, TEX.cellH); });
  void L;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

/** Rallye-Coupé in Auto-Koordinaten (vorn = −z). `mount` = Radaufhängepunkte (für die Kotflügelbacken). */
function buildRallyBody(p: CarParams, mount: number[][]): THREE.Mesh {
  const { w, l } = p.size, y0 = -(p.cgHeight - 0.24), hw = w / 2;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const U = (px: number, py: number) => [px / TEX.W, 1 - py / TEX.H];
  const cellUV = (k: number) => U(TEX.cellX + TEX.cellW / 2, k * TEX.cellH + TEX.cellH / 2);
  const sideUV = (x: number, z: number, y: number) => {   // y = Höhe über Unterkante
    const t = (z + l / 2) / l, right = x > 0;
    return U((right ? 1 - t : t) * TEX.sideW, (right ? TEX.sideH : 0) + TEX.sideH - Math.min(y, SIDE_V) / SIDE_V * TEX.sideH);
  };
  const topUV = (x: number, z: number) => U(TEX.topX + (x / w + 0.5) * TEX.topW, (z + l / 2) / l * TEX.topH);
  type V3 = [number, number, number];
  const quad = (a: V3, b: V3, c: V3, d: V3, uvs: number[][]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const ln = Math.hypot(nx, ny, nz) || 1; nx /= ln; ny /= ln; nz /= ln;
    for (const k of [0, 1, 2, 0, 2, 3]) { const P = [a, b, c, d][k]; pos.push(P[0], P[1], P[2]); nor.push(nx, ny, nz); uv.push(uvs[k][0], uvs[k][1]); }
  };
  const solid = (a: V3, b: V3, c: V3, d: V3, cell: number) => { const u = cellUV(cell); quad(a, b, c, d, [u, u, u, u]); };
  // Prisma: Profil (z, Höhe über Unterkante), Breite 2*hx; Kanten tragen Art: 's' Farbfeld, 't' Draufsicht
  const prism = (prof: number[][], hx: number, edges: ('t' | number)[]) => {
    const Pt = (i: number, x: number): V3 => [x, y0 + prof[i][1], prof[i][0]];
    for (let i = 0; i < prof.length; i++) {            // Mantelflächen
      const j = (i + 1) % prof.length, k = edges[i];
      const a = Pt(i, -hx), b = Pt(j, -hx), c = Pt(j, hx), d = Pt(i, hx);
      if (k === 't') quad(a, d, c, b, [topUV(-hx, prof[i][0]), topUV(hx, prof[i][0]), topUV(hx, prof[j][0]), topUV(-hx, prof[j][0])]);
      else if (k >= 0) solid(a, d, c, b, k);
    }
    for (const sx of [-1, 1]) {                         // Seitenflächen (Fächer)
      for (let i = 1; i < prof.length - 1; i++) {
        const ids = [0, i, i + 1], P = ids.map((n) => Pt(n, sx * hx)), uvs = ids.map((n) => sideUV(sx, prof[n][0], prof[n][1]));
        if (sx < 0) quad(P[0], P[1], P[2], P[2], [uvs[0], uvs[1], uvs[2], uvs[2]]);
        else quad(P[0], P[2], P[1], P[1], [uvs[0], uvs[2], uvs[1], uvs[1]]);
      }
    }
  };
  const Z = (t: number) => -l / 2 + t * l;
  const G = CELLS;
  // Unterbau: Front, Haube, (Kabinenfuß), Heckdeckel, Heck
  prism([[Z(0), 0], [Z(0), 0.48], [Z(0.3), 0.58], [Z(0.8), 0.64], [Z(1), 0.66], [Z(1), 0]], hw,
    [G.black, 't', 't', 't', G.white, -1 as any]);
  // Kabine
  prism([[Z(0.3), 0.58], [Z(0.47), 0.98], [Z(0.67), 0.98], [Z(0.8), 0.64]], hw * 0.86, [G.glass, 't', G.glass, -1 as any]);
  // Frontschürze weiß, schwarzer Grill oben: Gitterstreifen als Aufsatz
  solid([-hw, y0, Z(0) - 0.001], [hw, y0, Z(0) - 0.001], [hw, y0 + 0.2, Z(0) - 0.001], [-hw, y0 + 0.2, Z(0) - 0.001], G.white);
  solid([hw, y0 + 0.2, Z(0) - 0.001], [-hw, y0 + 0.2, Z(0) - 0.001], [-hw, y0 + 0.24, Z(0) - 0.001], [hw, y0 + 0.24, Z(0) - 0.001], G.silver);
  solid([-hw, y0 + 0.01, Z(1) + 0.001], [hw, y0 + 0.01, Z(1) + 0.001], [hw, y0 + 0.22, Z(1) + 0.001], [-hw, y0 + 0.22, Z(1) + 0.001], G.dark);
  solid([hw, y0 + 0.36, Z(1) + 0.002], [-hw, y0 + 0.36, Z(1) + 0.002], [-hw, y0 + 0.46, Z(1) + 0.002], [hw, y0 + 0.46, Z(1) + 0.002], G.red);
  const box = (cx: number, cy: number, cz: number, bw: number, bh: number, bl: number, cell: number) => {
    const x0 = cx - bw / 2, x1 = cx + bw / 2, y1 = cy - bh / 2, y2 = cy + bh / 2, z0 = cz - bl / 2, z1 = cz + bl / 2;
    solid([x0, y1, z1], [x1, y1, z1], [x1, y2, z1], [x0, y2, z1], cell); solid([x1, y1, z0], [x0, y1, z0], [x0, y2, z0], [x1, y2, z0], cell);
    solid([x1, y1, z1], [x1, y1, z0], [x1, y2, z0], [x1, y2, z1], cell); solid([x0, y1, z0], [x0, y1, z1], [x0, y2, z1], [x0, y2, z0], cell);
    solid([x0, y2, z1], [x1, y2, z1], [x1, y2, z0], [x0, y2, z0], cell); solid([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], cell);
  };
  // Scheinwerfer (4) vor dem Grill
  for (const x of [-0.64, -0.21, 0.21, 0.64]) box(x * hw / 0.85, y0 + 0.33, Z(0) - 0.05, 0.26, 0.2, 0.12, G.lamp);   // vier Scheinwerfer
  // Kotflügelbacken (kantig, breiter als der Unterbau); hinten dunkel wie der Rest der Lackierung
  mount.forEach((m, i) => box(Math.sign(m[0]) * (hw + 0.02), y0 + 0.25, m[2], 0.22, 0.34, 1.0, i < 2 ? G.white : G.brown));
  // kleiner Heckflügel auf dem Deckel
  box(0, y0 + 0.84, Z(0.93), w * 0.7, 0.04, 0.34, G.white);
  for (const sx of [-1, 1]) box(sx * w * 0.3, y0 + 0.75, Z(0.93), 0.05, 0.18, 0.2, G.dark);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: rallyTexture(l), side: THREE.DoubleSide }));
}


/** Konvexes Prisma aus Seitenprofil (z, Höhe h über Karosserieunterkante) mit Breite 2*hx; Flächen nach außen gedreht, flach schattiert. */
function prismGeo(prof: number[][], hx: number, y0: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const P = (i: number, x: number): number[] => [x, y0 + prof[i][1], prof[i][0]];
  const cz = prof.reduce((a, q) => a + q[0], 0) / prof.length, cy = y0 + prof.reduce((a, q) => a + q[1], 0) / prof.length;
  const tri = (a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3, my = (a[1] + b[1] + c[1]) / 3 - cy, mz = (a[2] + b[2] + c[2]) / 3 - cz;
    const out = nx * mx + ny * my + nz * mz >= 0;
    for (const q of out ? [a, b, c] : [a, c, b]) pos.push(q[0], q[1], q[2]);
  };
  for (const x of [-hx, hx]) for (let i = 1; i < prof.length - 1; i++) tri(P(0, x), P(i, x), P(i + 1, x));
  for (let i = 0; i < prof.length; i++) { const j = (i + 1) % prof.length; tri(P(i, -hx), P(j, -hx), P(j, hx)); tri(P(i, -hx), P(j, hx), P(i, hx)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

/** 80er-Kompaktwagen (Schrägheck, kein reales Modell): Wanne + Glaskabine + Dach, Radhäuser (Kotflügelbacken), Stoßfänger, Seitenstreifen, Kennzeichen – 1 Mesh (Vertexfarben) */
function buildHatchBody(p: CarParams, mount: number[][]): THREE.Mesh {
  const { w, l } = p.size, y0 = -(p.cgHeight - 0.18), hw = w / 2, zf = -l / 2, zr = l / 2;
  const parts: THREE.BufferGeometry[] = [];
  const BODY = PALETTE.body, GLASS = 0x1f2d3a, DARK = 0x2a2d33, BLACK = 0x0e0f12, STRIPE = 0xe6e8ec, BUMP = 0x3a3e46, PLATE = 0xf2f2ea;
  const bx = (cx: number, h: number, cz: number, sx: number, sh: number, sz: number, hex: number) => { const g = new THREE.BoxGeometry(sx, sh, sz).toNonIndexed(); g.deleteAttribute('uv'); g.translate(cx, y0 + h, cz); parts.push(withColor(g, hex)); };
  const pr = (prof: number[][], hx: number, hex: number, dx = 0) => { const g = prismGeo(prof, hx, y0); g.translate(dx, 0, 0); parts.push(withColor(g, hex)); };
  const A = zf + 0.07, B = zr - 0.07;
  // Wanne (Karosserie bis zur Gürtellinie)
  pr([[A, 0.04], [zf, 0.16], [zf, 0.62], [zf + 0.45, 0.70], [zf + 1.25, 0.74], [zr - 0.25, 0.78], [zr, 0.72], [zr, 0.16], [B, 0.04]], hw, BODY);
  // Kabine: dunkles Glas, Dach + Säulen in Wagenfarbe
  pr([[-0.72, 0.74], [-0.12, 1.18], [1.32, 1.2], [1.8, 0.78]], hw * 0.88, GLASS);
  bx(0, 1.205, 0.6, hw * 1.84, 0.05, 1.46, BODY);
  for (const sx of [-1, 1]) {
    const x = sx * hw * 0.88;
    pr([[-0.72, 0.74], [-0.12, 1.18], [-0.04, 1.18], [-0.62, 0.74]], 0.025, BODY, x);       // A-Säule
    pr([[0.42, 0.78], [0.46, 1.19], [0.58, 1.19], [0.58, 0.78]], 0.025, BODY, x);            // B-Säule
    pr([[1.22, 1.19], [1.36, 1.19], [1.84, 0.78], [1.64, 0.78]], 0.025, BODY, x);            // C-Säule
    bx(sx * (hw + 0.07), 0.84, -0.52, 0.12, 0.09, 0.14, DARK);                               // Spiegel
    bx(sx * (hw + 0.006), 0.42, 0, 0.014, 0.06, l * 0.9, STRIPE);                            // Seitenstreifen
    bx(sx * (hw + 0.006), 0.13, 0, 0.014, 0.1, 2.3, DARK);                                   // Schweller
  }
  // Radhäuser: Kotflügelbacken über den Rädern + dunkle Radlauf-Kante
  for (const m of mount) {
    const sx = Math.sign(m[0]);
    bx(sx * (hw + 0.045), 0.43, m[2], 0.15, 0.17, 0.92, BODY);
    bx(sx * (hw + 0.045), 0.335, m[2], 0.15, 0.025, 0.92, BLACK);
    bx(sx * (hw + 0.006), 0.2, m[2], 0.014, 0.34, 0.9, DARK);
  }
  // Stoßfänger, Grill, Kennzeichen, Heckschürze
  bx(0, 0.22, zf - 0.04, w * 1.02, 0.24, 0.14, BUMP); bx(0, 0.22, zr + 0.04, w * 1.02, 0.24, 0.14, BUMP);
  bx(0, 0.34, zf - 0.11, w * 0.9, 0.02, 0.02, STRIPE); bx(0, 0.34, zr + 0.11, w * 0.9, 0.02, 0.02, STRIPE);
  bx(0, 0.47, zf - 0.005, w * 0.34, 0.13, 0.02, BLACK);
  bx(0, 0.42, zr + 0.013, 0.32, 0.11, 0.02, PLATE);
  bx(0, 0.69, zr - 0.2, w * 0.7, 0.03, 0.34, DARK);   // Heckklappen-Fuge / kleiner Abrisskante
  return new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** Jeep: offener Geländewagen, orange, Überrollbügel, Reserverad hinten, hohe Bodenfreiheit – ein Mesh aus Quadern (Vertexfarben) */
function buildJeepBody(p: CarParams, mount: number[][]): THREE.Mesh {
  const { w, l } = p.size, y0 = -(p.cgHeight - (p.clearance ?? 0.5)), hw = w / 2, zf = -l / 2, zr = l / 2;
  const parts: THREE.BufferGeometry[] = [];
  const OR = 0xff6a00, DARK = 0x24262c, BLACK = 0x0e0f12, GLASS = 0x6aa6d0, STEEL = 0xa8aab2, SEAT = 0x3a3330;
  const bx = (cx: number, h: number, cz: number, sx: number, sh: number, sz: number, hex: number) => { const g = new THREE.BoxGeometry(sx, sh, sz).toNonIndexed(); g.deleteAttribute('uv'); g.translate(cx, y0 + h, cz); parts.push(withColor(g, hex)); };
  bx(0, 0.02, 0, w * 0.62, 0.14, l * 0.9, DARK);                         // Rahmen/Unterbau
  bx(0, 0.14, 0.7, w * 0.92, 0.06, 2.3, DARK);                           // Wannenboden
  for (const sx of [-1, 1]) {
    bx(sx * (hw - 0.05), 0.4, 0.75, 0.1, 0.5, 2.3, OR);                  // Seitenwände (offen, keine Türen)
    bx(sx * (hw - 0.05), 0.68, 0.75, 0.12, 0.05, 2.3, DARK);             // Rand
    bx(sx * 0.4, 0.4, 0.55, 0.4, 0.08, 0.42, SEAT); bx(sx * 0.4, 0.62, 0.78, 0.4, 0.42, 0.1, SEAT);   // Sitze
    bx(sx * (hw * 0.55), 1.02, -0.62, 0.05, 0.5, 0.05, DARK);            // Scheibenpfosten
    bx(sx * 0.7, 0.95, 1.1, 0.07, 0.7, 0.07, STEEL);                     // Überrollbügel: ein Bügel hinter den Sitzen, Pfosten
    bx(sx * 0.38, 0.5, 1.6, 0.05, 0.05, 0.05, DARK);
  }
  bx(0, 1.3, 1.1, 1.47, 0.07, 0.07, STEEL);                                                         // Bügel quer von Seite zu Seite, nichts längs
  bx(0, 0.4, zr - 0.07, w * 0.96, 0.5, 0.1, OR);                         // Heckwand
  bx(0, 0.58, -1.18, w * 0.88, 0.34, 1.45, OR);                          // Motorhaube
  bx(0, 0.4, -1.18, w * 0.8, 0.18, 1.45, DARK);
  bx(0, 0.5, zf + 0.04, w * 0.52, 0.26, 0.05, BLACK);                    // Kühlergrill
  for (const k of [-0.15, -0.05, 0.05, 0.15]) bx(k * w * 0.5, 0.5, zf + 0.015, 0.03, 0.22, 0.03, STEEL);
  bx(0, 0.15, zf - 0.07, w * 1.02, 0.16, 0.14, DARK); bx(0, 0.15, zr + 0.05, w * 1.0, 0.16, 0.1, DARK);   // Stoßfänger
  bx(0, 0.93, -0.65, w * 0.88, 0.5, 0.04, GLASS); bx(0, 1.19, -0.65, w * 0.92, 0.06, 0.06, DARK);       // Frontscheibe + Rahmen
  for (const m of mount) bx(Math.sign(m[0]) * (hw + 0.03), 0.66, m[2], 0.2, 0.05, 1.05, BLACK);       // Kotflügelverbreiterung über den Rädern
  const spare = new THREE.CylinderGeometry(0.36, 0.36, 0.2, 10).toNonIndexed(); spare.deleteAttribute('uv'); spare.rotateX(Math.PI / 2); spare.translate(0, y0 + 0.6, zr + 0.2); parts.push(withColor(spare, PALETTE.tyre));
  const hubG = new THREE.CylinderGeometry(0.15, 0.15, 0.22, 8).toNonIndexed(); hubG.deleteAttribute('uv'); hubG.rotateX(Math.PI / 2); hubG.translate(0, y0 + 0.6, zr + 0.2); parts.push(withColor(hubG, PALETTE.rim));
  return new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** Weiche Lichttextur: links Lichtkegel (Länge nach oben abklingend, Ränder weich), rechts runder Schein. 128x64. */
let _lightTex: THREE.CanvasTexture | null = null;
function lightTexture(): THREE.CanvasTexture {
  if (_lightTex) return _lightTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d')!, im = g.createImageData(128, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
    let a: number;
    if (x < 64) { const u = Math.abs(x / 63 - 0.5) * 2, v = y / 63; a = Math.max(0, 1 - u * u) * (1 - v) ** 0.8; }       // v=0: am Auto
    else { const dx = (x - 64) / 31.5 - 1, dy = y / 31.5 - 1, d = Math.hypot(dx, dy); a = Math.max(0, 1 - d) ** 1.6; }
    const k = Math.round(a * 255), o = (y * 128 + x) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = k; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  _lightTex = new THREE.CanvasTexture(c); _lightTex.colorSpace = THREE.SRGBColorSpace; _lightTex.generateMipmaps = false;
  _lightTex.minFilter = _lightTex.magFilter = THREE.LinearFilter;
  return _lightTex;
}

/** Beweglicher Fahrwerksteil des Buggys: Querlenker, Radträger und Federbein (gestreift wie eine Feder) je Rad in EINEM Mesh;
 *  die Enden folgen jedes Bild dem Rad (Federweg), die oberen Enden sitzen fest an der Karosserie. Nur Optik. */
class LinkMesh {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array; private readonly nor: Float32Array;
  private static readonly STRIPES = 5;
  private static readonly PER = 3 + LinkMesh.STRIPES;   // Boxen je Rad
  constructor(private car: Vehicle, private doms: number[][], private w: number, private lowY: number, p: CarParams) {
    const n = 4 * LinkMesh.PER * 36;
    this.pos = new Float32Array(n * 3); this.nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3), c = new THREE.Color();
    const RED = 0xd8342a, DARK = 0x3a3c44, STEEL = 0xa8aab2;
    for (let i = 0; i < 4; i++) for (let k = 0; k < LinkMesh.PER; k++) {
      c.set(k < 3 ? STEEL : (k % 2 ? RED : DARK));
      for (let v = 0; v < 36; v++) { const o = ((i * LinkMesh.PER + k) * 36 + v) * 3; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.frustumCulled = false;
    void p;
  }
  /** Quader von a nach b mit Querschnitt t x t2 an Platz `slot` schreiben */
  private box(slot: number, a: number[], b: number[], t: number, t2: number): void {
    let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const L = Math.hypot(dx, dy, dz) || 1e-6; dx /= L; dy /= L; dz /= L;
    const up = Math.abs(dy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = dy * up[2] - dz * up[1], uy = dz * up[0] - dx * up[2], uz = dx * up[1] - dy * up[0]; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const P: number[][] = [];
    for (const e of [a, b]) for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push([e[0] + ux * su * t / 2 + vx * sv * t2 / 2, e[1] + uy * su * t / 2 + vy * sv * t2 / 2, e[2] + uz * su * t / 2 + vz * sv * t2 / 2]);
    const faces: [number[], number[]][] = [   // Ecken + Normale
      [[0, 1, 2, 3], [-dx, -dy, -dz]], [[7, 6, 5, 4], [dx, dy, dz]],
      [[0, 4, 5, 1], [-vx, -vy, -vz]], [[3, 2, 6, 7], [vx, vy, vz]],
      [[0, 3, 7, 4], [-ux, -uy, -uz]], [[1, 5, 6, 2], [ux, uy, uz]],
    ];
    let o = slot * 36 * 3;
    for (const [q, nv] of faces) for (const k of [0, 1, 2, 0, 2, 3]) {
      const pt = P[q[k]]; this.pos[o] = pt[0]; this.pos[o + 1] = pt[1]; this.pos[o + 2] = pt[2];
      this.nor[o] = nv[0]; this.nor[o + 1] = nv[1]; this.nor[o + 2] = nv[2]; o += 3;
    }
  }
  update(wheels: { steer: THREE.Group }[]): void {
    const { w, lowY } = this, S = LinkMesh.STRIPES;
    for (let i = 0; i < 4; i++) {
      const m = this.car.mount[i], sx = Math.sign(m[0]), h = wheels[i].steer.position, hw = i < 2 ? 0.1 : 0.23;
      const cx = h.x - sx * (hw + 0.04), inX = sx * w * 0.3, z = m[2];
      const Cl = [cx, h.y - 0.06, z], Cu = [cx, h.y + 0.14, z - 0.03];
      const A1 = [inX, lowY + 0.24, z], A2 = [inX, lowY + 0.42, z - 0.1];
      const base = i * LinkMesh.PER;
      this.box(base, A1, Cl, 0.05, 0.04);                 // unterer Querlenker
      this.box(base + 1, A2, Cu, 0.04, 0.03);             // oberer Querlenker
      this.box(base + 2, Cl, Cu, 0.05, 0.05);             // Radträger
      const top = this.doms[i], bot = [A1[0] + (Cl[0] - A1[0]) * 0.85, A1[1] + (Cl[1] - A1[1]) * 0.85 + 0.03, z + 0.03];
      for (let k = 0; k < S; k++) {                        // Feder: abwechselnd rot/dunkel, wächst und schrumpft mit dem Federweg
        const t0 = k / S, t1 = (k + 1) / S, at = (t: number) => [bot[0] + (top[0] - bot[0]) * t, bot[1] + (top[1] - bot[1]) * t, bot[2] + (top[2] - bot[2]) * t];
        this.box(base + 3 + k, at(t0), at(t1), 0.12, 0.12);
      }
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class CarMesh {
  readonly root = new THREE.Group();
  /** angewandter Lichtzustand (Test/Debug) */
  lit = { brake: false, reverse: false };
  private lampCol!: THREE.BufferAttribute; private fxCol!: THREE.BufferAttribute;
  private seg: Record<string, [number, number]> = {};
  private night = false;
  private lampN = 0; private fxN = 0;
  private wheels: { steer: THREE.Group; spin: THREE.Mesh }[] = [];
  private links: LinkMesh | null = null;
  private mountY: number[]; private frontDrop = 0; private frontSpin = 1;
  constructor(private car: Vehicle, p: CarParams) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: p.style === 'buggy' ? PALETTE.buggy : PALETTE.body });
    const cabinMat = new THREE.MeshLambertMaterial({ color: PALETTE.cabin });
    const { w, l } = p.size;
    const lowY = -(p.cgHeight - 0.18);
    const lowH = 0.56;
    if (p.style === 'jeep') {
      this.root.add(buildJeepBody(p, car.mount));
    } else if (p.style === 'rally') {
      this.root.add(buildRallyBody(p, car.mount));
    } else if (p.style === 'buggy') {
      // RC-Offroad-Buggy: flache Keilwanne, Cockpit-Kuppel, hoher Heckspoiler auf zwei Stützen, Frontbügel, Querlenker + Federbeine – alles in EINEM Mesh (Vertexfarben)
      const parts: THREE.BufferGeometry[] = [];
      const bx = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, hex: number, rz = 0) => { const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(); if (rz) g.rotateZ(rz); g.translate(cx, cy, cz); parts.push(withColor(g, hex)); };
      const BODY = PALETTE.buggy, DARK = 0x24262c, RED = 0xd8342a, GLASS = 0x6aa6d0, STEEL = 0xa8aab2;
      bx(0, lowY + 0.2, 0.05, w * 0.62, 0.14, l * 0.8, BODY);                       // Wanne
      bx(0, lowY + 0.29, -l * 0.36, w * 0.5, 0.1, l * 0.26, BODY);                  // Nase (flach, Keil)
      bx(0, lowY + 0.25, -l * 0.47, w * 0.42, 0.06, l * 0.08, BODY);
      bx(0, lowY + 0.33, l * 0.3, w * 0.58, 0.2, l * 0.28, BODY);                   // Heckpartie höher
      for (const sx of [-1, 1]) { bx(sx * w * 0.37, lowY + 0.27, 0.0, w * 0.13, 0.22, l * 0.42, BODY); bx(sx * w * 0.37, lowY + 0.39, 0.0, w * 0.13, 0.03, l * 0.42, RED); }   // Seitenkästen mit Streifen
      const dome = new THREE.SphereGeometry(1, 8, 6).toNonIndexed(); dome.scale(w * 0.2, 0.2, 0.55); dome.translate(0, lowY + 0.38, -0.12); parts.push(withColor(dome, GLASS));   // Cockpit-Kuppel
      bx(0, lowY + 0.3, l * 0.5 - 0.04, w * 0.6, 0.2, 0.1, BODY);                    // Heckblende (Rücklichter sitzen darauf)
      bx(0, lowY + 0.35, l * 0.33, w * 0.42, 0.22, 0.44, DARK);                     // Motor (Oberkante über der Heckpartie: keine koplanare Fläche -> kein Flimmern)
      // Frontbügel: Querstange an der Nasenspitze, zwei kurze Streben zurück an die Nase (alles berührt die Wanne)
      bx(0, lowY + 0.3, -l * 0.5 - 0.06, w * 0.54, 0.07, 0.09, DARK);
      for (const sx of [-1, 1]) bx(sx * w * 0.255, lowY + 0.3, -l * 0.5 + 0.09, 0.05, 0.05, 0.3, DARK);
      // Heckspoiler: zwei Stützen + Flügel + Endplatten (rot)
      for (const sx of [-1, 1]) { bx(sx * w * 0.26, lowY + 0.68, l * 0.44, 0.06, 0.62, 0.06, STEEL); bx(sx * w * 0.5, lowY + 0.95, l * 0.46, 0.04, 0.26, 0.5, RED); }
      bx(0, lowY + 0.95, l * 0.46, w, 0.05, 0.46, RED); bx(0, lowY + 0.99, l * 0.5, w, 0.04, 0.2, DARK);
      // Federbeindome auf der Wanne (statisch); Querlenker und Federbeine sind beweglich (`LinkMesh`, folgen den Rädern)
      const doms: number[][] = [];
      car.mount.forEach((m) => {
        const sx = Math.sign(m[0]), z = m[2], base = z < 0 ? lowY + 0.27 : lowY + 0.41;   // Oberseite der Wanne bzw. Heckpartie an der Radachse
        const dx = sx * w * 0.26;
        bx(dx, base + 0.14, z + 0.05, 0.13, 0.32, 0.13, DARK);
        doms.push([dx + sx * 0.03, base + 0.3, z + 0.05]);
      });
      this.links = new LinkMesh(car, doms, w, lowY, p);
      this.root.add(this.links.mesh);
      const body = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ vertexColors: true })); this.root.add(body);
    } else {
      this.root.add(buildHatchBody(p, car.mount));
    }
    // Bodenplatte (dunkelgrau): von unten / beim Überschlag sieht man nie ins Innere. Unterkante je Auto wie die Karosserie.
    const floorY = p.style === 'jeep' ? -(p.cgHeight - (p.clearance ?? 0.5)) : p.style === 'rally' ? -(p.cgHeight - 0.24) : p.style === 'buggy' ? lowY + 0.05 : lowY;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(w * (p.style === 'buggy' ? 0.9 : 0.98), 0.06, l * 0.98), new THREE.MeshLambertMaterial({ color: 0x2b2c30 }));
    plate.position.y = floorY - 0.02; this.root.add(plate);
    // Reifen: Buggy mit Stollen (Klötzchen rund um den Umfang), hinten breiter als vorn
    const tyreGeo = (width: number, knobs: boolean, R = p.wheelRadius) => {
      const cyl = new THREE.CylinderGeometry(R, R, width, 8).toNonIndexed(); const gl = [cyl];
      if (knobs) for (let k = 0; k < 12; k++) { const kb = new THREE.BoxGeometry(0.16 * R / 0.36, width * 1.04, 0.14 * R / 0.36).toNonIndexed(); kb.translate(R + 0.02, 0, 0); kb.rotateY(k * Math.PI / 6); gl.push(kb); }
      const g = mergeGeometries(gl)!; g.rotateZ(Math.PI / 2); return g;
    };
    // Buggy (RC): vorn deutlich kleiner und schmaler als hinten. Nur Optik: Physik-Radius bleibt, Mesh sitzt tiefer (Aufstandspunkt gleich) und dreht schneller.
    const bug = p.style === 'buggy', RF = bug ? 0.25 : p.wheelRadius;
    const jp = p.style === 'jeep', wg = tyreGeo(bug ? 0.2 : jp ? 0.3 : 0.24, bug || jp, RF), wgR = bug ? tyreGeo(0.46, true) : wg;
    this.frontDrop = p.wheelRadius - RF; this.frontSpin = p.wheelRadius / RF;
    const tyre = new THREE.MeshLambertMaterial({ color: PALETTE.tyre });
    const rim = new THREE.MeshLambertMaterial({ color: PALETTE.rim });
    // Speiche: macht die Drehung sichtbar; steht 1 cm über die Reifenflanke (gleich breit wäre koplanar und flimmert)
    const hub = new THREE.BoxGeometry(bug || jp ? 0.24 : 0.26, 0.12, 0.5);
    const hubF = new THREE.BoxGeometry(0.22, 0.09, 0.36);
    this.mountY = car.mount.map((m) => m[1]);
    for (let i = 0; i < 4; i++) {
      const steer = new THREE.Group();
      const spin = new THREE.Mesh(i >= 2 ? wgR : wg, tyre);
      spin.add(new THREE.Mesh(bug && i < 2 ? hubF : hub, rim));
      steer.add(spin);
      this.root.add(steer);
      this.wheels.push({ steer, spin });
    }
    this.buildLights(p);
  }

  /** Reifen der angetriebenen Achse(n) einfärben (Auto-Symbole im Menü); Räder 0/1 vorn, 2/3 hinten */
  markDriven(drive: 'FWD' | 'RWD' | 'AWD', color = 0xe8281e): void {
    const m = new THREE.MeshLambertMaterial({ color });
    this.wheels.forEach((w, i) => { if (i < 2 ? drive !== 'RWD' : drive !== 'FWD') w.spin.material = m; });
  }

  /** Lichter: 1 Mesh Lampenflächen (Vertexfarben) + 1 additives Mesh (Lichtkegel auf der Straße, Schein). Farben nur bei Zustandswechsel. */
  private buildLights(p: CarParams): void {
    const { w, l } = p.size, cg = p.cgHeight, hw = w / 2;
    const ly = p.style === 'jeep' ? -(cg - (p.clearance ?? 0.5)) + 0.5 : p.style === 'rally' ? -(cg - 0.24) + 0.33 : p.style === 'buggy' ? -(cg - 0.18) + 0.32 : -(cg - 0.18) + 0.46;   // Kompakter: Leuchten in der Stirn-/Heckfläche über den Stoßfängern
    const gy = -cg + 0.07;
    // Lampenquader
    const pos: number[] = [], seg: Record<string, [number, number]> = this.seg;
    const box = (cx: number, cy: number, cz: number, bw: number, bh: number, bl: number) => {
      const x0 = cx - bw / 2, x1 = cx + bw / 2, y0 = cy - bh / 2, y1 = cy + bh / 2, z0 = cz - bl / 2, z1 = cz + bl / 2;
      const f = (a: number[], b: number[], c: number[], d: number[]) => { for (const q of [a, b, c, a, c, d]) pos.push(q[0], q[1], q[2]); };
      f([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); f([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
      f([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); f([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
      f([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    };
    const mark = (k: string, from: number) => { seg[k] = [from, pos.length / 3 - from]; };
    let a = 0;
    if (p.style !== 'rally') for (const sx of [-1, 1]) box(sx * w * 0.32, ly, -l / 2 - 0.02, 0.28, 0.14, 0.06);
    mark('head', a); a = pos.length / 3;
    if (p.style === 'rally') { for (const x of [-0.64, -0.21, 0.21, 0.64]) box(x * hw / 0.85, ly, -l / 2 - 0.12, 0.24, 0.17, 0.04); mark('aux', a); a = pos.length / 3; }   // Rallye: genau vier Scheinwerfer
    for (const sx of [-1, 1]) box(sx * w * 0.36, ly, l / 2 + 0.02, 0.3, 0.12, 0.05); mark('tail', a); a = pos.length / 3;
    for (const sx of [-1, 1]) box(sx * w * 0.16, ly, l / 2 + 0.02, 0.14, 0.1, 0.05); mark('rev', a);
    this.lampN = pos.length / 3;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.lampCol = new THREE.BufferAttribute(new Float32Array(this.lampN * 3), 3); lg.setAttribute('color', this.lampCol);
    const lamps = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); lamps.frustumCulled = false;
    this.root.add(lamps);
    // Additiv: Kegel + Schein
    const fp: number[] = [], fu: number[] = [], fs: Record<string, [number, number]> = {};
    const quad = (v: number[][], uv: number[][]) => { for (const i of [0, 1, 2, 0, 2, 3]) { fp.push(v[i][0], v[i][1], v[i][2]); fu.push(uv[i][0], uv[i][1]); } };
    let b = 0; const fmark = (k: string) => { fs[k] = [b, fp.length / 3 - b]; b = fp.length / 3; };
    const zf = -l / 2;
    quad([[-0.7, gy, zf], [0.7, gy, zf], [4.5, gy, zf - 30], [-4.5, gy, zf - 30]], [[0, 1], [0.5, 1], [0.5, 0], [0, 0]]); fmark('beam');
    for (const sx of [-1, 1]) { const x = sx * w * 0.32, r = 0.55; quad([[x - r, ly - r, zf - 0.08], [x + r, ly - r, zf - 0.08], [x + r, ly + r, zf - 0.08], [x - r, ly + r, zf - 0.08]], [[0.5, 0], [1, 0], [1, 1], [0.5, 1]]); } fmark('hglow');
    for (const sx of [-1, 1]) { const x = sx * w * 0.36, r = 0.6; quad([[x - r, ly - r, l / 2 + 0.07], [x + r, ly - r, l / 2 + 0.07], [x + r, ly + r, l / 2 + 0.07], [x - r, ly + r, l / 2 + 0.07]], [[0.5, 0], [1, 0], [1, 1], [0.5, 1]]); } fmark('tglow');
    for (const sx of [-1, 1]) { const x = sx * w * 0.16, r = 0.4; quad([[x - r, ly - r, l / 2 + 0.07], [x + r, ly - r, l / 2 + 0.07], [x + r, ly + r, l / 2 + 0.07], [x - r, ly + r, l / 2 + 0.07]], [[0.5, 0], [1, 0], [1, 1], [0.5, 1]]); } fmark('rglow');
    this.fxN = fp.length / 3; this.fxSeg = fs;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
    this.fxCol = new THREE.BufferAttribute(new Float32Array(this.fxN * 3), 3); fg.setAttribute('color', this.fxCol);
    const fx = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: lightTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    fx.frustumCulled = false; fx.renderOrder = 2; this.fxMesh = fx;
    this.root.add(fx);
    this.paint(true);
  }
  private fxSeg: Record<string, [number, number]> = {};
  private fxMesh!: THREE.Mesh;
  private fill(att: THREE.BufferAttribute, seg: [number, number] | undefined, c: number[]): void {
    if (!seg) return;
    for (let i = seg[0]; i < seg[0] + seg[1]; i++) att.setXYZ(i, c[0], c[1], c[2]);
  }
  private paint(all = false): void {
    const L = this.lit, n = this.night;
    this.fill(this.lampCol, this.seg.head, [1, 0.95, 0.7]); this.fill(this.lampCol, this.seg.aux, [1, 0.95, 0.7]);
    this.fill(this.lampCol, this.seg.tail, L.brake ? [1, 0.12, 0.08] : [0.4, 0.04, 0.03]);
    this.fill(this.lampCol, this.seg.rev, L.reverse ? [1, 1, 1] : [0.22, 0.22, 0.24]);
    this.lampCol.needsUpdate = true;
    const k = n ? 1 : 0, off = [0, 0, 0];   // Scheinwerferkegel nur bei Dämmerung/Nacht/Tunnel
    this.fxMesh.visible = n || L.brake || L.reverse;
    this.fill(this.fxCol, this.fxSeg.beam, [1.0 * k, 0.95 * k, 0.65 * k]);
    this.fill(this.fxCol, this.fxSeg.hglow, [0.9 * k, 0.85 * k, 0.6 * k]);
    this.fill(this.fxCol, this.fxSeg.tglow, L.brake ? [1, 0.12, 0.08] : off);
    this.fill(this.fxCol, this.fxSeg.rglow, L.reverse ? [0.9, 0.9, 1] : off);
    this.fxCol.needsUpdate = true;
    void all;
  }
  /** Bremslicht/Rückfahrlicht; zeichnet nur bei Wechsel neu */
  setLights(brake: boolean, reverse: boolean): void {
    if (brake === this.lit.brake && reverse === this.lit.reverse) return;
    this.lit.brake = brake; this.lit.reverse = reverse; this.paint();
  }
  /** Nacht/Abendlicht: Scheinwerfer und Lichtkegel kräftiger */
  setNight(n: boolean): void { if (n !== this.night) { this.night = n; this.paint(); } }
  /** Rotanteil des ersten Rücklicht-Eckpunkts (Test) */
  tailRed(): number { return this.lampCol.getX(this.seg.tail[0]); }
  update(a: Pose, b: Pose, f: number): void {
    const r = this.root;
    r.position.set(a.px + (b.px - a.px) * f, a.py + (b.py - a.py) * f, a.pz + (b.pz - a.pz) * f);
    r.quaternion.set(a.qx, a.qy, a.qz, a.qw).slerp(_q.set(b.qx, b.qy, b.qz, b.qw), f);
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i], m = this.car.mount[i];
      const s = a.susp[i] + (b.susp[i] - a.susp[i]) * f;
      w.steer.position.set(m[0], m[1] - s - (i < 2 ? this.frontDrop : 0), m[2]);
      w.steer.rotation.y = i < 2 ? -(a.steer + (b.steer - a.steer) * f) : 0;
      w.spin.rotation.x = -(a.spin[i] + (b.spin[i] - a.spin[i]) * f) * (i < 2 ? this.frontSpin : 1);
    }
    this.links?.update(this.wheels);
  }
}

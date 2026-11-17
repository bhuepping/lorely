// Nachtstadt: Fassaden, Leuchtschilder, Gebäude-Suppe.
import * as THREE from 'three';
import type { Course } from '../level';

// ───────────────────────── Nachtstadt ─────────────────────────
// Alles unbeleuchtet (MeshBasic) und zusammengeführt: Gebäude in einem Mesh mit Fenster-Textur,
// 1 Mesh Straßenzeug (Mittellinie, Randlinien, Laternenmasten), 1 additives Mesh (Neon-Schilder, Lichtkegel, Lichtpfützen).
const TINTS = [[1, 0.85, 0.55], [0.55, 0.9, 1], [1, 0.55, 0.9], [0.95, 0.95, 1]];

function facadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b0c18'; g.fillRect(0, 0, 128, 128);
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const lit = rnd() < 0.34, k = rnd();
    g.fillStyle = lit ? (k < 0.6 ? '#ffffff' : k < 0.85 ? '#d8dcee' : '#8d97b8') : (k < 0.5 ? '#12142a' : '#171a30');
    g.fillRect(i * 16 + 4, j * 16 + 4, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

const SIGN_TEXT: [string, string][] = [['BAR', '#ff2a9d'], ['HOTEL', '#22e8ff'], ['DISCO', '#ffe135'], ['24H', '#35ff7a'], ['TAXI', '#ffb020'], ['PIZZA', '#ff4a3a'],
  ['RAMEN', '#ff6ad5'], ['NEON', '#4ad0ff'], ['CLUB', '#b46bff'], ['GAME', '#7dff4a'], ['SHOP', '#ff9a3a'], ['JAZZ', '#4affd9']];
const CELL_GLOW = 14, CELL_WHITE = 15;
function glowAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  SIGN_TEXT.forEach(([t, col], i) => {
    const x = (i % 4) * 128, y = Math.floor(i / 4) * 64;
    g.font = 'bold 36px "Arial Black", Impact, sans-serif';
    g.strokeStyle = col; g.fillStyle = col;
    g.shadowColor = col; g.shadowBlur = 10; g.lineWidth = 5;
    g.strokeRect(x + 6, y + 6, 116, 52);                    // Rahmen
    g.shadowBlur = 8; g.fillText(t, x + 64, y + 34);
    g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.55; g.fillText(t, x + 64, y + 34); g.globalAlpha = 1;
  });
  // Lichtpfütze (weich)
  const gx = (CELL_GLOW % 4) * 128, gy = Math.floor(CELL_GLOW / 4) * 64;
  const rg = g.createRadialGradient(gx + 64, gy + 32, 0, gx + 64, gy + 32, 32);
  rg.addColorStop(0, '#fff'); rg.addColorStop(1, '#000');
  g.save(); g.beginPath(); g.rect(gx, gy, 128, 64); g.clip(); g.translate(gx + 64, gy + 32); g.scale(2, 1); g.translate(-(gx + 64), -(gy + 32)); g.fillStyle = rg; g.fillRect(gx, gy, 128, 64); g.restore();
  const wx = (CELL_WHITE % 4) * 128, wy = Math.floor(CELL_WHITE / 4) * 64;
  g.fillStyle = '#fff'; g.fillRect(wx, wy, 128, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
const cellUV = (cell: number): [number, number, number, number] => {
  const x = (cell % 4) * 128, y = Math.floor(cell / 4) * 64;
  return [(x + 2) / 512, 1 - (y + 62) / 256, (x + 126) / 512, 1 - (y + 2) / 256];     // u0, v0 (unten), u1, v1 (oben)
};

export class Soup {
  pos: number[] = []; col: number[] = []; uv: number[] = [];
  tri(a: number[], b: number[], c: number[], col: number[], ua?: number[], ub?: number[], uc?: number[]): void {
    for (const [p, u] of [[a, ua], [b, ub], [c, uc]] as const) { this.pos.push(p[0], p[1], p[2]); this.col.push(col[0], col[1], col[2]); this.uv.push(u ? u[0] : 0, u ? u[1] : 0); }
  }
  quad(a: number[], b: number[], c: number[], d: number[], col: number[], u?: number[][]): void {   // a,b,c,d gegen den Uhrzeigersinn; u = 4 UVs
    this.tri(a, b, c, col, u?.[0], u?.[1], u?.[2]); this.tri(a, c, d, col, u?.[0], u?.[2], u?.[3]);
  }
  geometry(uv = true): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

export function buildCity(course: Course): THREE.Group {
  const city = course.city!, T = course.terrain, route = course.route, half = course.roadWidth / 2;
  const group = new THREE.Group();

  // ── Gebäude, als ein zusammengeführtes Mesh (Draw Calls sparen; ein paar zehntausend Ecken sind billig) ──
  const chunks = new Map<number, Soup>();
  const DARK = [0.5, 0.5, 0.5];
  for (const b of city.buildings) {
    const k = 0;
    let sp = chunks.get(k); if (!sp) chunks.set(k, sp = new Soup());
    const tint = TINTS[b.tint].map((v, i) => v * (0.55 + 0.5 * ((b.u0 * (i + 3)) % 1)));
    const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
    const W = (lx: number, lz: number, y: number) => [b.x + cs * lx + sn * lz, y, b.z - sn * lx + cs * lz];
    const tile = 24;
    const box = (hx: number, hz: number, y0: number, y1: number) => {
      const corners: [number, number][] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
      let u = b.u0;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4], len = Math.hypot(bx - ax, bz - az);
        const v0 = b.v0 + y0 / tile, v1 = b.v0 + y1 / tile, u0 = u, u1 = u + len / tile; u = u1;
        sp.quad(W(ax, az, y0), W(bx, bz, y0), W(bx, bz, y1), W(ax, az, y1), tint, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      }
      const du = [[0.002, 0.004], [0.002, 0.004], [0.002, 0.004], [0.002, 0.004]];
      sp.quad(W(-hx, -hz, y1), W(-hx, hz, y1), W(hx, hz, y1), W(hx, -hz, y1), DARK, du);
    };
    box(b.hx, b.hz, b.y0, b.y0 + b.h);
    if (b.tier) box(b.hx * 0.6, b.hz * 0.6, b.y0 + b.h, b.y0 + b.h * (1 + b.tier));
  }
  const bm = new THREE.MeshBasicMaterial({ map: facadeTexture(), vertexColors: true, side: THREE.DoubleSide });
  for (const sp of chunks.values()) group.add(new THREE.Mesh(sp.geometry(), bm));

  // ── Straßenzeug: Mittelstrich, Randlinien, Laternenmasten (unbeleuchtet, Vertexfarben) ──
  const fs = new Soup(), Y = 0.07;
  const strip = (s0: number, s1: number, lat0: number, lat1: number, col: number[]) => {
    const p = (s: number, l: number) => { const [x, z] = route.offset(s, l); return [x, T.height(x, z) + Y, z]; };
    fs.quad(p(s0, lat1), p(s0, lat0), p(s1, lat0), p(s1, lat1), col);
  };
  const onBridge = (s: number) => !!course.bridge && s > course.bridge.s0 - 4 && s < course.bridge.s1 + 1;
  for (let s = 0; s < route.length; s += 4) {   // Gehwege (heller, leicht erhöht) – die Grenze der Straße, die das grobe Raster nicht zeigt
    if (onBridge(s)) continue;
    for (const side of [1, -1]) {
      const p = (ss: number, l: number) => { const [x, z] = route.offset(ss, side * l); return [x, T.height(x, z) + 0.14, z]; };
      fs.quad(p(s, half), p(s, half + 3), p(s + 4, half + 3), p(s + 4, half), [0.15, 0.15, 0.22]);
    }
  }
  for (let s = 4; s < route.length - 4; s += 3) {
    if (onBridge(s)) continue;
    if (Math.floor(s / 3) % 3 === 0) strip(s, s + 3, -0.12, 0.12, [0.85, 0.8, 0.45]);
    strip(s, s + 3, half - 0.7, half - 0.45, [0.6, 0.62, 0.7]); strip(s, s + 3, -half + 0.45, -half + 0.7, [0.6, 0.62, 0.7]);
  }
  const bar = (x: number, y0: number, y1: number, z: number, w: number, col: number[]) => {
    const h = w / 2; const P = (dx: number, y: number, dz: number) => [x + dx, y, z + dz];
    fs.quad(P(-h, y0, h), P(h, y0, h), P(h, y1, h), P(-h, y1, h), col); fs.quad(P(h, y0, -h), P(-h, y0, -h), P(-h, y1, -h), P(h, y1, -h), col);
    fs.quad(P(h, y0, h), P(h, y0, -h), P(h, y1, -h), P(h, y1, h), col); fs.quad(P(-h, y0, -h), P(-h, y0, h), P(-h, y1, h), P(-h, y1, -h), col);
    fs.quad(P(-h, y1, h), P(h, y1, h), P(h, y1, -h), P(-h, y1, -h), col);
  };
  for (const l of city.lamps) {
    const y = T.height(l.x, l.z);
    bar(l.x, y - 0.2, y + 7.4, l.z, 0.22, [0.28, 0.3, 0.38]);
    const [hx2, hz2] = [l.x + Math.cos(l.yaw) * l.side * 0.9, l.z - Math.sin(l.yaw) * l.side * 0.9];
    bar(hx2, y + 7.3, y + 7.55, hz2, 1.1, [1, 0.88, 0.6]);
  }
  const furn = new THREE.Mesh(fs.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  furn.frustumCulled = false; group.add(furn);

  // ── Glühen (additiv): Schilder, Lichtkegel, Lichtpfützen ──
  const gs = new Soup();
  const [wu0, wv0, wu1, wv1] = cellUV(CELL_WHITE), [gu0, gv0, gu1, gv1] = cellUV(CELL_GLOW);
  for (const sg of city.signs) {
    const [u0, v0, u1, v1] = cellUV(sg.cell), hw = sg.w / 2, ux = sg.ux, uz = sg.uz;
    const P = (k: number, y: number) => [sg.x + ux * hw * k, y, sg.z + uz * hw * k];
    gs.quad(P(-1, sg.y), P(1, sg.y), P(1, sg.y + sg.h), P(-1, sg.y + sg.h), [1, 1, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }
  for (const l of city.lamps) {
    const y = T.height(l.x, l.z), hx = l.x + Math.cos(l.yaw) * l.side * 0.9, hz = l.z - Math.sin(l.yaw) * l.side * 0.9, top = y + 7.3;
    const N = 8, R = 5.2;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * 6.2832, a1 = (i + 1) / N * 6.2832;
      const p0 = [hx + Math.cos(a0) * R, T.height(hx + Math.cos(a0) * R, hz + Math.sin(a0) * R) + 0.1, hz + Math.sin(a0) * R];
      const p1 = [hx + Math.cos(a1) * R, T.height(hx + Math.cos(a1) * R, hz + Math.sin(a1) * R) + 0.1, hz + Math.sin(a1) * R];
      const wu = [(wu0 + wu1) / 2, (wv0 + wv1) / 2];
      gs.tri([hx, top, hz], p0, p1, [0.0, 0.0, 0.0], wu, wu, wu);   // Platzhalter, unten überschrieben
      const n = gs.col.length; // Apex hell, Rand schwarz (additiv = unsichtbar)
      gs.col[n - 9] = 0.11; gs.col[n - 8] = 0.09; gs.col[n - 7] = 0.05;
    }
    // Pfütze auf der Straße
    const pr = 6, py = (x: number, z: number) => T.height(x, z) + 0.09;
    const cx = hx + Math.cos(l.yaw) * l.side * 1.5, cz = hz - Math.sin(l.yaw) * l.side * 1.5;
    gs.quad([cx - pr, py(cx - pr, cz - pr), cz - pr], [cx + pr, py(cx + pr, cz - pr), cz - pr], [cx + pr, py(cx + pr, cz + pr), cz + pr], [cx - pr, py(cx - pr, cz + pr), cz + pr], [0.42, 0.33, 0.16],
      [[gu0, gv0], [gu1, gv0], [gu1, gv1], [gu0, gv1]]);
  }
  const glow = new THREE.Mesh(gs.geometry(true), new THREE.MeshBasicMaterial({ map: glowAtlas(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  glow.frustumCulled = false; glow.renderOrder = 2; group.add(glow);
  return group;
}

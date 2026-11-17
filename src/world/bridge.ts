// Brücke mit Kanal.
import * as THREE from 'three';
import type { Course } from '../level';
import { Soup } from './city';

// ───────────────────────── Brücke ─────────────────────────
function canalTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a1230'; g.fillRect(0, 0, 128, 128);
  let seed = 777; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 80; i++) { g.fillStyle = rnd() < 0.5 ? '#16285a' : '#060b1e'; g.fillRect(Math.floor(rnd() * 120), Math.floor(rnd() * 128), 6 + Math.floor(rnd() * 14), 2); }
  for (let i = 0; i < 30; i++) { g.fillStyle = rnd() < 0.5 ? '#ff3fb4' : '#35e0ff'; g.fillRect(Math.floor(rnd() * 124), Math.floor(rnd() * 120), 2 + Math.floor(rnd() * 4), 2 + Math.floor(rnd() * 6)); }   // Neon-Spiegelungen
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
  return t;
}

/** Brücke: Deck (Bogenprofil), Geländer mit Neonröhre, Pfeiler, Torbögen, Lampen = 1 Mesh (Vertexfarben, unbeleuchtet); Wasser = 1 Fläche mit wanderndem Muster. 2 Draw Calls. */
export class BridgeMesh {
  readonly group = new THREE.Group();
  private tex = canalTexture();
  constructor(course: Course, br: NonNullable<Course['bridge']> = course.bridge!) {
    const route = br.route, half = br.half, sp = new Soup();
    const P = (s: number, l: number, y: number) => { const [x, z] = route.offset(s, l); return [x, y, z]; };
    const dy = (s: number, l: number, d: number) => P(s, l, br.deckY(s) + d);
    const STEP = 2, n = Math.ceil(br.def.len / STEP);
    const day = !course.city;
    const ROAD: number[] = day ? [0.22, 0.23, 0.26] : [0.17, 0.18, 0.26], CURB: number[] = day ? [0.5, 0.5, 0.52] : [0.3, 0.3, 0.4], SIDE: number[] = day ? [0.38, 0.38, 0.4] : [0.2, 0.2, 0.28], UNDER: number[] = day ? [0.2, 0.2, 0.22] : [0.1, 0.1, 0.16], STEEL: number[] = day ? ((br.def.arches ?? 1) > 1 ? [0.2, 0.23, 0.25] : [0.3, 0.42, 0.58]) : [0.5, 0.55, 0.72], LINE: number[] = [0.6, 0.62, 0.7], DASH: number[] = [0.85, 0.8, 0.45];
    const NEON: number[][] = day ? [[0.3, 0.42, 0.58], [0.3, 0.42, 0.58]] : [[0.2, 0.95, 1], [1, 0.2, 0.8]];
    const wood = !!br.def.wood;   // Holzsteg über den Bach (Vorstadt): Bohlen, Holzgeländer
    if (wood) { ROAD.splice(0, 3, 0.46, 0.33, 0.2); CURB.splice(0, 3, 0.36, 0.25, 0.15); SIDE.splice(0, 3, 0.3, 0.2, 0.12); UNDER.splice(0, 3, 0.2, 0.14, 0.09); STEEL.splice(0, 3, 0.42, 0.3, 0.17); LINE.splice(0, 3, 0.38, 0.26, 0.15); DASH.splice(0, 3, 0.38, 0.26, 0.15); NEON[0] = NEON[1] = [0.34, 0.23, 0.13]; }
    const plain = !!br.def.plain; if (plain) { ROAD.splice(0, 3, 0.072, 0.072, 0.085); CURB.splice(0, 3, 0.25, 0.25, 0.26); SIDE.splice(0, 3, 0.14, 0.14, 0.15); }
    const W = half + 0.5, TH = plain ? 0.5 : 1.0;
    for (let i = 0; i < n; i++) {
      const a = br.s0 + i * STEP, b = Math.min(br.s1, a + STEP);
      sp.quad(dy(a, W, 0), dy(a, half, 0), dy(b, half, 0), dy(b, W, 0), CURB); sp.quad(dy(a, -half, 0), dy(a, -W, 0), dy(b, -W, 0), dy(b, -half, 0), CURB);
      sp.quad(dy(a, half, 0), dy(a, -half, 0), dy(b, -half, 0), dy(b, half, 0), ROAD);
      if (Math.floor(a / STEP) % 3 === 0) sp.quad(dy(a, 0.12, 0.03), dy(a, -0.12, 0.03), dy(b, -0.12, 0.03), dy(b, 0.12, 0.03), DASH);
      for (const sd of [1, -1]) sp.quad(dy(a, sd * (half - 0.7), 0.03), dy(a, sd * (half - 0.45), 0.03), dy(b, sd * (half - 0.45), 0.03), dy(b, sd * (half - 0.7), 0.03), LINE);
      for (const sd of [1, -1]) sp.quad(dy(a, sd * W, 0), dy(b, sd * W, 0), dy(b, sd * W, -TH), dy(a, sd * W, -TH), SIDE);
      sp.quad(dy(a, W, -TH), dy(a, -W, -TH), dy(b, -W, -TH), dy(b, W, -TH), UNDER);
      // Geländer: Holm oben, Holm unten, Neonröhre innen (schlicht: niedrige Brüstung)
      if (plain) for (const sd of [1, -1]) { const l0 = sd * (half + 0.05), l1 = sd * (half + 0.45); sp.quad(dy(a, l0, 0.45), dy(a, l1, 0.45), dy(b, l1, 0.45), dy(b, l0, 0.45), CURB); sp.quad(dy(a, l0, 0), dy(a, l0, 0.45), dy(b, l0, 0.45), dy(b, l0, 0), SIDE); }
      else for (const sd of [1, -1]) {
        const l0 = sd * (half + 0.14), l1 = sd * (half + 0.36);
        for (const [y0, y1, col] of [[0.95, 1.12, STEEL], [0.4, 0.52, STEEL]] as [number, number, number[]][]) {
          sp.quad(dy(a, l0, y1), dy(a, l1, y1), dy(b, l1, y1), dy(b, l0, y1), col); sp.quad(dy(a, l0, y0), dy(a, l0, y1), dy(b, l0, y1), dy(b, l0, y0), col); sp.quad(dy(a, l1, y0), dy(b, l1, y0), dy(b, l1, y1), dy(a, l1, y1), col);
        }
        sp.quad(dy(a, sd * (half + 0.12), 0.8), dy(b, sd * (half + 0.12), 0.8), dy(b, sd * (half + 0.12), 0.9), dy(a, sd * (half + 0.12), 0.9), NEON[sd > 0 ? 0 : 1]);
      }
    }
    // Pfosten, Lampen
    const post = (s: number, l: number, h: number, w: number, col: number[], base = 0) => {
      const y0 = br.deckY(s) + base, y1 = y0 + h, x = P(s, l, 0)[0], z = P(s, l, 0)[2], q = w / 2;
      const c = [[-q, -q], [q, -q], [q, q], [-q, q]];
      for (let k = 0; k < 4; k++) { const [ax, az] = c[k], [bx, bz] = c[(k + 1) % 4]; sp.quad([x + ax, y0, z + az], [x + bx, y0, z + bz], [x + bx, y1, z + bz], [x + ax, y1, z + az], col); }
      sp.quad([x - q, y1, z + q], [x + q, y1, z + q], [x + q, y1, z - q], [x - q, y1, z - q], col);
    };
    for (let s = br.s0 + 1; s < br.s1; s += 4) if (!plain) for (const sd of [1, -1]) post(s, sd * (half + 0.25), 1.12, 0.26, STEEL);
    for (let s = br.s0 + 8; s < br.s1 - 4; s += 16) if (!wood) for (const sd of [1, -1]) { post(s, sd * (half + 0.3), 6.2, 0.2, [0.28, 0.3, 0.38]); post(s, sd * (half - 0.2), 0.25, 1.1, [1, 0.88, 0.6], 6.1); }
    // Torbögen an beiden Enden: zwei Masten + Querbalken + Neonband
    br.gates().forEach((s, k) => {   // (Flussbrücke: leer)
      for (const sd of [1, -1]) post(s, sd * (half + 0.9), 6.6, 0.5, STEEL);
      const y = 6.2, l = half + 1.15;
      sp.quad(dy(s - 0.3, l, y + 0.6), dy(s - 0.3, -l, y + 0.6), dy(s + 0.3, -l, y + 0.6), dy(s + 0.3, l, y + 0.6), STEEL);
      sp.quad(dy(s - 0.3, l, y), dy(s - 0.3, -l, y), dy(s - 0.3, -l, y + 0.6), dy(s - 0.3, l, y + 0.6), STEEL); sp.quad(dy(s + 0.3, l, y), dy(s + 0.3, -l, y), dy(s + 0.3, -l, y + 0.6), dy(s + 0.3, l, y + 0.6), STEEL);
      sp.quad(dy(s - 0.3, l, y - 0.02), dy(s - 0.3, 0, y - 0.02), dy(s + 0.3, 0, y - 0.02), dy(s + 0.3, l, y - 0.02), NEON[k % 2]);
      sp.quad(dy(s - 0.3, 0, y - 0.02), dy(s - 0.3, -l, y - 0.02), dy(s + 0.3, -l, y - 0.02), dy(s + 0.3, 0, y - 0.02), NEON[(k + 1) % 2]);
    });
    // Stahlbogen-Fachwerk (Flussbrücke): Gurt oben, Hänger, Diagonalen, Querriegel
    if (br.def.arch) {
      const NA = br.def.arches ?? 1, LS = br.def.len / NA, H = NA > 1 ? 11 : 8.5, aH = (s: number) => H * Math.abs(Math.sin(Math.PI * (s - br.s0) / LS)), la = half + 0.9;
      const beam = (l: number, sa: number, ya: number, sb: number, yb: number, t: number) => { sp.quad(P(sa, l, br.deckY(sa) + ya - t), P(sa, l, br.deckY(sa) + ya + t), P(sb, l, br.deckY(sb) + yb + t), P(sb, l, br.deckY(sb) + yb - t), STEEL); };
      const SEG = LS / Math.max(1, Math.round(LS / 6)), N = Math.round(br.def.len / SEG);
      for (const sd of [1, -1]) {
        for (let i = 0; i < N; i++) {
          const a = br.s0 + i * SEG, b = a + SEG, ha = aH(a), hb = aH(b);
          beam(sd * la, a, ha + 1.1, b, hb + 1.1, 0.35);             // oberer Gurt
          if (i > 0) beam(sd * la, a, 1.1, a, ha + 1.1, 0.12);        // Hänger
          beam(sd * la, a, 1.1, b, hb + 1.1, 0.1);                    // Diagonale
        }
      }
      for (let i = 2; i < N - 1; i++) { const a = br.s0 + i * SEG, h = aH(a) + 1.1;   // Querriegel oben
        sp.quad(dy(a - 0.2, la, h), dy(a - 0.2, -la, h), dy(a + 0.2, -la, h), dy(a + 0.2, la, h), STEEL); }
    }
    // Liebesschlösser: bunte Pixel am Geländer (beide Seiten, innen sichtbar), Farben aus einer kleinen Palette
    if (br.def.locks) {
      const LC = [[1, 0.2, 0.3], [1, 0.8, 0.15], [0.25, 0.8, 1], [0.35, 1, 0.45], [1, 0.45, 0.85], [1, 0.6, 0.15], [0.7, 0.55, 1], [0.95, 0.95, 0.95]];
      let h = 12345; const rn = () => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return h / 4294967296; };
      for (const sd of [1, -1]) for (let s = br.s0 + 2.5; s < br.s1 - 2.5; s += 0.55) {
        if (rn() < 0.28) continue;
        const l = sd * (half + 0.1), y = 0.55 + rn() * 0.4, w = 0.16 + rn() * 0.08, c = LC[Math.floor(rn() * LC.length)];
        sp.quad(dy(s, l, y), dy(s + w, l, y), dy(s + w, l, y + w), dy(s, l, y + w), c);
        sp.quad(dy(s, l * 1.03, y), dy(s + w, l * 1.03, y), dy(s + w, l * 1.03, y + w), dy(s, l * 1.03, y + w), c);
      }
    }
    // Pfeiler im Wasser
    const piers = wood || plain ? [] : (br.def.arches ?? 1) > 1 ? Array.from({ length: br.def.arches! - 1 }, (_, i) => br.s0 + (i + 1) * br.def.len / br.def.arches!) : [br.def.s - br.def.canal / 4, br.def.s + br.def.canal / 4];
    for (const sc of piers) {
      const y0 = br.bed - 0.5, y1 = br.deckY(sc) - TH + 0.05, x0 = sc - 0.9, x1 = sc + 0.9, lw = half - 1;
      for (const [a, b, la, lb] of [[x0, x1, lw, lw], [x1, x1, lw, -lw], [x1, x0, -lw, -lw], [x0, x0, -lw, lw]] as number[][]) sp.quad(P(a, la, y0), P(b, lb, y0), P(b, lb, y1), P(a, la, y1), [0.18, 0.19, 0.26]);
    }
    const deck = new THREE.Mesh(sp.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    deck.frustumCulled = false; this.group.add(deck);
    // Wasser (Fluss: eigene Fläche in RiverMesh)
    if (br.river) return;
    const wid = br.def.canal + 18, len = br.reachL + br.reachR;
    this.tex.repeat.set(wid / 16, len / 16);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(wid, len).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial(wood ? { color: course.world === "snow" ? 0xa9d4ec : 0x6d7f5a } : { map: this.tex }));
    water.rotation.order = 'YXZ'; water.rotation.y = Math.atan2(-br.tz, br.tx);
    const [wx, wz] = route.offset(br.def.s, (br.reachL - br.reachR) / 2);
    water.position.set(wx + br.tx * 0, br.level, wz + br.tz * 0); water.frustumCulled = false;
    this.group.add(water);
  }
  update(t: number): void { this.tex.offset.y = (t * 0.015) % 1; }
}

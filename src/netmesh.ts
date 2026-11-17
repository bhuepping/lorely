// Straßennetz zeichnen: alle Kanten als glatte Bänder + Kreuzungsflächen (1 Mesh, 1 Draw Call), Markierungen als Decals
// (laufen im Decal-Mesh der Vorstadt mit). Kanten enden vor der Kreuzungsfläche, die Fläche füllt die Lücke (kein Z-Fighten verschiedener Beläge).
import * as THREE from 'three';
import type { Course } from './level';
import { SURFACE_BY_NAME } from './level';

const Y = 0.03;
const lin = (hex: number): number[] => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export function buildNetRoad(course: Course): THREE.Mesh {
  const net = course.net!, T = course.terrain, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const colorOf = (id: number) => new THREE.Color(course.surfaceColors[id] ?? 0x4b4e57);
  const asphalt = colorOf(SURFACE_BY_NAME.Asphalt.id);
  const deckOf = new Map<string, [number, number]>(); for (const b of course.bridges) { const e = net.edges.find((q) => q.route === b.route); if (e) deckOf.set(e.id, [b.s0 + 0.5, b.s1 - 0.5]); }
  for (const ed of net.edges) {
    const c0 = ed.a.cutOf(ed), c1 = ed.length - ed.b.cutOf(ed), W = 5, deck = deckOf.get(ed.id);
    const n = Math.max(1, Math.ceil((c1 - c0) / 2));
    let prev = false;
    for (let i = 0; i <= n; i++) {
      const s = c0 + (c1 - c0) * i / n;
      if (deck && s > deck[0] && s < deck[1]) { prev = false; continue; }
      const c = colorOf(SURFACE_BY_NAME[ed.surfAt(s)].id), base = pos.length / 3, h = ed.half;
      for (const l of [-h, -h / 2, 0, h / 2, h]) { const [x, z] = ed.route.offset(s, l); pos.push(x, T.height(x, z) + Y, z); col.push(c.r, c.g, c.b); }
      if (prev) for (let k = 0; k + 1 < W; k++) { const a = base - W + k; idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1); }
      prev = true;
    }
  }
  for (const nd of net.junctions) {   // Kreuzungsfläche: Fächer vom Mittelpunkt über den Umriss (Arm-Schnitte + Ausrundungen), Asphalt, bündig an die Bänder
    const base = pos.length / 3, N = nd.poly.length;
    pos.push(nd.x, T.height(nd.x, nd.z) + Y, nd.z); col.push(asphalt.r, asphalt.g, asphalt.b);
    for (const [x, z] of nd.poly) { pos.push(x, T.height(x, z) + Y, z); col.push(asphalt.r, asphalt.g, asphalt.b); }
    for (let k = 0; k < N; k++) idx.push(base, base + 1 + (k + 1) % N, base + 1 + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.frustumCulled = false; return m;
}

/** Fahrbahnmarkierungen aller Asphalt-Kanten als flache Quads (Mittellinie, Randlinien, vierspurig: Doppellinie + Spurtrenner) */
export function netMarks(course: Course, quad: (a: number[], b: number[], c: number[], d: number[], col: number[]) => void): void {
  const net = course.net!, T = course.terrain, WHITE = lin(0xe8e6dc), YEL = lin(0xe0c060);
  const decks = course.bridges.map((b) => [b.route, b.s0 - 1, b.s1 + 1] as const);
  for (const ed of net.edges) {
    if (ed.def.surf !== 'Asphalt') continue;
    const c0 = ed.a.cutOf(ed) + 1, c1 = ed.length - ed.b.cutOf(ed) - 1, h = ed.half, kind = ed.def.kind;
    const P = (s: number, l: number): number[] => { const [x, z] = ed.route.offset(s, l); return [x, T.height(x, z) + 0.075, z]; };
    const strip = (s0: number, s1: number, l0: number, l1: number, c: number[]) => quad(P(s0, l1), P(s0, l0), P(s1, l0), P(s1, l1), c);
    for (let s = c0; s < c1 - 3; s += 3) {
      if (decks.some(([r, a, b]) => r === ed.route && s > a && s < b)) continue;
      const wide = kind === 'damm' || kind === 'obere';
      if (kind === 'damm') { strip(s, s + 3, -0.32, -0.12, YEL); strip(s, s + 3, 0.12, 0.32, YEL); if (Math.floor(s / 3) % 2 === 0) { strip(s, s + 3, h / 2 - 0.08, h / 2 + 0.08, WHITE); strip(s, s + 3, -h / 2 - 0.08, -h / 2 + 0.08, WHITE); } }
      else if (Math.floor(s / 3) % 2 === 0) strip(s, s + 3, -0.1, 0.1, wide ? YEL : WHITE);
      if (kind !== 'fuss' && h >= 4.5) { strip(s, s + 3, h - 0.55, h - 0.35, WHITE); strip(s, s + 3, -h + 0.35, -h + 0.55, WHITE); }
    }
  }
}

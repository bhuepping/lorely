// Offroad-Level „Hügel“: langer Weg über die Hügel. Auftakt im Tal mit Kuppen und Querrinnen, Anstieg im Lehm, Kammfahrt (Buckelgruppen, links und rechts fällt das Gelände ab),
// Hohlweg (Böschungen, Fels- und Baumreihen oben), Abfahrt in ein Tal mit Wasserdurchfahrt, Gegenanstieg im Lehm, Berg direkt vor dem Ziel (die Fahne steht dahinter).
// Gelände: Sollhöhe längs des Wegs (Straßenbau `carveAt`, Höhe je Wegpunkt) + Kuppen, Berge, Rinnen, Buckel; der Bach liegt quer im Tal (Furtwald-Technik).
import { Route, rng, fbm, type Course, type NearHit } from '../level';
import { GRASS, GRAVEL, MUD, FORD, type Surface } from '../physics/terrain';
import { FORD_DRAG } from '../features';
import { assemble, scatter, rocksAt, hardLine, pathWalls, carveAt, sm, MUD_DRAG, type Pt, type Carve } from './offroad';

/** Wegpunkte (x, z, Sollhöhe y): Auftakt im Tal, Anstieg, Kamm, Wende, Hohlweg, Abfahrt, Tal mit Bach, Gegenanstieg, Schlussstück mit Berg */
const MAIN3: [number, number, number][] = [
  [-100, 168, 0], [-60, 172, 0], [-20, 166, 0], [20, 172, 0], [60, 166, 0],                          // 0..4 Auftakt
  [100, 158, 0.5], [132, 138, 3], [148, 108, 6], [142, 80, 8.5],                                      // 5..8 Anstieg
  [112, 58, 9.5], [72, 50, 9.5], [32, 58, 9], [-8, 48, 9.5],                                          // 9..12 Kamm
  [-46, 50, 9], [-84, 34, 8], [-104, 0, 7], [-98, -34, 6.5],                                          // 13..16 Wende
  [-70, -58, 6.5], [-36, -62, 6.5], [-4, -56, 6.5],                                                   // 17..19 Hohlweg
  [24, -66, 3.5], [48, -64, -0.5], [66, -62, -2.2], [85, -66, -2.5], [106, -70, -2.2],                // 20..24 Abfahrt, Tal, Furt (22..24)
  [128, -82, 0.5], [146, -104, 3.5],                                                                  // 25..26 Gegenanstieg
  [150, -128, 3.5], [126, -152, 1.5], [92, -162, 0.5], [58, -160, 1], [30, -166, 0.5],               // 27..31 Schlussstück
];
const MAIN: Pt[] = MAIN3.map(([x, z]) => [x, z]);
const FORD_X = 85;
const BROOK: Pt[] = [[88, -128], [84, -104], [86, -80], [FORD_X, -66], [88, -44], [84, -20], [86, 4]];
const bump = (v: number) => (Math.abs(v) < 1 ? 0.5 * (1 + Math.cos(Math.PI * v)) : 0);

export function makeHuegel(): Course {
  const seed = 52, n = 201, cell = 2, half = (n - 1) * cell / 2, rand = rng(seed);
  const route = new Route(MAIN), L = route.length, sOf = (i: number) => route.nearest(MAIN[i][0], MAIN[i][1]).s;
  // Sollhöhe längs des Wegs: Linie durch die Wegpunkte, mit Gauß σ 9 m geglättet
  const prof = (() => {
    const N = Math.ceil(L) + 1, raw = new Float64Array(N), sk = MAIN3.map((_, i) => sOf(i));
    for (let i = 0; i < N; i++) { let k = 0; while (k < sk.length - 2 && sk[k + 1] < i) k++; const f = Math.min(1, Math.max(0, (i - sk[k]) / Math.max(1e-6, sk[k + 1] - sk[k]))); raw[i] = MAIN3[k][2] + (MAIN3[k + 1][2] - MAIN3[k][2]) * f; }
    const out = new Float64Array(N), K = 24; for (let i = 0; i < N; i++) { let a = 0, b = 0; for (let j = -K; j <= K; j++) { const q = Math.min(N - 1, Math.max(0, i + j)), w = Math.exp(-((j / 9) ** 2 / 2)); a += w * raw[q]; b += w; } out[i] = a / b; }
    return (s: number) => { const f = Math.min(N - 2, Math.max(0, s)), i = Math.floor(f); return out[i] + (out[i + 1] - out[i]) * (f - i); };
  })();
  const sK0 = sOf(9), sH0 = sOf(17), sH1 = sOf(19), sFord = sOf(23), sG0 = sOf(25), sG1 = sOf(26);
  // Kuppen (Rücken quer über den ganzen Korridor), Berge direkt auf dem Weg, Querrinnen, Buckelgruppen auf dem Kamm
  const crestS = [50, 95, 140, sOf(6) - 10, sOf(29) + 30, sOf(28) + 10, sK0 + 115];
  const bergs: [number, number, number][] = [[sOf(4) + 30, 13, 3.8], [L - 52, 16, 3.8]];   // s, Radius, Höhe
  const ditchS = [30, 72, 118, sOf(25) + 30, sOf(27) + 45, sOf(29) - 10];
  const kammS = [sK0 + 25, sK0 + 70];
  const feat = (h: NearHit | null) => {
    if (!h) return 0;
    const a = Math.abs(h.lat), s = h.s, f = 1 - sm(7, 12, a);
    let y = 0;
    for (const c of crestS) y += 2.0 * Math.exp(-(((s - c) / 5.6) ** 2)) * f;
    for (const [sb, r, hh] of bergs) y += hh * Math.exp(-(((s - sb) / r) ** 2)) * Math.exp(-((a / 9) ** 2));
    for (const c of kammS) for (const d of [-13, 0, 13]) y += 0.7 * bump((s - c - d) / 5.5) * (1 - sm(9, 14, a));
    y += 0.14 * Math.sin(s / 2.6) * (1 - sm(8, 13, a));                                       // Wellblech
    for (const d of ditchS) { const u = (s - d) / 2.4; if (Math.abs(u) < 1) y -= (0.12 + (h.lat > 0 ? 1.15 : 0.7) * sm(2, 14, a)) * (1 - sm(26, 36, a)) * 0.5 * (1 + Math.cos(Math.PI * u)); }   // links tief, am Weg flach
    y += 3.2 * sm(sH0 - 6, sH0 + 6, s) * (1 - sm(sH1 - 6, sH1 + 6, s)) * sm(3.2, 6.5, a) * (1 - sm(13, 21, a));   // Hohlweg: Böschungen
    return y;
  };
  const carves: Carve[] = [{ route, y: prof, half: 6, bank: 20 }];
  const HILLS: [number, number, number, number][] = [[-70, 110, 14, 8], [20, 110, 12, 7], [-30, -10, 14, 8], [70, 20, 12, 6], [60, -120, 14, 8], [-60, -125, 12, 7], [-165, 90, 12, 6], [170, 20, 13, 7], [-100, -150, 12, 5], [10, -118, 10, 5]];
  const base = (x: number, z: number) => { let y = 0.5 * fbm(x / 40 + 9, z / 40 + 2, seed); for (const [hx, hz, r, hh] of HILLS) { const dx = (x - hx) / r, dz = (z - hz) / r; if (dx > 3 || dx < -3 || dz > 3 || dz < -3) continue; y += hh * Math.exp(-(dx * dx + dz * dz)); } return y; };
  const brookRoute = new Route(BROOK), W0 = 3.2, SOFT = 5, depth = 0.7;
  const h0 = (x: number, z: number) => { const hm = route.nearestWithin(x, z, 24); return carveAt(base(x, z), x, z, carves, () => hm) + feat(hm) + 0.25 * fbm(x / 7 + 21, z / 7 + 5, seed + 1); };
  const ycs = (() => { const a = new Float64Array(Math.ceil(brookRoute.length) + 2); for (let i = 0; i < a.length; i++) { const p = brookRoute.at(i); a[i] = h0(p.x, p.z); } const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, w = 0; for (let j = -10; j <= 10; j++) { const q = Math.min(a.length - 1, Math.max(0, i + j)), k = Math.exp(-((j / 5) ** 2 / 2)); s += k * a[q]; w += k; } o[i] = s / w; } return o; })();
  const yc = (s: number) => ycs[Math.min(ycs.length - 1, Math.max(0, Math.round(s)))];
  const brookHit = (x: number, z: number) => { if (x < 40 || x > 130 || z < -140 || z > 20) return null; return brookRoute.nearestWithin(x, z, 26); };
  const height = (x: number, z: number) => {
    const y = h0(x, z), h = brookHit(x, z);
    if (!h || h.d > W0 + SOFT + 12) return y;
    const c = yc(h.s), flat = c + (y - c) * sm(W0 + SOFT, W0 + SOFT + 12, h.d);
    if (h.d >= W0 + SOFT) return flat;
    const t = sm(W0, W0 + SOFT, h.d), bed = c - depth * (1 - 0.35 * sm(0.5 * W0, W0, h.d));
    return bed * (1 - t) + c * t;
  };
  // Lehm: Anstieg am Ende der Auftakt-Kuppen, auf dem Kamm-Anstieg, im Gegenanstieg und an der Auffahrt der Berge
  const clay: [number, number][] = [[bergs[0][0] - 16, bergs[0][0] - 2], [sOf(7) - 14, sOf(7) + 6], [sG0 + 6, sG0 + 22], [sG1 + 4, sG1 + 20], [bergs[1][0] - 18, bergs[1][0] - 6]];
  const inClay = (x: number, z: number) => { const h = route.nearestWithin(x, z, 8); if (!h || Math.abs(h.lat) > 6.5) return 0; let m = 0; for (const [a, b] of clay) m = Math.max(m, sm(a - 2, a + 2, h.s) * (1 - sm(b - 1, b + 2, h.s))); return m; };
  const surf = (x: number, z: number, d: number): Surface => {
    const h = brookHit(x, z);
    if (h && h.d < W0 + 0.5) return FORD;
    if (inClay(x, z) > 0.3) return MUD;
    return d < 2.5 ? GRAVEL : GRASS;
  };
  const shallow = (x: number, z: number) => { const h = brookHit(x, z); return Math.max(h && h.d < W0 + 0.5 ? FORD_DRAG : 0, MUD_DRAG * inClay(x, z)); };
  const rd = (x: number, z: number) => route.nearestWithin(x, z, 20)?.d ?? 99;
  const bd = (x: number, z: number) => brookRoute.nearestWithin(x, z, 14)?.d ?? 99;
  const trees = scatter(rand, 70, half - 8, 13, (x, z) => rd(x, z) > 18 && bd(x, z) > 9 && Math.hypot(x + 100, z - 168) > 18 && Math.hypot(x - 30, z + 166) > 18);
  const rockPts = scatter(rand, 30, half - 10, 10, (x, z) => rd(x, z) > 16 && bd(x, z) > 9);
  const wall = pathWalls([route], rng(seed * 7 + 3), { w: 12, rockP: 0.5, caps: 12, rockAt: (x, z) => bd(x, z) < W0 + 6 });
  // Jeep-Sterne: auf Kuppen, Bergen, Kamm-Buckeln, Lehm und in der Furt
  const pts: [number, number][] = [[crestS[0], 0], [crestS[2], 0], [bergs[0][0], 0], [sOf(7), 0], [kammS[0], 0], [crestS[6], 0], [sFord, 0], [clay[2][0] + 8, 0], [clay[3][0] + 8, 0], [crestS[4], 0], [bergs[1][0], 0], [crestS[5], 0]];
  const { stars, line } = hardLine(route, pts);
  return assemble({ id: 'huegel', ver: 2, name: 'Hügel', seed, n, cell, height, surf, route, nStars: stars.length, stars, jeepLine: line, trees, rocks: rocksAt(rand, rockPts), wall, shallow,
    brook: { route: brookRoute, w: W0, soft: () => SOFT, yc }, post: 0, sky: 0x93c1e8, fog: { color: 0xb9d4ea, near: 70, far: 250 } });
}

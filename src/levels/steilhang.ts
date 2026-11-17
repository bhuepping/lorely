// Offroad-Level 4 „Steilhang“: langer Berghang für Fortgeschrittene, Karte ≈ 500 × 500 m. Linksherum den Berg hinauf:
// Tal → Direktanstieg in der Falllinie (Lehm) | Serpentinen → obere Hangquerung (Querneigung ≈ 23°) | untere (≈ 11°) → 4 Serpentinen mit Lehm in den Kehren →
// steiler Felsanstieg | weiter Bogen → Gipfelplateau mit dem Ziel. Der gute Weg (`route`) ist immer die kurze, riskante Linie (Jeep-Sterne); die Äste (`branches`) sind die
// langen, sicheren. Gelände: Grundprofil `P(z)` + Straßenbau (`carveAt`: Sollhöhe + Querneigung) + Zusätze (Wellen, Rinnen, Stufen, Rücken) längs des Wegs.
import { Route, rng, fbm, type Course, type NearHit } from '../level';
import { GRASS, GRAVEL, MUD, type Surface } from '../physics/terrain';
import { assemble, scatter, rocksAt, hardLine, pathWalls, zigzag, carveAt, profileAlong, sm, type Pt, type Carve } from './offroad';

/** Grundprofil: Höhe über z (Berg steigt nach −z); Schlüsselpunkte, geglättet */
const KEYS: [number, number][] = [[260, 2], [215, 0], [190, 0], [90, 38], [62, 43], [-100, 104], [-140, 108], [-260, 110]];
const PROF = (() => {
  const z0 = -262, n = 524, raw = new Float64Array(n);
  for (let i = 0; i < n; i++) { const z = z0 + i; let k = 0; while (k < KEYS.length - 2 && KEYS[k + 1][0] > z) k++; const [za, ha] = KEYS[k], [zb, hb] = KEYS[k + 1]; raw[i] = ha + (hb - ha) * Math.min(1, Math.max(0, (z - za) / (zb - za))); }
  const out = new Float64Array(n), K = 14; for (let i = 0; i < n; i++) { let a = 0, b = 0; for (let j = -K; j <= K; j++) { const q = Math.min(n - 1, Math.max(0, i + j)), w = Math.exp(-((j / 6) ** 2 / 2)); a += w * raw[q]; b += w; } out[i] = a / b; }
  return (z: number) => { const f = Math.min(n - 2, Math.max(0, z - z0)), i = Math.floor(f); return out[i] + (out[i + 1] - out[i]) * (f - i); };
})();
const KNOBS: [number, number, number, number][] = [[215, 120, 28, 14], [210, -50, 34, 24], [110, -130, 36, 20], [-190, -10, 30, 12], [-195, 150, 26, 8], [75, -40, 30, 12]];   // Hügel abseits aller Wege

// Wegpunkte des guten Wegs (x, z); z nach unten, der Berg liegt bei −z; DX schiebt alles in die Kartenmitte
const DX = 90, sh = (a: Pt[]): Pt[] => a.map(([x, z]) => [x + DX, z]);
const VALLEY: Pt[] = sh([[-215, 226], [-186, 210], [-152, 226], [-118, 208], [-84, 226], [-56, 208], [-32, 198]]);
const DIRECT: Pt[] = sh([[-28, 172], [-25, 140], [-27, 112], [-30, 90]]);
const T1UP: Pt[] = sh([[-62, 76], [-95, 64], [-120, 46]]);
const SERP = zigzag(-160 + DX, -120 + DX, 46, -24, 5, false);   // 5 Schenkel, 4 Kehren, erster Schenkel nach Westen
const F3DIR: Pt[] = sh([[-172, -60], [-176, -88], [-173, -112]]);
const PLATEAU: Pt[] = sh([[-166, -130], [-146, -152], [-116, -150], [-94, -172], [-104, -198], [-78, -214], [-48, -200]]);
const MAIN: Pt[] = [...VALLEY, ...DIRECT, ...T1UP, ...SERP.pts.slice(1), ...F3DIR, ...PLATEAU];
// Äste
const B1 = zigzag(10 + DX, 55 + DX, 198, -21.6, 6, true);   // Serpentinen neben dem Direktanstieg: 6 Schenkel, 5 Kehren
const B1PTS: Pt[] = [VALLEY[VALLEY.length - 1], ...B1.pts, ...sh([[-10, 90]]), DIRECT[DIRECT.length - 1]];
const B2PTS: Pt[] = [T1UP[0], ...sh([[-70, 104], [-95, 128], [-130, 136], [-165, 120], [-182, 94], [-178, 68]]), SERP.apex[0]];   // untere Hangquerung
const B3PTS: Pt[] = [SERP.pts[SERP.pts.length - 1], ...sh([[-188, -46], [-206, -56], [-214, -74], [-202, -88], [-213, -102], [-213, -118], [-198, -130], [-184, -134]]), PLATEAU[0]];   // Bogen um den Felsanstieg

export function makeSteilhang(): Course {
  const seed = 71, n = 251, cell = 2, rand = rng(seed), half = (n - 1) * cell / 2;
  const route = new Route(MAIN), L = route.length;
  const sOf = (p: Pt) => route.nearest(p[0], p[1]).s;
  const sF1 = sOf(VALLEY[VALLEY.length - 1]), sM1 = sOf(DIRECT[DIRECT.length - 1]), sF2 = sOf(T1UP[0]), sM2 = sOf(T1UP[T1UP.length - 1]), sB2 = sOf(SERP.apex[0]), sP3 = sOf(SERP.pts[SERP.pts.length - 1]), sM3 = sOf(PLATEAU[0]);
  const brs = [{ pts: B1PTS, a: sF1, b: sM1 }, { pts: B2PTS, a: sF2, b: sB2 }, { pts: B3PTS, a: sP3, b: sM3 }];
  const bRoutes = brs.map((b) => new Route(b.pts));
  const base = (x: number, z: number) => {
    let y = PROF(z) + 1.2 * fbm(x / 55 + 3, z / 55 + 7, seed);
    for (const [kx, kz, r, h] of KNOBS) y += h * Math.exp(-(((x - kx) / r) ** 2 + ((z - kz) / r) ** 2));
    return y;
  };
  // Straßenbau
  const win = (s0: number, s1: number, f = 8) => (s: number) => sm(s0 - f, s0 + f, s) * (1 - sm(s1 - f, s1 + f, s));
  const pSerp = profileAlong(route, base, 12), pT1 = profileAlong(route, base, 14), wSerp = win(sM2 - 6, sP3 + 4), wT1 = win(sM1, sM2 - 6, 6);
  const carves: Carve[] = [
    { route: bRoutes[0], y: profileAlong(bRoutes[0], base, 12), on: (s) => sm(0, 18, s) * sm(0, 18, bRoutes[0].length - s), half: 3.2, bank: 7 },
    // guter Weg: Serpentinen (σ 22) und obere Hangquerung (σ 14, Querneigung 0,42 ≈ 23°) in einer Linie
    { route, y: (s) => { const t = wT1(s); return pT1(s) * t + pSerp(s) * (1 - t); }, on: (s) => Math.max(wSerp(s), wT1(s)), tilt: (s) => 0.42 * wT1(s), half: 3.2, bank: 7 },
    { route: bRoutes[1], y: profileAlong(bRoutes[1], base, 14), on: (s) => sm(0, 14, s) * sm(0, 14, bRoutes[1].length - s), tilt: (s) => 0.2 * (1 - sm(bRoutes[1].length - 60, bRoutes[1].length - 25, s)), half: 3.2, bank: 7 },
    { route: bRoutes[2], y: profileAlong(bRoutes[2], base, 20), on: (s) => sm(0, 14, s) * sm(0, 14, bRoutes[2].length - s), half: 3.2, bank: 7 },
  ];
  // Zusätze längs des guten Wegs: Wellen im Tal, Querrinnen, Felsstufen (Absatz + Auslauf), Rücken quer über den Korridor
  const ditchS = [sF1 * 0.3, sF1 * 0.55, sF1 * 0.8], ledgeS = [sF1 + 28, sF1 + 56, sF1 + 84, sP3 + 14, sP3 + 30, sP3 + 46];
  const crestS = [sF1 * 0.42, sF1 * 0.68, sF1 * 0.92, sM3 + 40];
  const feat = (h: NearHit | null) => {
    if (!h) return 0;
    const f = 1 - sm(8, 13, Math.abs(h.lat)), s = h.s;
    let y = 0;
    if (s < sF1) y += 0.2 * Math.sin(s / 3.3) * sm(10, 25, s);
    for (const d of ditchS) { const u = (s - d) / 2.5; if (Math.abs(u) < 1) y -= 0.5 * 0.5 * (1 + Math.cos(Math.PI * u)); }
    for (const g of ledgeS) y += 0.6 * sm(g - 1.5, g + 1.5, s) * (1 - sm(g + 3, g + 12, s));
    for (const c of crestS) y += 1.2 * Math.exp(-(((s - c) / 4.5) ** 2));
    return y * f;
  };
  const height = (x: number, z: number) => {
    const hm = route.nearestWithin(x, z, 14);   // eine Abfrage für Straßenbau und Zusätze des guten Wegs
    return carveAt(base(x, z), x, z, carves, (r, R) => (r === route ? hm : r.nearestWithin(x, z, R))) + feat(hm);
  };
  // Lehm: Anstiege des Direktwegs und die Kehren
  const mud: { r: Route; s0: number; s1: number }[] = [];
  const apexMain = SERP.apex.map(sOf);
  mud.push({ r: route, s0: sF1 + 38, s1: sF1 + 62 }, { r: route, s0: sF1 + 78, s1: sF1 + 100 }, { r: route, s0: sP3 + 22, s1: sP3 + 38 });
  for (const a of apexMain) mud.push({ r: route, s0: a - 11, s1: a + 11 });
  B1.apex.forEach((p) => { const s = bRoutes[0].nearest(p[0], p[1]).s; mud.push({ r: bRoutes[0], s0: s - 10, s1: s + 10 }); });
  const surf = (x: number, z: number, d: number): Surface => {
    if (d < 8) for (const r of [route, bRoutes[0]]) {
      const h = r.nearestWithin(x, z, 6); if (!h || h.d > 5.5) continue;
      for (const m of mud) if (m.r === r && h.s > m.s0 && h.s < m.s1) return MUD;
    }
    return d < 2.5 ? GRAVEL : GRASS;
  };
  const all = [route, ...bRoutes], dAll = (x: number, z: number) => { let d = 99; for (const r of all) d = Math.min(d, r.nearestWithin(x, z, 16)?.d ?? 99); return d; };
  const trees = scatter(rand, 70, half - 8, 13, (x, z) => dAll(x, z) > 15);
  const rockPts = scatter(rand, 36, half - 10, 10, (x, z) => dAll(x, z) > 14);
  const wr = rng(seed * 7 + 3);
  const wall = pathWalls(all, wr, { w: 8, rockP: 0.45, caps: 12 });
  // Jeep-Sterne auf den schweren Stellen des guten Wegs
  const pts: [number, number][] = [[crestS[0], 0], [crestS[2], 0], [sF1 + 50, 0], [sF1 + 70, 0], [sF1 + 89, 0], [sM1 + 40, 0], [sM1 + 70, 0], [apexMain[0], 0], [apexMain[1], 0], [apexMain[2], 0], [apexMain[3], 0], [sP3 + 15, 0], [sP3 + 30, 0], [sM3 + 40, 0]];
  const { stars, line } = hardLine(route, pts);
  return assemble({ id: 'steilhang', name: 'Steilhang', seed, n, cell, height, surf, route, nStars: pts.length, stars, jeepLine: line, branches: brs, trees, rocks: rocksAt(rand, rockPts), wall, post: 0, sky: 0x8fbfe6, fog: { color: 0xb4d0e6, near: 90, far: 320 } });
}

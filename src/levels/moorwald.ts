// Offroad-Level 5 „Moorwald“: langer, dunkler Sumpfwald, Karte ≈ 500 × 500 m. Süd-West → Ost (Reihe A, z ≈ 205), nach Norden über die Furt 1 (x ≈ 170), Reihe B nach Westen (z ≈ 40),
// Furt 2 (x ≈ −34), dann Waldhügel nach Nordwesten zum Ziel. Der gute Weg (`route`) ist immer die kurze, riskante Linie (Jeep-Sterne); die Äste (`branches`) sind lange, sichere:
// Gabel 1 Matschbecken mit Anstieg im Matsch | Waldumweg mit Stämmen und Wurzeln; Gabel 2 Hangquerung an Waldkuppen (Schräglage) | Umweg durch den Wald; Gabel 3 tiefe Furt | flache Furt weiter oben.
// Gelände: flach-wellig-sumpfig, nach Norden steigend, Wurzelwellen längs der Wege, Waldkuppen an den Flanken, dazu ein Bach (Furtwald-Technik).
import { Route, rng, fbm, type Course, type NearHit } from '../level';
import { GRASS, GRAVEL, MUD, FORD, type Surface } from '../physics/terrain';
import { FORD_DRAG } from '../features';
import { assemble, scatter, rocksAt, hardLine, pathWalls, sm, MUD_DRAG, type Pt } from './offroad';

const MAIN: Pt[] = [
  [-190, 205], [-165, 209], [-140, 205], [-118, 206], [-100, 204],            // 0..4: Wurzelwald, Gabel 1 bei Index 4
  [-78, 209], [-55, 200], [-32, 207], [-10, 201], [10, 206],                   // 5..9: Matschbecken, Mündung 1 bei 9
  [32, 197], [56, 205], [82, 198], [108, 206], [134, 198], [156, 188],         // Wurzelbuckel
  [170, 168], [166, 145], [174, 122], [170, 98], [176, 75], [168, 52],         // Furt 1 (z ≈ 120)
  [150, 42], [128, 48], [106, 38],                                             // Gabel 2 am letzten Punkt
  [84, 44], [62, 36], [40, 45], [18, 38],                                      // Hangquerung, Mündung 2 am letzten Punkt
  [6, 44], [-6, 41],                                                           // Gabel 3
  [-20, 46], [-34, 40], [-50, 45], [-68, 40],                                  // Furt 2 (x ≈ −34), Mündung 3
  [-94, 45], [-124, 42], [-152, 32], [-172, 12], [-176, -14], [-168, -42], [-160, -66], [-168, -92], [-176, -110],
];
const wiggle = (pts: Pt[], amp: number, wl: number): Pt[] => { const r = new Route(pts), o: Pt[] = []; for (let d = 0; d < r.length - 3; d += 4) o.push(d < 1 ? pts[0] : r.offset(d, amp * Math.sin(2 * Math.PI * d / wl) * sm(0, 25, d) * sm(0, 25, r.length - d))); o.push(pts[pts.length - 1]); return o; };
const B1: Pt[] = wiggle([[-100, 204], [-92, 186], [-88, 152], [-72, 120], [-46, 100], [-14, 104], [4, 128], [12, 158], [22, 184], [32, 197]], 8, 56);
const B2: Pt[] = wiggle([[106, 38], [94, 16], [78, -14], [56, -46], [26, -60], [0, -40], [2, -8], [10, 20], [18, 38]], 0, 50);
const B3: Pt[] = [[-6, 41], [-22, 32], [-30, 12], [-40, -10], [-62, -24], [-84, -10], [-92, 14], [-96, 34], [-94, 45]];
// Bach: vom Nordwesten (hoch) nach Osten (tief), kreuzt den guten Weg bei Furt 2 (−34, 40) und Furt 1 (170, 118)
const BROOK: Pt[] = [[-110, -250], [-100, -200], [-85, -140], [-80, -90], [-60, -40], [-45, 10], [-33, 40], [-38, 70], [-25, 100], [10, 110], [50, 122], [90, 112], [130, 126], [170, 118], [210, 122], [250, 128]];
const FORD1X = 170, FORD2X = -34, FORD3X = -56;
const g1 = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));
const KNOBS: [number, number, number, number][] = [[230, -130, 45, 12], [-30, -175, 40, 16], [200, -20, 30, 9], [-200, 120, 30, 6], [-215, -190, 35, 13], [60, -120, 35, 10], [120, 130, 22, 4]];   // Waldhügel abseits aller Wege

export function makeMoorwald(): Course {
  const seed = 83, n = 251, cell = 2, rand = rng(seed), half = (n - 1) * cell / 2;
  const route = new Route(MAIN), L = route.length;
  const sIdx = (i: number) => route.nearest(MAIN[i][0], MAIN[i][1]).s;
  const sG1 = sIdx(4), sM1 = sIdx(10), sG2 = sIdx(24), sM2 = sIdx(28), sG3 = sIdx(30), sM3 = sIdx(35);
  const brs = [{ pts: B1, a: sG1, b: sM1 }, { pts: B2, a: sG2, b: sM2 }, { pts: B3, a: sG3, b: sM3 }];
  const bRoutes = brs.map((b) => new Route(b.pts));
  const brookRoute = new Route(BROOK);
  const soft = (x: number) => 1.4 + 6.6 * g1(x, FORD1X, 14) + 2.6 * g1(x, FORD2X, 5) + 8.6 * g1(x, FORD3X, 7);
  const W0 = 3.2, depthAt = (x: number) => 0.7 + 0.45 * g1(x, FORD2X, 5) - 0.2 * g1(x, FORD3X, 7);
  // Waldkuppen an der Flanke des guten Wegs (Hangquerung = Schräglage), vor allem an Gabel 2 und auf dem Weg zum Ziel
  const knollS: [number, number, number, number][] = [[sG2 + 10, 4.5, 9, 3.4], [sG2 + 36, -4.5, 9, 3.6], [sG2 + 62, 4.5, 9, 3.4], [sM3 + 110, 4.5, 9, 2.6], [sM3 + 150, -4.5, 9, 2.6], [sM3 + 185, 4.5, 9, 2.6], [sM1 + 60, 4.5, 9, 3.2], [sM1 + 100, -4.5, 9, 3.2]];
  const bergS: [number, number, number][] = [[280, 14, 3.6], [345, 13, 3.0], [430, 13, 3.4], [60, 12, 3.0], [135, 12, 3.2]];   // Waldhügel auf dem Weg selbst (Höhenmeter)
  const bergs = bergS.map(([sb, r, h]): [number, number, number, number] => { const a = route.at(sb); return [a.x, a.z, r, h]; });
  const knolls = [...bergs, ...knollS.map(([s, lat, r, h]): [number, number, number, number] => { const [x, z] = route.offset(s, lat); return [x, z, r, h]; })];
  const allKnolls: [number, number, number, number][] = [...KNOBS.map(([kx, kz, r, h]): [number, number, number, number] => [kx, kz, r, h]), ...knolls];
  const trend = (z: number) => 21 * sm(40, -150, z) + 1.5 * sm(200, 150, z);
  const base = (x: number, z: number) => {
    let y = trend(z) + 1.3 * fbm(x / 45 + 3, z / 45 + 7, seed);
    for (const k of allKnolls) { const dx = (x - k[0]) / k[2], dz = (z - k[1]) / k[2]; if (dx > 3 || dx < -3 || dz > 3 || dz < -3) continue; y += k[3] * Math.exp(-(dx * dx + dz * dz)); }
    return y;
  };
  // Bachbett (Furtwald-Technik): Wasserhöhe folgt dem geglätteten Gelände, Ufer eben, Rinne
  const ycs = (() => { const L2 = brookRoute.length, a = new Float64Array(Math.ceil(L2) + 2); for (let i = 0; i < a.length; i++) { const p = brookRoute.at(i); a[i] = base(p.x, p.z); } const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, w = 0; for (let j = -12; j <= 12; j++) { const q = Math.min(a.length - 1, Math.max(0, i + j)), k = Math.exp(-((j / 6) ** 2 / 2)); s += k * a[q]; w += k; } o[i] = s / w; } return o; })();
  const yc = (s: number) => ycs[Math.min(ycs.length - 1, Math.max(0, Math.round(s)))];
  const BC = 8, BN = Math.ceil(2 * half / BC) + 1, nearBrook = Uint8Array.from({ length: BN * BN }, (_, k) => (brookRoute.nearestWithin(-half + (k % BN) * BC, -half + Math.floor(k / BN) * BC, 26 + BC) ? 1 : 0));   // grobes Raster: Abfragen weit vom Bach sparen
  let lx = NaN, lz = NaN, lh: (NearHit & { soft: number }) | null = null;
  const brookHit = (x: number, z: number) => {
    if (x === lx && z === lz) return lh;
    lx = x; lz = z; lh = null;
    const ix = Math.round((x + half) / BC), iz = Math.round((z + half) / BC);
    if (ix < 0 || iz < 0 || ix >= BN || iz >= BN || !nearBrook[iz * BN + ix]) return null;
    const h = brookRoute.nearestWithin(x, z, 26); lh = h ? { ...h, soft: soft(x) } : null; return lh;
  };
  // Wurzelwellen (kurze Wellen 0,3–0,5 m, in Gruppen) und Matschbecken mit Anstieg im Matsch längs der Wege
  const HUMPS: [number, number][] = [[sG1 + 40, 8], [sG1 + 88, 8]];   // Buckel im Matsch (Mitte, Halblänge) – das Becken liegt davor
  const BASINS: [number, number][] = [[sG1 + 26, 13], [sG1 + 72, 13]];
  const MUDS: [number, number][] = [[sG1 + 18, sG1 + 44], [sG1 + 62, sG1 + 90]];
  // das Schwerste kommt zuerst – auch Ast 1 (Waldumweg) hat gleich die zwei Matschanstiege; danach nichts mehr, woran schwächere Autos scheitern
  const BHUMPS: [number, number][] = [[70, 7], [118, 7]], BBASINS: [number, number][] = [[56, 13], [102, 13]], BMUDS: [number, number][] = [[48, 74], [92, 120]];
  const bump = (v: number) => (Math.abs(v) < 1 ? 0.5 * (1 + Math.cos(Math.PI * v)) : 0);
  const rootGroups = (s: number, a: number, b: number, amp = 0.24) => amp * Math.sin(s / 0.72) * sm(a - 6, a + 4, s) * (1 - sm(b - 4, b + 6, s)) * sm(0.2, 0.55, 0.5 + 0.5 * Math.sin(s / 11));
  const mainRoots: [number, number][] = [[14, sG1 - 6], [sM1 + 6, sM1 + 70], [sM1 + 140, sG2 - 20], [sM2 + 4, sG3 - 4], [sM3 + 30, L - 20]];
  const featMain = (h: NearHit | null) => {
    if (!h) return 0;
    const f = 1 - sm(8, 13, Math.abs(h.lat)), s = h.s; let y = 0;
    for (const [a, b] of mainRoots) y += rootGroups(s, a, b);
    for (const [sc, hb] of BASINS) y -= 0.9 * bump((s - sc) / hb);
    for (const [sc, hh] of HUMPS) y += 1.0 * bump((s - sc) / hh);
    y += 0.16 * Math.max(-7, Math.min(7, h.lat)) * sm(sG2 + 2, sG2 + 12, s) * (1 - sm(sG2 + 74, sG2 + 86, s));   // Hangquerung an Gabel 2: Querneigung 0,16
    return y * f;
  };
  const bRootS: [number, number][][] = [[[130, 290]], [[10, 150]], [[10, 120]]];
  const featBr = (i: number, h: NearHit | null) => { if (!h) return 0; let y = 0; for (const [a, b] of bRootS[i]) y += rootGroups(h.s, a, b, 0.22); if (!i) { for (const [sc, hb] of BBASINS) y -= 0.9 * bump((h.s - sc) / hb); for (const [sc, hh] of BHUMPS) y += 1.3 * bump((h.s - sc) / hh); } return y * (1 - sm(8, 13, Math.abs(h.lat))); };
  const boxOf = (r: Route, s0 = 0, s1 = r.length, m = 15) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (let t = s0; t <= s1; t += 2) { const p = r.at(t); a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.z); d = Math.max(d, p.z); } return [a - m, b + m, c - m, d + m]; };
  const bbox = bRoutes.map((r) => boxOf(r)), mudBox = MUDS.map(([a, b]) => boxOf(route, a - 4, b + 4, 10));
  const height = (x: number, z: number) => {
    let y = base(x, z);
    y += featMain(route.nearestWithin(x, z, 14));
    for (let i = 0; i < 3; i++) { const b = bbox[i]; if (x > b[0] && x < b[1] && z > b[2] && z < b[3]) y += featBr(i, bRoutes[i].nearestWithin(x, z, 14)); }
    const h = brookHit(x, z);
    if (!h || h.d > W0 + h.soft + 12) return y;
    const c = yc(h.s), flat = c + (y - c) * sm(W0 + h.soft, W0 + h.soft + 12, h.d);
    if (h.d >= W0 + h.soft) return flat;
    const t = sm(W0, W0 + h.soft, h.d), bed = c - depthAt(x) * (1 - 0.35 * sm(0.5 * W0, W0, h.d));
    return bed * (1 - t) + c * t;
  };
  const mudAt = (r: Route, spans: [number, number][], x: number, z: number) => { const h = r.nearestWithin(x, z, 8); if (!h || Math.abs(h.lat) > 6.5) return 0; let m = 0; for (const [a, b] of spans) m = Math.max(m, sm(a - 2, a + 2, h.s) * (1 - sm(b - 1, b + 2, h.s))); return m; };
  const inMud = (x: number, z: number) => { const b = bbox[0]; if (x > b[0] && x < b[1] && z > b[2] && z < b[3]) { const m = mudAt(bRoutes[0], BMUDS, x, z); if (m) return m; } return inMudMain(x, z); };
  const inMudMain = (x: number, z: number) => { if (!mudBox.some((b) => x > b[0] && x < b[1] && z > b[2] && z < b[3])) return 0; const h = route.nearestWithin(x, z, 8); if (!h || Math.abs(h.lat) > 6.5) return 0; let m = 0; for (const [a, b] of MUDS) m = Math.max(m, sm(a - 2, a + 2, h.s) * (1 - sm(b - 1, b + 2, h.s))); return m; };
  const surf = (x: number, z: number, d: number): Surface => {
    const h = brookHit(x, z);
    if (h && h.d < W0 + 0.5) return FORD;
    if (inMud(x, z) > 0.3) return MUD;
    return d < 2.5 ? GRAVEL : GRASS;
  };
  const shallow = (x: number, z: number) => { const h = brookRoute.nearestWithin(x, z, W0 + 1); return Math.max(h && h.d < W0 + 0.5 ? FORD_DRAG : 0, MUD_DRAG * inMud(x, z)); };
  const all = [route, ...bRoutes], dAll = (x: number, z: number) => { let d = 99; for (const r of all) d = Math.min(d, r.nearestWithin(x, z, 18)?.d ?? 99); return d; };
  const bd = (x: number, z: number) => brookRoute.nearestWithin(x, z, 12)?.d ?? 99;
  const inBrook = (x: number, z: number) => bd(x, z) < W0 + 6;
  // Stämme quer: Engstellen (zwei Stämme mit 4,5 m Lücke) auf dem guten Weg, einzelne Stämme (Lücke seitlich) auf den Ästen
  const logs: NonNullable<Course['logs']> = [];
  const logAt = (r: Route, s: number, lat: number, len: number) => { const [x, z] = r.offset(s, lat), a = r.at(s); logs.push({ x, z, yaw: Math.atan2(-a.dz, a.dx), len, r: 0.45 }); };
  const straight = (r: Route, s0: number) => { let best = s0, bk = 1e9; for (let s = Math.max(10, s0 - 12); s <= Math.min(r.length - 10, s0 + 12); s += 1) { const k = Math.abs(Math.atan2(Math.sin(r.yawAt(s + 8) - r.yawAt(s - 8)), Math.cos(r.yawAt(s + 8) - r.yawAt(s - 8)))); if (k < bk) { bk = k; best = s; } } return best; };
  const pinch = (r: Route, s0: number, lat = 7.2) => { const s = straight(r, s0); logAt(r, s, lat, 8); logAt(r, s, -lat, 8); };
  for (const s of [40, 70, sG1 - 24, sM1 + 20, sM1 + 90, sM1 + 120, sM3 + 40, sM3 + 172]) pinch(route, s);
  [20, 140, 190, 240].forEach((s) => pinch(bRoutes[0], s, 7.8));
  [25, 55, 85, 115].forEach((s) => pinch(bRoutes[1], s, 7.8));
  [30, 70, 110, 150].forEach((s) => pinch(bRoutes[2], s, 7.8));
  const trees = scatter(rand, 800, half - 8, 5.5, (x, z) => dAll(x, z) > 14.5 && bd(x, z) > 8 && Math.hypot(x + 190, z - 205) > 18).filter(([x, z]) => !logs.some((l) => Math.hypot(x - l.x, z - l.z) < l.len / 2 + 1.5));
  const rockPts = scatter(rand, 40, half - 12, 10, (x, z) => dAll(x, z) > 14 && (bd(x, z) < 26 || rand() < 0.35));
  const wr = rng(seed * 7 + 3);
  const wall = pathWalls(all, wr, { w: 8, rockP: 0.2, caps: 12, rockAt: inBrook });
  // Jeep-Sterne auf den schweren Stellen des guten Wegs
  const fordS = (px: number) => { let best = 0, b0 = 1e9; for (let q = 0; q < L; q += 0.5) { const a = route.at(q); if (Math.abs(a.x - px) > 40) continue; const d = bd(a.x, a.z); if (d < b0) { b0 = d; best = q; } } return best; };
  const pts: [number, number][] = [
    [sG1 - 40, 0], [HUMPS[0][0], 0], [HUMPS[1][0], 0], [sM1 + 40, 0], [sM1 + 100, 0], [fordS(FORD1X), 0],
    [knollS[0][0], knollS[0][1] * 0.75], [knollS[1][0], knollS[1][1] * 0.75], [knollS[2][0], knollS[2][1] * 0.75], [fordS(FORD2X), 0],
    [knollS[3][0], knollS[3][1] * 0.75], [knollS[4][0], knollS[4][1] * 0.75], [knollS[5][0], knollS[5][1] * 0.75],
  ];
  const { stars, line } = hardLine(route, pts);
  return assemble({ id: 'moorwald', name: 'Moorwald', seed, n, cell, height, surf, route, nStars: pts.length, stars, jeepLine: line, branches: brs, trees, rocks: rocksAt(rand, rockPts), logs, wall, shallow,
    brook: { route: brookRoute, w: W0, soft, yc }, post: 0, sky: 0x1c2a2e, fog: { color: 0x26373b, near: 22, far: 135 }, mood: { zenith: 0x141f27, mid: 0x2c3d44, ringTop: 0x1d2e32, light: 0.62 } });
}

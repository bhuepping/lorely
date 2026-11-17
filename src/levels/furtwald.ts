// Offroad-Level „Furtwald“: heller Wald mit einem Bach, der den Weg dreimal kreuzt. Süd → Nord über die Furt 1 (flach), Schneise mit Stämmen und Wurzeln im Norden,
// zurück nach Süden über die Furt 2 (tief, steile Ufer; trockener Umweg = flache Furt weiter östlich), Lichtung mit Lehm, dann nach Norden über die Furt 3 und quer am Waldhang zum Ziel.
// Technik wie Moorwald/Matschgrube: Bachbett (Furtwald-Technik), Gabel (`branches`), `pathWalls`, Sterne auf dem guten Weg (Jeep) und auf dem Umweg.
import { Route, rng, fbm, type Course, type NearHit } from '../level';
import { GRASS, GRAVEL, MUD, FORD, type Surface } from '../physics/terrain';
import { FORD_DRAG } from '../features';
import { assemble, scatter, rocksAt, hardLine, pathWalls, sm, MUD_DRAG, type Pt } from './offroad';

const bz = (x: number) => -4 + 7 * Math.sin(x / 42);   // Bach: von West nach Ost, geschwungen
const F1 = -105, F2 = 15, F3 = 125, FB = 96;           // x der Furten (FB = flache Furt des Umwegs an der tiefen Furt 2)
const BROOK: Pt[] = Array.from({ length: 25 }, (_, i): Pt => { const x = -240 + i * 20; return [x, bz(x)]; });
const MAIN: Pt[] = [
  [-125, 165], [-112, 140], [-128, 116], [-108, 92], [-122, 68], [-104, 46], [-104, 22], [F1, bz(F1)], [-104, -24],     // Wald, Furt 1
  [-99, -62], [-88, -100], [-58, -128], [-18, -140], [22, -126], [36, -92], [24, -58],        // Schneise im Norden
  [F2 + 3, -26], [F2, bz(F2)], [F2 + 1, 22],                                                  // Furt 2 (tief)
  [30, 52], [56, 84], [78, 112], [104, 134], [130, 118], [132, 80],                           // Lichtung bei (66, 98)
  [127, 40], [F3, bz(F3)], [126, -26],                                                        // Furt 3
  [134, -62], [154, -86], [150, -114], [166, -140], [146, -158], [128, -166],                              // Waldhang zum Ziel
];
const UM: Pt[] = [[36, -92], [64, -88], [88, -64], [95, -30], [FB + 1, bz(FB)], [FB + 2, 30], [100, 62], [102, 98], [104, 134]];   // Umweg über die flache Furt
const LIGHT: Pt = [66, 98];
const g1 = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));
const bump = (v: number) => (Math.abs(v) < 1 ? 0.5 * (1 + Math.cos(Math.PI * v)) : 0);

export function makeFurtwald(): Course {
  const seed = 63, n = 201, cell = 2, half = (n - 1) * cell / 2, rand = rng(seed);
  const route = new Route(MAIN), L = route.length, sOf = (p: Pt) => route.nearest(p[0], p[1]).s;
  const sA = sOf(UM[0]), sB = sOf(UM[UM.length - 1]), brs = [{ pts: UM, a: sA, b: sB }], bRoute = new Route(UM);
  const brookRoute = new Route(BROOK);
  const W0 = 3.2, soft = (x: number) => 1.4 + 6.6 * g1(x, F1, 14) + 1.4 * g1(x, F2, 6) + 3.6 * g1(x, F3, 10) + 8.6 * g1(x, FB, 9);
  const depthAt = (x: number) => 0.5 + 0.8 * g1(x, F2, 6) + 0.25 * g1(x, F3, 10) - 0.1 * g1(x, FB, 9);
  const awayBrook = (x: number, z: number) => sm(14, 30, Math.abs(z - bz(x)));
  const sL = sOf(LIGHT), sH0 = sOf(MAIN[29]), sH1 = L - 30;   // Lichtung, Waldhang
  // Waldkuppen links und rechts des Wegs (Querneigung), Erosionsrinnen quer über den Weg
  const knollS: [number, number, number, number][] = [[0.06, 5, 12, 2.0], [0.13, -5, 12, 2.2], [0.3, 5, 12, 2.0], [0.37, -5, 11, 2.8], [0.5, 5, 12, 1.8], [0.64, -5, 12, 2.0], [0.74, 5, 11, 2.8], [0.9, -5, 12, 2.2]];
  const knolls = knollS.map(([f, lat, r, h]): [number, number, number, number] => { const [x, z] = route.offset(f * L, lat); return [x, z, r, h]; });
  const gulS = [0.1, 0.22, 0.33, 0.56, 0.7, 0.83, 0.95].map((f) => f * L);
  const gully = (h: NearHit | null) => { if (!h) return 0; let d = 0; for (const g of gulS) { const u = (h.s - g) / 2.8; if (Math.abs(u) < 1) d = Math.max(d, 0.6 * bump(u) * (1 - sm(9, 14, Math.abs(h.lat)))); } return d; };
  const base = (x: number, z: number) => {
    let y = 1.5 * fbm(x / 34 + 4, z / 34 + 8, seed) + 0.2 * fbm(x / 7 + 11, z / 7 + 3, seed + 1) + 5.5 * sm(12, 56, Math.abs(z - bz(x)));
    const a = awayBrook(x, z); if (a > 0) for (const k of knolls) { const dx = (x - k[0]) / k[2], dz = (z - k[1]) / k[2]; if (dx > 3 || dx < -3 || dz > 3 || dz < -3) continue; y += a * k[3] * Math.exp(-(dx * dx + dz * dz)); }
    return y;
  };
  const ycs = (() => { const a = new Float64Array(Math.ceil(brookRoute.length) + 2); for (let i = 0; i < a.length; i++) { const p = brookRoute.at(i); a[i] = base(p.x, p.z); } const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, w = 0; for (let j = -12; j <= 12; j++) { const q = Math.min(a.length - 1, Math.max(0, i + j)), k = Math.exp(-((j / 6) ** 2 / 2)); s += k * a[q]; w += k; } o[i] = s / w; } return o; })();
  const yc = (s: number) => ycs[Math.min(ycs.length - 1, Math.max(0, Math.round(s)))];
  const brookHit = (x: number, z: number) => { if (Math.abs(z - bz(x)) > 40) return null; const h = brookRoute.nearestWithin(x, z, 26); return h ? { ...h, soft: soft(x) } : null; };
  const rootGroups = (s: number, a: number, b: number, amp = 0.22) => amp * Math.sin(s / 0.72) * sm(a - 6, a + 4, s) * (1 - sm(b - 4, b + 6, s)) * sm(0.2, 0.55, 0.5 + 0.5 * Math.sin(s / 11));
  const sF = [F1, F2, F3].map((x) => { let best = 0, b0 = 1e9; for (let q = 0; q < L; q += 0.5) { const a = route.at(q); if (Math.abs(a.x - x) > 30) continue; const d = Math.abs(a.z - bz(a.x)); if (d < b0) { b0 = d; best = q; } } return best; });
  const mainRoots: [number, number][] = [[sF[0] + 40, sF[0] + 120], [sF[1] - 90, sF[1] - 40], [sF[2] + 40, sF[2] + 90]];
  const featMain = (h: NearHit | null) => {
    if (!h) return 0;
    const f = 1 - sm(8, 13, Math.abs(h.lat)), s = h.s; let y = -gully(h);
    for (const [a, b] of mainRoots) y += rootGroups(s, a, b);
    y += 0.13 * Math.max(-7, Math.min(7, h.lat)) * sm(sH0, sH0 + 14, s) * (1 - sm(sH1 - 10, sH1, s));   // Waldhang: Querneigung 0,13
    return y * f;
  };
  const featBr = (h: NearHit | null) => !h ? 0 : (rootGroups(h.s, 12, 60, 0.2) * (1 - sm(8, 13, Math.abs(h.lat))));
  const boxOf = (r: Route, m = 15) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (let t = 0; t <= r.length; t += 2) { const p = r.at(t); a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.z); d = Math.max(d, p.z); } return [a - m, b + m, c - m, d + m]; };
  const bb = boxOf(bRoute);
  const height = (x: number, z: number) => {
    let y = base(x, z);
    y += featMain(route.nearestWithin(x, z, 14));
    if (x > bb[0] && x < bb[1] && z > bb[2] && z < bb[3]) y += featBr(bRoute.nearestWithin(x, z, 14));
    const h = brookHit(x, z);
    if (!h || h.d > W0 + h.soft + 12) return y;
    const c = yc(h.s), flat = c + (y - c) * sm(W0 + h.soft, W0 + h.soft + 12, h.d);
    if (h.d >= W0 + h.soft) return flat;
    const t = sm(W0, W0 + h.soft, h.d), bed = c - depthAt(x) * (1 - 0.35 * sm(0.5 * W0, W0, h.d));
    return bed * (1 - t) + c * t;
  };
  // Lehm: auf der Lichtung (zwei Stellen), nach Furt 1 und am Waldhang
  const clay: [number, number][] = [[sL - 24, sL - 8], [sL + 8, sL + 24], [sF[0] + 22, sF[0] + 36], [sH0 + 40, sH0 + 56]];
  const inClay = (x: number, z: number) => { const h = route.nearestWithin(x, z, 8); if (!h || Math.abs(h.lat) > 6.5) return 0; let m = 0; for (const [a, b] of clay) m = Math.max(m, sm(a - 2, a + 2, h.s) * (1 - sm(b - 1, b + 2, h.s))); return m; };
  const surf = (x: number, z: number, d: number): Surface => {
    const h = brookHit(x, z);
    if (h && h.d < W0 + 0.5) return FORD;
    if (inClay(x, z) > 0.3) return MUD;
    return d < 2.5 ? GRAVEL : GRASS;
  };
  const shallow = (x: number, z: number) => { const h = brookRoute.nearestWithin(x, z, W0 + 1); return Math.max(h && h.d < W0 + 0.5 ? FORD_DRAG : 0, MUD_DRAG * inClay(x, z)); };
  const all = [route, bRoute], dAll = (x: number, z: number) => Math.min(route.nearestWithin(x, z, 18)?.d ?? 99, bRoute.nearestWithin(x, z, 18)?.d ?? 99);
  const bd = (x: number, z: number) => brookRoute.nearestWithin(x, z, 12)?.d ?? 99;
  const inBrook = (x: number, z: number) => bd(x, z) < W0 + 6;
  const inLight = (x: number, z: number) => Math.hypot(x - LIGHT[0], z - LIGHT[1]) < 30;
  // Stämme quer: Engstellen (zwei Stämme) in der Schneise im Norden
  const logs: NonNullable<Course['logs']> = [];
  const logAt = (r: Route, s: number, lat: number, len: number) => { const [x, z] = r.offset(s, lat), a = r.at(s); logs.push({ x, z, yaw: Math.atan2(-a.dz, a.dx), len, r: 0.45 }); };
  const straight = (r: Route, s0: number) => { let best = s0, bk = 1e9; for (let s = Math.max(10, s0 - 12); s <= Math.min(r.length - 10, s0 + 12); s += 1) { const k = Math.abs(Math.atan2(Math.sin(r.yawAt(s + 8) - r.yawAt(s - 8)), Math.cos(r.yawAt(s + 8) - r.yawAt(s - 8)))); if (k < bk) { bk = k; best = s; } } return best; };
  const pinch = (r: Route, s0: number, lat = 7.2) => { const s = straight(r, s0); logAt(r, s, lat, 8); logAt(r, s, -lat, 8); };
  const sN = sOf(MAIN[10]);
  for (const s of [sN - 20, sN + 30, sN + 80, sN + 130]) pinch(route, s);
  const trees = scatter(rand, 800, half - 8, 5.4, (x, z) => dAll(x, z) > 14.5 && bd(x, z) > 8 && !inLight(x, z) && Math.hypot(x + 125, z - 165) > 16 && Math.hypot(x - 128, z + 166) > 16).filter(([x, z]) => !logs.some((l) => Math.hypot(x - l.x, z - l.z) < l.len / 2 + 1.5));
  const rockPts = scatter(rand, 30, half - 12, 9, (x, z) => dAll(x, z) > 14 && !inLight(x, z) && (bd(x, z) < 26 || rand() < 0.3));
  const wall = pathWalls(all, rng(seed * 7 + 3), { w: 8, rockP: 0.1, caps: 12, rockAt: inBrook, skip: inLight });
  // Sterne: Jeep auf dem guten Weg (Furten, Lehm, Waldkuppen), zwei auf dem Umweg
  const pts: [number, number][] = [[sF[0], 0], [sF[1], 0], [sF[2], 0], ...clay.map(([a, b]): [number, number] => [(a + b) / 2, 0]), ...[1, 3, 6, 7].map((i): [number, number] => [knollS[i][0] * L, knollS[i][1] * 0.8])];
  const { stars: mainStars, line } = hardLine(route, pts);
  const stars = [...mainStars, bRoute.offset(bRoute.length * 0.5, 0), bRoute.offset(bRoute.length * 0.78, 0)];
  return assemble({ id: 'furtwald', ver: 2, name: 'Furtwald', seed, n, cell, height, surf, route, nStars: stars.length, stars, jeepLine: line, branches: brs, trees, rocks: rocksAt(rand, rockPts), logs, wall, shallow,
    brook: { route: brookRoute, w: W0, soft, yc }, post: 0, sky: 0x86b8e0, fog: { color: 0xa9c9d8, near: 55, far: 210 } });
}

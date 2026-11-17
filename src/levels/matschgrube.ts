// Offroad-Level 1 „Matschgrube“: langer Waldweg mit vier Matschgruben. Der gute Weg (`route`) führt durch die Gruben (Jeep, schneller); vor jeder Grube zweigt
// ein trockener Umweg (`branches`) ab und mündet dahinter wieder ein – die schwächeren Autos kommen so ins Ziel. Dazwischen Kurven, Kuppen, Wurzelwellen, Stämme und
// eine Furt. Technik wie der Moorwald (Gabeln: Spec.branches, pathWalls, viaBranch/viaBranches).
import { Route, rng, fbm, type Course, type NearHit } from '../level';
import { GRASS, GRAVEL, MUD, FORD, type Surface } from '../physics/terrain';
import { FORD_DRAG } from '../features';
import { assemble, scatter, rocksAt, hardLine, pathWalls, sm, MUD_DRAG, type Pt } from './offroad';

const ZS = 62;   // Verschiebung nach Norden: der Weg liegt dann mittig in der Karte
const RAW: Pt[] = [
  [-170, -170], [-140, -175], [-105, -166], [-70, -172], [-35, -163], [0, -171], [35, -163], [70, -170], [105, -163],                  // Weg A nach Osten
  [140, -168], [166, -140], [170, -108], [150, -78],                                                                                    // Kehre nach Norden, Furt
  [115, -66], [80, -74], [45, -62], [10, -70], [-25, -60], [-60, -68], [-95, -58], [-125, -42], [-140, -15], [-152, 22], [-122, 52], [-94, 74], [-58, 84], [-22, 92],                        // Weg B nach Westen, Ziel
];
const MAIN: Pt[] = RAW.map(([x, z]) => [x, z + ZS]);
/** Gruben: Lage am Weg (Mitte), Seite des Umwegs (+1 = links der Fahrtrichtung; auf Weg A nach Osten also −1 = Norden) */
const PIT_AT: Pt[] = [[-75, -172 + ZS], [55, -170 + ZS], [88, -72 + ZS], [-42, -65 + ZS]];
const PIT_SIDE = [1, 1, 1, 1];
const LAT = 54, T = 60, A0 = 55, B0 = 65;     // Umweg: seitlicher Versatz, Ein-/Ausblendstrecke, Beginn vor / Ende nach der Grubenmitte
const PIT_HALF = 13, HUMP_AT = 14, HUMP_HALF = 7, HUMP_H = [2.8, 2.9, 2.8, 2.9];   // Becken halbe Länge, Buckel (hinter der Mitte, halbe Länge, Höhe m): nur der Jeep kommt im Matsch hoch
const FORD_X = 169;

const bump = (v: number) => (Math.abs(v) < 1 ? 0.5 * (1 + Math.cos(Math.PI * v)) : 0);
const g1 = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));

export function makeMatschgrube(): Course {
  const seed = 41, n = 201, cell = 2, half = (n - 1) * cell / 2, rand = rng(seed);
  const route = new Route(MAIN), L = route.length, PIT_S = PIT_AT.map(([x, z]) => Math.round(route.nearest(x, z).s));
  // Umweg = guter Weg, seitlich verschoben entlang der festen Normalen der Sehne Gabel→Mündung (so faltet die Kurve des Wegs den Umweg nicht)
  const brs = PIT_S.map((c, i) => {
    const a = c - A0, b = c + B0, pts: Pt[] = [], pa = route.at(a), pb = route.at(b), cl = Math.hypot(pb.x - pa.x, pb.z - pa.z) || 1;
    const nx = (pb.z - pa.z) / cl * PIT_SIDE[i], nz = -(pb.x - pa.x) / cl * PIT_SIDE[i];
    for (let s = a; s < b; s += 3) { const q = route.at(s), l = LAT * sm(a, a + T, s) * (1 - sm(b - T, b, s)); pts.push([q.x + nx * l, q.z + nz * l]); }
    pts.push([pb.x, pb.z]); pts[0] = [pa.x, pa.z];
    return { pts, a, b };
  });
  const bRoutes = brs.map((b) => new Route(b.pts));
  // Bach (Furtwald-Technik): von der Quelle mitten im Wald nach Osten, kreuzt den Weg an der Furt (x ≈ 169)
  const BROOK: Pt[] = ([[40, -118], [70, -108], [100, -112], [130, -104], [158, -108], [190, -104], [216, -110]] as Pt[]).map(([x, z]) => [x, z + ZS]);
  const brookRoute = new Route(BROOK);
  const W0 = 3.2, depth = 0.7, softAt = (x: number) => 1.4 + 8 * g1(x, FORD_X, 12);
  // Kuppen (Rücken quer zum Weg, s / Höhe / Halblänge) und Flankenkuppen (s, Seite, Höhe)
  const crests: [number, number, number][] = [[30, 1.4, 6], [420, 1.2, 7], [L - 38, 1.6, 6]];   // nur zwischen den Gabelfenstern, nicht vor Furt und Kehre; die letzte kurz vor dem Ziel
  const knollS: [number, number, number, number][] = [[20, 5, 9, 2.6], [330, 5, 9, 2.8], [705, 5, 9, 1.6], [770, -5, 9, 1.6]];
  const knolls = knollS.map(([s, lat, r, h]): [number, number, number, number] => { const [x, z] = route.offset(s, lat); return [x, z, r, h]; });
  const base = (x: number, z: number) => {
    let y = 1.4 * fbm(x / 42 + 3, z / 42 + 5, seed);
    for (const k of knolls) { const dx = (x - k[0]) / k[2], dz = (z - k[1]) / k[2]; if (dx > 3 || dx < -3 || dz > 3 || dz < -3) continue; y += k[3] * Math.exp(-(dx * dx + dz * dz)); }
    return y;
  };
  const ycArr = Float64Array.from({ length: Math.ceil(brookRoute.length) + 2 }, (_, i) => { const a = brookRoute.at(i); return base(a.x, a.z); });
  const yc = (s: number) => ycArr[Math.min(ycArr.length - 1, Math.max(0, Math.round(s)))];
  const brookHit = (x: number, z: number): (NearHit & { soft: number }) | null => { if (x < 20 || z < ZS - 150 || z > ZS - 70) return null; const h = brookRoute.nearestWithin(x, z, 26); return h ? { ...h, soft: softAt(x) } : null; };
  // Wurzelwellen längs der Wege in Gruppen; Grubenprofil (Becken -0,9 m, Buckel im Matsch)
  const rootGroups = (s: number, a: number, b: number, amp = 0.22) => amp * Math.sin(s / 0.72) * sm(a - 6, a + 4, s) * (1 - sm(b - 4, b + 6, s)) * sm(0.2, 0.55, 0.5 + 0.5 * Math.sin(s / 11));
  const mainRoots: [number, number][] = [[305, 432], [695, L - 30]];   // Wurzelwellen nur außerhalb der Gabelfenster (dort ist die Grube die Hürde)
  const featMain = (h: NearHit | null) => {
    if (!h) return 0;
    const s = h.s; let y = 0;
    for (const [a, b] of mainRoots) y += rootGroups(s, a, b);
    for (const [sc, hh, hl] of crests) y += hh * Math.exp(-(((s - sc) / hl) ** 2)) * (1 - sm(7, 12, Math.abs(h.lat)));
    PIT_S.forEach((c, i) => { y -= 0.9 * bump((s - c) / PIT_HALF); y += HUMP_H[i] * bump((s - c - HUMP_AT) / HUMP_HALF); });
    return y * (1 - sm(8, 13, Math.abs(h.lat))) + 0;
  };
  const featBr = (i: number, h: NearHit | null) => !h ? 0 : (rootGroups(h.s, 12, bRoutes[i].length - 12, 0.2) + 0.7 * Math.sin(h.s / 19 + i) * sm(12, 32, h.s) * sm(12, 32, bRoutes[i].length - h.s)) * (1 - sm(8, 13, Math.abs(h.lat)));
  const boxOf = (r: Route, m = 15) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (let t = 0; t <= r.length; t += 2) { const p = r.at(t); a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.z); d = Math.max(d, p.z); } return [a - m, b + m, c - m, d + m]; };
  const bbox = bRoutes.map((r) => boxOf(r));
  const height = (x: number, z: number) => {
    let y = base(x, z);
    y += featMain(route.nearestWithin(x, z, 14));
    for (let i = 0; i < bRoutes.length; i++) { const b = bbox[i]; if (x > b[0] && x < b[1] && z > b[2] && z < b[3]) y += featBr(i, bRoutes[i].nearestWithin(x, z, 14)); }
    const h = brookHit(x, z);
    if (!h || h.d > W0 + h.soft + 12) return y;
    const c = yc(h.s), flat = c + (y - c) * sm(W0 + h.soft, W0 + h.soft + 12, h.d);
    if (h.d >= W0 + h.soft) return flat;
    const t = sm(W0, W0 + h.soft, h.d), bed = c - depth * (1 - 0.35 * sm(0.5 * W0, W0, h.d));
    return bed * (1 - t) + c * t;
  };
  // Matsch: vom Beckenanfang bis zur Kuppe des Buckels (der Anstieg liegt noch im Matsch)
  const MUDS: [number, number][] = PIT_S.map((c) => [c - 7, c + HUMP_AT]);
  const mudBox = MUDS.map(([a, b]) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let t = a - 4; t <= b + 4; t += 2) { const p = route.at(t); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); } return [x0 - 10, x1 + 10, z0 - 10, z1 + 10]; });
  const inMud = (x: number, z: number) => {
    if (!mudBox.some((b) => x > b[0] && x < b[1] && z > b[2] && z < b[3])) return 0;
    const h = route.nearestWithin(x, z, 8); if (!h || Math.abs(h.lat) > 7) return 0;
    let m = 0; for (const [a, b] of MUDS) m = Math.max(m, sm(a - 2, a + 2, h.s) * (1 - sm(b - 1, b + 2, h.s))); return m;
  };
  const surf = (x: number, z: number, d: number): Surface => {
    const h = brookHit(x, z);
    if (h && h.d < W0 + 0.5) return FORD;
    if (inMud(x, z) > 0.3) return MUD;
    return d < 2.5 ? GRAVEL : GRASS;
  };
  const shallow = (x: number, z: number) => { const h = brookHit(x, z); return Math.max(h && h.d < W0 + 0.5 ? FORD_DRAG : 0, MUD_DRAG * inMud(x, z)); };
  const all = [route, ...bRoutes], dAll = (x: number, z: number) => { let d = 99; for (const r of all) d = Math.min(d, r.nearestWithin(x, z, 18)?.d ?? 99); return d; };
  const bd = (x: number, z: number) => brookRoute.nearestWithin(x, z, 12)?.d ?? 99;
  const inBrook = (x: number, z: number) => bd(x, z) < W0 + 6;
  // Stämme quer: Engstellen (zwei Stämme, ≈ 5 m Lücke) an geraden Stellen des guten Wegs zwischen den Gruben
  const logs: NonNullable<Course['logs']> = [];
  const logAt = (r: Route, s: number, lat: number, len: number) => { const [x, z] = r.offset(s, lat), a = r.at(s); logs.push({ x, z, yaw: Math.atan2(-a.dz, a.dx), len, r: 0.45 }); };
  const straight = (r: Route, s0: number) => { let best = s0, bk = 1e9; for (let s = Math.max(10, s0 - 12); s <= Math.min(r.length - 10, s0 + 12); s += 1) { const k = Math.abs(Math.atan2(Math.sin(r.yawAt(s + 8) - r.yawAt(s - 8)), Math.cos(r.yawAt(s + 8) - r.yawAt(s - 8)))); if (k < bk) { bk = k; best = s; } } return best; };
  for (const s of [] as number[]) { const q = straight(route, s); logAt(route, q, 7.2, 8); logAt(route, q, -7.2, 8); }
  const trees = scatter(rand, 700, half - 8, 5.2, (x, z) => dAll(x, z) > 14.5 && bd(x, z) > 8 && Math.hypot(x + 170, z + 170 - ZS) > 16).filter(([x, z]) => !logs.some((l) => Math.hypot(x - l.x, z - l.z) < l.len / 2 + 1.5));
  const rockPts = scatter(rand, 30, half - 12, 10, (x, z) => dAll(x, z) > 14 && (bd(x, z) < 26 || rand() < 0.3));
  const wall = pathWalls(all, rng(seed * 7 + 3), { w: 8, rockP: 0.15, caps: 12, rockAt: inBrook });
  // Sterne: in jeder Grube (Matsch am Buckel) auf dem guten Weg, zwei auf jedem Umweg, eine in der Furt, je eine auf der ersten und der letzten Kuppe
  const fordS = (() => { let best = 0, b0 = 1e9; for (let q = 0; q < L; q += 0.5) { const a = route.at(q); if (Math.abs(a.x - FORD_X) > 30) continue; const d = bd(a.x, a.z); if (d < b0) { b0 = d; best = q; } } return best; })();
  const pts: [number, number][] = [...PIT_S.map((c): [number, number] => [c + HUMP_AT - 3, 0]), [fordS, 0], [crests[0][0], 0], [crests[2][0], 0]];
  const { stars: mainStars, line } = hardLine(route, pts);
  const brStars: Pt[] = bRoutes.flatMap((r) => [r.offset(r.length * 0.38, 0), r.offset(r.length * 0.66, 0)]);
  const stars = [...mainStars, ...brStars];
  return assemble({ id: 'matschgrube', name: 'Matschgrube', seed, n, cell, height, surf, route, nStars: stars.length, stars, jeepLine: line, branches: brs, trees, rocks: rocksAt(rand, rockPts), logs, wall, shallow,
    brook: { route: brookRoute, w: W0, soft: softAt, yc }, post: 0, sky: 0x8fbfe4, fog: { color: 0xb2cfdf, near: 45, far: 190 } });
}

// Welt Offroad: drei freie Geländelevel. Nur Start und Ziel (hohe Zielfahne), freie Wegwahl; die unsichtbare Route ist der „gute Weg“
// (Zeitkonto, Sterne, Rückstellpunkte, Bot, Minimap). Alles prozedural aus Höhenfunktionen, kein Verkehr, kein Checkpoint-Zwang (`Course.free`).
import { Route, rng, fbm, saveKeyOf, type Course, type NearHit } from '../level';
import { GridTerrain, GRASS, GRAVEL, MUD, FORD, type Surface } from '../physics/terrain';
import type { Circle, Box } from '../physics/obstacles';
import { FORD_DRAG } from '../features';
import { KRAN_BACK } from '../run';
import BUDGETS_JSON from './budgets.json';

export type Pt = [number, number];
export const MUD_DRAG = 0.8;   // 1/s: Zähigkeit im tiefen Matsch (Wasser der Furt: 0,55)
export const sm = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };


/** Zeitkonten je Auto: Bot-Zeit auf dem guten Weg × 1,18, Quelle `budgets.json` (Werkzeug tools/budgets.test.ts) */
const BUDGETS: Record<string, Partial<Record<string, number>>> = BUDGETS_JSON;

export interface Spec {
  id: string; /** Fassung (> 1: neuer Speicherschlüssel `id#v`, alte Bestzeiten verfallen) */ ver?: number; name: string; seed: number; n: number; cell: number;
  height: (x: number, z: number) => number;
  /** Untergrund; d = Abstand zur Route */
  surf: (x: number, z: number, d: number) => Surface;
  route: Route; nStars: number;
  /** Jeep-Sternenlinie: Sterne an den schweren Stellen statt mittig auf dem guten Weg (Länge = nStars) */
  stars?: Pt[]; jeepLine?: Pt[];
  /** Gabelungen: Äste als Punktlisten; Anfang/Ende liegen auf dem guten Weg bei s = a / b (Spec.branches[i].pts[0] / letzter Punkt) */
  branches?: { pts: Pt[]; a: number; b: number }[];
  trees: Pt[]; rocks: { x: number; z: number; s: number; yaw: number }[]; logs?: Course['logs'];
  /** natürliche Sperren: Bäume/Felsen dicht an dicht entlang des Korridors, mit Größe */
  wall?: Wall;
  brook?: Course['brook']; shallow?: (x: number, z: number) => number;
  post: number;   // Farbe Pfosten (ungenutzt)
  sky?: number; fog?: { color: number; near: number; far: number }; mood?: Course['mood'];
}

/** Punkte mit Mindestabstand streuen (Rejection); ok(x,z) schließt Zonen aus */
export function scatter(rand: () => number, count: number, half: number, minD: number, ok: (x: number, z: number) => boolean, tries = 40): Pt[] {
  const out: Pt[] = [], cell = minD, grid = new Map<number, Pt[]>();
  const key = (cx: number, cz: number) => cx * 4001 + cz;
  for (let k = 0; k < count * tries && out.length < count; k++) {
    const x = (rand() * 2 - 1) * half, z = (rand() * 2 - 1) * half;
    if (!ok(x, z)) continue;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let free = true;
    for (let j = -1; j <= 1 && free; j++) for (let i = -1; i <= 1 && free; i++) for (const q of grid.get(key(cx + i, cz + j)) ?? []) if (Math.hypot(q[0] - x, q[1] - z) < minD) { free = false; break; }
    if (!free) continue;
    out.push([x, z]); const kk = key(cx, cz); (grid.get(kk) ?? grid.set(kk, []).get(kk)!).push([x, z]);
  }
  return out;
}

export interface Wall { trees: { x: number; z: number; s: number }[]; rocks: { x: number; z: number; s: number; yaw: number }[] }
const R_TREE = 0.7, R_ROCK = 1.0;   // Kollisionsradius je Größe (wie in assemble)

/** Dichte Kette aus Bäumen und Felsen entlang einer Linie (natürliche Sperre statt unsichtbarer Wand). Die Nachbarn liegen Rand an Rand
 *  (Lücke 0,4 m, schmaler als jedes Auto), die Kette schwankt seitlich um ±0,8 m. rockP = Anteil Felsen; rockAt erzwingt Felsen (z. B. im Bach). */
export function chain(line: Pt[], rand: () => number, o: { rockP: number; rockAt?: (x: number, z: number) => boolean; sTree?: [number, number]; sRock?: [number, number]; skip?: (x: number, z: number) => boolean }): Wall {
  const out: Wall = { trees: [], rocks: [] }, [t0, t1] = o.sTree ?? [0.8, 1.5], [r0, r1] = o.sRock ?? [1.1, 2.0];
  const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const total = cum[cum.length - 1];
  let k = 0;
  const at = (d: number) => {   // Position + Normale an Strecke d (d steigt nur)
    while (k < line.length - 2 && cum[k + 1] < d) k++;
    const [ax, az] = line[k], [bx, bz] = line[k + 1], e = Math.hypot(bx - ax, bz - az) || 1, f = Math.min(1, Math.max(0, (d - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k])));
    return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, nx: -(bz - az) / e, nz: (bx - ax) / e };
  };
  let d = 0, prevR = -1;
  for (;;) {
    const x0 = line[Math.min(line.length - 1, k)];
    const rock = !!o.rockAt?.(x0[0], x0[1]) || rand() < o.rockP, size = rock ? r0 + rand() * (r1 - r0) : t0 + rand() * (t1 - t0), rr = (rock ? R_ROCK : R_TREE) * size;
    if (prevR >= 0) d += prevR + rr + 0.4;
    if (d > total) break;
    const p = at(d), w = (rand() * 2 - 1) * 0.8, x = p.x + p.nx * w, z = p.z + p.nz * w;
    if (!o.skip?.(x, z)) { if (rock) out.rocks.push({ x, z, s: size, yaw: rand() * 6.28 }); else out.trees.push({ x, z, s: size }); }
    prevR = rr;
  }
  return out;
}
export const joinWalls = (...w: Wall[]): Wall => ({ trees: w.flatMap((q) => q.trees), rocks: w.flatMap((q) => q.rocks) });
/** Linie im festen seitlichen Abstand zur Route (lat > 0 = links vom Fahrtrichtungs-Normalen von Route.offset), dicht abgetastet */
export const along = (route: Route, lat: number, s0: number, s1: number): Pt[] => { const out: Pt[] = []; for (let s = s0; s <= s1; s += 0.5) out.push(route.offset(s, lat)); return out; };
export const poly = (pts: Pt[]): Pt[] => { const out: Pt[] = []; for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5); for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); } out.push(pts[pts.length - 1]); return out; };

/** Sterne als Belohnung AUF der schweren Linie (Kuppen, Lehm, Rinnen, Bach), nicht daneben. pts = [s, lat] am guten Weg; die Jeep-Linie folgt
 *  dem Weg und schwenkt zu jedem Stern seitlich aus (Gauß σ 8 m). Liefert Sterne + Linie (Start → Ziel). */
export function hardLine(route: Route, pts: [number, number][]): { stars: Pt[]; line: Pt[] } {
  const q = [...pts].sort((a, b) => a[0] - b[0]), L = route.length, line: Pt[] = [];
  for (let s = 0; s <= L; s += 3) { let w = 0, l = 0; for (const [ss, lat] of q) { const g = Math.exp(-(((s - ss) / 8) ** 2)); w += g; l += g * lat; } line.push(route.offset(s, w > 1e-3 ? l / Math.max(1, w) : 0)); }
  line.push(route.offset(L, 0));
  return { stars: q.map(([ss, lat]) => route.offset(ss, lat)), line };
}

export function assemble(sp: Spec): Course {
  const { route } = sp;
  const branches = (sp.branches ?? []).map((b) => ({ route: new Route(b.pts), a: b.a, b: b.b }));
  const bBox = branches.map((b) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let s = 0; s <= b.route.length; s += 2) { const p = b.route.at(s); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); } return [x0 - 9, x1 + 9, z0 - 9, z1 + 9]; });
  const dAny = (x: number, z: number) => { let d = route.nearestWithin(x, z, 8)?.d ?? 99; branches.forEach((b, i) => { const q = bBox[i]; if (x > q[0] && x < q[1] && z > q[2] && z < q[3]) d = Math.min(d, b.route.nearestWithin(x, z, 8)?.d ?? 99); }); return d; };
  const terrain = new GridTerrain(sp.n, sp.cell, sp.height, (x, z) => sp.surf(x, z, dAny(x, z)));
  const half = terrain.half, goalS = route.length, g = route.at(goalS), p0 = route.at(0);
  // Sterne: – eigene Jeep-Sternenlinie durch die schweren Stellen (`sp.stars`); der gute Weg bleibt sternenfrei
  const stars: [number, number][] = sp.stars ? sp.stars.map(([x, z]) => [x, z]) : [];
  if (!sp.stars) for (let i = 1; i <= sp.nStars; i++) { const s = goalS * i / (sp.nStars + 1), [x, z] = route.offset(s, 0); stars.push([x, z]); }
  const rs = rng(sp.seed * 31 + 7), trees = [...sp.trees.map(([x, z]) => ({ x, z, s: 0.75 + rs() * 0.8 })), ...(sp.wall?.trees ?? [])];   // s = Baumgröße
  const rocks = [...sp.rocks.map((r) => ({ ...r, s: r.s })), ...(sp.wall?.rocks ?? [])];
  const circles: Circle[] = [...trees.map((t) => ({ x: t.x, z: t.z, r: R_TREE * t.s, e: 0.2 })), ...rocks.map((k) => ({ x: k.x, z: k.z, r: R_ROCK * k.s, e: 0.25 }))];
  const boxes: Box[] = (sp.logs ?? []).map((l) => ({ x: l.x, z: l.z, hx: l.r + 0.1, hz: l.len / 2, yaw: l.yaw }));
  const bud = BUDGETS[sp.id];
  const surfaceColors = [0x4b4e57, 0xb89d6c, 0xbfe6f2, 0xdbe8f2, 0xf5f8fb, 0x3e4a5a, 0xc9b88a, 0xdcc89a, 0x8b6a3e, 0x6f8f46, 0x8a8478, 0x8a7656, 0x5d432d];
  const budgets = bud ? { ...bud } : {};
  return {
    id: sp.id, saveKey: saveKeyOf({ id: sp.id, v: sp.ver }), name: sp.name, world: 'offroad', route, net: null, bridges: [], bridgeSpans: [], terrain, length: route.length, roadWidth: 8, free: true,
    start: { x: p0.x, z: p0.z, yaw: route.yawAt(0) },
    goal: { s: goalS, x: g.x, z: g.z, yaw: route.yawAt(goalS) },
    city: null, suburb: null, signals: null, town: [], rainAlways: false, rainS: [], bridge: null, river: null, jumps: [], fords: [], tunnels: [], moverDefs: [], rails: [], traffic: null, bays: [], bayExt: () => 0,
    shallowAt: sp.shallow ?? (() => 0), vines: [], castles: [], landmarks: [], waterAt: () => -1e9, sea: null, sun: null, treeKind: 'fir', boardwalk: [],
    obstacles: { circles, boxes }, brook: sp.brook ?? null, logs: sp.logs ?? [],
    edge: { x0: -half + 12, z0: -half + 12, x1: half - 12, z1: half - 12 },
    stars, jeepLine: sp.jeepLine, branches: branches.length ? branches : undefined, posts: [], trees, rocks,
    timeBudget: budgets.hatch ?? 70, starBonus: 3, timeBudgets: budgets, hints: { cp: [], arrow: [] }, chassis: { setup: 'standard' },
    surfaceColors, mood: sp.mood, sky: sp.sky ?? 0x9cc7ea, fog: sp.fog ?? { color: 0xbcd6e8, near: 60, far: 230 },
    colors: { tree: 0x1f4a2a, treeTop: 0x2f6b3a, rock: 0x8a8478, post: sp.post, star: 0xffd93b, gate: 0xd8342a },
    recover: (s) => { const a = route.at(Math.max(0, s)); return { x: a.x, z: a.z, yaw: route.yawAt(Math.max(0, s)) }; },
    recoverAt: branches.length ? (x, z) => {   // Kran: nächster Punkt irgendeines Asts (gute Weg oder Gabelast), KRAN_BACK/3 m zurück
      let best = route, h = route.nearest(x, z);
      for (const b of branches) { const q = b.route.nearest(x, z); if (q.d < h.d) { h = q; best = b.route; } }
      const s0 = Math.max(0, h.s - KRAN_BACK / 3), a = best.at(s0);
      return { x: a.x, z: a.z, yaw: best.yawAt(s0) };
    } : undefined,
  };
}

export const rocksAt = (rand: () => number, pts: Pt[]) => pts.map(([x, z]) => ({ x, z, s: 1.0 + rand() * 1.4, yaw: rand() * 6.28 }));

// ── Gabelungen und Wegbau (gemeinsam für Steilhang/Moorwald) ──
/** Zickzack-Serpentine: Wendepunkte x∈[xL,xR] (Gerade zwischen den Kehren), `legs` Schenkel im Abstand dz (Vorzeichen = Richtung), Kehren als Halbkreise R = |dz|/2.
 *  Der erste Schenkel läuft von xL nach xR (Ost; east0=false: nach Westen), der zweite zurück usw. Punkte alle ≈ 3 m. Liefert Punkte + Scheitel der Kehren. */
export function zigzag(xL: number, xR: number, z0: number, dz: number, legs: number, east0 = true): { pts: Pt[]; apex: Pt[] } {
  const pts: Pt[] = [], apex: Pt[] = [], R = Math.abs(dz) / 2;
  for (let k = 0; k < legs; k++) {
    const z = z0 + dz * k, east = (k % 2 === 0) === east0, xa = east ? xL : xR, xb = east ? xR : xL, n = Math.max(1, Math.round(Math.abs(xb - xa) / 3));
    for (let i = 0; i <= n; i++) pts.push([xa + (xb - xa) * i / n, z]);
    if (k < legs - 1) {   // Kehre: Halbkreis um (xb, z + dz/2); Ost->West biegt über +x, West->Ost über -x
      const cx = xb, cz = z + dz / 2, sgn = east ? 1 : -1, m = Math.max(6, Math.round(Math.PI * R / 3));
      for (let i = 1; i < m; i++) { const a = Math.PI * i / m; pts.push([cx + sgn * R * Math.sin(a), cz - (dz / 2) * Math.cos(a)]); }
      apex.push([cx + sgn * R, cz]);
    }
  }
  return { pts, apex };
}

/** Straßenbau: eine Linie legt das Gelände auf Sollhöhe y(s) mit Querneigung tilt(s) (Höhe/m, > 0: links fällt ab), `half` m breit, danach `bank` m Böschung zum Grundgelände.
 *  `on(s)` = Gewicht 0..1 (Ein-/Ausblenden). Mehrere Linien nahe beieinander (Gabel) mitteln sich nach Gewicht. */
export interface Carve { route: Route; y: (s: number) => number; on?: (s: number) => number; tilt?: (s: number) => number; half: number; bank: number }
export function carveAt(base: number, x: number, z: number, cs: Carve[], near?: (r: Route, R: number) => NearHit | null): number {
  let ws = 0, ys = 0, wm = 0;
  for (const c of cs) {
    const h = near ? near(c.route, c.half + c.bank) : c.route.nearestWithin(x, z, c.half + c.bank); if (!h || h.d > c.half + c.bank) continue;
    const on = c.on ? c.on(h.s) : 1; if (on <= 0) continue;
    const w = on * (1 - sm(c.half, c.half + c.bank, Math.abs(h.lat))); if (w <= 0) continue;
    const l = Math.max(-c.half, Math.min(c.half, h.lat)), y = c.y(h.s) - (c.tilt ? c.tilt(h.s) * l : 0);
    ws += w; ys += w * y; wm = Math.max(wm, w);
  }
  return ws > 0 ? base + (ys / ws - base) * wm : base;
}
/** Höhe des Grundgeländes entlang einer Linie, mit Gauß σ (m) geglättet: Sollhöhe für `Carve.y` */
export function profileAlong(route: Route, base: (x: number, z: number) => number, sigma: number): (s: number) => number {
  const L = route.length, step = 1, n = Math.ceil(L / step) + 1, raw = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = route.at(Math.min(L, i * step)); raw[i] = base(a.x, a.z); }
  const k = Math.ceil(sigma * 2.5), w: number[] = []; for (let j = -k; j <= k; j++) w.push(Math.exp(-((j * step / sigma) ** 2 / 2)));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) { let a = 0, b = 0; for (let j = -k; j <= k; j++) { const q = i + j; if (q < 0 || q >= n) continue; a += w[j + k] * raw[q]; b += w[j + k]; } out[i] = a / b; }
  return (s) => { const f = Math.min(n - 1, Math.max(0, s / step)), i = Math.min(n - 2, Math.floor(f)); return out[i] + (out[i + 1] - out[i]) * (f - i); };
}
/** Sperrketten entlang aller Wege (guter Weg + Äste) beidseits im Abstand `w`. Wandstücke im Korridor eines anderen Wegs entfallen – dort laufen die Äste
 *  zusammen (Gabel, Mündung); überall sonst steht zwischen den Ästen eine geschlossene Kette (kein Durchschlupf). `caps` = Tiefe (m) einer U-Kappe hinter Start und Ziel des guten Wegs (sonst läuft man hinten herum). */
export function pathWalls(paths: Route[], rand: () => number, o: { w: number; caps?: number; rockP: number; rockAt?: (x: number, z: number) => boolean; skip?: (x: number, z: number) => boolean }): Wall {
  const walls: Wall[] = [];
  paths.forEach((p, i) => {
    const others = paths.filter((_, j) => j !== i);
    const skip = (x: number, z: number) => !!o.skip?.(x, z) || others.some((q) => !!q.nearestWithin(x, z, o.w - 0.3));
    for (const side of [1, -1]) walls.push(chain(along(p, side * o.w, 0, p.length), rand, { rockP: o.rockP, rockAt: o.rockAt, skip }));
    if (i === 0 && o.caps) for (const [s, sg] of [[0, -1], [p.length, 1]] as [number, number][]) {   // Kappe hinter Start und Ziel (U um das Wegende), sonst führt der Raum dahinter um die Sperren
      const e = p.at(s), cap = (lat: number, back: number): Pt => [e.x + e.dz * lat + sg * e.dx * back, e.z - e.dx * lat + sg * e.dz * back];
      walls.push(chain(poly([cap(o.w, 0), cap(o.w, o.caps), cap(-o.w, o.caps), cap(-o.w, 0)]), rand, { rockP: o.rockP }));
    }
  });
  return joinWalls(...walls);
}
/** Gesamtweg über einen Ast (Test/Bot/Zeitkonto): guter Weg bis a, Ast, guter Weg ab b */
export function viaBranch(c: Course, i: number): Course {
  const br = c.branches![i], pts: Pt[] = [];
  for (let s = 0; s < br.a; s += 2) { const q = c.route.at(s); pts.push([q.x, q.z]); }
  for (let s = 0; s < br.route.length; s += 2) { const q = br.route.at(s); pts.push([q.x, q.z]); }
  for (let s = br.b; s < c.route.length; s += 2) { const q = c.route.at(s); pts.push([q.x, q.z]); }
  const e = c.route.at(c.route.length); pts.push([e.x, e.z]);
  const r = new Route(pts);
  return { ...c, route: r, length: r.length, goal: { ...c.goal!, s: r.length }, recover: (s: number) => { const a = r.at(Math.max(0, s)); return { x: a.x, z: a.z, yaw: r.yawAt(Math.max(0, s)) }; } };
}
/** Gesamtweg über mehrere Äste (aufsteigend nach Gabel): guter Weg, Ast i, guter Weg, Ast j … (Test/Bot) */
export function viaBranches(c: Course, idx: number[]): Course {
  const pts: Pt[] = []; let s0 = 0;
  for (const i of [...idx].sort((p, q) => p - q)) {
    const br = c.branches![i];
    for (let s = s0; s < br.a; s += 2) { const q = c.route.at(s); pts.push([q.x, q.z]); }
    for (let s = 0; s < br.route.length; s += 2) { const q = br.route.at(s); pts.push([q.x, q.z]); }
    s0 = br.b;
  }
  for (let s = s0; s < c.route.length; s += 2) { const q = c.route.at(s); pts.push([q.x, q.z]); }
  const e = c.route.at(c.route.length); pts.push([e.x, e.z]);
  const r = new Route(pts);
  return { ...c, route: r, length: r.length, goal: { ...c.goal!, s: r.length }, recover: (s: number) => { const a = r.at(Math.max(0, s)); return { x: a.x, z: a.z, yaw: r.yawAt(Math.max(0, s)) }; } };
}

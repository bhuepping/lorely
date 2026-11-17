// Level-Format + Streckenlogik. Reine Daten, keine three-Abhängigkeit (headless testbar).
// Ein Level ist eine JSON-Datei (siehe src/levels/*.json): Seed, Spline der Straße, Objektlisten,
// Untergrundzonen, Palette, Nebel, Zeitkonto, Fahrwerk-Setup (nur Feld, wird noch nicht ausgewertet).
import { type EdgeRect, EDGE_INSET } from './edge';
import { Bridge, type BridgeDef } from './bridge';
import { River, type RiverDef } from './river';
import { planTown, type TownDef, type TownHouse } from './town';
import type { Circle, Box } from './physics/obstacles';
import type { MoverDef } from './movers';
import { NetSignals } from './signals';
import { planNetSuburb, makeHill, hillLift } from './netsub';
import { planSuburb, planArms, onArm, type SubDef, type SubData } from './suburb';
import { Net, type NetDef } from './net';
import { planRail, RAIL_CLEAR, RAIL_CITY, type RailPlan } from './rail';
import type { TrafficDef } from './traffic';
import { Bumps, shallowAt, tunnelBoxes, inTunnel, type JumpDef, type FordDef, type TunnelDef } from './features';
import { GridTerrain, ASPHALT, GRAVEL, ICE, SNOW, DEEP_SNOW, WET_ASPHALT, WET_SAND, SOFT_SAND, WOOD, GRASS, COBBLE, FORD, MUD, type Surface } from './physics/terrain';

export interface LevelDef {
  id: string; name: string; world: string; seed: number;
  /** Fassung des Levels: ab 2 heißt der Save-Schlüssel `id#v` (Umbau setzt die Bestzeit dieses Levels zurück) */
  v?: number;
  palette: { sky: string; surfaces: Record<string, string>; tree: string; treeTop: string; rock: string; post: string; star: string; gate: string };
  fog: { color: string; near: number; far: number };
  /** Zeitkonto: Zahl (alle Autos gleich) oder je Auto-Id (Kompakter = hatch; fehlt ein Auto, gilt hatch) */
  time: { budget: number | Partial<Record<string, number>>; starBonus: number };
  chassis?: { setup: string };                       // Fahrwerk-Setup je Welt – Tuning später
  /** Wegweiser-Hinweise: feste Checkpoints (s) und Zonen [s0, s1, Pfeil-Verzögerung s] mit früherem Richtungspfeil (Abzweige) */
  hints?: { cp?: number[]; arrow?: [number, number, number][] };
  terrain: { n: number; cell: number; amp: number; wavelength: number; roadAmp: number; intro: number; smooth?: number; base?: number; /** flache Neigung des ganzen Geländes [dh/dx, dh/dz, Höhe bei 0,0] (Netz-Level: Grundhöhe nähert die Straßenhöhen an) */ tilt?: [number, number, number]; lakes?: { x: number; z: number; r: number; h: number }[] };
  road: { width: number; surface: string; verge: string; points: [number, number][] };
  /** Regenfahrt: 1 = Regen immer (sonst nur in den „Nasser Asphalt“-Abschnitten) */
  rain?: number;
  zones?: { surface: string; s?: [number, number]; circle?: [number, number, number] }[];   // s = nur auf der Straße, circle = überall
  /** Meer: Wasserspiegel `level`; Küste = geneigte Ebene (nx,nz = Richtung zum Meer, d0 = Abstand vom Ursprung, w = Breite der Böschung, depth = Tiefe, wob = Küstenwellen); wet = Höhenband über dem Spiegel mit nassem Sand */
  sea?: { level: number; wet: number; shore: { nx: number; nz: number; d0: number; w: number; depth: number; wob?: number } };
  sun?: { dir: [number, number]; elev: number };      // Richtung (x,z) der Sonne am Horizont, Höhe in Grad
  bridge?: BridgeDef;
  river?: RiverDef;
  /** Altstadt-Bebauung (town.ts) */
  town?: TownDef;
  /** Vorstadt (suburb.ts): Häuser, Wahrzeichen, Ampeln, Schilder, Querstraßen */
  suburb?: SubDef;
  /** Straßennetz (net.ts): Kreuzungen + Straßen, unabhängig von der Strecke; `road.points` ist dann nur der Rennpfad durch das Netz */
  net?: NetDef;
  /** Brücken über Kanten des Netzes (s = Meter ab Knoten a der Kante) */
  bridges?: (BridgeDef & { edge: string })[];
  /** Kulissen mit fester Grundfläche (Kölner Dom aus Klötzen): Mitte, Blickrichtung (rad), Maßstab */
  landmarks?: { kind: 'dom'; x: number; z: number; yaw: number; s: number }[];
  jumps?: JumpDef[]; fords?: FordDef[]; tunnels?: TunnelDef[]; movers?: MoverDef[];
  /** Rand der Welt: 'respawn' = Auto löst sich über der Grenze auf und taucht ~10 m innen neu auf; `edgeBox` [x0,z0,x1,z1] sonst Geländerand − 12 m */
  edge?: 'respawn'; edgeBox?: [number, number, number, number]; edgeCuts?: [number, number, number, number][];
  /** Ausweichbuchten (Verkehr wartet dort, z. B. vor dem Schneepflug) */
  bays?: BayDef[];
  /** Verkehr: Fahrzeuge je km, Anteil Gegenverkehr 0…1, Tempo der Vorausfahrer (m/s) */
  traffic?: TrafficDef;
  city?: { rows: number; gap: [number, number]; height: [number, number]; lampEvery: number; signChance: number;
    /** feste Blöcke (z. B. Kreisel-Inseln): Mitte, halbe Seiten, Höhe */ fixed?: { x: number; z: number; hx: number; hz: number; h: number; yaw?: number }[] };
  objects: {
    stars: [number, number][];
  /** Offroad: Linie Start → Sterne → Ziel für den Jeep (Tests, Werkzeuge, Bilder); sonst fehlt sie */
  jeepLine?: [number, number][];                       // [Strecke s in m, seitlich in m]
    posts: [number, number][] | { every: number; from: number; lateral: number };
    trees?: { count: number; near: number; far: number; kind?: 'palm' | 'mixed' | 'autumn' };
    /** Weinberg-Rebzeilen: Rechtecke [x0,z0,x1,z1], Zeilenabstand, Zeilenrichtung (Grad, 0 = x-Achse) */
    vines?: { rects: [number, number, number, number][]; spacing?: number; yaw?: number };
    /** Burgruinen */
    castles?: { x: number; z: number; yaw: number; s: number }[];
    rocks?: { count: number };
    /** Felskette: Linienzüge [x,z]; Felsen Rand an Rand (lückenlos), Größe 2,2–3,1 – schließen Flächen, damit eine Kehre nicht abzukürzen ist */
    reef?: [number, number][][];
    /** Randmarkierung (Strand): Pfähle alle `every` m im Abstand `lateral` vom Wegrand-Mittelpunkt, nur Optik (ohne Kollision) */
    marks?: { every: number; lateral: number; /** nur zwischen diesen Streckenmetern */ s?: [number, number]; /** Stadt: kurze Poller mit gelber Kappe statt Strandpfähle */ poller?: boolean };
  };
}

export interface Building { x: number; z: number; hx: number; hz: number; yaw: number; h: number; y0: number; tint: number; u0: number; v0: number; tier: number }
export interface Lamp { x: number; z: number; yaw: number; side: number }
export interface Sign { x: number; y: number; z: number; ux: number; uz: number; w: number; h: number; cell: number }
export interface CityData { buildings: Building[]; lamps: Lamp[]; signs: Sign[] }

const brighten = (c: number, k: number) => [16, 8, 0].reduce((a, sh) => a | (Math.min(255, Math.round(((c >> sh) & 255) * k)) << sh), 0);
export const SURFACE_BY_NAME: Record<string, Surface> = {
  Asphalt: ASPHALT, Schotter: GRAVEL, Eis: ICE, Schnee: SNOW, Tiefschnee: DEEP_SNOW, 'Nasser Asphalt': WET_ASPHALT,
  'Nasser Sand': WET_SAND, 'Weicher Sand': SOFT_SAND, Holz: WOOD, Gras: GRASS, Kopfstein: COBBLE, Furt: FORD, Matsch: MUD,
};

// ── Zufall / Rauschen ──
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash2 = (x: number, y: number, seed: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const fade = (t: number) => t * t * (3 - 2 * t);
export function noise2(x: number, y: number, seed: number): number {   // −1…1
  const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) * 2 - 1;
}
export const fbm = (x: number, y: number, seed: number) => (noise2(x, y, seed) + 0.5 * noise2(x * 2.1, y * 2.1, seed + 1) + 0.25 * noise2(x * 4.3, y * 4.3, seed + 2)) / 1.75;
/** Ausweichbucht: Straße auf der Seite `side` (+1 = links in Fahrtrichtung = Gegenspur) von s0 bis s1 um w m verbreitert, davor/dahinter über `taper` m auslaufend */
export interface BayDef { s0: number; s1: number; side: 1 | -1; w: number; taper: number }
/** 0…1: wie weit die Bucht bei s ausgeformt ist */
export const bayRamp = (b: BayDef, s: number): number => { const up = Math.min(1, Math.max(0, (s - (b.s0 - b.taper)) / b.taper)), dn = Math.min(1, Math.max(0, (b.s1 + b.taper - s) / b.taper)); return up * up * (3 - 2 * up) * (dn * dn * (3 - 2 * dn)); };
const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── Straße: Catmull-Rom-Spline, auf 1 m Stützstellen umgerechnet ──
export interface NearHit { s: number; d: number; lat: number }

export class Route {
  readonly x: Float64Array; readonly z: Float64Array; readonly s: Float64Array; readonly length: number; readonly step = 1;
  private grids = new Map<number, Map<number, number[]>>(); private gridC = 16;

  constructor(pts: [number, number][]) {
    const P = [pts[0], ...pts, pts[pts.length - 1]];
    const dx: number[] = [], dz: number[] = [];
    for (let i = 0; i < P.length - 3; i++) {
      const [p0, p1, p2, p3] = [P[i], P[i + 1], P[i + 2], P[i + 3]];
      const n = Math.max(8, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2));
      // zentripetaler Catmull-Rom (alpha 0,5, Barry-Goldman): keine Spitzen/Schleifen bei ungleichen Stützabständen (lange Gerade + enge Kurve)
      const kn = (a: [number, number], b: [number, number]) => Math.max(1e-3, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
      const t0 = 0, t1 = t0 + kn(p0, p1), t2 = t1 + kn(p1, p2), t3 = t2 + kn(p2, p3);
      for (let k = 0; k < n; k++) {
        const t = t1 + (t2 - t1) * (k / n);
        const mix = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => { const u = (t - ta) / (tb - ta); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
        const a1 = mix(p0, p1, t0, t1), a2 = mix(p1, p2, t1, t2), a3 = mix(p2, p3, t2, t3);
        const b1 = mix(a1, a2, t0, t2), b2 = mix(a2, a3, t1, t3);
        const c = mix(b1, b2, t1, t2);
        dx.push(c[0]); dz.push(c[1]);
      }
    }
    dx.push(pts[pts.length - 1][0]); dz.push(pts[pts.length - 1][1]);
    const cum = [0];
    for (let i = 1; i < dx.length; i++) cum.push(cum[i - 1] + Math.hypot(dx[i] - dx[i - 1], dz[i] - dz[i - 1]));
    this.length = cum[cum.length - 1];
    const N = Math.floor(this.length) + 1;
    this.x = new Float64Array(N + 1); this.z = new Float64Array(N + 1); this.s = new Float64Array(N + 1);
    let j = 0;
    for (let i = 0; i <= N; i++) {
      const sv = i < N ? i : this.length;
      while (j < cum.length - 2 && cum[j + 1] < sv) j++;
      const u = (sv - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      this.x[i] = dx[j] + (dx[j + 1] - dx[j]) * u; this.z[i] = dz[j] + (dz[j + 1] - dz[j]) * u; this.s[i] = sv;
    }
  }
  get n(): number { return this.x.length; }

  /** Punkt + Fahrtrichtung bei Strecke s (m) */
  at(s: number): { x: number; z: number; dx: number; dz: number } {
    const c = Math.min(Math.max(s, 0), this.length), i = Math.min(Math.floor(c), this.n - 2), u = (c - this.s[i]) / Math.max(1e-9, this.s[i + 1] - this.s[i]);
    const ax = this.x[i], az = this.z[i], bx = this.x[i + 1], bz = this.z[i + 1], l = Math.hypot(bx - ax, bz - az) || 1;
    return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, dx: (bx - ax) / l, dz: (bz - az) / l };
  }
  yawAt(s: number): number { const a = this.at(s); return Math.atan2(-a.dx, -a.dz); }
  /** Punkt seitlich neben der Straße (lat > 0 = links in Fahrtrichtung) */
  offset(s: number, lat: number): [number, number] { const a = this.at(s); return [a.x + a.dz * lat, a.z - a.dx * lat]; }

  private seg(i: number, px: number, pz: number): NearHit {
    const ax = this.x[i], az = this.z[i], ex = this.x[i + 1] - ax, ez = this.z[i + 1] - az;
    const l2 = ex * ex + ez * ez || 1e-9;
    const u = Math.min(1, Math.max(0, ((px - ax) * ex + (pz - az) * ez) / l2));
    const qx = ax + ex * u, qz = az + ez * u, d = Math.hypot(px - qx, pz - qz);
    const cross = ex * (pz - az) - ez * (px - ax);
    return { s: this.s[i] + (this.s[i + 1] - this.s[i]) * u, d, lat: cross < 0 ? d : -d };
  }
  /** nächster Punkt; mit hint (m) nur im Fenster ±win, sonst überall */
  nearest(px: number, pz: number, hint?: number, win = 60): NearHit {
    let lo = 0, hi = this.n - 2;
    if (hint !== undefined) { lo = Math.max(0, Math.floor(hint - win)); hi = Math.min(this.n - 2, Math.ceil(hint + win)); }
    let best: NearHit = { s: 0, d: Infinity, lat: 0 };
    for (let i = lo; i <= hi; i++) { const h = this.seg(i, px, pz); if (h.d < best.d) best = h; }
    if (hint !== undefined && best.d > 25) return this.nearest(px, pz);
    return best;
  }
  /** Raster für schnelle Abfragen bis Radius R (Geländebau, Baumverteilung) */
  nearestWithin(px: number, pz: number, R: number): NearHit | null {
    let grid = this.grids.get(R);
    if (!grid) {
      const g = new Map<number, number[]>(), c = this.gridC;
      for (let i = 0; i < this.n - 1; i++) {
        const x0 = Math.min(this.x[i], this.x[i + 1]) - R, x1 = Math.max(this.x[i], this.x[i + 1]) + R;
        const z0 = Math.min(this.z[i], this.z[i + 1]) - R, z1 = Math.max(this.z[i], this.z[i + 1]) + R;
        for (let cz = Math.floor(z0 / c); cz <= Math.floor(z1 / c); cz++) for (let cx = Math.floor(x0 / c); cx <= Math.floor(x1 / c); cx++) {
          const k = cx * 100003 + cz; const a = g.get(k); if (a) a.push(i); else g.set(k, [i]);
        }
      }
      grid = g; this.grids.set(R, g);
    }
    const l = grid.get(Math.floor(px / this.gridC) * 100003 + Math.floor(pz / this.gridC));
    if (!l) return null;
    let bi = -1, bd = Infinity;   // ohne Objekt je Segment (heißer Pfad beim Geländebau); Ergebnis über `seg` des besten Segments
    const X = this.x, Z = this.z;
    for (let k = 0; k < l.length; k++) {
      const i = l[k], ax = X[i], az = Z[i], ex = X[i + 1] - ax, ez = Z[i + 1] - az, l2 = Math.max(1e-9, ex * ex + ez * ez);
      const u = Math.min(1, Math.max(0, ((px - ax) * ex + (pz - az) * ez) / l2)), dx = px - (ax + ex * u), dz = pz - (az + ez * u), d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    if (bi < 0) return null;
    const best = this.seg(bi, px, pz);
    return best.d <= R ? best : null;
  }
}

/** Fortschritt entlang der Straße (Position des Autos auf dem Spline) */
export class Tracker {
  s = 0; maxS = 0; lat = 0; d = 0;
  private fresh = true;
  constructor(private route: Route) {}
  update(x: number, z: number): number {
    const h = this.route.nearest(x, z, this.fresh ? undefined : this.s);
    this.fresh = false;
    this.s = h.s; this.lat = h.lat; this.d = h.d;
    if (h.s > this.maxS) this.maxS = h.s;
    return h.s;
  }
  reset(): void { this.s = 0; this.maxS = 0; this.fresh = true; }
}

// ── Level → Spielwelt ──
export interface Course {
  id: string; saveKey: string; name: string; world: string;
  route: Route; terrain: GridTerrain; length: number; roadWidth: number;
  /** Straßennetz (Vorstadt) oder null; die Route ist dann ein Pfad darin */
  net: Net | null;
  /** alle Brücken (Netz-Level: mehrere; sonst höchstens `bridge`) */
  bridges: Bridge[];
  /** Brückendecks als Streckenmeter [s0, s1] der Route (Checkpoints, Tests) */
  bridgeSpans: [number, number][];
  start: { x: number; z: number; yaw: number };
  goal: { s: number; x: number; z: number; yaw: number } | null;
  stars: [number, number][];
  /** Offroad: Linie Start → Sterne → Ziel für den Jeep (Tests, Werkzeuge, Bilder); sonst fehlt sie */
  jeepLine?: [number, number][];
  /** Offroad: Gabelungen – zusätzliche Äste (sichere Linien), je ein Route von der Gabel (Hauptweg-s `a`) bis zur Mündung (`b`); der gute Weg bleibt die riskante Linie */
  branches?: { route: Route; a: number; b: number }[];
  /** Offroad mit Ästen: Kran-Rückstellpunkt am nächsten Punkt irgendeines Asts (statt am weitesten Punkt des guten Wegs) */
  recoverAt?: (x: number, z: number) => { x: number; z: number; yaw: number };
  posts: [number, number][];
  trees: { x: number; z: number; s: number }[];
  rocks: { x: number; z: number; s: number; yaw: number }[];
  /** Randmarkierung: Pfähle ohne Kollision; side +1 = links in Fahrtrichtung */
  marks?: { x: number; z: number; side: 1 | -1; k: number; poller: boolean }[];
  city: CityData | null;
  bridge: Bridge | null;
  sea: { level: number } | null;
  sun: { dx: number; dz: number; elev: number } | null;
  treeKind: 'fir' | 'palm' | 'mixed' | 'autumn';
  /** Vorstadt: Bebauung, Ampeln, Schilder */
  suburb: SubData | null;
  /** Ampeln am Straßennetz: Schaltung für Mesh, Spieler und Verkehr */
  signals: NetSignals | null;
  river: River | null;
  jumps: JumpDef[]; fords: FordDef[]; tunnels: TunnelDef[]; moverDefs: MoverDef[]; rails: RailPlan[]; traffic: TrafficDef | null;
  /** Rand-Rechteck (nur wenn das Level `edge: 'respawn'` hat) */
  edge?: EdgeRect;
  bays: BayDef[]; /** zusätzliche Straßenbreite (m) auf der Seite side bei Streckenmeter s */ bayExt: (s: number, side: number) => number;
  /** Zähigkeit des flachen Wassers (Furt) an (x,z), sonst 0 */
  shallowAt: (x: number, z: number) => number;
  /** Wasserspiegel an (x,z) oder -1e9 (Fluss, Kanal) */
  waterAt: (x: number, z: number) => number;
  /** Rebzeilen-Stücke [x, z, yaw] */
  vines: [number, number, number][];
  castles: { x: number; z: number; yaw: number; s: number }[];
  landmarks: { kind: 'dom'; x: number; z: number; yaw: number; s: number }[];
  /** Regen: immer (Regenfahrt) bzw. s-Bereiche der „Nasser Asphalt“-Zonen */
  rainAlways: boolean; rainS: [number, number][];
  /** Altstadt-Häuser (Kölner Ufer) */
  town: TownHouse[];
  /** Strecken-Abschnitte (s von…bis) mit sichtbarem Holzsteg */
  boardwalk: [number, number][];
  /** feste Hindernisse (Grundriss): Kreise (zuerst die Bäume, gleicher Index, dann Felsen) und gedrehte Rechtecke */
  obstacles: { circles: Circle[]; boxes: Box[] };
  /** Offroad: freie Wegwahl – nur Start und Ziel (Treffer im Umkreis des Ziels), keine Checkpoints; die Route ist der unsichtbare „gute Weg“ */
  free?: boolean;
  /** Offroad Furtwald: Bach (Mittellinie, Halbbreite der Rinne, Uferweichheit je x, Uferhöhe je Streckenmeter) und Baumstämme (Mitte, Richtung, Länge, Radius) */
  brook?: { route: Route; w: number; soft: (x: number) => number; yc: (s: number) => number } | null;
  logs?: { x: number; z: number; yaw: number; len: number; r: number }[];
  /** Stimmung (Moorwald): dunklerer Himmel (Zenit/Mitte/Hügelring) und gedämpftes Licht (Faktor auf Himmels-/Sonnenlicht) */
  mood?: { zenith: number; mid: number; ringTop: number; light: number };
  timeBudget: number; starBonus: number;
  hints: { cp: number[]; arrow: [number, number, number][] };
  /** Zeitkonto je Auto-Id (nur wenn das Level je Auto ein Konto hat); sonst gilt timeBudget */
  timeBudgets?: Partial<Record<string, number>>;
  chassis: { setup: string };
  surfaceColors: number[];       // je Untergrund-Id
  /** Untergrund-Id je Zelle fürs Geländemesh (unter der Straße = Rand) und Straßenbelag je Streckenmeter; fehlt = kein Straßenband */
  meshSurf?: Uint8Array; roadSurfAt?: (s: number) => Surface;
  sky: number; fog: { color: number; near: number; far: number };
  colors: { tree: number; treeTop: number; rock: number; post: number; star: number; gate: number };
  /** Rückstellpunkt nach ↺ (null = an Ort und Stelle) */
  recover: (s: number) => { x: number; z: number; yaw: number } | null;
}

export const saveKeyOf = (d: { id: string; v?: number }) => ((d.v ?? 1) > 1 ? `${d.id}#${d.v}` : d.id);
/** Zeitkonto des gewählten Autos (Übungsplatz, Kaffee-Modus: unverändert hatch-Wert) */
export const timeBudgetFor = (c: Course, carId: string): number => c.timeBudgets?.[carId] ?? c.timeBudget;
/** Dom-Grundflächen lokal (x = Querschiff-Richtung, z = Längsachse; Westwerk mit den Türmen bei z<0): Langhaus, Chor, Querhaus, 2 Türme */
export const DOM_FOOT: [number, number, number, number][] = [[0, 8, 14, 38], [0, 18, 21, 8], [0, -34, 21, 11], [0, 58, 9, 8]];
const hex = (c: string) => parseInt(c.replace('#', ''), 16);

export function buildCourse(def: LevelDef): Course {
  const route = new Route(def.road.points);
  const T = def.terrain, half = def.road.width / 2, R = 30;
  const river = def.river ? new River(def.river) : null;
  const roadSurf = SURFACE_BY_NAME[def.road.surface], vergeSurf = SURFACE_BY_NAME[def.road.verge];
  const seed = def.seed | 0;
  const noiseH = (x: number, z: number) => T.amp * fbm(x / T.wavelength + 11, z / T.wavelength + 7, seed);
  // Höhenprofil der Straße: Geländehöhe entlang des Splines, zweimal geglättet (Fenster ±40 m), sanfter Einstieg
  const W = T.smooth ?? 40;
  const prof = new Float64Array(route.n), val = new Float64Array(route.n);
  for (let i = 0; i < route.n; i++) { prof[i] = noiseH(route.x[i], route.z[i]) * smooth(0, T.intro, route.s[i]);
    if (river) { const rd = river.dist(route.x[i], route.z[i]); prof[i] *= smooth(river.width / 2 + 10, river.width / 2 + 70, rd); val[i] = river.roadProfile(rd); } }
  for (let pass = 0; pass < 2; pass++) {
    for (const arr of river ? [prof, val] : [prof]) {
      const src = Float64Array.from(arr);
      for (let i = 0; i < route.n; i++) { let a = 0, c = 0; for (let k = -W; k <= W; k++) { const j = i + k; if (j >= 0 && j < route.n) { a += src[j]; c++; } } arr[i] = a / c; }
    }
  }
  for (let i = 0; i < route.n; i++) prof[i] = prof[i] * T.roadAmp + (T.base ?? 0) + val[i];
  const profAt = (s: number) => { const c = Math.min(Math.max(s, 0), route.length), i = Math.min(Math.floor(c), route.n - 2); return prof[i] + (prof[i + 1] - prof[i]) * (c - route.s[i]); };

  const arms = planArms(def.suburb, route, half);   // Querstraßen der Vorstadt (Asphalt neben der Strecke)
  const bays = def.bays ?? [], bayExt = (s: number, side: number): number => { let e = 0; for (const b of bays) if (b.side === side) e = Math.max(e, b.w * bayRamp(b, s)); return e; };
  const maxBay = bays.reduce((m, b) => Math.max(m, b.w), 0);
  /** auf der Straße (inkl. Buchten)? bay = nur in der Bucht, nicht auf der Normalbreite */
  const roadHit = (x: number, z: number): { h: NearHit; bay: boolean } | null => {
    const h = route.nearestWithin(x, z, half);
    if (h) return { h, bay: false };
    if (!maxBay) return null;
    const g = route.nearestWithin(x, z, half + maxBay);
    return g && g.d <= half + bayExt(g.s, g.lat > 0 ? 1 : -1) ? { h: g, bay: true } : null;
  };
  const net = def.net ? new Net(def.net) : null;
  const bridge = def.bridge ? new Bridge(def.bridge, route, half, profAt, river) : null;
  const bridges: Bridge[] = bridge ? [bridge] : [];
  for (const b of def.bridges ?? []) {   // Brücken auf Netzkanten: Deck mit der Kante als Strecke; unter dem Deck wirkt die Straßenhöhe nicht aufs Gelände
    const ed = net!.edge(b.edge), br = new Bridge(b, ed.route, ed.half, (s) => ed.elev(s), river);
    ed.deck.push([br.s0 + 6, br.s1 - 6]); bridges.push(br);
  }
  const bridgeSpans: [number, number][] = net ? bridges.map((b): [number, number] => { let best = 1e9, bs = 0; for (let q = 0; q <= route.length; q += 2) { const p = route.at(q), d = Math.hypot(p.x - b.cx, p.z - b.cz); if (d < best) { best = d; bs = q; } } return [bs - b.def.len / 2, bs + b.def.len / 2]; }) : bridge ? [[bridge.s0, bridge.s1]] : [];
  /** (x,z) liegt auf Fahrbahn/Kreuzung des Netzes bzw. der Strecke (Rand m dazu) */
  const nearRoad = (x: number, z: number, m: number): boolean => net ? net.onRoad(x, z, m) : !!route.nearestWithin(x, z, half + m);
  const sh = def.sea?.shore, lvl = def.sea?.level ?? -1e9, wet = def.sea?.wet ?? 0;
  const tilt = (x: number, z: number): number => T.tilt ? T.tilt[0] * x + T.tilt[1] * z + T.tilt[2] : 0;
  const hill = net && def.suburb?.hill ? makeHill(net, def.suburb.hill) : null;
  const height = (x: number, z: number): number => {
    let rdv = 1e9;
    const h = net ? null : route.nearestWithin(x, z, R), nn = net ? net.nearest(x, z) : null;
    const d = net ? (nn ? nn.d : 99) : h ? h.d : 1e9;
    let y: number;
    if (net) {   // Netzlevel: Gelände = glatte Interpolation der Straßenhöhen, ohne Noise/Tilt; Au-Niederung eben
      const nb = net.blend(x, z); y = nb ? nb.y : 0.4;
      if (river) {   // Au-Niederung eben; an Straßen (außer unter dem Brückendeck) bleibt das Gelände bündig auf Fahrbahnhöhe
        rdv = river.dist(x, z); let k = 1 - smooth(river.width / 2 + 5, river.width / 2 + 12, rdv);
        if (k > 0) { let prot = 0; for (const q of net.hits(x, z, 14)) if (!q.edge.onDeck(q.s)) prot = Math.max(prot, 1 - smooth(q.edge.half + 2.5, q.edge.half + 10, q.d)); k *= 1 - prot; }
        y += (river.profile(rdv) - y) * k;
      }
      if (hill) y += hillLift(net, hill, x, z);
    }
    else if (river) { const rd = rdv = river.dist(x, z); y = river.profile(rd) + noiseH(x, z) * (0.3 + 0.7 * smooth(15, 90, d)) * smooth(river.width / 2 + 10, river.width / 2 + 70, rd) + ((T.base ?? 0) + tilt(x, z)); }
    else y = noiseH(x, z) * (0.3 + 0.7 * smooth(15, 90, d)) + ((T.base ?? 0) + tilt(x, z));
    if (sh) { const sd = sh.nx * x + sh.nz * z - sh.d0 + (sh.wob ?? 0) * fbm((-sh.nz * x + sh.nx * z) / 140 + 3, 0.5, seed + 9); y -= sh.depth * smooth(0, sh.w, sd); }
    // unter dem Brückendeck bleibt das Flussbett; an den Brückenenden trägt das Straßenprofil noch 2 Rasterzellen weit (knapp unter dem Deck), sonst reißt die Rasterinterpolation ein Loch vor die Deckkante
    const ap = 2 * T.cell, inBr = bridge !== null && h !== null && h.s > bridge.s0 + ap && h.s < bridge.s1 - ap;
    if (h && !inBr) y += (profAt(h.s) - (bridge && h.s > bridge.s0 && h.s < bridge.s1 ? 0.06 : 0) - y) * (1 - smooth(half + 1.5 + (maxBay ? bayExt(h.s, h.lat > 0 ? 1 : -1) : 0), R, h.d));
    for (const b of bridges) y = b.carve(x, z, y);
    for (const L of T.lakes ?? []) { const dl = Math.hypot(x - L.x, z - L.z); y += (L.h - y) * (1 - smooth(L.r, L.r + 25, dl)); }
    return y;
  };
  const surfFn = (x: number, z: number): Surface => {
    for (const zn of def.zones ?? []) if (zn.circle && Math.hypot(x - zn.circle[0], z - zn.circle[1]) <= zn.circle[2]) return SURFACE_BY_NAME[zn.surface];
    if (net) { const n = net.surfAt(x, z); return n ? SURFACE_BY_NAME[n] : vergeSurf; }
    const rh = roadHit(x, z);
    if (!rh) return arms.length && onArm(arms, x, z) ? ASPHALT : vergeSurf;
    if (rh.bay) return SURFACE_BY_NAME.Asphalt;      // freigeräumte Bucht
    const h = rh.h;
    for (const f of def.fords ?? []) if (h.s >= f.s0 && h.s <= f.s1) return FORD;
    for (const zn of def.zones ?? []) if (zn.s && h.s >= zn.s[0] && h.s <= zn.s[1]) return SURFACE_BY_NAME[zn.surface];
    return roadSurf;
  };
  const terrain = new GridTerrain(T.n, T.cell, height, surfFn);
  if (bridges.length) terrain.deck = (x, z) => { for (const b of bridges) { const v = b.height(x, z); if (v !== null) return v; } return null; };
  const jumps = def.jumps ?? [], fords = def.fords ?? [], tunnels = def.tunnels ?? [];
  if (jumps.length || fords.length) terrain.bump = new Bumps(route, half, jumps, fords);
  // Farben fürs Geländemesh: Zellen unter der Straße bekommen die Randfarbe – die Straße selbst zeichnet ein glattes Band (buildRoadMesh), sonst treppt der Rand in Zellgröße
  const meshSurf = Uint8Array.from(terrain.surf);
  const roadCell = new Uint8Array(meshSurf.length);   // Zellen unter der Straße: Meer/Fluss-Saum darf ihren Straßenbelag nie überschreiben (Zone „Weicher Sand“ = Randbelag)
  {
    const m = T.n - 1;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const x = (i + 0.5) * T.cell - terrain.half, z = (j + 0.5) * T.cell - terrain.half;
      if ((def.zones ?? []).some((zn) => zn.circle && Math.hypot(x - zn.circle[0], z - zn.circle[1]) <= zn.circle[2])) continue;
      if (net ? net.onRoad(x, z) : roadHit(x, z)) { meshSurf[j * m + i] = vergeSurf.id; roadCell[j * m + i] = 1; }
    }
  }
  if (def.sea) {   // Küste: Seeboden = weicher Sand, schmaler Streifen darüber = nasser Sand (nur dort, wo sonst Verge-Untergrund läge)
    const m = T.n - 1, tn = T.n;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const y = (terrain.h[j * tn + i] + terrain.h[j * tn + i + 1] + terrain.h[(j + 1) * tn + i] + terrain.h[(j + 1) * tn + i + 1]) / 4;
      const sea = y < lvl ? SOFT_SAND.id : y < lvl + wet ? WET_SAND.id : -1;
      if (sea < 0) continue;
      if (terrain.surf[j * m + i] === vergeSurf.id && !roadCell[j * m + i]) terrain.surf[j * m + i] = sea;
      if (meshSurf[j * m + i] === vergeSurf.id) meshSurf[j * m + i] = sea;
    }
  }
  const roadSurfAt = (s: number): Surface => {
    if (net) { const p = route.at(s), n = net.surfAt(p.x, p.z); return n ? SURFACE_BY_NAME[n] : roadSurf; }
    for (const f of fords) if (s >= f.s0 && s <= f.s1) return FORD;
    for (const zn of def.zones ?? []) if (zn.s && s >= zn.s[0] && s <= zn.s[1]) return SURFACE_BY_NAME[zn.surface];
    return roadSurf;
  };

  if (river) {   // Flussbett = weicher Sand, Ufersaum = nasser Sand (nur wo sonst Verge-Untergrund läge)
    const m = T.n - 1, tn = T.n;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      if (terrain.surf[j * m + i] !== vergeSurf.id || roadCell[j * m + i]) continue;
      const y = (terrain.h[j * tn + i] + terrain.h[j * tn + i + 1] + terrain.h[(j + 1) * tn + i] + terrain.h[(j + 1) * tn + i + 1]) / 4;
      if (y < river.level) terrain.surf[j * m + i] = SOFT_SAND.id; else if (y < river.level + 0.5) terrain.surf[j * m + i] = WET_SAND.id;
      if (river.bank > 1.5 && y < river.level + river.bank - 0.4 && meshSurf[j * m + i] === vergeSurf.id && !!def.palette.surfaces['Kopfstein']) meshSurf[j * m + i] = COBBLE.id;   // Ufermauer: Steinfarbe (nur Optik)
    }
  }

  const O = def.objects;
  const stars = O.stars.map(([s, lat]) => route.offset(s, lat));
  let posts: [number, number][] = [];
  if (Array.isArray(O.posts)) posts = O.posts.map(([s, lat]) => route.offset(s, lat));
  else for (let s = O.posts.from; s < route.length - 12; s += O.posts.every) posts.push(route.offset(s, O.posts.lateral + bayExt(s, 1)), route.offset(s, -O.posts.lateral - bayExt(s, -1)));

  if (bridge) posts = posts.filter(([x, z]) => !bridge.inCanal(x, z, 3));
  if (tunnels.length) posts = posts.filter(([x, z]) => !inTunnel(tunnels, route.nearest(x, z).s, 6));
  const r = rng(seed * 7919 + 13), lim = terrain.half - 4;
  const inVine = (x: number, z: number) => (O.vines?.rects ?? []).some(([a, b, c, d]) => x > Math.min(a, c) - 3 && x < Math.max(a, c) + 3 && z > Math.min(b, d) - 3 && z < Math.max(b, d) + 3);
  const inTun = (x: number, z: number) => tunnels.length > 0 && tunnels.some((t) => { const h = route.nearestWithin(x, z, 24); return h !== null && h.s >= t.s0 - 8 && h.s <= t.s1 + 8; });
  const inLake = (x: number, z: number) => inTun(x, z) || (T.lakes ?? []).some((L) => Math.hypot(x - L.x, z - L.z) < L.r + 12) || (river !== null && river.dist(x, z) < river.width / 2 + 14) || inVine(x, z) || (O.castles ?? []).some((c) => Math.hypot(x - c.x, z - c.z) < 22 * c.s);
  const trees: Course['trees'] = [];
  if (O.trees) {
    let guard = 0;
    while (trees.length < O.trees.count && guard++ < O.trees.count * 40) {
      let x: number, z: number;
      if (!net && r() < 0.7) { const a = route.at(r() * route.length), lat = (r() < 0.5 ? -1 : 1) * (half + O.trees.near + r() * (O.trees.far - O.trees.near)); x = a.x + a.dz * lat; z = a.z - a.dx * lat; }
      else { x = (r() * 2 - 1) * lim; z = (r() * 2 - 1) * lim; }
      if (Math.abs(x) > lim || Math.abs(z) > lim || inLake(x, z) || (def.sea && terrain.height(x, z) < lvl + 0.8)) continue;
      if (nearRoad(x, z, O.trees.near)) continue;
      trees.push({ x, z, s: 0.75 + r() * 0.8 });
    }
  }
  const rocks: Course['rocks'] = [];
  if (O.rocks) {
    let guard = 0;
    while (rocks.length < O.rocks.count && guard++ < O.rocks.count * 40) {
      const a = route.at(r() * route.length), lat = (r() < 0.5 ? -1 : 1) * (half + 9 + r() * 30);
      const x = a.x + a.dz * lat, z = a.z - a.dx * lat;
      if (Math.abs(x) > lim || Math.abs(z) > lim || inLake(x, z) || (def.sea && terrain.height(x, z) < lvl + 0.8) || route.nearestWithin(x, z, half + 8)) continue;
      rocks.push({ x, z, s: 0.8 + r() * 1.6, yaw: r() * 6.28 });
    }
  }
  // Felskette: eigener Zufall, damit Reef und Streuung sich nicht gegenseitig verschieben
  if (O.reef) {
    const rr = rng(seed * 104729 + 7);
    for (const line of O.reef) for (let i = 0; i + 1 < line.length; i++) {
      const [x0, z0] = line[i], [x1, z1] = line[i + 1], L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      let u = 0;
      while (u < L) {
        const s = 2.2 + rr() * 0.9, lat = (rr() - 0.5) * 1.0, x = x0 + ux * u - uz * lat, z = z0 + uz * u + ux * lat;
        if (!(def.sea && terrain.height(x, z) < lvl - 0.6) && Math.abs(x) < lim && Math.abs(z) < lim) rocks.push({ x, z, s, yaw: rr() * 6.28 });
        u += s * 1.6;   // Kreis r = 1,0·s: Abstand 1,6·s < s + s_nachbar (≥ 4,4 vs ≤ 5,0 bei 2,2…3,1) = lückenlos
      }
    }
  }

  // Altstadt: Häuser planen (eigener Zufall), Bäume/Felsen darin entfernen, Grundrisse = feste Rechtecke
  const dom0 = (def.landmarks ?? [])[0] ?? null;
  // Gleiskorridor frei halten: Häuser/Laternen im Gleisbereich ±RAIL_CITY m um die Straße entfallen, damit der Zug nicht aus einem Gebäude kommt
  const railLines = (def.movers ?? []).filter((d) => d.kind === 'crossing').map((d) => { const a = route.at(d.s); return { x: a.x, z: a.z, kx: -a.dz, kz: a.dx }; });
  const onRailLine = (o: { x: number; z: number; hx?: number; hz?: number; yaw?: number }, pad: number) => railLines.some((p) => {
    for (let u = -RAIL_CITY; u <= RAIL_CITY; u += 1) { const x = p.x + p.kx * u, z = p.z + p.kz * u; if (o.hx === undefined) { if (Math.hypot(x - o.x, z - o.z) < RAIL_CLEAR + pad) return true; } else { const cs = Math.cos(o.yaw!), sn = Math.sin(o.yaw!), dx = x - o.x, dz = z - o.z; if (Math.abs(cs * dx - sn * dz) < o.hx + RAIL_CLEAR + pad && Math.abs(sn * dx + cs * dz) < o.hz! + RAIL_CLEAR + pad) return true; } }
    return false;
  });
  const town: TownHouse[] = def.town ? planTown(def.town, { route, half, lim, river, bridgeS: def.bridge?.s ?? null, dom: dom0, seed, height: (x, z) => terrain.height(x, z) }) : [];
  for (let i = town.length - 1; i >= 0; i--) if (onRailLine(town[i], 0)) town.splice(i, 1);
  if (town.length) {
    const inHouse = (x: number, z: number, m: number) => town.some((h) => { const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw), dx = x - h.x, dz = z - h.z; return Math.abs(cs * dx - sn * dz) < h.hx + m && Math.abs(sn * dx + cs * dz) < h.hz + m; });
    const onPlaza = (x: number, z: number) => { if (!dom0 || !def.town?.dom) return false; const cs = Math.cos(dom0.yaw), sn = Math.sin(dom0.yaw), lx = cs * (x - dom0.x) - sn * (z - dom0.z), lz = sn * (x - dom0.x) + cs * (z - dom0.z); return Math.abs(lx) < 34 * dom0.s && lz > -112 * dom0.s && lz < 80 * dom0.s; };
    if (def.palette.surfaces['Kopfstein']) {   // gepflasterter Grund um die Häuser (nur Optik, Farbe des Geländemeshs)
      const m = T.n - 1;
      for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) if (!roadCell[j * m + i] && meshSurf[j * m + i] === vergeSurf.id && (inHouse((i + 0.5) * T.cell - terrain.half, (j + 0.5) * T.cell - terrain.half, 8) || onPlaza((i + 0.5) * T.cell - terrain.half, (j + 0.5) * T.cell - terrain.half))) meshSurf[j * m + i] = COBBLE.id;
    }
    for (let i = trees.length - 1; i >= 0; i--) if (inHouse(trees[i].x, trees[i].z, 3)) trees.splice(i, 1);
    for (let i = rocks.length - 1; i >= 0; i--) if (inHouse(rocks[i].x, rocks[i].z, 3)) rocks.splice(i, 1);
  }
  // Vorstadt: Bebauung planen, Bäume/Felsen in Häusern entfernen, Straßenbäume + Parkbäume ergänzen
  // Netzampeln: Start-Zufahrt = Knoten nahe dem Start, Arm in Richtung Start (bei t = 0 grün)
  let signals: NetSignals | null = null;
  if (net && net.junctions.some((n) => n.signal)) {
    const p0 = route.at(6); let sg: { node: string; edge: string } | undefined, bd = 1e9;
    for (const n of net.junctions) if (n.signal) { const d = Math.hypot(n.x - p0.x, n.z - p0.z); if (d < bd) { bd = d; const ux = (p0.x - n.x) / (d || 1), uz = (p0.z - n.z) / (d || 1); let bc = -2; for (const e of n.edges) { const o = n.dirOut(e), c = o[0] * ux + o[1] * uz; if (c > bc) { bc = c; sg = { node: n.id, edge: e.edge.id }; } } } }
    signals = new NetSignals(net, { startGreen: sg });
  }
  const sub: SubData | null = def.suburb ? planSuburb(def.suburb, { route, half, lim, seed }) : null;
  if (sub && net && def.suburb!.net) {   // Bebauung, Gehwege, Alleen, Hang aus dem Netz
    const r = planNetSuburb(sub, { net, lim, seed, river, keepOut: (signals?.heads ?? []).map((h): [number, number, number] => [h.x, h.z, 2.5]), reserve: def.suburb!.reserve, landmarks: def.suburb!.landmarks }, hill);
    sub.walks = r.walks; sub.hill = r.hill;
  }
  if (sub) {
    const inSub = (x: number, z: number, m: number) => sub.houses.some((h) => { const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw), dx = x - h.x, dz = z - h.z; return Math.abs(cs * dx - sn * dz) < h.hx + m && Math.abs(sn * dx + cs * dz) < h.hz + m; });
    const wet = (x: number, z: number) => bridges.some((b) => b.inCanal(x, z, 4)) || fords.some((f) => { const h = route.nearestWithin(x, z, half + 22); return h !== null && h.s >= f.s0 - 8 && h.s <= f.s1 + 8; });
    for (let i = trees.length - 1; i >= 0; i--) if (inSub(trees[i].x, trees[i].z, 3) || wet(trees[i].x, trees[i].z) || onArm(sub.arms, trees[i].x, trees[i].z, 3)) trees.splice(i, 1);
    for (let i = rocks.length - 1; i >= 0; i--) if (inSub(rocks[i].x, rocks[i].z, 3)) rocks.splice(i, 1);
    for (const t of sub.trees) if (!wet(t.x, t.z) && !inSub(t.x, t.z, 2) && Math.abs(t.x) < lim && Math.abs(t.z) < lim) trees.push({ x: t.x, z: t.z, s: t.s });
  }
  const circles: Circle[] = [
    ...trees.map((t) => ({ x: t.x, z: t.z, r: (O.trees?.kind === 'palm' ? 0.4 : 0.7) * t.s, wobble: true })),
    ...rocks.map((k) => ({ x: k.x, z: k.z, r: 1.0 * k.s, e: 0.25 })),
  ];
  const boxes: Box[] = [];
  for (const t of tunnels) boxes.push(...tunnelBoxes(route, half, t));
  let city: CityData | null = null;
  if (def.city) {
    city = buildCity(def, route, terrain, half, lim, r, bridge);
    city.buildings = city.buildings.filter((b) => !onRailLine(b, 0)); city.lamps = city.lamps.filter((l) => !onRailLine(l, 0.3));
    for (const b of city.buildings) boxes.push({ x: b.x, z: b.z, hx: b.hx, hz: b.hz, yaw: b.yaw });
    for (const l of city.lamps) circles.push({ x: l.x, z: l.z, r: 0.3, e: 0.3 });
  }

  if (signals) for (const h of signals.heads) circles.push({ x: h.x, z: h.z, r: 0.3, e: 0.2 });
  if (sub) {
    for (const h of sub.houses) boxes.push({ x: h.x, z: h.z, hx: h.hx, hz: h.hz, yaw: h.yaw });
    for (const l of sub.lamps) circles.push({ x: l.x, z: l.z, r: 0.3, e: 0.3 });
    for (const g of sub.signals) for (const side of [1, -1]) { const [x, z] = route.offset(g.s + 3, side * (half + 1.6)); circles.push({ x, z, r: 0.3, e: 0.2 }); }
    for (const b of sub.bus) circles.push({ x: b.x, z: b.z, r: 0.9, e: 0.1 });
    for (const g of sub.signs) circles.push({ x: g.x, z: g.z, r: 0.25, e: 0.2 });
  }
  for (const b of bridges) { const bo = b.obstacles(); boxes.push(...bo.boxes); circles.push(...bo.circles); }
  if (bridge) {
    // Reklametafeln auf Pfosten an den Kanalufern, quer zur Strecke gesehen
    if (city) for (const side of [1, -1]) for (const sgn of [-1, 1]) {
      const s = def.bridge!.s + sgn * (def.bridge!.len / 2 + 12), [x, z] = route.offset(s, side * (half + 7)), a = route.at(s);
      city.signs.push({ x, y: terrain.height(x, z) + 5.2, z, ux: a.dx * side, uz: a.dz * side, w: 10, h: 4.2, cell: (side > 0 ? 2 : 7) + (sgn > 0 ? 1 : 0) });
      circles.push({ x, z, r: 0.3, e: 0 });
    }
  }
  const vines: [number, number, number][] = [];
  if (O.vines) {
    const sp2 = O.vines.spacing ?? 3.4, yaw0 = (O.vines.yaw ?? 0) * Math.PI / 180, cy = Math.cos(yaw0), sy = Math.sin(yaw0);
    for (const [x0, z0, x1, z1] of O.vines.rects) {
      const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2, hw = Math.abs(x1 - x0) / 2, hh = Math.abs(z1 - z0) / 2, R2 = Math.hypot(hw, hh);
      for (let v = -R2; v <= R2; v += sp2) for (let u = -R2; u <= R2; u += 5.6) {
        const x = cxm + cy * u - sy * v, z = czm + sy * u + cy * v;   // Zeile entlang yaw0
        if (Math.abs(x - cxm) > hw || Math.abs(z - czm) > hh) continue;
        if (route.nearestWithin(x, z, half + 9) || (river && river.dist(x, z) < river.width / 2 + 40)) continue;
        vines.push([x, z, yaw0]);
      }
    }
  }
  const castles = O.castles ?? [];
  for (const c of castles) {   // Ruine: zwei Türme + Mauer dazwischen (Grundriss fest)
    const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), P = (lx: number, lz: number): [number, number] => [c.x + cs * lx + sn * lz, c.z - sn * lx + cs * lz];
    const [ax, az] = P(-9 * c.s, 0), [bx, bz] = P(9 * c.s, 0);
    circles.push({ x: ax, z: az, r: 3.4 * c.s, e: 0 }, { x: bx, z: bz, r: 2.8 * c.s, e: 0 });
    boxes.push({ x: c.x, z: c.z, hx: 6 * c.s, hz: 0.9 * c.s, yaw: c.yaw });
  }
  for (const h of town) boxes.push({ x: h.x, z: h.z, hx: h.hx, hz: h.hz, yaw: h.yaw });
  const landmarks = def.landmarks ?? [];
  for (const m of landmarks) for (const [lx, lz, hx, hz] of DOM_FOOT) {   // Dom: Grundflächen (lokal, vor dem Maßstab) als feste Rechtecke
    const cs = Math.cos(m.yaw), sn = Math.sin(m.yaw);
    boxes.push({ x: m.x + (cs * lx + sn * lz) * m.s, z: m.z + (-sn * lx + cs * lz) * m.s, hx: hx * m.s, hz: hz * m.s, yaw: m.yaw });
  }
  // Gleise: je Bahnübergang freie Länge + glattes Profil; Bäume/Felsen/Pfosten im Gleiskorridor entfallen
  const nTR = trees.length + rocks.length, rails: RailPlan[] = [];
  for (const d of def.movers ?? []) if (d.kind === 'crossing') {
    const a = route.at(d.s);
    rails.push(planRail(a.x, a.z, -a.dz, a.dx, half, { height: (x, z) => terrain.height(x, z), boxes, circles: circles.slice(nTR), water: (x, z) => !!(river && river.inside(x, z)) || !!(bridge && bridge.inCanal(x, z)) || (T.lakes ?? []).some((L) => Math.hypot(x - L.x, z - L.z) < L.r + 2), limit: lim }));
  }
  if (rails.length) {
    const onRail = (x: number, z: number) => rails.some((p) => { const u = (x - p.x) * p.kx + (z - p.z) * p.kz, v = (x - p.x) * -p.kz + (z - p.z) * p.kx; return Math.abs(v) < RAIL_CLEAR && u > p.uMin - 7 && u < p.uMax + 7; });
    const keep = (o: { x: number; z: number }) => !onRail(o.x, o.z);
    const tr0 = trees.length, rk0 = rocks.length;
    const tc = circles.slice(0, tr0), rc = circles.slice(tr0, tr0 + rk0);
    const tk = trees.filter(keep), rk = rocks.filter(keep);
    const tcK = tc.filter((_, i) => keep(trees[i])), rcK = rc.filter((_, i) => keep(rocks[i]));
    const rest = circles.slice(tr0 + rk0);
    trees.length = 0; trees.push(...tk); rocks.length = 0; rocks.push(...rk);
    circles.length = 0; circles.push(...tcK, ...rcK, ...rest);
    posts = posts.filter(([x, z]) => keep({ x, z }));
  }
  const sp = Object.keys(def.palette.surfaces);
  const surfaceColors: number[] = [];
  for (const n of sp) surfaceColors[SURFACE_BY_NAME[n].id] = hex(def.palette.surfaces[n]);
  // Asphalt moderat heller (Verkehr/Strecke heben sich ab); Nass etwas weniger, damit Nacht/Regen dunkel bleiben
  for (const [n, k] of [['Asphalt', 1.3], ['Nasser Asphalt', 1.2]] as const) { const id = SURFACE_BY_NAME[n].id; if (surfaceColors[id] !== undefined) surfaceColors[id] = brighten(surfaceColors[id], k); }
  if (fords.length && surfaceColors[FORD.id] === undefined) surfaceColors[FORD.id] = hex('#6b5f4a');   // Furtbett (liegt unter dem Wasser)
  const marks: Course['marks'] = [];
  if (O.marks) {   // links/rechts um den halben Abstand versetzt; nicht im Wasser (Priel, Furt, Meer), nicht auf einem Pfosten
    const mr = rng(seed * 31337 + 5), E = O.marks.every;
    for (const side of [1, -1] as const) for (let sm = (O.marks.s?.[0] ?? 12) + (side > 0 ? 0 : E / 2); sm < Math.min(route.length - 10, O.marks.s?.[1] ?? 1e9); sm += E) {
      const [x, z] = route.offset(sm, side * O.marks.lateral);
      if (bridge && bridge.inCanal(x, z, 3)) continue;
      if (fords.some((f) => sm > f.s0 - 6 && sm < f.s1 + 6)) continue;
      if (def.sea && terrain.height(x, z) < lvl + 0.4) continue;
      if (posts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.5)) continue;
      marks.push({ x, z, side, k: mr(), poller: !!O.marks.poller });
    }
  }
  const p0 = route.at(6), goalS = route.length - 8, g = route.at(goalS);
  return {
    id: def.id, saveKey: saveKeyOf(def), name: def.name, world: def.world, route, net, bridges, bridgeSpans, terrain, length: route.length, roadWidth: def.road.width,
    start: { x: p0.x, z: p0.z, yaw: route.yawAt(6) },
    goal: { s: goalS, x: g.x, z: g.z, yaw: route.yawAt(goalS) },
    town, rainAlways: !!def.rain, rainS: (def.zones ?? []).filter((zn) => zn.s && zn.surface === 'Nasser Asphalt').map((zn) => zn.s!), stars, posts, marks, trees, rocks, city, bridge, river, vines, castles, landmarks, jumps, fords, tunnels, moverDefs: def.movers ?? [], rails, traffic: def.traffic ?? null, bays, bayExt,
    shallowAt: (x, z) => { if (!fords.length) return 0; const h = route.nearestWithin(x, z, half + 6); return h ? shallowAt(fords, h.s, h.d, half) : 0; },
    waterAt: (x, z) => (river && river.inside(x, z) ? river.level : bridge && bridge.inCanal(x, z) ? bridge.level : bridge ? def.sea?.level ?? -1e9 : -1e9),   // Meer + Priel-Brücke in einem Level (game.ts nimmt waterAt, sobald es eine Brücke gibt)
    sea: def.sea ? { level: def.sea.level } : null,
    sun: def.sun ? { dx: def.sun.dir[0], dz: def.sun.dir[1], elev: def.sun.elev } : null,
    treeKind: O.trees?.kind === 'palm' ? 'palm' : O.trees?.kind === 'mixed' ? 'mixed' : O.trees?.kind === 'autumn' ? 'autumn' : 'fir', suburb: sub, signals,
    boardwalk: roadSurf === WOOD ? [[0, route.length]] : (def.zones ?? []).filter((zn) => zn.s && zn.surface === 'Holz').map((zn) => zn.s!), obstacles: { circles, boxes },
    timeBudget: typeof def.time.budget === 'number' ? def.time.budget : (def.time.budget.hatch ?? 0), timeBudgets: typeof def.time.budget === 'number' ? undefined : def.time.budget, starBonus: def.time.starBonus, hints: { cp: def.hints?.cp ?? [], arrow: def.hints?.arrow ?? [] }, chassis: def.chassis ?? { setup: 'standard' },
    surfaceColors, meshSurf, roadSurfAt, sky: hex(def.fog.color), fog: { color: hex(def.fog.color), near: def.fog.near, far: def.fog.far },
    colors: { tree: hex(def.palette.tree), treeTop: hex(def.palette.treeTop), rock: hex(def.palette.rock), post: hex(def.palette.post), star: hex(def.palette.star), gate: hex(def.palette.gate) },
    edge: def.edge === 'respawn' ? (def.edgeBox ? { x0: def.edgeBox[0], z0: def.edgeBox[1], x1: def.edgeBox[2], z1: def.edgeBox[3], ...(def.edgeCuts ? { cuts: def.edgeCuts } : {}) } : { x0: -terrain.half + EDGE_INSET, z0: -terrain.half + EDGE_INSET, x1: terrain.half - EDGE_INSET, z1: terrain.half - EDGE_INSET }) : undefined,
    recover: (s) => { const a = route.at(s); return { x: a.x, z: a.z, yaw: route.yawAt(s) }; },
  };
}

/** Stadt: Blöcke in Reihen links/rechts der Strecke (nur wo Platz ist), Laternen, Neon-Schilder. Alles deterministisch aus dem Seed. */
function buildCity(def: LevelDef, route: Route, terrain: GridTerrain, half: number, lim: number, r: () => number, bridge: Bridge | null): CityData {
  const C = def.city!, out: CityData = { buildings: [], lamps: [], signs: [] };
  const clear = (x: number, z: number, m: number) => !route.nearestWithin(x, z, half + m) && !(bridge && bridge.inCanal(x, z, 14));
  const overlap = (a: Building, b: Building) => {
    if (Math.hypot(a.x - b.x, a.z - b.z) > Math.hypot(a.hx, a.hz) + Math.hypot(b.hx, b.hz) + 2) return false;
    const m = 1.5;
    for (const [P, Q] of [[a, b], [b, a]] as const) {
      for (const ang of [P.yaw, P.yaw + Math.PI / 2]) {
        const ax = Math.cos(ang), az = -Math.sin(ang);
        const rp = Math.abs(Math.cos(P.yaw) * ax - Math.sin(P.yaw) * az) * P.hx + Math.abs(Math.sin(P.yaw) * ax + Math.cos(P.yaw) * az) * P.hz;
        const rq = Math.abs(Math.cos(Q.yaw) * ax - Math.sin(Q.yaw) * az) * Q.hx + Math.abs(Math.sin(Q.yaw) * ax + Math.cos(Q.yaw) * az) * Q.hz;
        if (Math.abs((Q.x - P.x) * ax + (Q.z - P.z) * az) > rp + rq + m) return false;
      }
    }
    return true;
  };
  const yMin = (x: number, z: number, hx: number, hz: number, yaw: number) => {
    let m = Infinity; const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) { const lx = sx * hx, lz = sz * hz; m = Math.min(m, terrain.height(x + c * lx + s * lz, z - s * lx + c * lz)); }
    return m;
  };
  for (const f of C.fixed ?? []) out.buildings.push({ x: f.x, z: f.z, hx: f.hx, hz: f.hz, yaw: f.yaw ?? 0, h: f.h, y0: yMin(f.x, f.z, f.hx, f.hz, f.yaw ?? 0) - 1, tint: 1, u0: 0.3, v0: 0.6, tier: 0 });
  for (const side of [1, -1]) {
    let edge = [0, 0, 0].map(() => 0);
    for (let row = 0; row < C.rows; row++) {
      for (let s = 6 + r() * 6; s < route.length - 6;) {
        const w = 14 + r() * 20, d = 14 + r() * 14, sm = s + w / 2;
        s += w + 1.5 + r() * 5;
        const gap = C.gap[0] + r() * (C.gap[1] - C.gap[0]) + (row ? 3 + r() * 8 : 0);
        const lat = half + gap + (row ? edge[row] : 0) + d / 2;
        const a = route.at(sm), px = a.x + a.dz * side * lat, pz = a.z - a.dx * side * lat;
        const yaw = route.yawAt(sm);
        const hx = d / 2, hz = w / 2, c = Math.cos(yaw), sn = Math.sin(yaw);
        let ok = Math.abs(px) < lim - 20 && Math.abs(pz) < lim - 20;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
          if (!ok) break;
          const lx = sx * hx, lz = sz * hz;
          ok = clear(px + c * lx + sn * lz, pz - sn * lx + c * lz, gap > 0 ? C.gap[0] - 1 : 0);
        }
        if (!ok) continue;
        const f = row === 0 ? 0 : row === 1 ? 0.5 : 0.9;
        const h = C.height[0] + (C.height[1] - C.height[0]) * (f * 0.6 + r() * 0.5);
        const y0 = yMin(px, pz, hx, hz, yaw) - 1;
        const b: Building = { x: px, z: pz, hx, hz, yaw, h, y0, tint: Math.floor(r() * 4), u0: r(), v0: r(), tier: r() < 0.45 ? 0.2 + r() * 0.3 : 0 };
        if (out.buildings.some((o) => overlap(b, o))) continue;
        out.buildings.push(b);
        edge[row + 1] = Math.max(edge[row + 1] ?? 0, edge[row] + gap + d);   // nächste Reihe beginnt hinter diesem Block (grob)
        if (row === 0 && r() < C.signChance) {
          const sw = 5 + r() * 5, sh = sw * 0.42, fl = lat - d / 2 - 0.25;
          const [sx2, sz2] = route.offset(sm + (r() - 0.5) * (w - sw - 2), side * fl);
          out.signs.push({ x: sx2, y: b.y0 + 5 + r() * Math.min(18, h - 9), z: sz2, ux: a.dx * side, uz: a.dz * side, w: sw, h: sh, cell: Math.floor(r() * 12) });
        }
      }
    }
  }
  // Laternen im Wechsel links/rechts
  let k = 0;
  for (let s = 20; s < route.length - 10; s += C.lampEvery, k++) {
    const side = k % 2 ? 1 : -1, lat = half + 1.8, [x, z] = route.offset(s, side * lat);
    if (bridge && s > bridge.s0 - 6 && s < bridge.s1 + 6) continue;
    out.lamps.push({ x, z, yaw: route.yawAt(s), side });
  }
  return out;
}

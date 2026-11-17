// Gelände: Höhenfeld + Untergrund. Reine Daten, keine three-Abhängigkeit.
// Physik UND Rendering lesen dasselbe Raster (Dreiecks-Interpolation), damit Räder nicht schweben.

export interface Surface {
  id: number;
  name: string;
  mu: number;       // Reibwert (Spitze)
  rolling: number;  // Rollwiderstandsbeiwert
  B: number;        // Schlupfsteifigkeit der Reifenkurve
  C: number;        // Formfaktor (kleiner = weniger Abfall hinter der Spitze)
  bd?: number;      // loser Untergrund: Seitenkraft wächst jenseits der Spitze noch an (Schiebekeil aus Schnee/Kies/Sand)
  tc?: number;      // Ziel-Schlupf der Traktionskontrolle (Standard TC_DEFAULT)
}

export const ASPHALT: Surface = { id: 0, name: 'Asphalt', mu: 1.15, rolling: 0.013, B: 11, C: 1.45 };
export const GRAVEL: Surface = { id: 1, name: 'Schotter', mu: 0.62, rolling: 0.035, B: 7, C: 1.3 };
export const ICE: Surface = { id: 2, name: 'Eis', mu: 0.11, rolling: 0.008, B: 8, C: 1.4 };
// Schnee (Welt 3): zwischen Schotter und Eis. Straße = festgefahrener Schnee, daneben Tiefschnee (zäh).
export const SNOW: Surface = { id: 3, name: 'Schnee', mu: 0.45, rolling: 0.03, B: 6.5, C: 1.25 };
export const DEEP_SNOW: Surface = { id: 4, name: 'Tiefschnee', mu: 0.3, rolling: 0.09, B: 6, C: 1.2 };
// Nasser Asphalt (Nachtstadt): spürbar rutschiger als trocken, aber weit griffiger als Schotter.
export const WET_ASPHALT: Surface = { id: 5, name: 'Nasser Asphalt', mu: 0.95, rolling: 0.014, B: 10, C: 1.4 };
// Strand: nasser Sand = fest und schnell, weicher Sand = zäh (hoher Rollwiderstand), Holz (Stege) = griffig.
export const WET_SAND: Surface = { id: 6, name: 'Nasser Sand', mu: 1.0, rolling: 0.02, B: 10, C: 1.4 };
export const SOFT_SAND: Surface = { id: 7, name: 'Weicher Sand', mu: 0.5, rolling: 0.1, B: 6, C: 1.2 };
export const WOOD: Surface = { id: 8, name: 'Holz', mu: 1.05, rolling: 0.014, B: 11, C: 1.45 };
// Rheinsteig: Gras (Weinberg, Hang), Kopfsteinpflaster (Ortsdurchfahrten)
export const GRASS: Surface = { id: 9, name: 'Gras', mu: 0.7, rolling: 0.05, B: 7, C: 1.3 };
export const COBBLE: Surface = { id: 10, name: 'Kopfstein', mu: 0.86, rolling: 0.022, B: 9.5, C: 1.35 };
// Furt: flaches Wasser über der Straße (zusätzlich bremst `Vehicle.shallow`)
export const FORD: Surface = { id: 11, name: 'Furt', mu: 0.62, rolling: 0.05, B: 7, C: 1.25 };
// Matsch (Vorstadt): zwischen Tiefschnee und Weichem Sand – wenig Grip, bremst spürbar.
export const MUD: Surface = { id: 12, name: 'Matsch', mu: 0.38, rolling: 0.085, B: 6, C: 1.2 };
export const TC_DEFAULT = 0.15;
// Traktionskontrolle: Ziel-Längsschlupf der angetriebenen Räder je Untergrund, ~80 % des Kraftspitzen-Schlupfs tan(π/2C)/B der Reifenkurve (flachere Ziele wie 0,1 kosten auf Schnee die halbe Beschleunigung)
for (const [sf, k] of [[ASPHALT, 0.15], [WET_ASPHALT, 0.17], [GRAVEL, 0.3], [SNOW, 0.38], [DEEP_SNOW, 0.5], [ICE, 0.21], [WET_SAND, 0.17], [SOFT_SAND, 0.5], [WOOD, 0.15], [GRASS, 0.3], [COBBLE, 0.2], [FORD, 0.35], [MUD, 0.45]] as [Surface, number][]) sf.tc = k;
// Lose Untergründe: hinter der Kraftspitze baut sich ein Schiebekeil auf, die Kraft fällt dort nicht ab, sondern steigt noch um bd (Anteil) -> kontrollierter Drift verliert weniger als hartes Einlenken am Limit
for (const [sf, k] of [[SNOW, 0.14], [DEEP_SNOW, 0.12], [GRAVEL, 0.12], [SOFT_SAND, 0.12], [WET_SAND, 0.06], [GRASS, 0.1], [FORD, 0.08], [COBBLE, 0.03], [MUD, 0.12]] as [Surface, number][]) sf.bd = k;
export const SURFACES: Surface[] = [ASPHALT, GRAVEL, ICE, SNOW, DEEP_SNOW, WET_ASPHALT, WET_SAND, SOFT_SAND, WOOD, GRASS, COBBLE, FORD, MUD];

/** Zusatzhöhe über dem Raster (Schanzen, Furt-Mulden): nur wo `near` wahr ist, sonst 0 */
export interface Bump { near(x: number, z: number): boolean; h(x: number, z: number): number }

export interface Terrain {
  height(x: number, z: number): number;
  /** schreibt die Normale in out[0..2] */
  normal(x: number, z: number, out: number[]): void;
  surface(x: number, z: number): Surface;
}

export class FlatTerrain implements Terrain {
  constructor(private s: Surface = ASPHALT, private h = 0) {}
  height(): number { return this.h; }
  normal(_x: number, _z: number, out: number[]): void { out[0] = 0; out[1] = 1; out[2] = 0; }
  surface(): Surface { return this.s; }
}

/** Raster-Höhenfeld, Zellgröße `cell`, `n`×`n` Stützstellen, zentriert um den Ursprung. */
export class GridTerrain implements Terrain {
  readonly h: Float32Array;
  readonly surf: Uint8Array;   // je Zelle (n-1)²
  readonly half: number;
  /** Brückendeck: liefert die Höhe, wo ein Deck über dem Höhenfeld liegt (sonst null) */
  deck: ((x: number, z: number) => number | null) | null = null;
  /** Schanzen/Mulden, additiv zum Raster */
  bump: Bump | null = null;
  constructor(readonly n: number, readonly cell: number,
              fn: (x: number, z: number) => number,
              surfFn: (x: number, z: number) => Surface) {
    this.half = (n - 1) * cell / 2;
    this.h = new Float32Array(n * n);
    this.surf = new Uint8Array((n - 1) * (n - 1));
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) this.h[j * n + i] = fn(i * cell - this.half, j * cell - this.half);
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++)
        this.surf[j * (n - 1) + i] = surfFn((i + 0.5) * cell - this.half, (j + 0.5) * cell - this.half).id;
  }
  private locate(x: number, z: number): [number, number, number, number] {
    const m = this.n - 1;
    let fx = (x + this.half) / this.cell, fz = (z + this.half) / this.cell;
    fx = Math.min(Math.max(fx, 0), m - 1e-6);
    fz = Math.min(Math.max(fz, 0), m - 1e-6);
    const i = Math.floor(fx), j = Math.floor(fz);
    return [i, j, fx - i, fz - j];
  }
  height(x: number, z: number): number {
    if (this.deck) { const d = this.deck(x, z); if (d !== null) return d; }
    const [i, j, u, v] = this.locate(x, z), n = this.n, h = this.h;
    const h00 = h[j * n + i], h10 = h[j * n + i + 1], h01 = h[(j + 1) * n + i], h11 = h[(j + 1) * n + i + 1];
    const y = u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00)
                         : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
    return this.bump && this.bump.near(x, z) ? y + this.bump.h(x, z) : y;
  }
  normal(x: number, z: number, out: number[]): void {
    if (this.deck && this.deck(x, z) !== null) {   // Deck: Steigung numerisch (Kante: Nachbarpunkt fehlt -> Gegenseite)
      const e = 0.5, d = this.deck;
      const y0 = d(x, z)!, ax = d(x + e, z), bx = d(x - e, z), az = d(x, z + e), bz = d(x, z - e);
      const gx = ax !== null && bx !== null ? (ax - bx) / (2 * e) : ax !== null ? (ax - y0) / e : bx !== null ? (y0 - bx) / e : 0;
      const gz = az !== null && bz !== null ? (az - bz) / (2 * e) : az !== null ? (az - y0) / e : bz !== null ? (y0 - bz) / e : 0;
      const l = Math.hypot(gx, 1, gz); out[0] = -gx / l; out[1] = 1 / l; out[2] = -gz / l; return;
    }
    const [i, j, u, v] = this.locate(x, z), n = this.n, h = this.h, c = this.cell;
    const h00 = h[j * n + i], h10 = h[j * n + i + 1], h01 = h[(j + 1) * n + i], h11 = h[(j + 1) * n + i + 1];
    let gx: number, gz: number;
    if (u + v <= 1) { gx = (h10 - h00) / c; gz = (h01 - h00) / c; }
    else { gx = (h11 - h01) / c; gz = (h11 - h10) / c; }
    if (this.bump && this.bump.near(x, z)) {   // Schanze: Steigung numerisch dazu
      const e = 0.4, b = this.bump;
      gx += (b.h(x + e, z) - b.h(x - e, z)) / (2 * e); gz += (b.h(x, z + e) - b.h(x, z - e)) / (2 * e);
    }
    const l = Math.hypot(gx, 1, gz);
    out[0] = -gx / l; out[1] = 1 / l; out[2] = -gz / l;
  }
  surface(x: number, z: number): Surface {
    const [i, j] = this.locate(x, z);
    return SURFACES[this.surf[j * (this.n - 1) + i]];
  }
}

/** Die Testwiese: Asphaltplatz + Straße, Schotter ringsum, Eisfläche rechts, ein paar Kuppen. */
export function makeTestMeadow(): GridTerrain {
  const bumps: [number, number, number, number][] = [
    [0, -75, 14, 0.8], [45, -55, 8, 1.2], [-50, -60, 10, 1.8], [-70, 20, 12, 2.2],
    [30, 70, 9, 1.4], [-20, 90, 8, 1.0], [95, -70, 10, 1.5],
  ];
  const height = (x: number, z: number) => {
    let y = 0.5 * Math.sin(x * 0.045) * Math.cos(z * 0.05);
    for (const [bx, bz, r, hh] of bumps) y += hh * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (r * r));
    // Platz am Start bleibt flach
    const flat = Math.min(1, Math.max(0, (Math.hypot(x, z) - 25) / 20));
    return y * flat;
  };
  const surf = (x: number, z: number): Surface => {
    if (Math.hypot(x - 105, z - 15) < 42) return ICE;
    if (Math.abs(x) < 36 && Math.abs(z) < 28) return ASPHALT;
    if (Math.abs(x) < 7 && z < -28 && z > -150) return ASPHALT;
    return GRAVEL;
  };
  return new GridTerrain(129, 2.5, height, surf);
}

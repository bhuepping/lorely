// Fluss (Rhein): Mittellinie als Spline, Höhenprofil quer dazu (Flussbett, Ufer-Schelf, Hang mit Hochebene). Ohne three.
import { Route } from './level';

export interface RiverDef {
  points: [number, number][];
  width: number;      // Wasserbreite (m)
  level: number;      // Wasserspiegel (absolute Höhe)
  flat?: number;      // Breite des ebenen Uferstreifens (m), Standard 30
  rise?: number;      // Steigung des Hangs (m/m), Standard 0,33
  cap?: number;       // Höhe der Hochebene über dem Ufer (m), Standard 110
  bank?: number;      // Uferhöhe über dem Wasserspiegel (m), Standard 1; Kölner Ufer: 4 = Fluss tiefer, Ufermauer
  depth?: number;     // Tiefe des Flussbetts unter dem Spiegel (m), Standard 3,2
  boat?: boolean;     // Ausflugsschiff zeichnen (Standard an; Vorstadt-Au: aus)
  wall?: number;      // halbe Breite der Uferböschung (m), Standard 5,5; kleiner = steilere Mauer
}

const sm = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export class River {
  readonly route: Route;
  readonly level: number; readonly width: number; readonly bed: number; readonly bank: number; private wall: number;
  private px: number[] = []; private pz: number[] = [];
  private flat: number; private rise: number; private cap: number;
  constructor(readonly def: RiverDef) {
    this.route = new Route(def.points);
    this.level = def.level; this.width = def.width; this.bed = def.level - (def.depth ?? 3.2); this.bank = def.bank ?? 1; this.wall = def.wall ?? 5.5;
    this.flat = def.flat ?? 30; this.rise = def.rise ?? 0.33; this.cap = def.cap ?? 110;
    for (let s = 0; s < this.route.length; s += 6) { const a = this.route.at(s); this.px.push(a.x); this.pz.push(a.z); }
    const e = this.route.at(this.route.length); this.px.push(e.x); this.pz.push(e.z);
  }
  /** Abstand zur Mittellinie (m) */
  dist(x: number, z: number): number {
    let best = Infinity; const px = this.px, pz = this.pz;
    for (let i = 0; i + 1 < px.length; i++) {
      const ax = px[i], az = pz[i], bx = px[i + 1] - ax, bz = pz[i + 1] - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1))), dx = x - ax - bx * t, dz = z - az - bz * t, d = dx * dx + dz * dz; if (d < best) best = d;   // quadratisch vergleichen, Wurzel einmal am Ende (Ladezeit)
    }
    return Math.sqrt(best);
  }
  /** Höhe des Talprofils im Abstand d von der Mittellinie */
  profile(d: number): number {
    const w2 = this.width / 2, bank = this.level + this.bank;
    const floor = this.bed + (bank - this.bed) * sm(w2 - this.wall + 0.5, w2 + this.wall + 0.5, d);
    const u = d - (w2 + 6 + this.flat);
    const lin = u < 0 ? 0 : u < 25 ? 0.5 * this.rise * u * u / 25 : this.rise * (u - 12.5);
    return floor + this.cap * Math.tanh(lin / this.cap);
  }
  /** Profil für die Straße: wie `profile`, aber ohne Flussbett (Brücken laufen über Ufer-Höhe) */
  roadProfile(d: number): number { return Math.max(this.profile(d), this.level + this.bank); }
  /** (x,z) liegt im Wasser (Ufersaum eingerechnet) */
  inside(x: number, z: number): boolean { return this.dist(x, z) < this.width / 2 + 4; }
}

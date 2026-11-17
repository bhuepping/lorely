// Brücke: ein Straßenabschnitt (s0…s1) liegt als Fahrbahndeck mit Bogenprofil über einem Graben (Kanal/Fluss). Ohne three (headless testbar).
// Physik: GridTerrain.deck liefert dort die Deckhöhe (Höhenfeld darunter ist der Kanalboden); Geländer = feste Rechtecke (Obstacles), Pfeiler/Masten = Kreise.
import type { Route } from './level';
import type { Box, Circle } from './physics/obstacles';
import type { River } from './river';

export interface BridgeDef {
  /** Mitte der Brücke (m auf der Strecke) */
  s: number;
  /** Länge des Decks (m) */
  len: number;
  /** Breite des Wassers quer zur Strecke (m) */
  canal: number;
  /** Bogenhöhe in der Mitte (m) */
  rise: number;
  /** Wasserspiegel unter Fahrbahn-Niveau (m), Standard 1,7 */
  below?: number;
  /** Stahlbogen-Fachwerk über dem Deck statt Torbögen (Flussbrücke) */
  arch?: boolean;
  /** Holzbrücke (Vorstadt): Bohlenbelag, Holzgeländer, keine Torbögen/Lampen, Bach statt Kanal */
  wood?: boolean;
  /** schlichte Straßenbrücke (Vorstadt): ebenerdig, Asphalt, niedrige Brüstung, keine Tore/Masten/Neon */
  plain?: boolean;
  /** Anzahl Stahlbögen hintereinander (Standard 1; Kölner Ufer: 3) und bunte Liebesschlösser am Geländer */
  arches?: number; locks?: boolean;
  /** Länge des Kanals links/rechts der Strecke (m), Standard 150 – am Ende läuft er flach aus */
  reachL?: number; reachR?: number;
}

const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Bridge {
  readonly s0: number; readonly s1: number;
  readonly cx: number; readonly cz: number; readonly tx: number; readonly tz: number;
  /** Wasserspiegel und Kanalboden (absolute Höhe) */
  readonly level: number; readonly bed: number;
  readonly yA: number; readonly yB: number;
  private readonly reach: number;
  constructor(readonly def: BridgeDef, readonly route: Route, readonly half: number, profAt: (s: number) => number, readonly river: River | null = null) {
    this.s0 = def.s - def.len / 2; this.s1 = def.s + def.len / 2;
    const c = route.at(def.s); this.cx = c.x; this.cz = c.z; this.tx = c.dx; this.tz = c.dz;
    this.yA = profAt(this.s0); this.yB = profAt(this.s1);
    this.level = river ? river.level : (this.yA + this.yB) / 2 - (def.below ?? 1.7); this.bed = river ? river.bed : this.level - 2.8;
    this.reach = def.len / 2 + half + 3;
  }
  /** Abstand längs der Strecke (Mitte des Kanals = 0) */
  along(x: number, z: number): number { return (x - this.cx) * this.tx + (z - this.cz) * this.tz; }
  /** seitliche Lage zur Strecke (positiv = Seite von route.offset(+)) */
  lat(x: number, z: number): number { return (x - this.cx) * this.tz - (z - this.cz) * this.tx; }
  get reachL(): number { return this.def.reachL ?? 150; }
  get reachR(): number { return this.def.reachR ?? 150; }
  /** Punkt liegt im Kanalstreifen (m = Rand dazu) */
  inCanal(x: number, z: number, m = 0): boolean {
    if (this.river) return this.river.dist(x, z) < this.river.width / 2 + m;
    const b = this.lat(x, z);
    return Math.abs(this.along(x, z)) < this.def.canal / 2 + m && b > -this.reachR - m && b < this.reachL + m;
  }
  /** Höhenfeld: Graben mit Böschung (blendet auf den Kanalboden) */
  carve(x: number, z: number, y: number): number {
    if (this.river) return y;      // Fluss steckt schon im Höhenfeld
    const a = Math.abs(this.along(x, z)), b = this.lat(x, z);
    const end = 1 - sm(this.reachL - 25, this.reachL, b) * (b > 0 ? 1 : 0) - sm(this.reachR - 25, this.reachR, -b) * (b < 0 ? 1 : 0);
    return y + (this.bed - y) * (1 - sm(this.def.canal / 2 - 2, this.def.canal / 2 + 7, a)) * end;
  }
  /** Deckhöhe bei Streckenmeter s (Bogen: Cosinus, an den Enden Steigung 0) */
  deckY(s: number): number {
    const t = (s - this.s0) / this.def.len;
    return this.yA + (this.yB - this.yA) * t + this.def.rise * 0.5 * (1 + Math.cos(Math.PI * (2 * t - 1)));
  }
  /** Physik-Höhe: Deckhöhe, wenn (x,z) auf dem Deck liegt, sonst null */
  height(x: number, z: number): number | null {
    if (Math.hypot(x - this.cx, z - this.cz) > this.reach) return null;
    const h = this.route.nearestWithin(x, z, this.half);
    return h && h.s >= this.s0 && h.s <= this.s1 ? this.deckY(h.s) : null;
  }
  /** Geländer (feste Rechtecke, Segmente je ~4 m entlang der Strecke) und Torbogen-Masten (Kreise) */
  obstacles(): { boxes: Box[]; circles: Circle[] } {
    const boxes: Box[] = [], circles: Circle[] = [];
    const n = Math.ceil(this.def.len / 4), seg = this.def.len / n;
    for (let i = 0; i < n; i++) {
      const sm0 = this.s0 + (i + 0.5) * seg, yaw = this.route.yawAt(sm0);
      for (const side of [1, -1]) { const [x, z] = this.route.offset(sm0, side * (this.half + 0.25)); boxes.push({ x, z, hx: 0.25, hz: seg / 2 + 0.05, yaw }); }
    }
    for (const s of this.gates()) for (const side of [1, -1]) { const [x, z] = this.route.offset(s, side * (this.half + 0.9)); circles.push({ x, z, r: 0.35, e: 0 }); }
    return { boxes, circles };
  }
  /** Streckenmeter der beiden Torbögen */
  gates(): number[] { return this.def.arch || this.def.wood || this.def.plain ? [] : [this.s0 + 3, this.s1 - 3]; }
}

// Verkehr ohne three: Zeit = Summe der Physikschritte (deterministisch, wie movers.ts). Jedes Fahrzeug folgt einer Spur
// (Sollpunkt wandert mit dem Tempoprofil die Route entlang) und hängt per Feder-Dämpfer daran – der Spieler kann es anschieben,
// es kehrt weich zurück. Verkehrsautos kollidieren NICHT untereinander (keine Ketten); nur Spieler <-> Verkehrsauto über Obstacles.dynBoxes.
import type { Route } from './level';
import { rng, bayRamp, type BayDef } from './level';
import type { Box, Soft } from './physics/obstacles';
import { sigPhase } from './suburb';
import type { Net } from './net';
import type { NetSignals } from './signals';
import { NetTraffic } from './nettraffic';

/** Level-JSON `traffic`: density = Fahrzeuge je km (beide Richtungen zusammen), oncoming = Anteil Gegenverkehr 0…1, speeds = Tempo Vorausfahrer m/s (min, max) */
export interface TrafficDef { density: number; oncoming?: number; speeds?: [number, number] }

export interface KindDef { hx: number; hz: number; mass: number; vMul: number }
/** Fahrzeugarten (Maße = halbe Breite/Länge). Das Aussehen steht in trafficmesh.ts unter demselben Schlüssel. */
export const KINDS: Record<string, KindDef> = {
  sedan: { hx: 0.9, hz: 2.15, mass: 1100, vMul: 1 },
  van: { hx: 1.0, hz: 2.5, mass: 1700, vMul: 0.9 },
  wagon: { hx: 0.92, hz: 2.25, mass: 1150, vMul: 1 },
  tractor: { hx: 1.15, hz: 1.9, mass: 2200, vMul: 0.5 },
  jeep: { hx: 0.95, hz: 2.1, mass: 1500, vMul: 0.95 },
  roofbox: { hx: 0.92, hz: 2.3, mass: 1200, vMul: 0.9 },
  camper: { hx: 1.02, hz: 2.6, mass: 1900, vMul: 0.8 },
  buggy: { hx: 0.85, hz: 1.55, mass: 600, vMul: 1.1 },
};
/** zwei Arten je Welt (Vorausfahrer/Gegenverkehr mischen sich daraus) */
export const WORLD_KINDS: Record<string, [string, string]> = {
  city: ['sedan', 'van'], rhein: ['wagon', 'tractor'], snow: ['jeep', 'roofbox'], beach: ['camper', 'buggy'], vorstadt: ['sedan', 'wagon'], practice: ['sedan', 'van'],
};

export interface TCar extends Box { vx: number; vz: number; on: boolean; soft: Soft;
  kind: number; scale: number; tint: number; dir: 1 | -1; lat: number; sT: number; speed: number; v0: number; yawRate: number; tvx: number; tvz: number; stuck: number; err: number; touch: number; build: number; lat0: number; bay: { b: BayDef; stop: number } | null; mass: number }

// Federn (Sollpunkt -> Auto), kritisch gedämpft: längs weicher als quer
const K_T = 4, C_T = 3.6, K_N = 8, C_N = 5.1, K_Y = 14, C_Y = 6.4, A_MAX = 14;
const EFF = 0.35;          // beim Stoß zählt das Verkehrsauto nur mit diesem Anteil seiner Masse: der Spieler wird gebremst, aber nie zurückgeschleudert
const HIT_DV = 17;         // so weit darf ein Verkehrsauto durch Stöße vom Solltempo abweichen (kein Pinball, es fliegt nicht davon)
const HIT_DW = 2.2;        // …und so viel Gierrate
const PUSH_MAX = 0.6;      // Ausweichen aus der Eindringtiefe je Schritt höchstens (m)
export const GONE_DIST = 25;   // weiter abgedrängt -> abbauen (nur außer Sicht, sonst findet das Auto zur Spur zurück)
const A_STOP = 2.4, BAY_SEE = 200;        // Bremsverzögerung vor der Schranke (m/s²)
const A_LAT = 3.2, A_BRK = 2.4;     // Querbeschleunigung der Verkehrsautos, Bremsverzögerung vor Kurven
const GAP = 16;            // Mindestabstand der Sollpunkte in einer Spur (m)

/** Bahnübergang für den Verkehr: s = Gleis (Streckenmeter), closed() = Schranke schließt/ist zu */
export interface Gate { s: number; closed: () => boolean; /** Haltepunkt vor (Fahrtrichtung +) bzw. hinter (−) s, Standard [10, 6] (Schranke); Ampeln [3.6, 3.6] */ off?: [number, number] }
/** Gates aus Movers.crossings (Schranke steht auf dem Weg 7 m vor dem Gleis, `warn` = Lichter/Schranke aktiv bis kurz nach dem Zug) */
export const gatesFrom = (m: { crossings: { def: { s: number }; warn: boolean }[] }): Gate[] => m.crossings.map((c) => ({ s: c.def.s, closed: () => c.warn }));

/** Hindernis, vor dem Gegenverkehr in eine Ausweichbucht fährt (Schneepflug): s = Mitte (Streckenmeter), fährt Richtung wachsendes s */
export interface Hazard { s: number; hz: number; active: boolean }
export interface TrafficEnv { gates?: Gate[]; hazards?: () => Hazard[]; bays?: BayDef[] }

/** Verkehrsauto-Körper (Feder-Hindernis für den Spieler); gemeinsam mit nettraffic.ts */
export function newCar(): TCar {
  const c: TCar = {
    x: 0, z: 0, hx: 1, hz: 2, yaw: 0, vx: 0, vz: 0, on: false, kind: 0, scale: 1, tint: 0, dir: 1, lat: 0, sT: 0, speed: 0, v0: 10, yawRate: 0, tvx: 0, tvz: 0, stuck: 0, err: 0, touch: 0, build: 0, lat0: 0, bay: null, mass: 1100,
    soft: {
      m: 1100, I: 1100 * 3, share: 0.5,
      push: (dx, dz) => { c.touch = 0.25; const l = Math.hypot(dx, dz); if (l > PUSH_MAX) { dx *= PUSH_MAX / l; dz *= PUSH_MAX / l; } c.x += dx; c.z += dz; },
      hit: (px, pz, jx, jz) => {
        c.vx += jx / (c.mass * EFF); c.vz += jz / (c.mass * EFF);
        const ex = c.vx - c.tvx, ez = c.vz - c.tvz, l = Math.hypot(ex, ez);      // Abweichung vom Solltempo gedeckelt
        if (l > HIT_DV) { c.vx = c.tvx + ex * HIT_DV / l; c.vz = c.tvz + ez * HIT_DV / l; }
        const rx = px - c.x, rz = pz - c.z, I = c.mass * EFF * (c.hx * c.hx + c.hz * c.hz) / 3;
        c.yawRate = Math.max(-HIT_DW, Math.min(HIT_DW, c.yawRate + (rz * jx - rx * jz) / I));
      },
    },
  };
  return c;
}

/** Gemeinsame Schnittstelle von Traffic (Route) und NetTraffic (Straßennetz): Spiel, Mesh und Hindernisse brauchen nur das */
export interface TrafficLike { /** Signalzeit des Spiels (NetTraffic) */ sigClock?: (() => number) | null; readonly cars: TCar[]; readonly kinds: string[]; t: number; readonly active: number; onFx: ((c: TCar, mode: 0 | 1) => void) | null; step(dt: number, px: number, pz: number, fx?: number, fz?: number): void }

export class Traffic implements TrafficLike {
  bays: BayDef[] = [];
  private hazards: (() => Hazard[]) | null = null;
  private haz: Hazard[] = [];
  /** Bahnübergänge, vor denen der Verkehr hält (in beide Richtungen) */
  gates: Gate[] = [];
  readonly cars: TCar[] = [];
  readonly kinds: string[];
  t = 0;
  /** Streckenmeter des Spielers (aus der letzten step()-Position) */
  pS = 0;
  private rnd: () => number;
  private plan: [Float64Array, Float64Array];
  private q: number;
  private ahead: number; private behind = 70;
  private cool = 0;
  private maxN: number;
  private target: [number, number];
  private ex = 1e9; private ez = 1e9; private fx = 0; private fz = 0;
  /** Sichtweite (Nebel) – Haken für das Auf-/Abbauen aus Pixel-Partikeln (mode 0 = löst sich auf, 1 = setzt sich zusammen) */
  private sight: number;
  onFx: ((c: TCar, mode: 0 | 1) => void) | null = null;
  /** Ist das Auto im Bild (billig): innerhalb der Nebelweite und nicht hinter der Kamera (Blickrichtung des Spielers, Kamera bis ~9 m dahinter). Ohne Blickrichtung zählt nur der Abstand. */
  inSight(c: { x: number; z: number }): boolean {
    const dx = c.x - this.ex, dz = c.z - this.ez, d = Math.hypot(dx, dz);
    if (d > this.sight) return false;
    return (this.fx === 0 && this.fz === 0) || dx * this.fx + dz * this.fz > -14;
  }
  /** Auto abbauen: im Bild löst es sich in Pixel-Partikel auf, sonst verschwindet es einfach */
  private remove(c: TCar): void { if (this.onFx && this.inSight(c)) this.onFx(c, 0); c.on = false; }

  constructor(readonly route: Route, private half: number, readonly def: TrafficDef, readonly world: string, seed: number, private banned: [number, number][] = [], fogFar = 300, startS = 6, env: TrafficEnv = {}) {
    this.gates = env.gates ?? []; this.hazards = env.hazards ?? null; this.bays = (env.bays ?? []).filter((b) => b.side === 1);
    this.kinds = WORLD_KINDS[world] ?? WORLD_KINDS.practice;
    this.rnd = rng(seed ^ 0x51ed);
    this.q = half * 0.5;
    this.ahead = Math.max(110, Math.min(300, fogFar * 0.92)); this.sight = fogFar * 0.97;
    const win = (this.ahead + this.behind) / 1000, onc = def.oncoming ?? 0;
    this.target = [def.density * (1 - onc) * win, def.density * onc * win];
    this.maxN = Math.max(8, Math.ceil((this.target[0] + this.target[1]) * 1.6) + 3);
    this.plan = [this.makePlan(1), this.makePlan(-1)];
    for (let i = 0; i < this.maxN; i++) this.cars.push(this.mk());
    this.pS = startS; this.ex = route.at(startS).x; this.ez = route.at(startS).z;
    // Anfangsverteilung (vor dem ersten Schritt), nie im Startbereich
    for (let k = 0; k < this.maxN * 3; k++) this.trySpawn(true);
  }
  get boxes(): TCar[] { return this.cars; }
  get active(): number { let n = 0; for (const c of this.cars) if (c.on) n++; return n; }

  private mk(): TCar { return newCar(); }

  /** Tempoplan je Meter in Fahrtrichtung dir: Kurvenlimit, rückwärts mit Bremsverzögerung geglättet */
  private makePlan(dir: 1 | -1): Float64Array {
    const R = this.route, n = Math.floor(R.length) + 1, v = new Float64Array(n + 1), W = 12;
    for (let i = 0; i <= n; i++) {
      const s = Math.min(i, R.length), a = R.at(Math.max(0, s - W)), b = R.at(s), d = R.at(Math.min(R.length, s + W));
      const h0 = Math.atan2(b.z - a.z, b.x - a.x), h1 = Math.atan2(d.z - b.z, d.x - b.x);
      let dh = h1 - h0; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      const kappa = Math.abs(dh) / (2 * W);
      v[i] = kappa < 1e-4 ? 60 : Math.max(5, Math.sqrt(A_LAT / kappa));
    }
    if (dir > 0) for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * A_BRK));
    else for (let i = 1; i <= n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * A_BRK));
    return v;
  }
  private planAt(dir: 1 | -1, s: number): number { const p = this.plan[dir > 0 ? 0 : 1]; return p[Math.max(0, Math.min(p.length - 1, Math.round(s)))]; }

  /** nächster aktiver Pflug vor einem Gegenverkehrs-Auto bei s (Pflug-Hinterkante noch nicht am Auto vorbei), innerhalb BAY_SEE */
  private plowFor(sT: number, hz = 2.2): Hazard | null {
    let p: Hazard | null = null;
    for (const h of this.haz) if (h.s - h.hz < sT + hz + 1 && sT - h.s < BAY_SEE && (!p || h.s > p.s)) p = h;
    return p;
  }
  /** Bucht wählen: die nächste vor mir, die der Pflug erst später erreicht, mit freiem Platz und erreichbarem Halt (nacheinander 8 m auseinander) */
  private pickBay(sT: number, speed: number, p: Hazard): { b: BayDef; stop: number } | null {
    const bs = [...this.bays].sort((a, b) => b.s1 - a.s1);
    let soft: { b: BayDef; stop: number } | null = null;
    for (const b of bs) {
      if ((b.s0 + b.s1) / 2 < p.s + p.hz + 20) continue;
      const k = this.cars.reduce((n, o) => n + (o.on && o.bay?.b === b ? 1 : 0), 0), cap = Math.floor((b.s1 - b.s0 - 4) / 8) + 1;
      if (k >= cap) continue;
      const stop = b.s0 + 2 + 8 * k, d = sT - stop;
      if (d < 3) continue;
      if (d >= speed * speed / (2 * 3.4) + 3) return { b, stop };      // erreichbar mit normalem Bremsen
      soft ??= { b, stop };                                              // sonst die nächste: dann wird stärker gebremst
    }
    return soft;
  }
  /** Tempo, mit dem ein Auto bei sT noch sicher in der Bucht ankommt (Spawn nahe am Pflug: vorsichtig) */
  private bayCap(sT: number, p: Hazard): number { const b = this.pickBay(sT, 0, p); return b ? Math.sqrt(2 * 3.0 * (sT - b.stop - 2)) : 0; }
  /** Gegenverkehr vor dem Pflug: in die Bucht, dort halten bis der Pflug vorbei ist, dann wieder einfädeln. Gibt die Tempogrenze zurück. */
  private bayStep(c: TCar): number {
    const p = this.plowFor(c.sT, c.hz);
    if (!c.bay && p) {
      c.bay = this.pickBay(c.sT, c.speed, p);
      if (!c.bay && c.sT - p.s - p.hz - c.hz < 8) { this.remove(c); return 0; }       // Notfall: kein Platz mehr – nie durch den Pflug fahren
    }
    if (!c.bay) return Infinity;
    const B = c.bay, ramp = bayRamp(B.b, c.sT);
    c.lat = c.lat0 + (this.half + B.b.w / 2 - c.lat0) * ramp;
    if (!p) { if (ramp < 0.02) { c.bay = null; c.lat = c.lat0; } return Infinity; }       // Pflug vorbei: weiterfahren, Spur wieder verlassen
    const d = c.sT - B.stop;
    return d > -0.5 ? (d < 0.3 ? 0 : Math.sqrt(2 * A_STOP * d)) : Infinity;
  }

  private isBanned(s: number, m = 0): boolean { for (const [a, b] of this.banned) if (s > a - m && s < b + m) return true; return false; }

  private trySpawn(initial = false): void {
    const onc = this.rnd() < this.target[1] / Math.max(1e-9, this.target[0] + this.target[1]);
    const cnt = [0, 0]; for (const c of this.cars) if (c.on) cnt[c.dir > 0 ? 0 : 1]++;
    const idx = onc ? 1 : 0, tg = this.target[idx];
    if (tg <= 0 || cnt[idx] >= Math.floor(tg) + (this.rnd() < tg - Math.floor(tg) ? 1 : 0)) return;
    const slot = this.cars.find((c) => !c.on); if (!slot) return;
    const dir: 1 | -1 = onc ? -1 : 1;
    const lo = initial ? 90 : this.ahead * 0.96, hi = initial ? this.ahead : this.ahead;
    const s = this.pS + lo + this.rnd() * (hi - lo);
    if (s < 70 || s > this.route.length - 50 || this.isBanned(s, 30) || this.isBanned(s + dir * 60) ) return;
    const lat = (dir > 0 ? -1 : 1) * this.q + (this.rnd() - 0.5) * 0.5;
    for (const c of this.cars) if (c.on && c.dir === dir && Math.abs(c.sT - s) < 45) return;
    if (dir < 0 && this.haz.length === 0 && this.hazards) this.haz = this.hazards().filter((h) => h.active);
    let vCap = 1e9;
    if (dir < 0) { const p = this.plowFor(s); if (p) { vCap = this.bayCap(s, p); if (vCap < 3) return; } }       // vor dem Pflug: vorsichtig erscheinen; ohne Bucht dazwischen gar nicht
    // außer Sicht: Luftlinie zum Spieler mindestens so weit wie der Spawnabstand (Kehren!)
    const p = this.route.offset(s, lat);
    if (!initial && Math.hypot(p[0] - this.ex, p[1] - this.ez) < this.ahead * 0.85) return;
    if (initial && Math.hypot(p[0] - this.ex, p[1] - this.ez) < 70) return;
    const ki = this.rnd() < 0.5 ? 0 : 1, sc = 0.92 + this.rnd() * 0.14, tint = Math.floor(this.rnd() * 6);
    const [v0lo, v0hi] = this.def.speeds ?? [12, 20];
    this.init(slot, ki, sc, tint, dir, s, lat, (v0lo + this.rnd() * (v0hi - v0lo)) * KINDS[this.kinds[ki]].vMul * (dir < 0 ? 1.15 : 1));
    if (slot.speed > vCap) { const k = vCap / slot.speed; slot.speed = vCap; slot.vx = slot.tvx = slot.vx * k; slot.vz = slot.tvz = slot.vz * k; }
    if (!initial && this.onFx && this.inSight(slot)) { slot.build = 0.5; this.onFx(slot, 1); }      // im Bild: setzt sich aus Partikeln zusammen
  }

  private init(slot: TCar, ki: number, sc: number, tint: number, dir: 1 | -1, s: number, lat: number, v0: number): void {
    const K = KINDS[this.kinds[ki]];
    Object.assign(slot, { kind: ki, scale: sc, tint, dir, lat, sT: s, v0, hx: K.hx * sc, hz: K.hz * sc, mass: K.mass * sc, yawRate: 0, stuck: 0, err: 0, build: 0, lat0: lat, bay: null, on: true });
    slot.speed = Math.min(v0, this.planAt(dir, s));
    slot.soft.m = slot.mass * EFF; slot.soft.I = slot.soft.m * (slot.hx * slot.hx + slot.hz * slot.hz) / 3;
    const a = this.route.at(s), h = dirVec(a, dir), p = this.route.offset(s, lat);
    slot.x = p[0]; slot.z = p[1]; slot.yaw = Math.atan2(-h[0], -h[1]); slot.vx = slot.tvx = h[0] * slot.speed; slot.vz = slot.tvz = h[1] * slot.speed;
  }
  /** Test/Werkzeug: Fahrzeug fest an eine Stelle setzen (dir 1 = mit der Strecke, -1 = entgegen) */
  place(dir: 1 | -1, s: number, v0: number, kind = 0, lat?: number): TCar | null {
    const slot = this.cars.find((c) => !c.on); if (!slot) return null;
    this.init(slot, kind, 1, 0, dir, s, lat ?? (dir > 0 ? -this.q : this.q), v0); return slot;
  }

  /** einen Physikschritt voranschreiten; (px,pz) = Position des Spielers */
  step(dt: number, px: number, pz: number, fx = 0, fz = 0): void {
    this.t += dt;
    this.ex = px; this.ez = pz; this.fx = fx; this.fz = fz;
    this.pS = this.route.nearest(px, pz, this.pS, 80).s;
    const R = this.route;
    this.haz = this.hazards ? this.hazards().filter((h) => h.active) : [];
    for (const c of this.cars) {
      if (!c.on) continue;
      if (c.build > 0) c.build -= dt;
      // Tempo des Sollpunkts: Plan, Mindestabstand zum Vordermann derselben Spur
      let vP = Math.min(c.v0, this.planAt(c.dir, c.sT));
      for (const o of this.cars) {
        if (o === c || !o.on || o.dir !== c.dir || Math.abs(o.lat - c.lat) > 1.6) continue;
        const gap = (o.sT - c.sT) * c.dir;
        if (gap > 0 && gap < GAP * 3) vP = Math.min(vP, Math.max(0, o.speed + (gap - GAP) * 0.5));
      }
      for (const g of this.gates) {
        if (!g.closed()) continue;
        const stop = c.dir > 0 ? g.s - (g.off?.[0] ?? 10) - c.hz : g.s + (g.off?.[1] ?? 6) + c.hz, d = (stop - c.sT) * c.dir;     // Halteposition: 3 m vor dem Schrankenarm (Arm 7 m vor dem Gleis)
        if (d > -0.8) vP = Math.min(vP, d < 0.3 ? 0 : Math.sqrt(2 * A_STOP * d));
      }
      if (c.dir < 0 && this.bays.length) { const cap = this.bayStep(c); if (!c.on) continue; vP = Math.min(vP, cap); }
      if (c.err > 2.5) vP = Math.min(vP, 3);          // weit abgedrängt: langsam zurückfinden statt davonzufahren
      c.speed += Math.max(-A_BRK * 1.6 * dt, Math.min(2 * dt, vP - c.speed));
      // Sollpunkt, -geschwindigkeit, -kurs
      const a = R.at(c.sT), h = dirVec(a, c.dir), nx = a.dz, nz = -a.dx;
      const tx = a.x + a.dz * c.lat, tz = a.z - a.dx * c.lat;
      const ex = tx - c.x, ez = tz - c.z, evx = h[0] * c.speed - c.vx, evz = h[1] * c.speed - c.vz;
      const et = ex * h[0] + ez * h[1], en = ex * nx + ez * nz, vt = evx * h[0] + evz * h[1], vn = evx * nx + evz * nz;
      let at = K_T * et + C_T * vt, an = K_N * en + C_N * vn;
      if (c.touch > 0) { c.touch -= dt; at = an = 0; c.vx *= 1 - 1.5 * dt; c.vz *= 1 - 1.5 * dt; }       // am Spieler: nicht schieben/ziehen, erst nach dem Loslassen zurück in die Spur
      const al = Math.hypot(at, an); if (al > A_MAX) { at *= A_MAX / al; an *= A_MAX / al; }
      c.tvx = h[0] * c.speed; c.tvz = h[1] * c.speed;
      c.vx += (at * h[0] + an * nx) * dt; c.vz += (at * h[1] + an * nz) * dt;
      c.x += c.vx * dt; c.z += c.vz * dt;
      const yT = Math.atan2(-h[0], -h[1]);
      let ey = yT - c.yaw; while (ey > Math.PI) ey -= 2 * Math.PI; while (ey < -Math.PI) ey += 2 * Math.PI;
      c.yawRate += (K_Y * ey - C_Y * c.yawRate) * dt; c.yaw += c.yawRate * dt;
      c.err = Math.hypot(ex, ez);
      c.sT += c.dir * c.speed * dt * Math.max(0, Math.min(1, 1 - (c.err - 4) / 6));      // Sollpunkt läuft nach dem Schritt weiter
      c.stuck = c.err > 2.2 ? c.stuck + dt : 0;
      c.vx = Number.isFinite(c.vx) ? c.vx : 0;
      // Abbauen nur außer Sicht (sonst: zurück zur Spur finden, warten); sichtbar am Streckenende / nach 20 s Hängen: Partikel
      const rel = (c.sT - this.pS), dist = Math.hypot(c.x - px, c.z - pz), seen = this.inSight(c);
      if (c.sT < 20 || c.sT > R.length - 30) { this.remove(c); continue; }
      if (c.err > GONE_DIST || c.stuck > 5) { if (!seen || c.stuck > 20) this.remove(c); continue; }
      if (((rel < -this.behind && dist > 50) || rel > this.ahead + 90) && !seen) c.on = false;
    }
    this.cool -= dt;
    if (this.cool <= 0) { this.cool = 0.4; this.trySpawn(); }
  }
}

function dirVec(a: { dx: number; dz: number }, dir: 1 | -1): [number, number] { return [a.dx * dir, a.dz * dir]; }

/** Verkehr für einen Kurs bauen (null = keiner). Kein Spawn nahe Bahnübergängen; vor geschlossener Schranke hält der Verkehr. */
export function makeTraffic(course: { net?: Net | null; signals?: NetSignals | null; suburb?: { signals: { s: number }[] } | null; length?: number; traffic?: TrafficDef | null; route: Route; roadWidth: number; world: string; id: string; fog: { far: number }; moverDefs: { kind: string; s?: number }[]; bays?: BayDef[]; start?: { x: number; z: number } }, movers?: { t: number; crossings: { def: { s: number }; warn: boolean }[]; convoys: { def: { look: string; s0: number; s1: number; speed: number }; moving: boolean }[] } | null): TrafficLike | null {
  const d = course.traffic; if (!d || d.density <= 0) return null;
  if (course.net && course.signals !== undefined) { let sd = 7; for (const ch of course.id) sd = (Math.imul(sd, 31) + ch.charCodeAt(0)) | 0; return new NetTraffic(course.net, course.signals, d, course.world, sd, course.start ?? course.route.at(6), course.fog.far); }
  const banned: [number, number][] = [];
  for (const m of course.moverDefs) if (m.kind === 'crossing' && m.s !== undefined) banned.push([m.s - 45, m.s + 45]);
  let seed = 7; for (const ch of course.id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  const env: TrafficEnv = { bays: course.bays };
  if (movers) { env.gates = gatesFrom(movers); env.hazards = () => movers.convoys.filter((c) => c.def.look === 'plow').map((c) => ({ s: c.def.s0 + Math.min(movers.t, (c.def.s1 - c.def.s0) / c.def.speed) * c.def.speed, hz: 3.9, active: c.moving })); }
  let tr: Traffic | null = null;
  // Vorstadt: Verkehr hält an roten Ampeln (billig: dieselbe Gate-Logik wie an der Schranke, Phase aus der Verkehrszeit)
  const L = course.length ?? course.route.length;
  course.suburb?.signals.forEach((g, k) => { if (g.s > 30 && g.s < L - 40) (env.gates ??= []).push({ s: g.s, off: [3.6, 3.6], closed: () => tr !== null && sigPhase(tr.t, k) > 0 }); });
  tr = new Traffic(course.route, course.roadWidth / 2, d, course.world, seed, banned, course.fog.far, 6, env);
  return tr;
}

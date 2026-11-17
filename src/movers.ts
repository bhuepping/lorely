// Bewegte Dinge ohne three: Zeit = Summe der Physikschritte (deterministisch). Kollisionen über Obstacles.dynBoxes/dynCircles.
import type { Route } from './level';
import type { Box, Circle } from './physics/obstacles';
import type { Props } from './physics/props';
import { flatRail, type RailPlan } from './rail';

export type MoverDef =
  | { kind: 'crossing'; s: number; period: number; phase?: number; speed?: number; len?: number }          // Bahnübergang: Gleis quer zur Straße bei s, Schranke 7 m davor
  | { kind: 'balls'; s: number; side?: 1 | -1; period: number; phase?: number; r?: number; speed?: number; reach?: number }   // Lawinenbrocken quer über die Straße
  | { kind: 'convoy'; look: 'plow' | 'buggy'; s0: number; s1: number; speed: number; lat: number }          // Fahrzeug fährt auf der Strecke, biegt bei s1 an den Rand ab
  | { kind: 'gulls'; x: number; z: number; r: number; n: number; h: number }                                // nur Optik
  | { kind: 'ferry'; path: [number, number][]; speed: number; wait?: number };                             // nur Optik, pendelt auf dem Pfad

type DBox = Box & { vx: number; vz: number; on: boolean };
type DCircle = Circle & { vx: number; vz: number; on: boolean };

export interface Crossing { x: number; z: number; kx: number; kz: number; yaw: number; gate: number; train: boolean; trainPos: number; len: number; gateBox: DBox; trainBox: DBox; gs: number; warn: boolean; def: Extract<MoverDef, { kind: 'crossing' }>; lead: number; broken: boolean; rail: RailPlan; base: number; gx: number; gz: number; tx: number; tz: number; nx: number; nz: number }

/** Schranken-Stücke: je Bahnübergang so viele Props-Körper (Klötze), ab Index base */
export const BARRIER_PIECES = 4;
/** Parkplätze für die Stücke (weit weg, außerhalb der Sichtweite) – gehören zu Props, damit sie den Körpern Indizes geben */
export const barrierParking = (defs: MoverDef[]): [number, number][] =>
  Array.from({ length: defs.filter((d) => d.kind === 'crossing').length * BARRIER_PIECES }, (_, k) => [-5000 - k * 3, -5000] as [number, number]);
export interface Ball { x: number; z: number; r: number; on: boolean; roll: number; def: Extract<MoverDef, { kind: 'balls' }>; c: DCircle }
export interface Convoy { x: number; z: number; yaw: number; on: boolean; box: DBox; def: Extract<MoverDef, { kind: 'convoy' }>; moving: boolean }
export interface Ferry { x: number; z: number; yaw: number; def: Extract<MoverDef, { kind: 'ferry' }>; len: number }

const smooth01 = (v: number) => Math.min(1, Math.max(0, v));

export class Movers {
  t = 0;
  readonly boxes: DBox[] = []; readonly circles: DCircle[] = [];
  readonly crossings: Crossing[] = []; readonly balls: Ball[] = []; readonly convoys: Convoy[] = []; readonly ferries: Ferry[] = [];
  readonly gulls: Extract<MoverDef, { kind: 'gulls' }>[] = [];
  private pieceNext: number;
  constructor(private route: Route, private half: number, defs: MoverDef[], propBase = 0, rails: RailPlan[] = []) {
    this.pieceNext = propBase;
    for (const d of defs) {
      if (d.kind === 'crossing') {
        const a = route.at(d.s), kx = -a.dz, kz = a.dx, g = route.at(d.s - 7), v = d.speed ?? 28, len = d.len ?? 44;
        const mk = (): DBox => ({ x: 0, z: 0, hx: 1, hz: 1, yaw: 0, vx: 0, vz: 0, on: false });
        const gateBox = mk(), trainBox = mk();
        Object.assign(gateBox, { x: g.x, z: g.z, hx: half + 0.4, hz: 0.2, yaw: route.yawAt(d.s - 7) });
        Object.assign(trainBox, { hx: 1.6, hz: len / 2, yaw: Math.atan2(kx, kz), vx: kx * v, vz: kz * v });
        // Schranke ist keine Hitbox mehr (Auto zerbricht sie, siehe barrierHit); nur der Zug blockiert
        this.boxes.push(trainBox);
        this.crossings.push({ x: a.x, z: a.z, kx, kz, yaw: Math.atan2(kx, kz), gate: 0, train: false, trainPos: -1e9, len, gateBox, trainBox, gs: 0, warn: false, def: d, lead: v * 5 + 24, broken: false, rail: rails[this.crossings.length] ?? flatRail(a.x, a.z, kx, kz), base: this.pieceNext, gx: g.x, gz: g.z, tx: g.dx, tz: g.dz, nx: g.dz, nz: -g.dx });
        this.pieceNext += BARRIER_PIECES;
      } else if (d.kind === 'balls') {
        const r = d.r ?? 1.6, c: DCircle = { x: 0, z: 0, r, e: 0, vx: 0, vz: 0, on: false };
        this.circles.push(c); this.balls.push({ x: 0, z: 0, r, on: false, roll: 0, def: d, c });
      } else if (d.kind === 'convoy') {
        const box: DBox = { x: 0, z: 0, hx: d.look === 'plow' ? 1.75 : 1.0, hz: d.look === 'plow' ? 3.9 : 1.8, yaw: 0, vx: 0, vz: 0, on: true };
        this.boxes.push(box); this.convoys.push({ x: 0, z: 0, yaw: 0, on: true, box, def: d, moving: true });
      } else if (d.kind === 'gulls') this.gulls.push(d);
      else if (d.kind === 'ferry') {
        let len = 0; for (let i = 0; i + 1 < d.path.length; i++) len += Math.hypot(d.path[i + 1][0] - d.path[i][0], d.path[i + 1][1] - d.path[i][1]);
        this.ferries.push({ x: d.path[0][0], z: d.path[0][1], yaw: 0, def: d, len });
      }
    }
    this.update(0);
  }
  get any(): boolean { return this.crossings.length + this.balls.length + this.convoys.length + this.gulls.length + this.ferries.length > 0; }
  /** Auto (Position, Geschwindigkeit) fährt durch eine geschlossene Schranke: Arm zerbricht in Klötze (Props), bleibt bis Fahrtende kaputt */
  barrierHit(x: number, z: number, vx: number, vz: number, props: Props): void {
    for (const c of this.crossings) {
      if (c.broken || c.gate < 0.55) continue;
      const rx = x - c.gx, rz = z - c.gz, along = rx * c.tx + rz * c.tz, lat = rx * c.nx + rz * c.nz;
      if (Math.abs(along) > 2.2 || Math.abs(lat) > this.half + 0.6) continue;
      c.broken = true; c.gs = 0; c.gate = 0; c.warn = false;
      for (let i = 0; i < BARRIER_PIECES; i++) {
        const o = (i - (BARRIER_PIECES - 1) / 2) * 1.0, side = Math.sign(o);   // Stücke 1 m auseinander, nach außen wegfliegend
        props.launch(c.base + i, c.gx + c.nx * o, c.gz + c.nz * o, vx * 0.4 + c.nx * side * 3, 3, vz * 0.4 + c.nz * side * 3);
      }
    }
  }

  /** einen Physikschritt voranschreiten */
  step(dt: number): void { this.t += dt; this.update(dt); }

  private update(dt: number): void {
    const t = this.t, R = this.route;
    for (const c of this.crossings) {
      const d = c.def, v = d.speed ?? 28, tc = (t + (d.phase ?? 0)) % d.period, Lr = c.lead + 40;
      const front = -Lr + v * tc, rear = front - c.len;
      c.train = rear < Lr && front > -Lr;      // sichtbar/aktiv, solange er nicht außer Sichtweite ist
      c.trainPos = front - c.len / 2;
      // Schranke: schließt 5 s vor der Ankunft (front = -v*5), öffnet wenn das Zugende 8 m hinter der Straße ist
      const tClose = (Lr - v * 5) / v, tOpen = (Lr + 8 + c.len) / v;
      const target = tc >= tClose && tc < tOpen && !c.broken ? 1 : 0;
      c.gs += Math.sign(target - c.gs) * Math.min(Math.abs(target - c.gs), dt / 1.2);
      c.gate = c.gs; c.warn = tc >= tClose - 0.3 && tc < tOpen + 0.5;
      c.gateBox.on = c.gate > 0.55;
      const tb = c.trainBox; tb.on = c.train && Math.abs(c.trainPos) < Math.min(60 + c.len, Math.max(-c.rail.uMin, c.rail.uMax) + c.len / 2);
      tb.x = c.x + c.kx * c.trainPos; tb.z = c.z + c.kz * c.trainPos;
    }
    for (const b of this.balls) {
      const d = b.def, side = d.side ?? 1, reach = d.reach ?? 30, sp = d.speed ?? 11, tc = (t + (d.phase ?? 0)) % d.period, tr = 2 * reach / sp;
      b.on = tc < tr; b.c.on = b.on;
      const lat = side * (reach - sp * tc), a = R.at(d.s);
      b.x = a.x + a.dz * lat; b.z = a.z - a.dx * lat; b.c.x = b.x; b.c.z = b.z;
      b.c.vx = a.dz * -side * sp; b.c.vz = -a.dx * -side * sp; b.roll = sp * tc / b.r;
    }
    for (const c of this.convoys) {
      const d = c.def, tEnd = (d.s1 - d.s0) / d.speed, s = d.s0 + Math.min(t, tEnd) * d.speed;
      const away = Math.max(0, t - tEnd), sgn = d.lat >= 0 ? 1 : -1, lat = d.lat + sgn * Math.min(away * 2.5, this.half + 4 - Math.abs(d.lat) + 1.5);
      const a = R.at(s);
      c.x = a.x + a.dz * lat; c.z = a.z - a.dx * lat; c.yaw = R.yawAt(s);
      c.moving = t < tEnd;
      Object.assign(c.box, { x: c.x, z: c.z, yaw: c.yaw, vx: c.moving ? a.dx * d.speed : 0, vz: c.moving ? a.dz * d.speed : 0 });
    }
    for (const f of this.ferries) {
      const d = f.def, w = d.wait ?? 6, trip = f.len / d.speed, cyc = 2 * (trip + w), tc = t % cyc;
      let u = tc < trip ? tc * d.speed : tc < trip + w ? f.len : tc < 2 * trip + w ? f.len - (tc - trip - w) * d.speed : 0;
      const dir = tc >= trip + w && tc < 2 * trip + w ? -1 : 1;
      let acc = 0;
      for (let i = 0; i + 1 < d.path.length; i++) {
        const [ax, az] = d.path[i], [bx, bz] = d.path[i + 1], L = Math.hypot(bx - ax, bz - az);
        if (u <= acc + L || i === d.path.length - 2) { const k = smooth01((u - acc) / L); f.x = ax + (bx - ax) * k; f.z = az + (bz - az) * k; f.yaw = Math.atan2(bx - ax, bz - az) + (dir < 0 ? Math.PI : 0); break; }
        acc += L;
      }
    }
  }
}

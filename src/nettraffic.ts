// Verkehr am Straßennetz (Vorstadt): Autos fahren über alle Netzstraßen (Rechtsverkehr, eine Spur je Richtung), biegen ab, halten an Ampeln
// (signals.ts, gleiche Schaltung wie die Lampen) und stauen sich dahinter. Aufbau wie traffic.ts: Sollpunkt auf der Spur, Körper per Feder daran,
// der Spieler kann ihn anschieben. Spuren = Stücke je Kante und Richtung, Abbieger = Verbinder durch die Kreuzung. Ohne three, deterministisch.
// Vorfahrt: Ein Auto belegt seinen Verbinder erst, wenn kein kreuzender belegt ist, der Ausgang Platz hat und (Ampel) Grün ist – so gibt es keine Zusammenstöße.
import { Route, rng } from './level';
import type { Net, NetEdge, NetNode } from './net';
import type { NetSignals, SigHead } from './signals';
import { KINDS, WORLD_KINDS, GONE_DIST, newCar, type TCar, type TrafficDef, type TrafficLike } from './traffic';

const K_T = 4, C_T = 3.6, K_N = 8, C_N = 5.1, K_Y = 14, C_Y = 6.4, A_MAX = 14;
const A_STOP = 2.4, A_LAT = 3.0, A_BRK = 2.4, LINE = 2.2;          // Bremsverzögerung am Halt, Querbeschleunigung, Haltelinie vor dem Rand der Kreuzungsfläche (wie signals.ts)
const CONF_D = 2.8;          // Verbinder näher als so (m) kreuzen sich
const S0 = 3.0, TAU = 0.6, B_GIPPS = 1.8;     // Mindestabstand im Stau (m), Reaktionszeit, geplante Verzögerung (Folgemodell)
const R_ACT = 340, SIGHT = 300, MIN_SPAWN = 60;
const INIT_N = 40, WARM0 = 0.5, WARM_T = 90;     // Erstbesetzung (Autos), Zufluss von außen: Anteil beim Start → 1 nach WARM_T s
const INIT_CLEAR = 330, INIT_GAP = 34;     // Erstbesetzung beim Start: Abstand zur nächsten Ampel (m) und zwischen Autos einer Spur (fließender Verkehr, keine Schlange)
const CRUISE: [number, number][] = [[16, 15], [12, 13.5], [11, 12.5], [8, 9], [0, 8]];    // Fahrbahnbreite (m) ab -> Reisetempo m/s
/** Fahrzeuge je km (beide Richtungen) nach Fahrbahnbreite: große Straßen mehr, Wohnstraßen wenig */
const DENS: [number, number][] = [[16, 48], [12, 40], [11, 30], [8, 9], [0, 5]];
const byW = (t: [number, number][], w: number) => t.find((r) => w >= r[0])![1];

export interface Piece {
  id: number; kind: 'lane' | 'conn'; route: Route; length: number; vlim: Float64Array; vTurn: number;
  edge: NetEdge; dir: 1 | -1; node: NetNode;     // lane: Kante + Richtung, node = Ende; conn: node = Kreuzung
  outs: Piece[];                                 // lane: Verbinder am Ende; conn: [Ausgangsspur]
  from: Piece | null; to: Piece | null; turn: 0 | 1 | -1; pr: number;     // conn
  conflicts: Set<Piece>; cars: NCar[];
  /** Haltepunkte der Spur (Meter ab Spuranfang): Kreuzung (Ampel/Vorfahrt) bzw. Fußgängerampel */
  stops: { at: number; ped: boolean; head: SigHead | null }[];
  cap: number; cruise: number; dead: boolean; w: number;
}
export interface NCar extends TCar { pc: Piece; s: number; plan: Piece | null; claim: Piece | null; pace: number; cruise: number; wait: number }
interface Junc { node: NetNode; conns: Piece[]; occ: NCar[] }

const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class NetTraffic implements TrafficLike {
  readonly cars: NCar[] = [];
  readonly kinds: string[];
  readonly lanes: Piece[] = [];
  readonly juncs = new Map<string, Junc>();
  t = 0;
  /** Signalzeit (Spiel: session.sigT); ohne: eigene Uhr = Summe der Schritte */
  sigClock: (() => number) | null = null;
  onFx: ((c: TCar, mode: 0 | 1) => void) | null = null;
  /** Zähler (Tests/Werkzeug): Abbieger/Geradeaus-Freigaben, Kanten mit Autos */
  turns = { straight: 0, right: 0, left: 0 };
  seenEdges = new Set<string>();
  private pieces: Piece[] = [];
  private rnd: () => number;
  private totW = 0; private cum: number[] = [];
  private cool = 0; private maxN: number;
  private ex = 1e9; private ez = 1e9; private fx = 0; private fz = 0;
  private scale: number;

  constructor(readonly net: Net, readonly signals: NetSignals | null, readonly def: TrafficDef, readonly world: string, seed: number, start: { x: number; z: number }, fogFar = 520) {
    this.kinds = WORLD_KINDS[world] ?? WORLD_KINDS.practice;
    this.rnd = rng(seed ^ 0x6e17);
    this.scale = def.density;
    this.ex = start.x; this.ez = start.z;
    this.build();
    this.maxN = 64;
    for (let i = 0; i < this.maxN; i++) { const c = newCar() as NCar; c.pc = null as unknown as Piece; c.s = 0; c.plan = null; c.claim = null; c.pace = 1; c.cruise = 10; c.wait = 0; c.dir = 1; c.sT = 0; this.cars.push(c); }
    void fogFar;
    for (let k = 0; k < this.maxN * 12 && this.active < INIT_N; k++) this.trySpawn(true);
  }
  get active(): number { let n = 0; for (const c of this.cars) if (c.on) n++; return n; }

  // ── Aufbau: Spuren + Verbinder ──
  private mkRoute(pts: [number, number][]): Route {
    const out: [number, number][] = [];
    for (const p of pts) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > 0.4) out.push(p);
    if (out.length < 2) out.push([out[0][0] + 0.5, out[0][1]]);
    return new Route(out);
  }
  private limits(r: Route): Float64Array {
    const n = Math.floor(r.length) + 1, v = new Float64Array(n + 1), W = 9;
    for (let i = 0; i <= n; i++) {
      const s = Math.min(i, r.length), a = r.at(Math.max(0, s - W)), b = r.at(s), d = r.at(Math.min(r.length, s + W));
      const dh = wrap(Math.atan2(d.dz, d.dx) - Math.atan2(a.dz, a.dx)), len = Math.min(r.length, s + W) - Math.max(0, s - W), kappa = Math.abs(dh) / Math.max(4, len);
      void b; v[i] = kappa < 1e-4 ? 99 : Math.sqrt(A_LAT / kappa);
    }
    for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * A_BRK));
    return v;
  }
  private piece(p: Partial<Piece> & { kind: 'lane' | 'conn'; route: Route; edge: NetEdge; dir: 1 | -1; node: NetNode }): Piece {
    const pc: Piece = { id: this.pieces.length, length: p.route.length, vlim: this.limits(p.route), vTurn: 99, outs: [], from: null, to: null, turn: 0, pr: 0, conflicts: new Set(), cars: [], stops: [], cap: 1, cruise: 10, dead: false, w: p.edge.def.w, ...p };
    this.pieces.push(pc); return pc;
  }
  private build(): void {
    const net = this.net, lane = new Map<string, Piece>();
    const drivable = (e: NetEdge) => e.def.kind !== 'fuss';
    for (const e of net.edges) {
      if (!drivable(e)) continue;
      for (const dir of [1, -1] as const) {
        const cutA = e.a.cutOf(e), cutB = e.b.cutOf(e), s0 = cutA, s1 = e.length - cutB, q = e.half * 0.5, n = Math.max(2, Math.ceil((s1 - s0) / 3));
        const pts: [number, number][] = [];
        for (let k = 0; k <= n; k++) {
          const se = dir > 0 ? s0 + (s1 - s0) * k / n : s1 - (s1 - s0) * k / n, a = e.at(se), hx = a.dx * dir, hz = a.dz * dir;
          pts.push([a.x - hz * q, a.z + hx * q]);       // rechts der Fahrtrichtung = (−hz, hx)
        }
        const end = dir > 0 ? e.b : e.a;
        const L = this.piece({ kind: 'lane', route: this.mkRoute(pts), edge: e, dir, node: end });
        L.cruise = byW(CRUISE, e.def.w); L.cap = Math.max(1, Math.round(e.length / 1000 * byW(DENS, e.def.w) * this.scale * 0.75 + 0.3));
        lane.set(e.id + '|' + dir, L); this.lanes.push(L);
        for (const h of this.signals?.heads ?? []) {   // Fußgängerampeln dieser Spur
          if (h.ped && h.edge === e && h.dir === dir) { const at = dir > 0 ? h.s - s0 : s1 - h.s; if (at > 6 && at < L.length - 6) L.stops.push({ at: at, ped: true, head: h }); }
        }
      }
    }
    // Kreuzungen: Verbinder je (Zufahrt, Ausfahrt) ohne Wenden
    for (const nd of net.nodes.values()) {
      const arms = nd.edges.filter((e) => drivable(e.edge));
      const ins = arms.map((e) => lane.get(e.edge.id + '|' + (e.end === 1 ? 1 : -1))!), outs = arms.map((e) => lane.get(e.edge.id + '|' + (e.end === 0 ? 1 : -1))!);
      const J: Junc = { node: nd, conns: [], occ: [] }; this.juncs.set(nd.id, J);
      ins.forEach((I) => {
        if (arms.length < 2) { I.dead = true; return; }
        const E = I.route.at(I.length);
        for (const O of outs) {
          if (O.edge === I.edge) continue;
          const S = O.route.at(0), D = Math.hypot(S.x - E.x, S.z - E.z), k = Math.max(1, D * 0.42), pts: [number, number][] = [], n = Math.max(3, Math.ceil(D * 1.1 / 2));
          const p0 = [E.x, E.z], p1 = [E.x + E.dx * k, E.z + E.dz * k], p2 = [S.x - S.dx * k, S.z - S.dz * k], p3 = [S.x, S.z];
          for (let i = 0; i <= n; i++) { const u = i / n, m = 1 - u, a = m * m * m, b = 3 * m * m * u, c = 3 * m * u * u, d = u * u * u; pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]); }
          const ang = wrap(Math.atan2(S.dz, S.dx) - Math.atan2(E.dz, E.dx)), turn: 0 | 1 | -1 = Math.abs(ang) < 0.45 ? 0 : (E.dx * S.dz - E.dz * S.dx) > 0 ? 1 : -1;
          const C = this.piece({ kind: 'conn', route: this.mkRoute(pts), edge: I.edge, dir: I.dir, node: nd, from: I, to: O, turn });
          C.outs = [O]; C.pr = I.edge.def.w + (turn === 0 ? 3 : turn === 1 ? 1.5 : 0);
          C.vTurn = Math.max(3.5, Math.min(...Array.from(C.vlim).slice(0, Math.floor(C.length) + 1)));
          I.outs.push(C); J.conns.push(C);
        }
        I.stops.push({ at: I.length - LINE, ped: false, head: this.signals && nd.signal ? this.signals.head(nd, I.edge, I.dir) ?? null : null });
      });
      // Konflikte: kreuzende oder zusammenlaufende Verbinder (gleiche Zufahrt: nicht, die ordnet das Folgen)
      for (const A of J.conns) for (const B of J.conns) {
        if (A === B || A.from === B.from) continue;
        let hit = A.to === B.to;
        for (let sa = 0; sa <= A.length && !hit; sa += 1) { const pa = A.route.at(sa); for (let sb = 0; sb <= B.length; sb += 1) { const pb = B.route.at(sb); if (Math.hypot(pa.x - pb.x, pa.z - pb.z) < CONF_D) { hit = true; break; } } }
        if (hit) A.conflicts.add(B);
      }
    }
    for (const L of this.lanes) L.stops.sort((a, b) => a.at - b.at);
    let w = 0; for (const L of this.lanes) { w += L.length * byW(DENS, L.edge.def.w); this.cum.push(w); } this.totW = w;
  }

  // ── Sichtbarkeit/Abbau ──
  inSight(c: { x: number; z: number }): boolean {
    const dx = c.x - this.ex, dz = c.z - this.ez, d = Math.hypot(dx, dz);
    if (d > SIGHT) return false;
    return (this.fx === 0 && this.fz === 0) || dx * this.fx + dz * this.fz > -14;
  }
  private release(c: NCar): void {
    if (!c.claim) return;
    const J = this.juncs.get(c.claim.node.id)!, i = J.occ.indexOf(c); if (i >= 0) J.occ.splice(i, 1); c.claim = null;
  }
  private detach(c: NCar): void { const a = c.pc.cars, i = a.indexOf(c); if (i >= 0) a.splice(i, 1); }
  private remove(c: NCar, quiet = false): void { if (!quiet && this.onFx && this.inSight(c)) this.onFx(c, 0); this.release(c); this.detach(c); c.on = false; }
  private clock(): number { return this.sigClock ? this.sigClock() : this.t; }

  // ── Spawn ──
  private pickPlan(L: Piece): Piece | null {
    if (!L.outs.length) return null;
    const wts = L.outs.map((C) => (C.turn === 0 ? 0.56 : 0.22) * (C.to!.dead ? 0.4 : 1) * (C.to!.edge.def.w > 7 ? 1 : 0.8));
    let r = this.rnd() * wts.reduce((a, b) => a + b, 0); for (let i = 0; i < wts.length; i++) { r -= wts[i]; if (r <= 0) return L.outs[i]; }
    return L.outs[L.outs.length - 1];
  }
  private enterLane(c: NCar, L: Piece): void {
    c.pc = L; L.cars.push(c); c.plan = this.pickPlan(L); c.cruise = L.cruise * c.pace * KINDS[this.kinds[c.kind]].vMul; this.seenEdges.add(L.edge.id);
  }
  /** Weg (m) von s auf der Spur bis zur nächsten Ampel, geradeaus weiter über unbeampelte Kreuzungen (bis 3 Spuren) */
  private toSignal(L: Piece, s: number): number {
    let d = L.length - s, P = L;
    for (let k = 0; k < 3 && !P.node.signal; k++) {
      const C = P.outs.find((o) => o.turn === 0) ?? P.outs[0]; if (!C || !C.to) return 1e9;
      d += C.length + C.to.length; P = C.to;
    }
    return P.node.signal ? d : 1e9;
  }
  private trySpawn(initial = false): void {
    const slot = this.cars.find((c) => !c.on); if (!slot || this.totW <= 0) return;
    if (!initial && this.rnd() > Math.min(1, WARM0 + (1 - WARM0) * this.t / WARM_T)) return;     // Anlauf: Zufluss von außen zunächst dünner (noch keine Platoons an den Ampeln)
    let r = this.rnd() * this.totW, i = 0; while (i < this.cum.length - 1 && r > this.cum[i]) i++;
    const L = this.lanes[i];
    if (L.cars.length >= L.cap || L.length < 72) return;
    const s = 32 + this.rnd() * (L.length - 68), p = L.route.at(s);   // nie nahe dem Spuranfang: Zufahrer aus der Kreuzung müssten sofort bremsen
    if (initial && this.toSignal(L, s) < INIT_CLEAR) return;     // Erstbesetzung: nicht dicht vor einer Ampel (stünde sofort als Schlange)
    const dx = p.x - this.ex, dz = p.z - this.ez, d = Math.hypot(dx, dz);
    if (initial ? d < MIN_SPAWN || d > R_ACT - 20 : d < MIN_SPAWN || d > R_ACT - 25 || this.inSight(p)) return;
    let lead: NCar | null = null;
    for (const o of L.cars) { if (Math.abs(o.s - s) < (initial ? INIT_GAP : 16)) return; if (o.s > s && (!lead || o.s < lead.s)) lead = o; }
    const ki = this.rnd() < 0.5 ? 0 : 1, sc = 0.92 + this.rnd() * 0.14, K = KINDS[this.kinds[ki]];
    Object.assign(slot, { kind: ki, scale: sc, tint: Math.floor(this.rnd() * 6), dir: 1, lat: 0, sT: 0, hx: K.hx * sc, hz: K.hz * sc, mass: K.mass * sc, yawRate: 0, stuck: 0, err: 0, build: 0, lat0: 0, bay: null, touch: 0, on: true, s, claim: null, wait: 0, pace: 0.88 + this.rnd() * 0.24 });
    slot.soft.m = slot.mass * 0.35; slot.soft.I = slot.soft.m * (slot.hx * slot.hx + slot.hz * slot.hz) / 3;
    this.enterLane(slot, L);
    const v = Math.min(slot.cruise, L.vlim[Math.floor(s)] ?? 99, lead ? lead.speed + 2 : 99, Math.sqrt(2 * A_STOP * 0.7 * (L.length - LINE - s)));
    slot.speed = v; slot.v0 = v;
    slot.x = p.x; slot.z = p.z; slot.yaw = Math.atan2(-p.dx, -p.dz); slot.vx = slot.tvx = p.dx * v; slot.vz = slot.tvz = p.dz * v;
    if (!initial && this.onFx && this.inSight(slot)) { slot.build = 0.5; this.onFx(slot, 1); }
  }

  // ── Fahren ──
  /** Abstand (Stoßstange bis Stoßstange) und Tempo des Vordermanns auf dem geplanten Weg; null = frei */
  private leader(c: NCar): { gap: number; v: number } | null {
    const P = c.pc, front = c.s + c.hz; let best: { gap: number; v: number } | null = null;
    const look = (Q: Piece, base: number, min: number) => { for (const o of Q.cars) { if (o === c || o.s < min) continue; const gap = Math.max(0, base + o.s - o.hz - front); if (base + o.s - o.hz - front > -3 && (!best || gap < best.gap)) best = { gap, v: o.speed }; } };
    look(P, 0, c.s + 0.01);
    if (P.kind === 'lane') {
      if (c.plan) { look(c.plan, P.length, -1e9); if (c.plan.to) look(c.plan.to, P.length + c.plan.length, -1e9); }
      for (const K of P.outs) if (K !== c.plan) for (const o of K.cars) if (o.s < 8) { const gap = P.length + o.s - o.hz - front; if (gap > -1 && (!best || gap < best.gap)) best = { gap, v: o.speed }; }
    } else {
      if (P.to) look(P.to, P.length, -1e9);
      for (const K of P.from!.outs) if (K !== P) for (const o of K.cars) if (o.s < 8 && o.s - o.hz > c.s - c.hz - 0.5) { const gap = o.s - o.hz - front; if (gap > -1 && (!best || gap < best.gap)) best = { gap, v: o.speed }; }
    }
    return best;
  }
  private sigGo(phaseAt: (t: number) => number, d: number, v: number): boolean {
    const t = this.clock(), now = phaseAt(t);
    if (now === 2) return false;
    const eta = d / Math.max(v, 2), later = phaseAt(t + eta + 0.35);
    if (later !== 2) return true;
    return d < v * v / (2 * 3.6);     // kann nicht mehr halten
  }
  private yields(c: NCar, C: Piece, J: Junc): boolean {
    const t = this.clock();
    for (const K of J.conns) {
      if (K === C || K.from === C.from || !C.conflicts.has(K) || K.pr <= C.pr) continue;
      if (J.node.signal && this.signals && this.signals.phase(J.node, K.from!.edge, t) !== 0) continue;
      for (const o of K.from!.cars) { if (o.plan !== K) continue; const dr = K.from!.length - o.s; if (dr < 60 && dr / Math.max(o.speed, 3) < 4.5) return true; }
    }
    return false;
  }
  private canClaim(c: NCar, C: Piece, J: Junc): boolean {
    for (const o of J.occ) if (o !== c && o.claim && (C.conflicts.has(o.claim) || o.claim.conflicts.has(C))) return false;
    for (const o of C.to!.cars) if (o.s - o.hz < 2 * c.hz + 4.5) return false;                 // Ausgang voll: nicht in die Kreuzung stellen
    for (const K of J.conns) if (K !== C && K.from === C.from) for (const o of K.cars) if (o.s - o.hz < 2 * c.hz + 2) return false;
    return !this.yields(c, C, J);
  }
  private desired(c: NCar): number {
    const P = c.pc; let vP = Math.min(c.cruise, P.vlim[Math.min(P.vlim.length - 1, Math.floor(c.s + 5))] ?? 99);
    const F = c.s + c.hz;
    if (P.kind === 'conn') vP = Math.min(vP, P.vTurn * 1.1);
    else if (c.plan) vP = Math.min(vP, Math.sqrt(c.plan.vTurn ** 2 + 2 * A_BRK * 0.8 * Math.max(0, P.length - 4 - c.s)));
    const ld = this.leader(c);
    if (ld) { const b = B_GIPPS, g = Math.max(0, ld.gap - S0); vP = Math.min(vP, -b * TAU + Math.sqrt(b * b * TAU * TAU + ld.v * ld.v + 2 * b * g)); }
    // Fußgängerampeln: auf dieser Spur und auf der Spur hinter der nächsten Kreuzung (ein Abbieger sieht sie schon im Verbinder)
    const nextL = P.kind === 'lane' ? c.plan?.to ?? null : P.to, base = P.kind === 'lane' ? (c.plan ? P.length + c.plan.length : 0) : P.length;
    for (const [L, off] of [[P.kind === 'lane' ? P : null, 0], [nextL, base]] as [Piece | null, number][]) {
      if (!L) continue;
      for (const st of L.stops) {
        const down = L !== P && !st.ped && !!st.head && L.node.signal;      // Ampel am Ende einer kurzen Folgespur: schon vor der ersten Kreuzung darauf einstellen
        if (!st.ped && !down) continue;
        const d = off + st.at - 0.3 - F, v = c.speed;
        if (d < -0.8 || d > v * v / (2 * 2.0) + 8) continue;
        const nd = L.node;
        if (!this.sigGo(st.ped ? (t) => this.signals!.pedPhase(t) : (t) => this.signals!.phase(nd, L.edge, t), d, v)) vP = Math.min(vP, d < 0.3 ? 0 : Math.sqrt(2 * A_STOP * d));
        break;
      }
    }
    if (P.kind !== 'lane') return vP;
    const J = this.juncs.get(P.node.id)!;
    for (const st of P.stops) {
      if (st.ped) continue;
      const d = st.at - 0.3 - F;
      if (d < -0.8) continue;
      const v = c.speed, near = v * v / (2 * 2.0) + 8;
      if (!c.plan) continue;
      if (c.claim) {      // schon belegt, aber noch vor der Linie: Signal weiter prüfen (Stau vor der Linie, Grün läuft ab)
        const nd = P.node;
        if (nd.signal && this.signals && st.head && d > 0 && !this.sigGo((t) => this.signals!.phase(nd, P.edge, t), d, v)) { this.release(c); vP = Math.min(vP, d < 0.3 ? 0 : Math.sqrt(2 * A_STOP * d)); }
        break;
      }
      if (d > near) continue;
      const nd = P.node, ok = (!nd.signal || !this.signals || !st.head || this.sigGo((t) => this.signals!.phase(nd, P.edge, t), d, v)) && this.canClaim(c, c.plan, J);
      if (ok) { c.claim = c.plan; J.occ.push(c); this.turns[c.plan.turn === 0 ? 'straight' : c.plan.turn === 1 ? 'right' : 'left']++; }
      else vP = Math.min(vP, d < 0.3 ? 0 : Math.sqrt(2 * A_STOP * d));
      break;
    }
    if (!c.claim && c.plan && P.stops.length && F > P.stops[P.stops.length - 1].at + 0.5 && !P.stops[P.stops.length - 1].ped) { c.claim = c.plan; J.occ.push(c); }   // nicht mehr zu halten: durch
    return vP;
  }

  step(dt: number, px: number, pz: number, fx = 0, fz = 0): void {
    this.t += dt; this.ex = px; this.ez = pz; this.fx = fx; this.fz = fz;
    for (const c of this.cars) {
      if (!c.on) continue;
      if (c.build > 0) c.build -= dt;
      const P = c.pc, vP = this.desired(c);
      if (!c.on) continue;
      c.speed += Math.max(-A_BRK * 1.6 * dt, Math.min(2 * dt, (c.err > 2.5 ? Math.min(vP, 3) : vP) - c.speed));
      const a = P.route.at(c.s), h = [a.dx, a.dz], nx = a.dz, nz = -a.dx;
      const ex = a.x - c.x, ez = a.z - c.z, evx = h[0] * c.speed - c.vx, evz = h[1] * c.speed - c.vz;
      const et = ex * h[0] + ez * h[1], en = ex * nx + ez * nz, vt = evx * h[0] + evz * h[1], vn = evx * nx + evz * nz;
      let at = K_T * et + C_T * vt, an = K_N * en + C_N * vn;
      if (c.touch > 0) { c.touch -= dt; at = an = 0; c.vx *= 1 - 1.5 * dt; c.vz *= 1 - 1.5 * dt; }
      const al = Math.hypot(at, an); if (al > A_MAX) { at *= A_MAX / al; an *= A_MAX / al; }
      c.tvx = h[0] * c.speed; c.tvz = h[1] * c.speed;
      c.vx += (at * h[0] + an * nx) * dt; c.vz += (at * h[1] + an * nz) * dt;
      c.x += c.vx * dt; c.z += c.vz * dt;
      const yT = Math.atan2(-h[0], -h[1]);
      c.yawRate += (K_Y * wrap(yT - c.yaw) - C_Y * c.yawRate) * dt; c.yaw += c.yawRate * dt;
      c.err = Math.hypot(ex, ez);
      c.s += c.speed * dt * Math.max(0, Math.min(1, 1 - (c.err - 4) / 6));
      c.stuck = c.err > 2.2 ? c.stuck + dt : 0;
      c.wait = c.speed < 0.3 ? c.wait + dt : 0;
      if (!Number.isFinite(c.vx)) c.vx = 0;
      // Stückwechsel
      while (c.on && c.s >= c.pc.length) {
        const Q = c.pc;
        if (Q.kind === 'lane') {
          if (!c.plan) { this.remove(c); break; }                                   // Sackgasse am Weltrand
          if (!c.claim) { c.claim = c.plan; this.juncs.get(Q.node.id)!.occ.push(c); }
          c.s -= Q.length; this.detach(c); c.pc = c.plan; c.pc.cars.push(c); c.plan = c.pc.to;
        } else {
          c.s -= Q.length; this.detach(c); const L = Q.to!; this.enterLane(c, L);
        }
      }
      if (!c.on) continue;
      if (c.claim && c.pc === c.claim.to && c.s - c.hz > 1) this.release(c);
      const dist = Math.hypot(c.x - px, c.z - pz), seen = this.inSight(c);
      if (c.err > GONE_DIST || c.stuck > 5) { if (!seen || c.stuck > 20) this.remove(c); continue; }
      if (dist > R_ACT && !seen) { this.remove(c, true); continue; }
      if (c.wait > 45 && (!seen || c.wait > 90)) this.remove(c);
    }
    this.cool -= dt;
    if (this.cool <= 0) { this.cool = 0.2; const n = this.active; for (let k = 0; k < 16 && n < 48; k++) this.trySpawn(); }
  }
}

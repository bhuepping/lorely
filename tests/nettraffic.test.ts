// Verkehr am Straßennetz: 3 min Simulation mit einem Beobachter, der das ganze Netz abfährt.
// Kein Auto durch ein anderes, keins über Rot an der Haltelinie, Autos auf (fast) allen Kanten, geradeaus + Abbiegen gemischt, große Straßen dichter als Wohnstraßen.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { makeTraffic } from '../src/traffic';
import { NetTraffic, type NCar, type Piece } from '../src/nettraffic';
import { Route } from '../src/level';
import { DT } from '../src/physics/vehicle';

const course = WORLDS.find((w) => w.id === 'vorstadt')!.levels[0].make(), net = course.net!;
/** Netzrundgang (benachbarte Knoten), danach wieder von vorn */
const WALK = ['x_hu', 'x_su', 'x_fu', 'x_of', 'x_oz', 'x_do', 'x_dh', 'x_hs', 'x_bu', 'x_du', 'x_dh', 'x_hs', 'x_hu', 'x_bu', 'x_du'];
const tour = new Route(net.path(WALK).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1));
const overlap = (a: NCar, b: NCar) => {
  for (const [ax, az] of [[Math.cos(a.yaw), -Math.sin(a.yaw)], [Math.sin(a.yaw), Math.cos(a.yaw)], [Math.cos(b.yaw), -Math.sin(b.yaw)], [Math.sin(b.yaw), Math.cos(b.yaw)]]) {
    const r = (c: NCar) => Math.abs(Math.cos(c.yaw) * ax - Math.sin(c.yaw) * az) * c.hx + Math.abs(Math.sin(c.yaw) * ax + Math.cos(c.yaw) * az) * c.hz;
    if (Math.abs((b.x - a.x) * ax + (b.z - a.z) * az) >= r(a) + r(b)) return false;
  }
  return true;
};

function sim(tr: NetTraffic, speed = 30) {
    const prev = new Map<NCar, { P: Piece; f: number }>(), cls = { big: 0, small: 0 }; const km = { big: 0, small: 0 };
    for (const L of tr.lanes) km[L.edge.def.w >= 11 ? 'big' : 'small'] += L.length / 1000;
    let maxN = 0, crossed = 0, pedCrossed = 0, samples = 0, stoppedAtRed = 0;
    const T = 180;
    for (let k = 0; k < T / DT; k++) {
      const t = k * DT, s = (speed * t) % tour.length, p = tour.at(s);
      tr.step(DT, p.x, p.z, p.dx, p.dz);
      const on = tr.cars.filter((c) => c.on); maxN = Math.max(maxN, on.length);
      if (k % 12 === 0) {
        for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) if (overlap(on[i], on[j])) throw new Error(`t=${t.toFixed(1)} s: Auto ${i} und ${j} überlappen ${[on[i], on[j]].map((q) => `[${q.pc.edge.id}/${q.pc.kind}/${q.pc.dir} s=${q.s.toFixed(1)}/${q.pc.length.toFixed(0)} v=${q.speed.toFixed(1)} err=${q.err.toFixed(1)} x=${q.x.toFixed(0)},${q.z.toFixed(0)} touch=${q.touch.toFixed(2)}]`).join(' ')}`);
      }
      for (const c of on) {   // Haltelinien: Front über die Linie nur bei nicht-rot
        const P: Piece = c.pc, f = c.s + c.hz, was = prev.get(c)?.P === P ? prev.get(c)!.f : undefined;
        if (P.kind === 'lane' && was !== undefined) for (const st of P.stops) {
          if (was < st.at && f >= st.at) {
            const ph = st.ped ? tr.signals!.pedPhase(tr.t) : st.head ? tr.signals!.phase(P.node, P.edge, tr.t) : 0;
            if (ph === 2) throw new Error(`t=${t.toFixed(1)} s: ${P.edge.id}/${P.dir} über Rot (${st.ped ? 'Fußgänger' : P.node.id}) v=${c.speed.toFixed(1)} was=${was.toFixed(2)} f=${f.toFixed(2)} at=${st.at.toFixed(2)} claim=${!!c.claim} sigt=${tr.t.toFixed(2)} ph0=${tr.signals!.phase(P.node, P.edge, tr.t - 1)} ph1=${tr.signals!.phase(P.node, P.edge, tr.t - 0.1)}`);
            if (st.ped) pedCrossed++; else if (st.head) crossed++;
          }
        }
        prev.set(c, { P, f });
      }
      if (k % 120 === 0) { samples++; for (const c of on) if (c.pc.kind === 'lane' && Math.hypot(c.x - p.x, c.z - p.z) < 250) cls[c.pc.edge.def.w >= 11 ? 'big' : 'small']++; for (const c of on) if (c.speed < 0.3 && c.pc.kind === 'lane' && c.pc.stops.some((st) => st.head && c.s + c.hz > st.at - 6)) stoppedAtRed++; }
    }
    const seen = [...net.edges].filter((e) => tr.seenEdges.has(e.id)).length;
    return { maxN, seen, crossed, pedCrossed, stoppedAtRed, dens: { big: cls.big / km.big, small: cls.small / km.small }, samples };
}

describe('Netzverkehr', () => {
  it('3 min: nichts durch ein anderes Auto, nichts über Rot, Autos auf ≥ 80 % der Kanten, geradeaus + abbiegen, Hauptstraßen dichter', () => {
    const tr = makeTraffic(course) as NetTraffic;
    expect(tr).toBeInstanceOf(NetTraffic);
    const r = sim(tr);
    console.log(`Autos max ${r.maxN}, Kanten ${r.seen}/${net.edges.length}, Abbiegen ${JSON.stringify(tr.turns)}, Ampel-Durchfahrten ${r.crossed}, Fußgängerampel ${r.pedCrossed}, wartend an Linie ${r.stoppedAtRed}`);
    expect(r.seen).toBeGreaterThanOrEqual(Math.ceil(net.edges.length * 0.8));
    expect(tr.turns.straight).toBeGreaterThan(10); expect(tr.turns.left).toBeGreaterThan(3); expect(tr.turns.right).toBeGreaterThan(3);
    expect(r.crossed, 'Autos fahren bei Grün durch die Ampelkreuzungen').toBeGreaterThan(5);
    expect(r.stoppedAtRed, 'es bilden sich Schlangen an roten Ampeln').toBeGreaterThan(0);
    expect(r.maxN).toBeLessThanOrEqual(56);
    // Dichte je km Spur: große Straßen (Damm, obere, untere) mindestens doppelt so dicht wie Wohnstraßen
    expect(r.dens.big).toBeGreaterThan(2 * r.dens.small);
  }, 120000);

  it('weitere Zufallsläufe: kein Überlappen, nichts über Rot', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { try { sim(new NetTraffic(net, course.signals, { density: 1 }, 'vorstadt', seed, course.start), [30, 10, 0][seed % 3]); } catch (e) { throw new Error(`Seed ${seed}: ${(e as Error).message}`); } }
  }, 120000);

  it('Anschieben: seitlich versetztes Auto findet in die Spur zurück und bleibt', () => {
    const tr = makeTraffic(course) as NetTraffic, p0 = course.start;
    const c = tr.cars.find((q) => q.on && q.pc.kind === 'lane' && q.pc.length - q.s > 60 && Math.hypot(q.x - p0.x, q.z - p0.z) > 80)!;
    expect(c).toBeTruthy();
    const a = c.pc.route.at(c.s); c.x += a.dz * 2.5; c.z += -a.dx * 2.5; c.touch = 0.3;
    for (let k = 0; k < 6 / DT; k++) tr.step(DT, p0.x, p0.z);
    expect(c.on).toBe(true); expect(c.err).toBeLessThan(0.3);
  });
});

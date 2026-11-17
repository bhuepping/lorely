// Vorstadt: gleichmäßiges Gelände (bündig an den Straßen, keine Hügel/Noise), Bebauung am Netz (nichts auf Fahrbahn/Kreuzung/Au), Gebüschhang als Sperre.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { Vehicle, DT } from '../src/physics/vehicle';
import { Obstacles } from '../src/physics/obstacles';
import { hillLift, makeHill, boxesOverlap, eastSide } from '../src/netsub';

const c = WORLDS.find((w) => w.id === 'vorstadt')!.levels[0].make(), net = c.net!, sub = c.suburb!, river = c.river!;
const H = (x: number, z: number) => c.terrain.height(x, z);
const hill = makeHill(net, { edges: ['damm.2', 'damm.3'], h: 6.5 })!;

describe('Vorstadt: Gelände', () => {
  it('neben jeder Straße bündig auf Fahrbahnhöhe (3 und 6 m daneben), nirgends Damm oder Böschung', () => {
    let n = 0;
    for (const e of net.edges) for (let s = e.a.cutOf(e) + 4; s < e.length - e.b.cutOf(e) - 4; s += 6) {
      const q = e.at(s);
      for (const sd of [1, -1]) for (const off of [3, 6]) {
        const [x, z] = e.route.offset(s, sd * (e.half + off)), nn = net.nearest(x, z)!;
        if (nn.edge !== e || hillLift(net, hill, x, z) > 0.01 || river.dist(x, z) < river.width / 2 + 14) continue;
        expect(Math.abs(H(x, z) - e.elev(s)), `${e.id} s${Math.round(s)} ${off} m`).toBeLessThan(0.3); n++;
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it('abseits der Straßen kaum geneigt: stärkste Geländeneigung nur knapp über der stärksten Straßensteigung (außer Gebüschhang und Au)', () => {
    let road = 0; for (const e of net.edges) for (let s = 10; s < e.length - 10; s += 5) road = Math.max(road, Math.abs(e.elev(s + 2.5) - e.elev(s - 2.5)) / 5);
    let worst = 0, n = 0;
    for (let x = -500; x <= 500; x += 10) for (let z = -500; z <= 500; z += 10) {
      const h = net.nearest(x, z, 46); if (h && h.d < h.edge.half + 16) continue;
      if (river.dist(x, z) < river.width / 2 + 14 || hillLift(net, hill, x, z) > 0.02) continue;
      worst = Math.max(worst, Math.hypot(H(x + 2.5, z) - H(x - 2.5, z), H(x, z + 2.5) - H(x, z - 2.5)) / 5); n++;
    }
    expect(n).toBeGreaterThan(5000); expect(worst).toBeLessThan(road + 0.04);
  });

  it('Gebüschhang: steigt am Damm (Ostseite) deutlich an, an den Enden und zu anderen Straßen läuft er flach aus', () => {
    const e = net.edge('damm.3'), s = e.length / 2, q = e.at(s), sd = hill.side, at = (u: number) => e.route.offset(s, sd * (e.half + u));
    const [x0, z0] = at(5), [x1, z1] = at(42); expect(hillLift(net, hill, x1, z1)).toBeGreaterThan(6); expect(H(x1, z1) - H(x0, z0)).toBeGreaterThan(2);
    expect(eastSide(e)).toBe(sd); expect(e.route.offset(s, sd * 20)[0]).toBeGreaterThan(q.x);   // Ostseite
    for (const id of ['quer.0', 'bogen.0', 'schl.0']) for (let t = 0; t <= 1; t += 0.1) { const f = net.edge(id), p = f.at(f.length * t); expect(hillLift(net, hill, p.x, p.z), id).toBeLessThan(0.05); }
  });
});

describe('Vorstadt: Bebauung am Netz', () => {
  const corners = (h: { x: number; z: number; yaw: number; hx: number; hz: number }) => { const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw); return [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => [h.x + cs * a * h.hx + sn * b * h.hz, h.z - sn * a * h.hx + cs * b * h.hz]); };
  it('Häuser, Hecken, Bäume, Laternen stehen nicht auf Fahrbahn, Kreuzung, Au-Ufer oder Brücke', () => {
    expect(sub.houses.length).toBeGreaterThan(400);
    for (const h of sub.houses) for (const [x, z] of corners(h)) {
      if (h.kind !== 'auto') { expect(net.onRoad(x, z, 0.5), `${h.kind} ${Math.round(x)},${Math.round(z)} auf Straße`).toBe(false); expect(net.junctionAt(x, z), h.kind + ' Kreuzung').toBeNull(); }
      if (h.kind !== 'steg') expect(river.dist(x, z), `${h.kind} am Ufer`).toBeGreaterThan(river.width / 2 + 8);
    }
    for (const t of sub.trees) { expect(net.onRoad(t.x, t.z, 0.8), 'Baum auf Straße').toBe(false); expect(river.dist(t.x, t.z)).toBeGreaterThan(river.width / 2 + 8); }
    for (const l of sub.lamps) expect(net.onRoad(l.x, l.z, 0.2)).toBe(false);
    for (const g of sub.hedges) expect(net.onRoad(g.x, g.z, 0.2)).toBe(false);
    expect(sub.trees.length).toBeGreaterThan(300);
  });
  it('kein Haus überlappt ein anderes; alle sind feste Kollisionsboxen (Autos und Gebüsch auch)', () => {
    const hs = sub.houses;
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      if (hs[i].kind === 'busch' && hs[j].kind === 'busch') continue;
      expect(boxesOverlap(hs[i], hs[j], 0), `${hs[i].kind}/${hs[j].kind} bei ${Math.round(hs[i].x)},${Math.round(hs[i].z)}`).toBe(false);
    }
    for (const h of hs) expect(c.obstacles.boxes.some((b) => Math.abs(b.x - h.x) < 1e-6 && Math.abs(b.z - h.z) < 1e-6 && b.hx === h.hx), h.kind).toBe(true);
  });
  it('Straßenzüge wie beschrieben: Doppelhaus-Ecke beidseitig mit zweiter Reihe + Allee, Querstraße mit parkenden Autos (mit Lücken), Damm-Gewerbe niedrig', () => {
    const near = (id: string, kinds: string[], R: number) => sub.houses.filter((h) => kinds.includes(h.kind) && net.nearest(h.x, h.z, R)?.edge.id.startsWith(id));
    for (const id of ['untere.1', 'untere.2']) {
      const hs = near(id, ['reihe', 'haus'], 46); expect(hs.length, id).toBeGreaterThan(4);
      const e = net.edge(id), side = (h: { x: number; z: number }) => { const nn = net.nearest(h.x, h.z)!; return nn.lat > 0 ? 1 : -1; };
      expect(new Set(hs.map(side)).size, id + ' beide Seiten').toBe(2);
      expect(hs.some((h) => net.nearest(h.x, h.z)!.d - e.half > 20), id + ' zweite Reihe').toBe(true);
      expect(sub.trees.filter((t) => net.nearest(t.x, t.z, 12)?.edge.id === id).length, id + ' Allee').toBeGreaterThan(12);
    }
    const cars = sub.houses.filter((h) => h.kind === 'auto'); expect(cars.length).toBeGreaterThan(30);
    for (const h of cars) expect(net.nearest(h.x, h.z)!.edge.id.startsWith('quer'), 'parken nur an der Querstraße').toBe(true);
    const he = net.edge('quer.2'), along = cars.filter((h) => net.nearest(h.x, h.z)!.edge === he).map((h) => net.nearest(h.x, h.z)!.s).sort((a, b) => a - b);
    expect(along.length).toBeGreaterThan(4); expect(Math.max(...along.slice(1).map((s, i) => s - along[i])), 'Lücken').toBeGreaterThan(5);
    for (const h of sub.houses.filter((q) => q.kind === 'gewerbe')) expect(h.h, 'max 2 Stockwerke').toBeLessThan(8.2);
  });
});

describe('Vorstadt: Gebüschhang ist eine Sperre', () => {
  it('Auto quer in den Hang: stoppt an der Kollision, kommt nicht auf die andere Seite, und fährt wieder zurück (hängt nicht)', () => {
    const e = net.edge('damm.3'), s = e.length * 0.45, q = e.at(s), sd = hill.side, ex = q.dz * sd, ez = -q.dx * sd;   // Blick nach Osten (zum Hang)
    for (const [cid, P] of Object.entries(CARS)) {
      const car = new Vehicle(P, c.terrain); car.allowSleep = false;
      const x0 = q.x + ex * (e.half - 2), z0 = q.z + ez * (e.half - 2);
      car.reset(x0, z0, Math.atan2(-ex, -ez)); car.launch(14);
      const obst = new Obstacles(c.obstacles.circles, c.obstacles.boxes);
      let maxU = 0;
      for (let k = 0; k < 9 / DT; k++) { car.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT); obst.step(car); maxU = Math.max(maxU, (car.pos[0] - q.x) * ex + (car.pos[2] - q.z) * ez - e.half); }
      expect(maxU, cid + ' Eindringtiefe').toBeLessThan(9); expect(Math.hypot(car.vel[0], car.vel[2]), cid + ' steht').toBeLessThan(2.5);
      const u1 = (car.pos[0] - q.x) * ex + (car.pos[2] - q.z) * ez;
      for (let k = 0; k < 6 / DT; k++) { car.step({ steer: 0, throttle: 0, brake: 1, handbrake: false }, DT); obst.step(car); }
      expect((car.pos[0] - q.x) * ex + (car.pos[2] - q.z) * ez, cid + ' rückwärts frei').toBeLessThan(u1 - 3);
    }
  });
});

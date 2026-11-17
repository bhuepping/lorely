// Vorstadt: Wahrzeichen stehen an der beschriebenen Stelle, frei von Fahrbahn/Kreuzung/Au, und die Fußgängerstege sind für Autos nicht befahrbar.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { Vehicle, DT } from '../src/physics/vehicle';
import { Obstacles } from '../src/physics/obstacles';
import { sideToward } from '../src/landmarks';

const c = WORLDS.find((w) => w.id === 'vorstadt')!.levels[0].make(), net = c.net!, sub = c.suburb!, river = c.river!;
const of = (k: string) => sub.houses.filter((h) => h.kind === k);
const near = (h: { x: number; z: number }, id: string) => Math.hypot(h.x - net.nodes.get(id)!.x, h.z - net.nodes.get(id)!.z);
const corners = (h: { x: number; z: number; yaw: number; hx: number; hz: number }) => { const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw); return [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => [h.x + cs * a * h.hx + sn * b * h.hz, h.z - sn * a * h.hx + cs * b * h.hz]); };

describe('Vorstadt: Wahrzeichen', () => {
  it('alle da: Restaurant, Apotheke-Haus, Doppelhaus mit zwei Garagen, weißes Haus mit rotem Dach, Holzhaus, Kita, Bungalow, Einkaufszentrum, rote Villa, zwei Stege', () => {
    for (const [k, n] of [['restaurant', 1], ['apotheke', 1], ['doppel', 1], ['garage', 2], ['holz', 1], ['kita', 1], ['bungalow', 1], ['kasten', 1], ['villa', 1], ['steg', 2]] as [string, number][]) expect(of(k).length, k).toBe(n);
    expect(sub.houses.filter((h) => h.kind === 'haus' && h.rc === 0xc0392b && h.wc !== undefined).length, 'weißes Haus, rotes Dach').toBe(1);
    expect(of('villa')[0].wc, 'rot').toBe(0xa23a2e);
  });
  it('an der beschriebenen Stelle: Startecke an x_hu, Doppelhaus-Ecke dahinter, Kita + Bungalow an x_du, Einkaufszentrum links am Damm vor x_do, Villa am Zwickel x_dh', () => {
    expect(near(of('restaurant')[0], 'x_hu')).toBeLessThan(60); expect(near(of('apotheke')[0], 'x_hu')).toBeLessThan(70);
    const doppel = of('doppel')[0]; expect(near(doppel, 'x_hu')).toBeLessThan(70); expect(near(doppel, 'x_hu')).toBeGreaterThan(20);
    expect(net.nearest(doppel.x, doppel.z)!.edge.id.startsWith('untere.2')).toBe(true);
    expect(near(of('kita')[0], 'x_du')).toBeLessThan(70); expect(near(of('bungalow')[0], 'x_du')).toBeLessThan(80);
    const k = of('kasten')[0], nk = net.nearest(k.x, k.z)!; expect(nk.edge.id).toBe('damm.2'); expect(near(k, 'x_do')).toBeLessThan(90);
    expect(k.x, 'EKT links (westlich) vom Damm').toBeLessThan(nk.edge.at(nk.s).x);
    expect(k.hz * 2, 'groß').toBeGreaterThan(35); expect(k.h, 'max 2 Stockwerke').toBeLessThan(11);
    expect(near(of('villa')[0], 'x_dh')).toBeLessThan(70);
    // Restaurant: Seite nach der Kreuzung rechts (Fahrt Richtung Westen: Norden), Apotheke links (Süden)
    expect(of('restaurant')[0].z, 'Restaurant nördlich der Straße').toBeLessThan(net.nearest(of('restaurant')[0].x, of('restaurant')[0].z)!.edge.at(net.nearest(of('restaurant')[0].x, of('restaurant')[0].z)!.s).z);
    expect(of('apotheke')[0].z, 'Apotheke südlich').toBeGreaterThan(net.nearest(of('apotheke')[0].x, of('apotheke')[0].z)!.edge.at(net.nearest(of('apotheke')[0].x, of('apotheke')[0].z)!.s).z);
    expect(sideToward(net.edge('untere.3'), 'N')).toBe(-sideToward(net.edge('untere.3'), 'S'));
  });
  it('nichts auf Fahrbahn, Kreuzung, Au-Ufer (außer den Stegen); keine Überlappung mit anderer Bebauung', () => {
    const LM = ['restaurant', 'apotheke', 'doppel', 'garage', 'holz', 'kita', 'bungalow', 'kasten', 'villa'];
    for (const h of sub.houses.filter((q) => LM.includes(q.kind))) for (const [x, z] of corners(h)) {
      expect(net.onRoad(x, z, 0.5), h.kind + ' auf Straße').toBe(false); expect(net.junctionAt(x, z), h.kind + ' Kreuzung').toBeNull();
      expect(river.dist(x, z), h.kind + ' am Ufer').toBeGreaterThan(river.width / 2 + 8);
    }
    for (const t of sub.trees) expect(net.onRoad(t.x, t.z, 0.8), 'Baum auf Straße').toBe(false);
  });
  it('Stege: genau zwei, quer über der Au, am Ufer neben dem Au-Weg, mit Buckel; Bodenpfad führt vom Au-Weg hin', () => {
    const st = of('steg'), fe = net.edge('fuss.0');
    for (const s of st) {
      expect(river.dist(s.x, s.z), 'Mitte über dem Wasser').toBeLessThan(1.5); expect(s.h, 'Buckel').toBeGreaterThan(1);
      const nn = net.nearest(s.x, s.z, 120)!; expect(nn.edge, 'neben dem Au-Weg').toBe(fe); expect(nn.d).toBeLessThan(70);
      const ends = [-1, 1].map((e) => [s.x + Math.sin(s.yaw) * s.hz * e, s.z + Math.cos(s.yaw) * s.hz * e]); for (const [x, z] of ends) expect(net.onRoad(x, z, 2), 'Steg-Ende auf Straße').toBe(false);
      const t = river.route.nearest(s.x, s.z), q = river.route.at(t.s); expect(Math.abs((q.dx * Math.sin(s.yaw) + q.dz * Math.cos(s.yaw))), 'quer zum Fluss').toBeLessThan(0.15);
    }
    expect(sub.patches.some((p) => p.c === 'stub')).toBe(true);
  });
  it('Auto fährt von beiden Seiten auf den Steg zu: kommt nicht hinauf, bleibt vor dem Brett stehen und kommt rückwärts frei', () => {
    for (const s of of('steg')) for (const end of [-1, 1]) for (const [cid, P] of Object.entries(CARS)) {
      const ax = Math.sin(s.yaw) * -end, az = Math.cos(s.yaw) * -end;               // Fahrtrichtung zur Mitte
      const x0 = s.x - ax * (s.hz + 22), z0 = s.z - az * (s.hz + 22);
      const car = new Vehicle(P, c.terrain); car.allowSleep = false; car.reset(x0, z0, Math.atan2(-ax, -az)); car.launch(13);
      const obst = new Obstacles(c.obstacles.circles, c.obstacles.boxes);
      let maxAlong = -99;
      for (let k = 0; k < 9 / DT; k++) { car.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT); obst.step(car); maxAlong = Math.max(maxAlong, (car.pos[0] - s.x) * ax + (car.pos[2] - s.z) * az); }
      expect(maxAlong, `${cid} Ende ${end}: nicht auf dem Deck`).toBeLessThan(-s.hz + 0.6); expect(maxAlong, cid + ' erreicht den Steg').toBeGreaterThan(-s.hz - 5);
      expect(Math.hypot(car.vel[0], car.vel[2]), cid + ' steht').toBeLessThan(3);
      const u1 = (car.pos[0] - s.x) * ax + (car.pos[2] - s.z) * az;
      for (let k = 0; k < 6 / DT; k++) { car.step({ steer: 0, throttle: 0, brake: 1, handbrake: false }, DT); obst.step(car); }
      expect(-((car.pos[0] - s.x) * ax + (car.pos[2] - s.z) * az), cid + ' rückwärts frei').toBeGreaterThan(-u1 + 2.5);
    }
  });
});

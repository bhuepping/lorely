// Rennstart auf der Vorstadt-Runde – in den ersten 48 s (Start, untere Straße, Damm-Einbiegung) stehen höchstens 2 Autos voraus (beide Richtungen, 150 m).
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { NetTraffic, type NCar } from '../src/nettraffic';
import { DT } from '../src/physics/vehicle';

const course = WORLDS.find((w) => w.id === 'vorstadt')!.levels[0].make(), net = course.net!;
const V = 13;     // Spielertempo (m/s), grob wie der Bot im Verkehr

/** 5 Rennstarts (andere Seeds); der Spieler fährt die Runde, an jeder Ampel auf seinem Weg zählen die stehenden Autos in seiner Spur vor ihm */
function run(seed: number) {
  const tr = new NetTraffic(net, course.signals, course.traffic!, course.world, seed, course.start ?? course.route.at(6), course.fog.far);
  let sigT = 0; tr.sigClock = () => sigT;
  let worst = 0, where = '', early = 0;
  const T = 48;
  for (let k = 0; k < T / DT; k++) {
    const s = Math.min(course.route.length, V * k * DT), p = course.route.at(s);
    sigT += DT; tr.step(DT, p.x, p.z, p.dx, p.dz);
    if (k % 30) continue;
    // stehende Autos (v < 1) voraus, bis 150 m und höchstens 25 m neben der Route, beide Richtungen (was der Spieler als Schlange sieht)
    const q = tr.cars.filter((c: NCar) => c.on && c.speed < 1 && c.pc.kind === 'lane').filter((c) => {
      if ((c.x - p.x) * p.dx + (c.z - p.z) * p.dz < 5 || Math.hypot(c.x - p.x, c.z - p.z) > 150) return false;
      for (let u = s; u < Math.min(course.route.length, s + 150); u += 3) { const r = course.route.at(u); if (Math.hypot(r.x - c.x, r.z - c.z) < 7) return true; }
      return false;
    });
    if (k * DT < 40) early = Math.max(early, q.length);
    if (q.length > worst) { worst = q.length; where = `t=${(k * DT).toFixed(0)} s ${q.map((c) => c.pc.edge.id + '@' + c.s.toFixed(0) + '/' + c.pc.length.toFixed(0)).join(' ')}`; }
  }
  return { worst, where, early };
}

describe('Rennstart ohne Schlange', () => {
  it('5 Starts: höchstens 2 stehende Autos voraus an der Route', () => {
    const res = [11, 22, 33, 44, 55].map(run);
    for (const r of res) expect(r.worst, r.where).toBeLessThanOrEqual(2);
  });
});

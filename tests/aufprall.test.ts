// Das Auto erzeugt beim Aufprall am Gelände keine Energie (kein Katapult, kein Zurückspringen über die Anfahrhöhe).
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { Vehicle, DT } from '../src/physics/vehicle';

const W = WORLDS.find((w) => w.id === 'offroad')!;
/** größter Energiegewinn (J/kg) beim Ausrollen ohne Gas aus vielen Anfahrten gegen Hügel, Grubenwände und Rinnen */
function maxGain(levelId: string, car: string, n: number): number {
  const c = W.levels.find((l) => l.id === levelId)!.make();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * 120, z = (rnd() - 0.5) * 160, yaw = rnd() * 6.283, sp = 8 + rnd() * 24, steer = (rnd() - 0.5) * 2;
    const v = new Vehicle(CARS[car], c.terrain); v.allowSleep = false; v.reset(x, z, yaw); v.launch(sp);
    const E = () => 0.5 * (v.vel[0] ** 2 + v.vel[1] ** 2 + v.vel[2] ** 2) + 9.81 * v.pos[1], E0 = E();
    for (let k = 0; k < 6 * 120; k++) { v.step({ steer: k < 180 ? steer : 0, throttle: 0, brake: 0, handbrake: false }, DT); worst = Math.max(worst, E() - E0); }
  }
  return worst;
}

describe('Aufprall am Gelände', () => {
  for (const lv of ['huegel', 'matschgrube', 'furtwald', 'steilhang', 'moorwald']) for (const car of ['rally', 'jeep'])
    it(`${lv}/${car}: Ausrollen aus 30 Zufallsanfahrten gewinnt keine Energie (< 2 m Höhenäquivalent)`, () => {
      expect(maxGain(lv, car, 30)).toBeLessThan(20);
    });
});

describe('Baumstämme am Boden', () => {
  for (const lv of W.levels) it(`${lv.id}: jeder Stamm liegt auf dem Gelände (Unterkante nahe Boden, nichts schwebt)`, async () => {
    const { buildLogs } = await import('../src/offroadmesh');
    const c = lv.make(); if (!c.logs?.length) return;
    // je Stamm einzeln bauen und vermessen
    for (const l of c.logs) {
      const pos = buildLogs({ ...c, logs: [l] } as typeof c).geometry.getAttribute('position');
      let gap = 1e9;   // kleinster Abstand Vertex-Höhe über dem Boden darunter = Unterkante
      for (let i = 0; i < pos.count; i++) gap = Math.min(gap, pos.getY(i) - c.terrain.height(pos.getX(i), pos.getZ(i)));
      expect(gap, `Stamm bei ${l.x},${l.z}`).toBeLessThan(0.45);   // schwebt nicht
      expect(gap, `Stamm bei ${l.x},${l.z}`).toBeGreaterThan(-1.2);
    }
  });
});

// Hügel und Furtwald sind lange Wege (Jeep-Bot ≥ 75 s), alle Autos kommen ins Ziel, ohne Kippen und Hänger; Furtwald hat drei Furten und einen trockenen Umweg.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { driveBot } from '../tools/bot';
import { viaBranches } from '../src/levels/offroad';

const get = (id: string) => WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === id)!.make();

describe('Hügel und Furtwald: Länge und Fahrbarkeit', () => {
  for (const id of ['huegel', 'furtwald']) it(`${id}: Jeep 75–105 s, alle Autos kommen ins Ziel ohne Hänger und Kippen`, () => {
    const c = get(id);
    expect(c.length).toBeGreaterThan(900);
    for (const [cid, P] of Object.entries(CARS)) {
      const r = driveBot(c, P, { maxSecs: 160 });
      expect(r.finished, `${id} ${cid} DNF bei ${r.s.toFixed(0)} m`).toBe(true);
      expect(r.stuck + r.flips + r.drowned, `${id} ${cid} Hänger/Kippen`).toBe(0);
      if (cid === 'jeep') { expect(r.time).toBeGreaterThanOrEqual(75); expect(r.time).toBeLessThan(105); }
    }
  }, 120_000);
  it('Furtwald: Bach quert den guten Weg dreimal, der Umweg quert ihn flach (alle Autos kommen über den Umweg)', () => {
    const c = get('furtwald');
    let n = 0, wet = false;
    for (let s = 0; s <= c.length; s += 1) { const p = c.route.at(s), w = c.brook!.route.nearest(p.x, p.z).d < 3; if (w && !wet) n++; wet = w; }
    expect(n).toBe(3);
    expect(c.branches!.length).toBe(1);
    const d = viaBranches(c, [0]);
    for (const [cid, P] of Object.entries(CARS)) expect(driveBot(d, P, { maxSecs: 160 }).finished, `Umweg ${cid}`).toBe(true);
  }, 120_000);
  it('Hügel: Kamm liegt über dem Start (Höhe ≥ 8 m), Tal mit Furt unter 0', () => {
    const c = get('huegel'); let hi = -9, lo = 9;
    for (let s = 0; s <= c.length; s += 2) { const p = c.route.at(s), y = c.terrain.height(p.x, p.z); hi = Math.max(hi, y); lo = Math.min(lo, y); }
    expect(hi).toBeGreaterThan(8); expect(lo).toBeLessThan(-1.5);
  });
});

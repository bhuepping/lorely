// Vorstadt: Abzweige der Runde, Abbiegepfeile auf der Fahrbahn und Vorab-Pfeil im HUD.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { turnsOf } from '../src/netturns';
import { buildTurnArrows, ARROW_DIST } from '../src/netarrows';
import { Run } from '../src/run';

const c = WORLDS.find((w) => w.id === 'vorstadt')!.levels[0].make(), net = c.net!, turns = turnsOf(c);

describe('Vorstadt: Abbiegen sichtbar', () => {
  it('Abzweigliste der Runde', () => {
    expect(turns.length).toBe(4);
    for (const q of turns) expect([-1, 1]).toContain(q.side);
    for (let i = 1; i < turns.length; i++) expect(turns[i].s).toBeGreaterThan(turns[i - 1].sEnd);
  });

  it('Pfeile liegen auf der rechten Spur der Fahrbahn, knapp über dem Asphalt', () => {
    const m = buildTurnArrows(c)!, p = m.geometry.getAttribute('position');
    expect(m).toBeTruthy(); expect(p.count / 4).toBeGreaterThan(turns.length * ARROW_DIST.length * 20);
    let off = 0, left = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = c.route.nearest(x, z);
      if (!net.onRoad(x, z, 0.2) && !net.junctionAt(x, z, 0.5)) off++;
      if (h && h.lat > 0) left++;
      expect(p.getY(i) - c.terrain.height(x, z)).toBeGreaterThan(0.05); expect(p.getY(i) - c.terrain.height(x, z)).toBeLessThan(0.2);
    }
    expect(off / p.count, 'Ecken außerhalb der Fahrbahn').toBeLessThan(0.02);
    expect(left / p.count, 'rechts der Mitte').toBeLessThan(0.05);
  });

  it('HUD-Pfeil: an 60 m vor dem Abzweig, aus nach dem Abbiegen, sonst aus', () => {
    const run = new Run(c, 'time'), v = 12, dt = 1 / 60, on: boolean[] = [];
    const inZone = (s: number) => turns.some((q) => s >= q.s - 60 && s <= q.sEnd);
    let bad = 0;
    for (let s = 1; s < c.length - 20; s += v * dt) {
      const a = c.route.at(s); run.update(dt, a.x, a.z, true, a.dx * v, a.dz * v);
      if (run.state === 'run' && run.arrowOn !== inZone(run.tracker.s)) { if (Math.abs(run.tracker.s - s) < 3 && ++bad > 3) break; }
      on.push(run.arrowOn);
    }
    expect(bad, 'Pfeil nur in den Zonen').toBeLessThanOrEqual(3);
    expect(on.some(Boolean) && on.some((o) => !o)).toBe(true);
    // Zielpunkt liegt vorn auf der Runde
    const t = turns[0], r2 = new Run(c, 'time'); const a = c.route.at(t.s - 50);
    for (let s = 1; s < t.s - 50; s += v * dt) { const q = c.route.at(s); r2.update(dt, q.x, q.z, true, q.dx * v, q.dz * v); }
    r2.update(dt, a.x, a.z, true, a.dx * v, a.dz * v);
    expect(r2.arrowOn).toBe(true);
    const g = c.route.at(t.s - 50 + 30); expect(Math.hypot(r2.aim.x - g.x, r2.aim.z - g.z)).toBeLessThan(2);
  });
});

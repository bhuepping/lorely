// Vorstadt: Abzweige der Runde, schwebender Abbiegepfeil und Vorab-Pfeil im HUD.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { turnsOf } from '../src/netturns';
import { TurnAR, arTurn, AR_SHOW } from '../src/netar';
import { Run } from '../src/run';
import * as THREE from 'three';

const c = WORLDS.find((w) => w.id === 'vorstadt')!.levels[0].make(), net = c.net!, turns = turnsOf(c);

describe('Vorstadt: Abbiegen sichtbar', () => {
  it('Abzweigliste der Runde', () => {
    expect(turns.length).toBe(4);
    for (const q of turns) expect([-1, 1]).toContain(q.side);
    for (let i = 1; i < turns.length; i++) expect(turns[i].s).toBeGreaterThan(turns[i - 1].sEnd);
  });

  it('AR-Pfeil: nur der nächste Abzweig, ab 80 m davor, aus nach dem Abbiegen, schwebt über der Kurve und zeigt in Abbiegerichtung', () => {
    const ar = new TurnAR(c);
    expect(ar.mesh.visible).toBe(false);
    turns.forEach((q, i) => {
      ar.update(q.s - AR_SHOW - 15, 0); expect(ar.mesh.visible, 'weit davor aus').toBe(false);
      ar.update(q.s - 60, 0.7);
      expect(ar.mesh.visible, 'Abzweig ' + i + ' 60 m davor an').toBe(true); expect(ar.active).toBe(q); expect(arTurn(turns, q.s - 60)).toBe(q);
      const p = ar.mesh.position, h = c.route.nearest(p.x, p.z);
      expect(p.y - c.terrain.height(p.x, p.z)).toBeGreaterThan(3); expect(p.y - c.terrain.height(p.x, p.z)).toBeLessThan(13);
      expect(Math.hypot(p.x - c.route.at(q.s).x, p.z - c.route.at(q.s).z), 'über der Kurve').toBeLessThan(30);
      const a = c.route.at(q.s - 4), ex = new THREE.Vector3(1, 0, 0).applyQuaternion(ar.mesh.quaternion), right = [-a.dz, a.dx];
      expect((ex.x * right[0] + ex.z * right[1]) * q.side, 'zeigt in Abbiegerichtung').toBeGreaterThan(0.9);
      expect(h.d).toBeLessThan(30);
      ar.update(q.sEnd + 1, 1); expect(ar.mesh.visible, 'nach dem Abbiegen aus').toBe(i + 1 < turns.length && q.sEnd + 1 >= turns[i + 1].s - AR_SHOW);
    });
    ar.update(turns[0].s - 60, 0, false); expect(ar.mesh.visible, 'ausgeschaltet').toBe(false);
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
    // Zielpunkt liegt hinter dem Abzweig: der Pfeil zeigt vorab deutlich nach rechts
    const t = turns[0], r2 = new Run(c, 'time'); const a = c.route.at(t.s - 50);
    for (let s = 1; s < t.s - 50; s += v * dt) { const q = c.route.at(s); r2.update(dt, q.x, q.z, true, q.dx * v, q.dz * v); }
    r2.update(dt, a.x, a.z, true, a.dx * v, a.dz * v);
    expect(r2.arrowOn).toBe(true);
    const hd = Math.atan2(a.dz, a.dx), to = Math.atan2(r2.aim.z - a.z, r2.aim.x - a.x);
    let ang = (to - hd) * 180 / Math.PI; ang = ((ang + 540) % 360) - 180;
    expect(ang * t.side, 'Winkel zur Abbiegerichtung (Grad)').toBeGreaterThan(30);
  });
});

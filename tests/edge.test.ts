// Rand der Welt: Gas Richtung Rand -> nach ~1 s außerhalb kommt der Kran (Auto zurück auf die Strecke, +3 s)
import { describe, it, expect } from 'vitest';
import { buildCourse, type LevelDef } from '../src/level';
import { EdgeGuard, EDGE_INSET, edgeNormal, EDGE_WARN, type EdgeRect } from '../src/edge';
import { Vehicle, DT } from '../src/physics/vehicle';
import { HATCHBACK_80S } from '../src/physics/params';
import { WORLDS } from '../src/levels';
import { Run } from '../src/run';
import { CARS } from '../src/physics/params';
import waldweg from '../src/levels/waldweg.json';

const course = buildCourse({ ...(waldweg as unknown as LevelDef), edge: 'respawn' });
const guard = new EdgeGuard(course.edge!);
const H = course.terrain.half - EDGE_INSET;

/** Start bei (x,z) mit Blick `yaw`, Vollgas bis zum Kran-Auslöser; liefert Auto, Zeit außerhalb bis dahin und ob die Vorwarnung lief */
function drive(x: number, z: number, yaw: number, v: number, g = guard, c = course, car0 = HATCHBACK_80S) {
  const car = new Vehicle(car0, c.terrain); car.allowSleep = false;
  car.reset(x, z, yaw); car.launch(v);
  let fired = false, warned = false, tOut = 0;
  for (let k = 0; k < 8 / DT && !fired; k++) {
    car.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT);
    const o = g.step(car, DT); warned ||= o.warn; fired = o.fire; if (edgeNormal(g.rect, car.pos[0], car.pos[2])) tOut += DT;
  }
  return { car, fired, warned, tOut };
}

describe('Rand der Welt', () => {
  it('Level mit edge:respawn bekommt ein Rand-Rechteck, andere nicht', () => {
    expect(course.edge).toEqual({ x0: -H, z0: -H, x1: H, z1: H });
    expect(buildCourse(waldweg as unknown as LevelDef).edge).toBeUndefined();
  });
  it('raus: Vorwarnung, Kran nach ~1 s außerhalb; Rückkehr in der Vorwarnung = nichts', () => {
    const r = drive(H - 30, 0, -Math.PI / 2, 10);   // Blick +x
    expect(r.warned).toBe(true); expect(r.fired).toBe(true); expect(r.tOut).toBeGreaterThan(EDGE_WARN - 0.05); expect(r.tOut).toBeLessThan(EDGE_WARN + 0.1);
    const car = new Vehicle(HATCHBACK_80S, course.terrain); car.allowSleep = false; const g2 = new EdgeGuard(course.edge!);
    car.reset(H + 3, 0, 0); expect(g2.step(car, 0.5)).toEqual({ warn: true, fire: false });
    car.reset(H - 3, 0, 0); expect(g2.step(car, 0.1)).toEqual({ warn: false, fire: false });
    car.reset(H + 3, 0, 0); expect(g2.step(car, 0.6).fire, 'Zähler lief neu an').toBe(false);
  });
});

describe('Rand: Kran statt Auflösen (Offroad, Jeep)', () => {
  const lv = WORLDS.find((w) => w.id === 'huegel' || w.levels.some((l) => l.id === 'huegel'))!.levels.find((l) => l.id === 'huegel')!;
  it('Jeep fährt über den Rand -> Kran-Warnung -> nach ~1 s wieder auf der Strecke, +3 s', () => {
    const c = lv.make(), e = c.edge!, run = new Run(c, 'time'); run.update(0.1, c.start.x, c.start.z, true);
    expect(run.state).toBe('run');
    const g = new EdgeGuard(e), t0 = run.elapsed;
    // von der Mitte des Rechtecks nach Osten, 25 m vor dem Rand
    const r = drive(e.x1 - 25, (e.z0 + e.z1) / 2, -Math.PI / 2, 15, g, c, CARS.jeep);
    expect(r.warned && r.fired).toBe(true);
    // Kran-Aktion wie game.ts onReset
    expect(run.penalize()).toBe(3); expect(run.elapsed).toBeCloseTo(t0 + 3, 5);
    const q = c.recoverAt ? c.recoverAt(r.car.pos[0], r.car.pos[2]) : c.recover(run.resetS())!;
    r.car.reset(q.x, q.z, q.yaw);
    expect(edgeNormal(e, r.car.pos[0], r.car.pos[2]), 'innerhalb des Rechtecks').toBeNull();
    expect(c.route.nearest(r.car.pos[0], r.car.pos[2]).d, 'nahe Weg/Ast').toBeLessThan(5);
    expect(r.car.speed).toBeLessThan(0.5);
    expect(g.step(r.car, DT).warn, 'Warnung aus').toBe(false);
  });
});

describe('Rand mit Sperrfläche', () => {
  const r: EdgeRect = { x0: -100, z0: -100, x1: 100, z1: 100, cuts: [[-1e4, -1e4, -40, -50]] };   // NW-Ecke abgeschnitten
  it('in der Sperrfläche = außerhalb; Normale weist aus der Fläche', () => {
    expect(edgeNormal(r, 0, 0)).toBeNull(); expect(edgeNormal(r, 0, -80)).toBeNull();
    const n = edgeNormal(r, -60, -70); expect(n).not.toBeNull();
    expect(edgeNormal(r, -60, -55)![1], 'Südseite (dist 5 < 20 zur Ostseite)').toBe(1);
    expect(edgeNormal(r, -45, -90)![0], 'Ostseite').toBe(1);
  });
});

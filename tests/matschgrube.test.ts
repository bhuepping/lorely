// Matschgrube: langer Waldweg mit 4 Matschgruben, jede mit trockenem Umweg. Der Jeep fährt durch die Gruben (schneller), die anderen Autos über die Umwege.
// Prüft den Nutzerweg: Startblick = Wegrichtung, Jeep durch alle Gruben ins Ziel, Kompakter/Buggy/Rallye über die Umwege ins Ziel und mit Sternen, keine Abkürzung.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { viaBranches } from '../src/levels/offroad';
import { Vehicle, DT } from '../src/physics/vehicle';
import { Obstacles } from '../src/physics/obstacles';
import type { Course } from '../src/level';
import { driveBot } from '../tools/bot';
import { shortestPath } from '../tools/detour';

const c = WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === 'matschgrube')!.make();
const br = c.branches!, all = br.map((_, i) => i), detours = viaBranches(c, all);

describe('Matschgrube: Aufbau', () => {
  it('Waldweg ≥ 850 m mit 4 Gabeln in Folge; jeder Ast beginnt und endet auf dem guten Weg, ist länger als sein Stück und deutlich vom Weg abgesetzt', () => {
    expect(br.length).toBe(4); expect(c.length).toBeGreaterThan(850);
    br.forEach((b, i) => {
      const a = c.route.at(b.a), e = c.route.at(b.b), p0 = b.route.at(0), p1 = b.route.at(b.route.length);
      expect(Math.hypot(a.x - p0.x, a.z - p0.z), `Ast ${i + 1} Gabel`).toBeLessThan(1.5); expect(Math.hypot(e.x - p1.x, e.z - p1.z), `Ast ${i + 1} Mündung`).toBeLessThan(1.5);
      expect(b.route.length - (b.b - b.a), `Ast ${i + 1} Umweg in m`).toBeGreaterThan(25);
      if (i) expect(b.a).toBeGreaterThan(br[i - 1].b - 1);
      const m = b.route.at(b.route.length / 2); expect(c.route.nearest(m.x, m.z).d, `Ast ${i + 1} Abstand in der Mitte`).toBeGreaterThan(25);
    });
  });
  it('4 Matschgruben auf dem guten Weg, je mit einem Umweg ohne Matsch; Sterne: Gruben, Furt, Umwege', () => {
    let pits = 0, was = false; for (let s = 0; s <= c.length; s += 1) { const p = c.route.at(s), m = c.terrain.surface(p.x, p.z).name === 'Matsch'; if (m && !was) pits++; was = m; }
    expect(pits).toBe(4);
    for (const b of br) for (let s = 0; s <= b.route.length; s += 1) { const p = b.route.at(s); expect(c.terrain.surface(p.x, p.z).name, `Umweg s${s}`).not.toBe('Matsch'); }
    expect(c.stars.length).toBeGreaterThanOrEqual(13);
    for (const b of br) expect(c.stars.filter(([x, z]) => b.route.nearestWithin(x, z, 3)).length, 'Sterne je Umweg').toBeGreaterThanOrEqual(2);
  });
  it('Startblick = Wegrichtung: Vollgas geradeaus bleibt auf dem Weg', () => {
    const car = new Vehicle(CARS.jeep, c.terrain), ob = new Obstacles(c.obstacles.circles, c.obstacles.boxes); car.allowSleep = false; car.reset(c.start.x, c.start.z, c.start.yaw);
    const f = car.forwardAxis(), r = c.route.at(15), L = Math.hypot(f[0], f[2]);
    expect((f[0] * r.dx + f[2] * r.dz) / L, 'Blick gegen Wegrichtung bei 15 m').toBeGreaterThan(0.97);
    for (let i = 0; i < 2.5 / DT; i++) { car.shallow = c.shallowAt(car.pos[0], car.pos[2]); car.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT); ob.step(car); }
    const h = c.route.nearest(car.pos[0], car.pos[2]); expect(h.s, 'Fortschritt in 2,5 s').toBeGreaterThan(15); expect(h.d, 'Abstand zum Weg').toBeLessThan(6);
  });
});

describe('Matschgrube: fahren', () => {
  it('Jeep durch alle 4 Gruben ins Ziel, Bot ≥ 75 s, ohne Kippen; schneller als über alle Umwege', () => {
    let n = 0, was = false;
    const jeep = driveBot(c, CARS.jeep, { maxSecs: 130, onStep: (car) => { const m = c.terrain.surface(car.pos[0], car.pos[2]).name === 'Matsch'; if (m && !was) n++; was = m; } });
    expect(jeep.finished && jeep.flips === 0, `Jeep ${jeep.time.toFixed(1)} s flips ${jeep.flips}`).toBe(true);
    expect(jeep.time, 'Bot-Zeit Jeep').toBeGreaterThanOrEqual(75);
    expect(n, 'Gruben durchfahren').toBe(4);
    const d = driveBot(detours, CARS.jeep, { maxSecs: 130 });
    expect(d.finished && d.stars >= jeep.stars, 'Jeep über die Umwege').toBe(true);
    expect(d.time, `Umwege ${d.time.toFixed(1)} s, Gruben ${jeep.time.toFixed(1)} s`).toBeGreaterThan(jeep.time + 3);
  });
  it('Kompakter, Buggy und Rallye kommen über die Umwege ins Ziel (ohne Kippen) und holen ≥ 6 Sterne; die Gruben sind für Kompakter und Buggy zu schwer', () => {
    for (const id of ['hatch', 'buggy', 'rally'] as const) {
      const r = driveBot(detours, CARS[id], { maxSecs: 150 });
      expect(r.finished && r.flips === 0, `${id} Umwege: ${r.finished ? r.time.toFixed(1) + ' s' : 'DNF@' + Math.round(r.s)} flips ${r.flips}`).toBe(true);
      expect(r.stars, `${id} Sterne`).toBeGreaterThanOrEqual(6);
    }
    for (const id of ['hatch', 'buggy'] as const) expect(driveBot(c, CARS[id], { maxSecs: 100 }).finished, `${id} schafft die Gruben nicht`).toBe(false);
  }, 120_000);
  it('Jeep fährt auch jeden einzelnen Umweg ins Ziel', () => {
    for (const i of all) { const r = driveBot(viaBranches(c, [i]), CARS.jeep, { maxSecs: 130 }); expect(r.finished && r.flips === 0, `Ast ${i + 1}`).toBe(true); }
  });
});

describe('Matschgrube: keine Abkürzung', () => {
  it('ohne Matsch kommt man von vor einer Grube nach hinter die Grube nur über den Umweg (≥ 15 m länger als der Weg)', () => {
    br.forEach((b, i) => {
      let s0 = -1, s1 = -1; for (let s = b.a; s <= b.b; s += 1) { const p = c.route.at(s); if (c.terrain.surface(p.x, p.z).name === 'Matsch') { if (s0 < 0) s0 = s; s1 = s; } }
      const A = c.route.at(s0 - 15), B = c.route.at(s1 + 15), main = s1 - s0 + 30;
      const p = shortestPath({ ...c, start: { x: A.x, z: A.z, yaw: 0 }, goal: { ...c.goal!, x: B.x, z: B.z } } as Course, { slope: 9, mud: false, goalR: 3 });
      expect(p.len, `Grube ${i + 1}: trocken ${p.len.toFixed(0)} m, Weg durch die Grube ${main.toFixed(0)} m`).toBeGreaterThan(main + 15);
    });
  });
  it('Kran auf einem Umweg setzt auf den Umweg zurück', () => {
    const b = br[1], p = b.route.at(b.route.length * 0.45), r = c.recoverAt!(p.x, p.z);
    expect(b.route.nearest(r.x, r.z).d).toBeLessThan(1); expect(c.route.nearest(r.x, r.z).d).toBeGreaterThan(8);
  });
});

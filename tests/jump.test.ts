import { describe, it, expect } from 'vitest';
import { buildCourse, type LevelDef } from '../src/level';
import waldweg from '../src/levels/waldweg.json';
import { jumpShape } from '../src/features';
import { CARS } from '../src/physics/params';
import { Vehicle, DT } from '../src/physics/vehicle';

const withJumps = (jumps: LevelDef['jumps']) => buildCourse({ ...(waldweg as unknown as LevelDef), jumps });

describe('Sprünge', () => {
  it('Schanzenform: Rampe steigt, Abfahrt fällt, außerhalb null', () => {
    const j = { s: 100, up: 22, down: 26, h: 2 };
    expect(jumpShape(j, -1)).toBe(0); expect(jumpShape(j, 60)).toBe(0);
    expect(jumpShape(j, 11)).toBeLessThan(jumpShape(j, 21)); expect(jumpShape(j, 22)).toBeCloseTo(2, 1); expect(jumpShape(j, 40)).toBeLessThan(1);
  });
  it('Gelände = Raster + Schanze: Straße über der Rampe liegt höher, daneben (> Straßenbreite + 8 m) unverändert', () => {
    const flat = withJumps([]), c = withJumps([{ s: 300, up: 22, down: 26, h: 2.2 }]);
    const a = c.route.at(321), [sx, sz] = c.route.offset(321, 14);
    expect(c.terrain.height(a.x, a.z) - flat.terrain.height(a.x, a.z)).toBeGreaterThan(1.9);
    expect(c.terrain.height(sx, sz)).toBeCloseTo(flat.terrain.height(sx, sz), 3);
    const n: number[] = []; c.terrain.normal(a.x, a.z, n); expect(n[1]).toBeLessThan(0.995);   // Rampe ist geneigt
  });
  for (const [name, P] of Object.entries(CARS)) it(`${name}: hebt ab, landet aufrecht auf allen Rädern und fährt weiter; Landung wird gemeldet (Ton)`, () => {
    // gerade Straße, Schanze bei s=100, Anfahrt mit 22 und 32 m/s (Tempo der Etappen)
    const base = waldweg as unknown as LevelDef;
    const c = buildCourse({ ...base, road: { ...base.road, points: [[0, 400], [0, -400]] }, terrain: { ...base.terrain, amp: 0.3, roadAmp: 0.1 }, jumps: [{ s: 100, up: 30, down: 40, h: 1.8 }] });
    for (const v0 of [22, 32]) {
      const car = new Vehicle(P, c.terrain); car.allowSleep = false; const a = c.route.at(70); car.reset(a.x, a.z, c.route.yawAt(70)); car.launch(v0);
      let air = 0, land = 0, minUp = 1, tl = 0, vAfter = 0;
      for (let k = 0; k < 7 * 120; k++) {
        car.step({ steer: 0, throttle: 0.5, brake: 0, handbrake: false }, DT);
        air = Math.max(air, car.airTime); if (car.landing) { land = Math.max(land, car.landing); tl = k * DT; car.landing = 0; }
        minUp = Math.min(minUp, car.axes().u[1]); if (tl && k === Math.round((tl + 1.5) * 120)) vAfter = car.forwardSpeed;
      }
      expect(air, `${name} ${v0}`).toBeGreaterThan(0.4);
      expect(land, `${name} ${v0}`).toBeGreaterThan(2);       // hart genug für den Landeton
      expect(minUp, `${name} ${v0}`).toBeGreaterThan(0.9);    // nie nennenswert gekippt
      expect(vAfter, `${name} ${v0}`).toBeGreaterThan(v0 * 0.7);
    }
  });
});

describe('Landungen und Kanten in den Etappen', () => {
  it('Stadt-Etappe: Bot lenkt beim Absprung quer an -> kein Überschlag, landet ohne Schleudern (alle Autos)', async () => {
    const { driveBot } = await import('../tools/bot');
    const stadt = buildCourse((await import('../src/levels/etappe_stadt.json')).default as unknown as LevelDef);
    for (const [name, P] of Object.entries(CARS)) {
      let kicked = false, pa = 0, tl = -9, beta = 0;
      const r = driveBot(stadt, P, { maxSecs: 45,
        before: (car) => { if (car.airTime === 0) kicked = false; else if (!kicked) { car.angVel[1] += 0.35; kicked = true; } },
        onStep: (car, _s, t) => {
          if (pa > 0.2 && car.airTime === 0) tl = t;
          pa = car.airTime;
          if (t - tl < 1.2) { const f = car.forwardAxis(), a = car.axes(), v = car.vel; beta = Math.max(beta, Math.abs(Math.atan2(v[0] * a.r[0] + v[2] * a.r[2], Math.abs(v[0] * f[0] + v[2] * f[2])))); }
        } });
      expect(r.flips, name).toBe(0);
      expect(r.s, name).toBeGreaterThan(1100);                     // beide Schanzen und die Kanalbrücke geschafft
      expect(beta * 57.3, name).toBeLessThan(8);
    }
  });
  it('Rhein-Etappe: langsam auf die Brücke -> keine Kante am Deckanfang, alle Autos kommen hoch', async () => {
    const rhein = buildCourse((await import('../src/levels/etappe_rhein.json')).default as unknown as LevelDef), s0 = rhein.bridge!.s0;
    for (const [name, P] of Object.entries(CARS)) {
      const car = new Vehicle(P, rhein.terrain); car.allowSleep = false; const a = rhein.route.at(s0 - 8); car.reset(a.x, a.z, rhein.route.yawAt(s0 - 8));
      for (let k = 0; k < 5 * 120; k++) {
        const h = rhein.route.nearest(car.pos[0], car.pos[2]), f = car.forwardAxis(), d = Math.atan2(-f[0], -f[2]) - rhein.route.yawAt(h.s);
        car.step({ steer: Math.max(-1, Math.min(1, 0.3 * h.lat - 2 * Math.atan2(Math.sin(d), Math.cos(d)))), throttle: 0.35, brake: 0, handbrake: false }, DT);
      }
      expect(rhein.route.nearest(car.pos[0], car.pos[2]).s, name).toBeGreaterThan(s0 + 15);
    }
  });
});

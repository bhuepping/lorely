// ehrliche Balance – im Gelände keine Fahrhilfe in der Luft, Überschlag möglich, Auto bleibt liegen (Kran blinkt: flipT), auf Straßen/Schanzen abgestuft.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { buildCourse, type LevelDef } from '../src/level';
import { aidField, AID_ROAD, AID_JUMP } from '../src/features';
import { CARS } from '../src/physics/params';
import { Vehicle, DT } from '../src/physics/vehicle';

describe('Fahrhilfe nach Ort', () => {
  it('Offroad 0, Straße schwach, an der Schanze stärker', async () => {
    const off = WORLDS.find((w) => w.id === 'offroad')!.levels[1].make();
    expect(aidField(off)(0, 0)).toBe(0);
    const c = buildCourse((await import('../src/levels/etappe_schnee.json')).default as unknown as LevelDef), j = c.jumps[0], m = c.route.at(j.s + (j.up + j.down) / 2), f = aidField(c);
    expect(f(m.x, m.z)).toBe(AID_JUMP);
    let road = 0; for (let q = 0; q < c.length; q += 20) { const a = c.route.at(q); if (f(a.x, a.z) === AID_ROAD) road++; }
    expect(road).toBeGreaterThan(5);
    expect(AID_ROAD).toBeLessThan(AID_JUMP); expect(AID_JUMP).toBeLessThan(1);
  });
});

describe('Überschlag im Gelände', () => {
  it('Hügel: zufällige Fahrten ohne Hilfe – irgendwann liegt das Auto auf Dach/Seite und richtet sich nicht von selbst auf (flipT läuft, bis zum Kran)', () => {
    const c = WORLDS.find((w) => w.id === 'offroad')!.levels[1].make();
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
      const v = new Vehicle(CARS.rally, c.terrain); v.aid = 0;
      v.reset((rnd() - 0.5) * 120, (rnd() - 0.5) * 160, rnd() * 6.28); v.launch(10 + rnd() * 10);
      let st = 0, sw = 0;
      for (let k = 0; k < 20 * 120; k++) {
        if (k % 120 === 0) { st = (rnd() - 0.5) * 2; sw = rnd(); }
        v.step({ steer: st, throttle: sw < 0.8 ? 1 : 0, brake: 0, handbrake: false }, DT);
      }
      if (v.flipT > 1.2) {
        found = true;
        for (let k = 0; k < 5 * 120; k++) v.step({ steer: 0, throttle: 0, brake: 0, handbrake: false }, DT);   // nichts tun: bleibt liegen
        expect(v.axes().u[1]).toBeLessThan(0.35); expect(v.flipT).toBeGreaterThan(5);
      }
    }
    expect(found, 'in 60 Zufallsfahrten kein Überschlag').toBe(true);
  });
});

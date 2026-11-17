// Anfahrkupplung: Motor dreht beim Anfahren frei in seinen Kraftbereich, die Kupplung schleift. Nutzerweg: Vollgas aus dem Stand.
import { describe, it, expect } from 'vitest';
import { Vehicle, DT } from '../src/physics/vehicle';
import { CARS } from '../src/physics/params';
import { FlatTerrain, ASPHALT, MUD } from '../src/physics/terrain';
import { WORLDS } from '../src/levels';

// 0-50 km/h auf Asphalt, Vollgas, in s (Stand vor, gemessen); Toleranz 8 %
const BASE: Record<string, number> = { hatch: 2.39, buggy: 1.54, rally: 1.48, jeep: 1.53 };

function zeroTo50(id: string) {
  const c = new Vehicle(CARS[id], new FlatTerrain(ASPHALT)); c.allowSleep = false;
  for (let i = 0; i < 20 / DT; i++) {
    c.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT);
    if (c.forwardSpeed >= 50 / 3.6) return i * DT;
  }
  return 99;
}

describe('Anfahrkupplung', () => {
  for (const id of Object.keys(CARS)) it(`${id}: 0-50 km/h auf Asphalt nicht langsamer als vorher`, () => {
    const t = zeroTo50(id);
    console.log('0-50', id, t.toFixed(2));
    expect(t).toBeLessThan(BASE[id] * 1.08);
  });

  it('Rallye Vollgas aus dem Stand im Moorwald-Matsch: Räder drehen schneller als der Boden, Drehzahl > 2500', () => {
    const c0 = WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === 'moorwald')!.make();
    const c = new Vehicle(CARS.rally, c0.terrain); c.allowSleep = false;
    const x = -67, z = 205, n0 = c0.route.nearest(x, z); c.reset(x, z, c0.route.yawAt(n0.s));   // Hängerpunkt: stand mit 900 U/min
    let slip = 0, rpm = 0, n = 0;
    for (let i = 0; i < 3 / DT; i++) {
      c.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT);
      if (i > 0.5 / DT) { slip += (c.omega[0] + c.omega[1] + c.omega[2] + c.omega[3]) / 4 * CARS.rally.wheelRadius - c.forwardSpeed; rpm += c.rpm; n++; }
    }
    console.log('rally matsch', (slip / n).toFixed(2), (rpm / n).toFixed(0), c.forwardSpeed.toFixed(1));
    expect(slip / n, 'Radüberschuss m/s').toBeGreaterThan(1.5);
    expect(rpm / n, 'Drehzahl').toBeGreaterThan(2500);
  });

  it('Rallye Vollgas aus dem Stand auf ebenem Matsch: Räder drehen durch, Drehzahl steigt deutlich über Leerlauf', () => {
    const c = new Vehicle(CARS.rally, new FlatTerrain(MUD)); c.allowSleep = false;
    const idle = c.rpm;
    let slip = 0, rpm = 0, n = 0;
    for (let i = 0; i < 3 / DT; i++) {
      c.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT);
      if (i > 0.5 / DT) { slip += (c.omega[0] + c.omega[1] + c.omega[2] + c.omega[3]) / 4 * CARS.rally.wheelRadius - c.forwardSpeed; rpm += c.rpm; n++; }
    }
    console.log('rally ebener matsch', (slip / n).toFixed(2), (rpm / n).toFixed(0), c.forwardSpeed.toFixed(1));
    expect(slip / n, 'Radüberschuss m/s').toBeGreaterThan(1.5);
    expect(rpm / n, 'Drehzahl').toBeGreaterThan(Math.max(2500, idle + 1500));
  });

  it('ohne Gas steht das Auto ruhig, Drehzahl im Leerlauf', () => {
    for (const id of Object.keys(CARS)) {
      const c = new Vehicle(CARS[id], new FlatTerrain(ASPHALT)); c.allowSleep = false;
      for (let i = 0; i < 4 / DT; i++) c.step({ steer: 0, throttle: 0, brake: 0, handbrake: false }, DT);
      expect(c.speed, id).toBeLessThan(0.01);
      expect(c.rpm, id).toBeLessThan(CARS[id].idleRpm + 150);
    }
  });
});

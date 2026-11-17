// Fallversuch: Auto aus h m fallen lassen; zählt Abprallen (Hüpfer, Höhe) und Nachschwingen (Zeit bis ruhig).
import { describe, it, expect } from 'vitest';
import { GridTerrain, ASPHALT, GRAVEL, GRASS } from '../src/physics/terrain';
import { CARS } from '../src/physics/params';
import { Vehicle, DT } from '../src/physics/vehicle';

interface FallRes { hops: number; hopH: number; maxLift: number; settle: number; tilt: number; wheelsOff: number }
function drop(carId: string, h: number, o: { pitch?: number; roll?: number; vf?: number; ground?: 'asphalt' | 'gravel' | 'slope' } = {}): FallRes {
  const slope = o.ground === 'slope' ? 0.36 : 0, S = o.ground === 'gravel' ? GRAVEL : o.ground === 'slope' ? GRASS : ASPHALT;
  const t = new GridTerrain(81, 2, (x, z) => slope * z, () => S);
  const P = CARS[carId], car = new Vehicle(P, t); car.allowSleep = false; car.reset(0, 0, 0);
  const pitch = o.pitch ?? 0, roll = o.roll ?? 0;
  // Ausrichtung (Nicken um x, Wanken um z): q = qz * qx
  const cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2), cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
  car.q = [cr * sp, -sr * sp, sr * cp, cr * cp];
  const base = t.height(0, 0); car.pos = [0, base + P.cgHeight + h, 0];
  car.launch(o.vf ?? 0); car.vel[1] = 0;
  let touched = false, air = 0, hops = 0, hopH = 0, hopStart = 0, maxLift = 0, settle = 0, tilt = 0, wheelsOff = 0, tT = 0, wasAir = false, apex = 0;
  const rest = base + P.cgHeight;
  for (let k = 0; k < 8 * 120; k++) {
    car.step({ steer: 0, throttle: 0, brake: 0, handbrake: false }, DT);
    const n = car.contact.filter(Boolean).length;
    if (!touched) { if (n > 0) { touched = true; tT = k * DT; } continue; }
    const tt = k * DT - tT;
    if (n === 0) { if (!wasAir) { wasAir = true; apex = car.pos[1]; hopStart = tt; } apex = Math.max(apex, car.pos[1]); air += DT; }
    else if (wasAir) { wasAir = false; if (air > 0.06) { hops++; hopH = Math.max(hopH, apex - car.pos[1] + 0); } air = 0; }
    if (n < 4 && n > 0 && tt < 3) wheelsOff += DT;
    tilt = Math.max(tilt, Math.acos(Math.min(1, car.axes().u[1])));
    if (Math.abs(car.vel[1]) > 0.15 || Math.hypot(car.angVel[0], car.angVel[1], car.angVel[2]) > 0.15 || n < 4) settle = tt;
  }
  return { hops, hopH, maxLift, settle, tilt, wheelsOff };
}

const cars = Object.keys(CARS);
describe('Fallversuch: kein Flummi', () => {
  for (const car of cars) for (const g of ['asphalt', 'gravel'] as const) it(`${car} auf ${g}: bis 3 m alle Räder am Boden, aus 15 m höchstens ein kurzer Hüpfer, ruhig in ~1 s`, () => {
    for (const h of [1, 3, 6, 10, 15]) for (const o of [{}, { pitch: 0.17, roll: 0.17 }, { vf: 20 }]) {
      const r = drop(car, h, { ...o, ground: g }), tag = `${car} ${g} ${h} m ${JSON.stringify(o)}`;
      expect(r.hops, tag).toBeLessThanOrEqual(1);
      expect(r.hopH, tag).toBeLessThan(0.5);
      if (h <= 3) { expect(r.hops, tag).toBe(0); expect(r.wheelsOff, tag).toBeLessThan(0.15); }
      if (!('vf' in o)) expect(r.settle, tag).toBeLessThan(1.3);
    }
  });
  it('Jeep bleibt nach einem Fall im Stand stehen (kein Phantomantrieb durch Reifen-Schwingen)', () => {
    const t = new GridTerrain(81, 2, () => 0, () => ASPHALT), car = new Vehicle(CARS.jeep, t); car.allowSleep = false; car.reset(0, 0, 0); car.pos[1] += 0.3;
    for (let k = 0; k < 6 * 120; k++) car.step({ steer: 0, throttle: 0, brake: 0, handbrake: false }, DT);
    expect(car.speed).toBeLessThan(0.1);
  });
});

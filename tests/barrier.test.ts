// Bahnübergang-Schranke: ein Auto fährt durch die geschlossene Schranke -> kommt durch, bremst etwas, Stücke fliegen;
// der Zug bleibt die einzige Hitbox.
import { it, expect } from 'vitest';
import { Route } from '../src/level';
import { Movers, barrierParking } from '../src/movers';
import { Props } from '../src/physics/props';
import { Vehicle, DT } from '../src/physics/vehicle';
import { FlatTerrain } from '../src/physics/terrain';
import { CARS } from '../src/physics/params';

const route = new Route([[0, -300], [0, 300]]);
const defs = [{ kind: 'crossing' as const, s: 40, period: 1000, phase: 1.5 }];   // Schranke schließt bei t≈0,8 s, Auto kommt bei ≈2,2 s

function drive(hit: boolean) {
  const terrain = new FlatTerrain();
  const m = new Movers(route, 4, defs, 0), props = new Props(terrain, barrierParking(defs));
  const car = new Vehicle(CARS.hatch, terrain); car.allowSleep = false;
  const a0 = route.at(0); car.reset(a0.x, a0.z, route.yawAt(0)); car.launch(15);
  let vGate = 0, vAfter = 0;
  for (let k = 0; k < 6 / DT; k++) {
    m.step(DT);
    car.step({ steer: 0, throttle: 0, brake: 0, handbrake: false }, DT);
    props.step(car, DT);
    if (hit) m.barrierHit(car.pos[0], car.pos[2], car.vel[0], car.vel[2], props);
    if (!vGate && car.pos[2] > -262) vGate = car.forwardSpeed;
    if (!vAfter && car.pos[2] > -240) vAfter = car.forwardSpeed;
  }
  return { m, props, car, vGate, vAfter };
}

it('Schranke: Auto kommt durch, bremst etwas, Stücke fliegen, Zug bleibt die einzige Hitbox', () => {
  const hit = drive(true), free = drive(false);
  const c = hit.m.crossings[0];
  expect(c.broken).toBe(true);                       // zerbrochen beim Durchfahren
  expect(free.m.crossings[0].broken).toBe(false);
  expect(hit.car.pos[2]).toBeGreaterThan(-240);      // durchgekommen
  expect(hit.vAfter).toBeGreaterThan(3);             // nicht stehen geblieben
  expect(hit.vAfter).toBeLessThan(free.vAfter - 0.02);   // Klötze bremsen etwas
  for (let i = 0; i < 4; i++) {                      // alle Stücke liegen an der Schranke
    expect(Math.abs(hit.props.pos[i * 3 + 2] + 267), `Stück ${i}`).toBeLessThan(60);
  }
  expect(hit.m.boxes.length).toBe(1);                // nur der Zug ist eine Box (keine Schrankenhitbox)
});

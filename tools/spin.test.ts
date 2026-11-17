// Werkzeug: Vollgas aus dem Stand an einer Stelle – Grund, Bodenkontakt, Reifen- vs Fahrzeugtempo, TC, Partikel. SPIN=1 [SPOTS="x,z;x,z"] [CAR=buggy,…] npx vitest run tools/spin.test.ts
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { Vehicle, DT } from '../src/physics/vehicle';
import { Fx } from '../src/fx';
import { Obstacles } from '../src/physics/obstacles';

it.skipIf(!process.env.SPIN)('Vollgas aus dem Stand', () => {
  const c = WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === (process.env.LV ?? 'moorwald'))!.make();
  const spots = (process.env.SPOTS ?? '-67,205').split(';').map((p) => p.split(',').map(Number));
  for (const [x, z] of spots) for (const [id, P] of Object.entries(CARS)) {
    if (process.env.CAR && !process.env.CAR.split(',').includes(id)) continue;
    const car = new Vehicle(P, c.terrain), ob = new Obstacles(c.obstacles.circles, c.obstacles.boxes), fx = new Fx(c, false);
    const n = c.route.nearest(x, z); car.reset(x, z, c.route.yawAt(n.s));
    const out: string[] = [];
    for (let k = 0; k < 3 / DT; k++) {
      car.shallow = c.shallowAt(x, z); car.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT); ob.step(car);
      (fx as any).emitAll(DT, car, { steer: 0, throttle: 1, brake: 0, handbrake: false }, 1);
      if (k % 120 === 119) { const R = P.wheelRadius, sf = c.terrain.surface(car.pos[0], car.pos[2]); out.push(`t${((k + 1) * DT).toFixed(0)} v${car.forwardSpeed.toFixed(1)} id${sf.id} ground ${car.contact.map((b) => +b).join('')} omR ${car.omega.map((w) => (w * R).toFixed(1)).join('/')} rpm${car.rpm.toFixed(0)} tcF${car.tcF.toFixed(2)}`); }
    }
    console.log(`SPIN ${id} (${x},${z}): ${out.join(' | ')} | Partikel ${JSON.stringify(fx.emitted)}`);
  }
});

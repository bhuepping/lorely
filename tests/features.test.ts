import { describe, it, expect } from 'vitest';
import { buildCourse, type LevelDef } from '../src/level';
import waldweg from '../src/levels/waldweg.json';
import { Movers } from '../src/movers';
import { TUNNEL_SHOULDER } from '../src/features';
import { HATCHBACK_80S } from '../src/physics/params';
import { Vehicle, DT } from '../src/physics/vehicle';
import { Obstacles } from '../src/physics/obstacles';

// gerade Straße von z=400 nach z=-400, fast flach; s=0 bei z=400
const base = waldweg as unknown as LevelDef;
const straight = (extra: Partial<LevelDef>) => buildCourse({ ...base, road: { ...base.road, points: [[0, 400], [0, -400]] }, terrain: { ...base.terrain, amp: 0.3, roadAmp: 0.1 }, ...extra });

/** fährt wie im Spiel (Movers -> Auto -> Hindernisse), gibt die Strecke s je Schritt zurück */
function drive(c: ReturnType<typeof straight>, s0: number, v0: number, secs: number, inp: { steer: number; throttle: number }, movers?: Movers, each?: (car: Vehicle) => void) {
  const car = new Vehicle(HATCHBACK_80S, c.terrain); car.allowSleep = false;
  const a = c.route.at(s0); car.reset(a.x, a.z, c.route.yawAt(s0)); car.launch(v0);
  const obst = new Obstacles(c.obstacles.circles, c.obstacles.boxes);
  if (movers) { obst.dynBoxes = movers.boxes; obst.dynCircles = movers.circles; }
  for (let k = 0; k < secs / DT; k++) {
    car.shallow = c.shallowAt(car.pos[0], car.pos[2]);
    movers?.step(DT); car.step({ ...inp, brake: 0, handbrake: false }, DT); obst.step(car); each?.(car);
  }
  return car;
}

describe('Bahnübergang', () => {
  // Schranke schließt 5 s vor der Ankunft des Zugs; Phase so gewählt, dass sie bei t=0 zu schließen beginnt
  const v = 28, Lr = v * 5 + 24 + 40, tClose = (Lr - v * 5) / v;
  const mk = (phase: number) => { const c = straight({}); return { c, m: new Movers(c.route, c.roadWidth / 2, [{ kind: 'crossing', s: 150, period: 60, phase }]) }; };
  // seit hat die Schranke keine Hitbox (sie zerbricht, siehe barrier.test.ts); nur der Zug hält auf
  it('Zug auf dem Übergang: Auto kommt nicht durch', () => {
    const { c, m } = mk(Lr / v - 1);   // Zugspitze erreicht die Straße nach 1 s, das Auto kommt nach ≈ 2 s
    expect(m.crossings[0].gateBox.on).toBe(false);   // keine Schrankenbox mehr
    expect(m.boxes.length).toBe(1);
    const car = drive(c, 125, 12, 4, { steer: 0, throttle: 0.6 }, m);
    expect(c.route.nearest(car.pos[0], car.pos[2]).s).toBeLessThan(150);
  });
  it('Schranke offen: Auto fährt durch', () => {
    const { c, m } = mk(tClose + 8);
    expect(m.crossings[0].gateBox.on).toBe(false);
    const car = drive(c, 125, 12, 4, { steer: 0, throttle: 0.6 }, m);
    expect(c.route.nearest(car.pos[0], car.pos[2]).s).toBeGreaterThan(165);
  });
});

describe('Tunnel und Furt', () => {
  it('Tunnel: geradeaus durch, Wand hält beim Volleinschlag', () => {
    const c = straight({ tunnels: [{ s0: 150, s1: 250 }] });
    const car = drive(c, 120, 20, 8, { steer: 0, throttle: 0.5 });
    expect(c.route.nearest(car.pos[0], car.pos[2]).s).toBeGreaterThan(260);
    let maxLat = 0;
    drive(c, 170, 12, 3, { steer: 1, throttle: 0.6 }, undefined, (k) => { maxLat = Math.max(maxLat, Math.abs(c.route.nearest(k.pos[0], k.pos[2]).lat)); });
    expect(maxLat).toBeLessThan(c.roadWidth / 2 + TUNNEL_SHOULDER + 0.3);
  });
  it('Furt: bremst spürbar, Auto säuft nicht ab', () => {
    const at = (fords: LevelDef['fords']) => { const c = straight({ fords }); let v = 0; const car = drive(c, 120, 18, 6, { steer: 0, throttle: 0.4 }, undefined, (k) => { const s = c.route.nearest(k.pos[0], k.pos[2]).s; if (s < 190) v = k.speed; }); return { v, car }; };
    const dry = at([]), wet = at([{ s0: 150, s1: 192 }]);
    expect(wet.v).toBeLessThan(dry.v - 2);
    expect(wet.car.drowned).toBe(false);
  });
});

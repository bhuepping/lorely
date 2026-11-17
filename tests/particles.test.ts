import { describe, it, expect } from 'vitest';
import { ParticlePool } from '../src/particles';
import { Fx } from '../src/fx';
import { FlatTerrain, GRASS } from '../src/physics/terrain';
import type { Course } from '../src/level';

const sp = (o = {}) => ({ x: 0, y: 0, z: 0, vx: 1, vy: 0, vz: 0, life: 1, size: 0.2, r: 1, g: 1, b: 1, ...o });

describe('ParticlePool', () => {
  it('überläuft nie: mehr Emits als Plätze überschreiben die ältesten, Größe bleibt fest', () => {
    const P = new ParticlePool(16), len = P.x.length;
    for (let i = 0; i < 100; i++) P.emit(sp({ x: i }));
    P.step(0.01);
    expect(P.alive).toBe(16); expect(P.x.length).toBe(len);
    expect(Math.min(...P.x)).toBeGreaterThanOrEqual(84);   // nur die neuesten 16
  });
  it('Plätze werden nach Ablauf wiederverwendet, Größe schrumpft am Ende auf 0', () => {
    const P = new ParticlePool(8);
    for (let i = 0; i < 8; i++) P.emit(sp({ life: 0.5 }));
    P.step(0.4); expect(P.alive).toBe(8); expect(P.sizeOf(0)).toBeLessThan(0.2);
    P.step(0.2); expect(P.alive).toBe(0); expect(P.sizeOf(0)).toBe(0);
    P.emit(sp()); P.step(0.01); expect(P.alive).toBe(1);
  });
  it('Bewegung: Geschwindigkeit, Schwerkraft', () => {
    const P = new ParticlePool(2); P.emit(sp({ vy: 5, grav: 10 })); P.step(0.1);
    expect(P.x[0]).toBeCloseTo(0.1, 5); expect(P.y[0]).toBeGreaterThan(0.3);
  });
});

describe('Konfetti im Ziel', () => {
  it('Schauer: rund 150 leuchtende bunte Pixel je Sekunde vor der Kamera, folgt ihr, fällt, ist nach dem Ende weg', () => {
    const terrain = new FlatTerrain(GRASS), fx = new Fx({ world: 'offroad', surfaceColors: [], terrain, fog: { color: 0, near: 50, far: 200 }, sea: null } as unknown as Course, false);
    fx.confetti();
    for (let i = 0; i < 40; i++) { fx.shower(0, 2, -i, 0, -1, 0.05); fx.pool.step(0.05); }   // 2 s, die Kamera fährt 40 m nach -z
    expect(fx.emitted.konfetti).toBeGreaterThanOrEqual(280);
    expect(fx.pool.alive).toBeGreaterThanOrEqual(200);
    const zs = Array.from(fx.pool.z).filter((_, i) => fx.pool.life[i] > 0); expect(zs.reduce((a, b) => a + b, 0) / zs.length).toBeLessThan(-20);   // wandert mit der Kamera
    expect(new Set(Array.from(fx.pool.r).map((v, i) => fx.pool.life[i] > 0 ? `${v}${fx.pool.g[i]}` : '')).size).toBeGreaterThan(4);   // bunt
    expect(Array.from(fx.pool.lit).every((l, i) => fx.pool.life[i] <= 0 || l === 0)).toBe(true);   // leuchtet (kein Nachtdunkel)
    for (let i = 0; i < 80; i++) fx.pool.step(0.05);
    expect(fx.pool.alive).toBe(0);
  });
});

describe('Durchdrehen im Matsch (Moorwald Gabel 1)', () => {
  it('Buggy und Kompakter stehen am Matschanstieg und drehen durch: es fliegt Matsch, auch im Stand', async () => {
    const { WORLDS } = await import('../src/levels'), { CARS } = await import('../src/physics/params'), { Vehicle, DT } = await import('../src/physics/vehicle');
    const c = WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === 'moorwald')!.make();
    for (const id of ['buggy', 'hatch'] as const) {
      const car = new Vehicle(CARS[id], c.terrain), fx = new Fx(c, false), inp = { steer: 0, throttle: 1, brake: 0, handbrake: false };
      car.reset(-67, 205, c.route.yawAt(c.route.nearest(-67, 205).s));
      let slow = 0;
      for (let k = 0; k < 3 / DT; k++) { car.shallow = c.shallowAt(-67, 205); car.step(inp, DT); (fx as any).emitAll(DT, car, inp, 1); if (car.speed < 1.5) slow++; }
      expect(slow, `${id} bleibt langsam`).toBeGreaterThan(120);
      expect(fx.emitted.matsch ?? 0, `${id} Matsch`).toBeGreaterThan(100);
    }
  });
});

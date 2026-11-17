// Matsch: rutschig, bremst, spritzt. Nutzerweg: Gas geben auf Matsch -> langsamer als auf Schotter, Klumpen fliegen; auf Asphalt keine.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Vehicle, DT } from '../src/physics/vehicle';
import { CARS } from '../src/physics/params';
import { FlatTerrain, MUD, GRAVEL, ASPHALT, type Surface } from '../src/physics/terrain';
import { Fx } from '../src/fx';
import type { Course } from '../src/level';

const drive = (sf: Surface, secs: number, car = 'hatch') => {
  const terrain = new FlatTerrain(sf), v = new Vehicle(CARS[car], terrain); v.allowSleep = false;
  const fx = new Fx({ world: 'offroad', surfaceColors: [], terrain, fog: { color: 0, near: 50, far: 200 }, sea: null } as unknown as Course, false);
  const cam = new THREE.PerspectiveCamera(), rend = { getDrawingBufferSize: (o: THREE.Vector2) => o.set(640, 400) } as unknown as THREE.WebGLRenderer;
  const inp = { steer: 0, throttle: 1, brake: 0, handbrake: false };
  for (let i = 0; i < secs / DT; i++) { v.step(inp, DT); if (i % 4 === 0) fx.update(4 * DT, v, inp, { camera: cam, tunnelF: 0, live: true, renderer: rend }); }
  return { dist: -v.pos[2], em: fx.emitted };
};

describe('Matsch', () => {
  it('bremst: Anfahren kommt weniger weit als auf Schotter, Jeep kommt weiter als der Kompakte', () => {
    expect(drive(MUD, 5).dist).toBeLessThan(drive(GRAVEL, 5).dist * 0.7);
    expect(drive(MUD, 5, 'jeep').dist).toBeGreaterThan(drive(MUD, 5).dist);
  });
  it('spritzt: Matschklumpen beim Fahren, auf Asphalt keine', () => {
    expect(drive(MUD, 3).em.matsch ?? 0).toBeGreaterThan(20);
    expect(drive(ASPHALT, 3).em.matsch ?? 0).toBe(0);
  });
});

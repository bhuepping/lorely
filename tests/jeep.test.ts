// Jeep: Sperre, Gelände. Nutzerweg: Gas geben, über eine Querrinne am Hang fahren, ein Rad hängt in der Luft.
import { describe, it, expect } from 'vitest';
import { Vehicle, DT } from '../src/physics/vehicle';
import { CARS } from '../src/physics/params';
import { GridTerrain, FlatTerrain, GRAVEL, ASPHALT, type Surface } from '../src/physics/terrain';

/** Hang auf Schotter; unter dem linken Vorderrad (Auto steht bei z=0) ein Loch: das Rad hängt in der Luft, der Rest steht auf Grund */
function holeTerrain(id: string, slope: number, depth = 0.8, surf: Surface = GRAVEL): GridTerrain {
  const P = CARS[id], a = P.wheelbase * (1 - P.frontWeight), hx = P.track / 2;
  const h = (x: number, z: number) => {
    const d = Math.hypot(x + hx, z + a);
    return -z * slope - depth * Math.max(0, Math.min(1, 1.6 - d * 1.7)) ;
  };
  return new GridTerrain(241, 0.5, h, () => surf);
}

function crawl(id: string, t: GridTerrain, secs = 10) {
  const c = new Vehicle(CARS[id], t); c.allowSleep = false; c.reset(0, 0, 0);
  let lifted = 0;
  for (let i = 0; i < secs / DT; i++) {
    c.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT);
    if (i === Math.round(0.8 / DT)) lifted = c.contact.filter((x) => !x).length;
  }
  return { dz: -c.pos[2], lifted, flipped: c.axes().u[1] < 0.3 };
}

const asphalt = (id: string, secs: number) => { const c = new Vehicle(CARS[id], new FlatTerrain(ASPHALT)); c.allowSleep = false; for (let i = 0; i < secs / DT; i++) c.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT); return c.forwardSpeed; };

describe('Jeep', () => {
  it('Gelände: hängt ein Rad in der Luft (Loch unter dem Vorderrad, Hang), kommt der Jeep weiter, die anderen Allradler bleiben stehen', () => {
    for (const [slope, depth] of [[0.15, 0.5], [0.25, 0.5]]) {
      const t = (id: string) => holeTerrain(id, slope, depth);
      const j = crawl('jeep', t('jeep')), r = crawl('rally', t('rally'));
      expect(j.lifted, 'Rad hängt').toBeGreaterThanOrEqual(1);
      expect(j.dz, `Jeep Hang ${slope}`).toBeGreaterThan(15);
      expect(r.dz, `Rallye Hang ${slope}`).toBeLessThan(5);
      expect(j.flipped).toBe(false);
    }
  });
  it('Asphalt: Höchsttempo etwas unter dem Kompakten', () => {
    expect(asphalt('jeep', 25)).toBeLessThan(asphalt('hatch', 25));
  });
});

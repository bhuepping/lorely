// Buggy: Visco-Kupplung, sonst natürliche Physik (schwache TC, keine Sonderregeln). Nutzerweg: im Matsch den Anstieg (Steigung 0,2) aus dem Stand fahren.
import { describe, it, expect } from 'vitest';
import { Vehicle, DT } from '../src/physics/vehicle';
import { CARS } from '../src/physics/params';
import { GridTerrain, MUD } from '../src/physics/terrain';

/** Matsch-Anstieg 0,2 ab z=0, Stand vor dem Hang, konstantes Gas; Weg, Radüberschuss (m/s am Reifen, Hinterräder) und Drehzahl */
function climb(id: string, gas: number, secs = 20) {
  const t = new GridTerrain(121, 2, (_x, z) => (z < 0 ? Math.min(-z, 16) * 0.2 : 0), () => MUD);
  const c = new Vehicle(CARS[id], t); c.allowSleep = false; c.reset(0, 3, 0);
  let slip = 0, n = 0, rpm = 0;
  for (let i = 0; i < secs / DT; i++) {
    c.step({ steer: 0, throttle: gas, brake: 0, handbrake: false }, DT);
    if (c.pos[2] < 0 && c.pos[2] > -8) { const wr = CARS[id].wheelRadius; slip += (c.omega[2] + c.omega[3]) / 2 * wr - c.forwardSpeed; rpm += c.rpm; n++; }
  }
  return { dist: 3 - c.pos[2], slip: n ? slip / n : 0, rpm: n ? rpm / n : 0 };
}

describe('Buggy im Matsch', () => {
  it('Vollgas am Anstieg: Räder drehen deutlich schneller als der Boden, Motor dreht hoch', () => {
    const r = climb('buggy', 1);
    console.log('buggy Vollgas', r);
    expect(r.slip, 'Radüberschuss m/s').toBeGreaterThan(1.5);
    expect(r.rpm, 'Drehzahl').toBeGreaterThan(2500);
  });
  it('Jeep mit Vollgas kommt am Matsch-Anstieg weiter als der Buggy', () => {
    expect(climb('jeep', 1).dist).toBeGreaterThan(climb('buggy', 1).dist);
  });
});

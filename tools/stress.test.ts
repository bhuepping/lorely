// Stresswerkzeug-Lauf (nur mit STRESS=1): alle Offroad-Level x alle Autos x Extremlagen, Bericht der Verstöße.
import { describe, it, expect } from 'vitest';
import { LEVELS, cases, fuzz, run, report } from './stress';
import { CARS } from '../src/physics/params';

describe.skipIf(!process.env.STRESS)('Stress', () => {
  for (const lv of (process.env.LV ?? LEVELS.join(',')).split(',')) for (const car of (process.env.CAR ?? Object.keys(CARS).join(',')).split(','))
    it(`${lv}/${car}`, () => {
      const rs = (process.env.FUZZ ? fuzz(lv, car, Number(process.env.FUZZ), Number(process.env.SEED ?? 1)) : cases(lv, car)).filter((s) => !process.env.CASE || s.name.includes(process.env.CASE)).map(run);
      const bad = report(rs).map((b) => lv + '/' + car + ' ' + b);
      if (process.env.VERBOSE) for (const r of rs) console.log(lv, car, r.name, JSON.stringify({ ...r, name: undefined }));
      expect(bad, bad.join('\n')).toEqual([]);
    }, 120000);
});

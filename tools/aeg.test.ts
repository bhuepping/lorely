// Messung: gute Route vs. Direktlinie im Hügel (AEG=1 npx vitest run tools/aeg.test.ts)
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { Route } from '../src/level';
import { driveBot } from './bot';
const W = WORLDS.find((w) => w.id === 'offroad')!;
it.skipIf(!process.env.AEG)('Hügel: Weg vs Direktlinie', () => {
  for (const lv of W.levels.filter((l) => !process.env.LV || process.env.LV.split(',').includes(l.id))) {
    const c0 = lv.make(), a = c0.route.at(0), b = c0.route.at(c0.route.length);
    const direct = new Route([[a.x, a.z], [b.x, b.z]]);
    const c = { ...c0, route: direct, length: direct.length, goal: { ...c0.goal!, s: direct.length } };
    const row: string[] = [];
    for (const [id, P] of Object.entries(CARS)) {
      const g = driveBot(c0, P, { maxSecs: 90 }), d = driveBot(c, P, { maxSecs: 90 });
      row.push(`${id}: weg ${g.finished ? g.time.toFixed(1) : 'DNF'} (air ${g.maxAir.toFixed(1)} fl${g.flips} st${g.stuck}) direkt ${d.finished ? d.time.toFixed(1) : 'DNF'} (air ${d.maxAir.toFixed(1)} fl${d.flips} st${d.stuck})`);
    }
    console.log(lv.id, '\n  ' + row.join('\n  '));
  }
}, 600_000);

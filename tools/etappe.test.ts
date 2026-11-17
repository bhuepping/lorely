// Kalibrierung einer einzelnen Etappen-JSON (noch nicht im Menü): ET=etappe_schnee npx vitest run tools/etappe.test.ts --reporter=verbose
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCourse, type LevelDef } from '../src/level';
import { CARS } from '../src/physics/params';
import { driveBot } from './bot';
it.skipIf(!process.env.ET)('Etappe kalibrieren', () => {
  const def = JSON.parse(readFileSync(`src/levels/${process.env.ET}.json`, 'utf8')) as LevelDef, c = buildCourse(def), row: string[] = [];
  for (const [id, P] of Object.entries(CARS)) { const r = driveBot(c, P); row.push(`${id} ${r.finished ? r.time.toFixed(1) : 'DNF@' + Math.round(r.s)}s ★${r.stars}/${c.stars.length} air${r.maxAir.toFixed(1)} hit${r.hits} flip${r.flips}`); }
  console.log(`${def.id} ${Math.round(c.length)} m, Budget ${c.timeBudget}: ${row.join(' | ')}`);
}, 600000);

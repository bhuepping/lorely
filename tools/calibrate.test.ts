// Zeitkonto-Kalibrierung: `CAL=levelId,… npx vitest run tools/calibrate.test.ts` – Bot fährt die Level mit allen Autos (ohne CAL übersprungen)
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { driveBot } from './bot';
const want = (process.env.CAL ?? "").split(",").filter((x) => x && x !== "all");
it.skipIf(!process.env.CAL)('kalibrieren', () => { for (const w of WORLDS) for (const lv of w.levels) {
  if (want.length && !want.includes(lv.id)) continue;
  const c = lv.make(); const row: string[] = [];
  for (const [id, P] of Object.entries(CARS)) { const r = driveBot(c, P); row.push(`${id} ${r.finished ? r.time.toFixed(1) : 'DNF@' + Math.round(r.s)}s ★${r.stars}/${c.stars.length} air${r.maxAir.toFixed(1)} hit${r.hits} flip${r.flips}`); }
  console.log(`${lv.id.padEnd(14)} ${Math.round(c.length)} m, Budget ${c.timeBudget}: ${row.join(' | ')}`);
}
}, 1_800_000);

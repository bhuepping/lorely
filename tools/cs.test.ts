// Werkzeug: Querschnitt (Höhe bei lat −12…12) und Höhenprofil längs des Wegs – CS=367,424 LV=huegel [S0= DS=] npx vitest run tools/cs.test.ts --reporter=verbose (Zeilen `CS`, `PROF`)
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
it.skipIf(!process.env.CS)('cs', () => {
  const c = WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === process.env.LV)!.make();
  for (const s of process.env.CS!.split(',').map(Number)) {
    const row: string[] = [];
    for (const lat of [-12, -9, -6, -4, -2, 0, 2, 4, 6, 9, 12]) { const [x, z] = c.route.offset(s, lat); row.push(c.terrain.height(x, z).toFixed(1)); }
    const a = c.route.at(s); console.log(`CS s${s} (${a.x.toFixed(0)},${a.z.toFixed(0)}) lat-12..12: ${row.join(' ')}`);
  }
  const p: string[] = []; for (let s = +(process.env.S0 ?? 0); s < c.length; s += +(process.env.DS ?? 20)) { const a = c.route.at(s); p.push(`${s}:${c.terrain.height(a.x, a.z).toFixed(1)}`); } console.log('PROF ' + p.join(' '));
});

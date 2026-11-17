// Werkzeug: liegt jeder Stern an einer schweren Stelle (wie tests/offroad.test.ts)? ST=huegel,furtwald npx vitest run tools/stars.test.ts --reporter=verbose (Zeilen `ST`)
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
it.skipIf(!process.env.ST)('st', () => {
  for (const id of process.env.ST!.split(',')) {
    const c = WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === id)!.make(), T = c.terrain;
    c.stars.forEach(([x, z], i) => {
      const sf = T.surface(x, z).name, y = T.height(x, z); let ring = 0, slope = 0;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, dx = Math.cos(a), dz = Math.sin(a); ring += T.height(x + 8 * dx, z + 8 * dz) / 8; slope = Math.max(slope, Math.abs(T.height(x + 2 * dx, z + 2 * dz) - y) / 2); }
      const hard = sf === 'Matsch' || sf === 'Furt' || slope >= 0.18 || Math.abs(y - ring) >= 0.7;
      console.log(`ST ${id} #${i} (${x.toFixed(0)},${z.toFixed(0)}) s${c.route.nearest(x, z).s.toFixed(0)} ${sf} slope ${slope.toFixed(2)} dring ${(y - ring).toFixed(2)} ${hard ? 'ok' : 'WEICH'}`);
    });
  }
});

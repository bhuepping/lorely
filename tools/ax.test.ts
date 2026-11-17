// Werkzeug: Bot-Zeit je Auto auf dem guten Weg und jedem Ast aller Offroad-Level – AX=1 [LV=steilhang,…] [MAXS=600] [CAR=jeep,…] npx vitest run tools/ax.test.ts
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { viaBranch } from '../src/levels/offroad';
import { driveBot } from './bot';

it.skipIf(!process.env.AX)('Offroad je Auto', () => {
  for (const lv of WORLDS.find((w) => w.id === 'offroad')!.levels) {
    if (process.env.LV && !process.env.LV.split(',').includes(lv.id)) continue;
    const c = lv.make(), maxSecs = Number(process.env.MAXS ?? 600);
    const rows: [string, typeof c][] = [['Weg', c], ...(c.branches ?? []).map((_, i) => [`Ast${i + 1}`, viaBranch(c, i)] as [string, typeof c])];
    for (const [name, cc] of rows) {
      const out = Object.entries(CARS).filter(([id]) => !process.env.CAR || process.env.CAR.split(',').includes(id)).map(([id, P]) => { const r = driveBot(cc, P, { maxSecs }); return `${id} ${r.finished ? r.time.toFixed(1) : 'DNF@' + Math.round(r.s)}${r.stuck ? ` (h${r.stuck})` : ''}`; });
      console.log(`AX ${lv.id} ${name}: ${out.join(' | ')}`);
    }
  }
});

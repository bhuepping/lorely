// Werkzeug: wo bleibt der Bot je Auto auf dem Weg / jedem Ast hängen? HANG=1 [LV=moorwald] [CAR=…] [MAXS=200] npx vitest run tools/hang.test.ts
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { viaBranch } from '../src/levels/offroad';
import { driveBot, fromS } from './bot';

it.skipIf(!process.env.HANG)('Hänger je Auto', () => {
  for (const lv of WORLDS.find((w) => w.id === 'offroad')!.levels) {
    if (process.env.LV && !process.env.LV.split(',').includes(lv.id)) continue;
    const c0 = lv.make(), c = c0, maxSecs = Number(process.env.MAXS ?? 200);
    const F = Number(process.env.FROM ?? 0), cut = (k: typeof c) => (F ? fromS(k, F) : k);
    const rows: [string, typeof c][] = [['Weg', cut(c)], ...(c.branches ?? []).map((_, i) => [`Ast${i + 1}`, cut(viaBranch(c, i))] as [string, typeof c])];
    for (const [name, cc] of rows) for (const [id, P] of Object.entries(CARS)) {
      if (process.env.CAR && !process.env.CAR.split(',').includes(id)) continue;
      let slow = 0; const ev: string[] = [];
      const r = driveBot(cc, P, { maxSecs, onStep: (car, s) => {
        slow = Math.abs(car.forwardSpeed) < 0.4 ? slow + 1 / 120 : 0;
        if (slow > 3 && ev.length < 3 && !ev.some((e) => Math.abs(Number(e.split(' ')[0].slice(1)) - s) < 15)) {
          const x = car.pos[0], z = car.pos[2], sf = cc.terrain.surface(x, z);
          let near = 'frei', bd = 99; for (const q of cc.obstacles.circles) { const d = Math.hypot(q.x - x, q.z - z) - q.r; if (d < bd) { bd = d; near = `Kreis r${q.r.toFixed(1)} ${d.toFixed(1)} m`; } }
          ev.push(`s${s.toFixed(0)} ${sf.name ?? ''} mu${sf.mu.toFixed(2)} ${near} (${x.toFixed(0)},${z.toFixed(0)}) quer ${((cc.terrain.height(x + 3, z) - cc.terrain.height(x - 3, z)) / 6).toFixed(2)}`);
        }
      } });
      console.log(`HANG ${lv.id} ${name} ${id}: ${r.finished ? 'ok ' + r.time.toFixed(0) + 's' : 'DNF@' + Math.round(r.s)} L${Math.round(cc.length)} | ${ev.join(' | ')}`);
    }
  }
});

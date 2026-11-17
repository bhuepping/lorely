// Werkzeug: wo schlägt der Jeep-Bot an Hindernisse? Treffer je 10 m Strecke – TH=1 LV=furtwald [CAR=jeep] npx vitest run tools/hits.test.ts --reporter=verbose (Zeile `res`)
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { driveBot } from './bot';
import { Obstacles } from '../src/physics/obstacles';
it.skipIf(!process.env.TH)('hits', () => {
  const c = WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === process.env.LV)!.make();
  const car = CARS[(process.env.CAR ?? 'jeep') as keyof typeof CARS];
  const bins: Record<string, number> = {};
  const orig = (Obstacles.prototype as any).step;
  (Obstacles.prototype as any).step = function (v: any) {
    if (!this.__w) { this.__w = 1; const o = this.onImpact; this.onImpact = (k: number) => { const s = c.route.nearest(v.pos[0], v.pos[2]).s; const key = `${Math.round(s / 10) * 10}`; bins[key] = (bins[key] ?? 0) + 1; o(k); }; }
    return orig.call(this, v);
  };
  const r = driveBot(c, car, { maxSecs: 200 });
  console.log('res', r.time.toFixed(1), r.hits, JSON.stringify(bins));
});

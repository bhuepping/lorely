// Werkzeug: Jeep-Bot fährt den guten Weg und jeden Ast eines Levels mit Gabelungen (Zeit, Hänger, Kipper, Sterne) – FORKS=1 LV=steilhang [LOOK=5] npx vitest run tools/forks.test.ts
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { viaBranch } from '../src/levels/offroad';
import { driveBot } from './bot';

it.skipIf(!process.env.FORKS)('Äste fahren', () => {
  for (const lv of WORLDS.find((w) => w.id === 'offroad')!.levels) {
    if (process.env.LV && !process.env.LV.split(',').includes(lv.id)) continue;
    const c = lv.make(), o = { maxSecs: 300, look: process.env.LOOK ? Number(process.env.LOOK) : undefined, aLat: process.env.ALAT ? Number(process.env.ALAT) : undefined };
    const row = (name: string, cc: typeof c) => { let lastW = -9; const r = driveBot(cc, CARS.jeep, { ...o, onStep: (car, sp, t) => { const u = car.axes().u[1]; if ((u < 0.55 || (t > 10 && Math.abs(car.forwardSpeed) < 0.3)) && t - lastW > 3) { lastW = t; console.log(`   ${name} t${t.toFixed(0)} s${sp.toFixed(0)} (${car.pos[0].toFixed(0)},${car.pos[2].toFixed(0)}) u${u.toFixed(2)} v${car.forwardSpeed.toFixed(1)}`); } } }); console.log(`${lv.id} ${name}: ${r.finished ? r.time.toFixed(1) + ' s' : 'DNF@' + Math.round(r.s)} (${cc.length.toFixed(0)} m) stuck ${r.stuck} flips ${r.flips} hits ${r.hits} Sterne ${r.stars}/${cc.stars.length}`); };
    row('Weg', c);
    (c.branches ?? []).forEach((_, i) => row(`Ast${i + 1}`, viaBranch(c, i)));
  }
});

// Werkzeug: wie bewegt ist das Gelände eines Offroad-Levels? Höhenspanne, Steigungen und Höhenmeter entlang des guten Wegs, dazu Bot je Auto.
// RELIEF=1 [LV=huegel,…] [BOT=1] npx vitest run tools/relief.test.ts
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { driveBot } from './bot';

const LV = process.env.LV?.split(',');
it.skipIf(!process.env.RELIEF)('Relief Offroad', () => {
  for (const lv of WORLDS.find((w) => w.id === 'offroad')!.levels) {
    if (LV && !LV.includes(lv.id)) continue;
    const c = lv.make(), r = c.route, T = c.terrain;
    let qn = 0, lo = 1e9, hi = -1e9, climb = 0, prev = T.height(r.at(0).x, r.at(0).z), steep = 0, n = 0, maxS = 0, lat = 0;
    for (let s = 1; s <= r.length; s += 1) {
      const a = r.at(s), y = T.height(a.x, a.z), g = Math.abs(y - prev);
      lo = Math.min(lo, y); hi = Math.max(hi, y); climb += Math.max(0, y - prev); if (g > 0.25) steep++; maxS = Math.max(maxS, g); n++; prev = y;
      const [lx, lz] = r.offset(s, 3), [rx, rz] = r.offset(s, -3); const q = Math.abs(T.height(lx, lz) - T.height(rx, rz)) / 6; lat = Math.max(lat, q); if (q > 0.3) qn++;   // quer > 30 % (≈ 17°)
    }
    // ganzes Feld: Spanne
    let flo = 1e9, fhi = -1e9; const h = T.half - 12;
    for (let x = -h; x <= h; x += 4) for (let z = -h; z <= h; z += 4) { const y = T.height(x, z); flo = Math.min(flo, y); fhi = Math.max(fhi, y); }
    console.log(`${lv.id}: Weg ${r.length.toFixed(0)} m, Spanne ${(hi - lo).toFixed(1)} m (Feld ${(fhi - flo).toFixed(1)}), ↑ ${climb.toFixed(0)} hm, steil(>25 %) ${(100 * steep / n).toFixed(0)} %, max ${(maxS * 100).toFixed(0)} %, quer max ${(lat * 100).toFixed(0)} %, quer>30 % auf ${(100 * qn / n).toFixed(0)} % des Wegs`);
    if (process.env.BOT) for (const [id, P] of Object.entries(CARS)) { const b = driveBot(c, P, { maxSecs: 90 }); console.log(`  ${id}: ${b.finished ? b.time.toFixed(1) + ' s' : 'DNF@' + Math.round(b.s)} stuck ${b.stuck} flips ${b.flips}`); }
  }
});

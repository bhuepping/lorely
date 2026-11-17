// Werkzeug: Längsprofil eines Offroad-Levels entlang des guten Wegs und aller Äste: Höhe, Steigung (Weg), Querneigung (±3 m), Belag je 20 m, dazu Gesamtwerte.
// PROFILE=1 LV=steilhang [STEP=20] npx vitest run tools/profile.test.ts
import { it } from 'vitest';
import { WORLDS } from '../src/levels';

it.skipIf(!process.env.PROFILE)('Profil Offroad', () => {
  const step = Number(process.env.STEP ?? 20);
  for (const lv of WORLDS.find((w) => w.id === 'offroad')!.levels) {
    if (process.env.LV && !process.env.LV.split(',').includes(lv.id)) continue;
    const c = lv.make(), T = c.terrain, paths = [{ name: 'Weg', r: c.route }, ...(c.branches ?? []).map((b, i) => ({ name: `Ast${i + 1} (${b.a.toFixed(0)}–${b.b.toFixed(0)})`, r: b.route }))];
    for (const { name, r } of paths) {
      console.log(`${lv.id} ${name}: ${r.length.toFixed(0)} m`);
      const rows: string[] = []; let maxG = 0, maxQ = 0, steep = 0, n = 0, climb = 0, py = T.height(r.at(0).x, r.at(0).z);
      for (let s = 0; s <= r.length; s += 1) {
        const a = r.at(s), b = r.at(Math.min(r.length, s + 2)), y = T.height(a.x, a.z), g = Math.hypot(b.x - a.x, b.z - a.z) > 0.5 ? (T.height(b.x, b.z) - y) / Math.hypot(b.x - a.x, b.z - a.z) : 0;
        const [lx, lz] = r.offset(s, 2.5), [rx, rz] = r.offset(s, -2.5), q = (T.height(lx, lz) - T.height(rx, rz)) / 5;
        maxG = Math.max(maxG, Math.abs(g)); maxQ = Math.max(maxQ, Math.abs(q)); if (Math.abs(g) > 0.25) steep++; n++; climb += Math.max(0, y - py); py = y;
        if (s % step === 0) rows.push(`  s${String(s).padStart(4)} (${a.x.toFixed(0)},${a.z.toFixed(0)}) y${y.toFixed(1).padStart(6)} Steig ${(g * 100).toFixed(0).padStart(4)}% quer ${(q * 100).toFixed(0).padStart(4)}% ${T.surface(a.x, a.z).name}`);
      }
      if (process.env.ROWS !== '0') console.log(rows.join('\n'));
      console.log(`  max Steigung ${(maxG * 100).toFixed(0)} %, max quer ${(maxQ * 100).toFixed(0)} %, steil>25 % ${(100 * steep / n).toFixed(0)} %, ↑ ${climb.toFixed(0)} hm`);
    }
  }
});

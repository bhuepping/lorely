import { it } from 'vitest';
import { WORLDS } from '../src/levels';
import { shortestPath } from './detour';
it.skipIf(!process.env.LEAK)('Leck', () => {
  const c = WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === (process.env.LV ?? 'steilhang'))!.make();
  const p = shortestPath(c, { slope: Number(process.env.SLOPE ?? 0.5), mud: true });
  console.log('len', p.len.toFixed(0), 'main', c.length.toFixed(0));
  const all = [c.route, ...(c.branches ?? []).map((b) => b.route)];
  let acc = 0, last = p.path[0], out = '';
  for (const q of p.path) { acc += Math.hypot(q[0] - last[0], q[1] - last[1]); last = q; const d = Math.min(...all.map((r) => r.nearest(q[0], q[1]).d)); if (d > 9) out += `  d${acc.toFixed(0)} (${q[0].toFixed(0)},${q[1].toFixed(0)}) abstand ${d.toFixed(1)}\n`; }
  console.log(out || 'alles im Korridor');
});

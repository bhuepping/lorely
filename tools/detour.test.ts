// Analyse: kürzester befahrbarer Weg je Offroad-Level (DUMP=ordner schreibt JSON für tools/detour_plot.py)
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { WORLDS } from '../src/levels';
import { shortestPath } from './detour';
it.skipIf(!process.env.DETOUR && !process.env.DUMP)('detour', () => {
  for (const lv of WORLDS.find((w) => w.id === 'offroad')!.levels) {
    const c = lv.make(), T = c.terrain as any, a = shortestPath(c), b = shortestPath(c, { mud: true });
    console.log(lv.id, 'route', c.length.toFixed(0), 'frei', a.len.toFixed(0), 'mit Matsch', b.len.toFixed(0));
    if (process.env.DUMP) {
      const n = 100, hs: number[][] = []; for (let j = 0; j < n; j++) { const r: number[] = []; for (let i = 0; i < n; i++) r.push(T.height(-T.half + (i + .5) * 2 * T.half / n, -T.half + (j + .5) * 2 * T.half / n)); hs.push(r); }
      const rt: number[][] = []; for (let s = 0; s <= c.length; s += 3) { const p = c.route.at(s); rt.push([p.x, p.z]); }
      writeFileSync(`${process.env.DUMP}/${lv.id}.json`, JSON.stringify({ half: T.half, h: hs, route: rt, path: a.path, pathMud: b.path, circles: c.obstacles.circles.map((q) => [q.x, q.z, q.r]), boxes: c.obstacles.boxes.map((q) => [q.x, q.z, q.hx, q.hz, q.yaw]), goal: [c.goal!.x, c.goal!.z], start: [c.start.x, c.start.z] }));
    }
  }
});

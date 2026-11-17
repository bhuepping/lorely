// Werkzeug: Strecke messen (LV=matschgrube|furtwald|huegel) – MG=1 [CARS=jeep,hatch] npx vitest run tools/mg.test.ts --reporter=verbose
// Je Auto: guter Weg (durch alle Gruben) und der Weg über alle Umwege; dazu Länge, Gabeln, Sterne.
import { it } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { viaBranches } from '../src/levels/offroad';
import { driveBot } from './bot';

it.skipIf(!process.env.MG)('Matschgrube messen', () => {
  const c = WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === (process.env.LV ?? 'matschgrube'))!.make();
  console.log(`MG Weg ${c.length.toFixed(0)} m, Sterne ${c.stars.length}, Gabeln ` + (c.branches ?? []).map((b) => `${b.a.toFixed(0)}-${b.b.toFixed(0)} (+${(b.route.length - (b.b - b.a)).toFixed(0)} m)`).join(' '));
  const all = (c.branches ?? []).map((_, i) => i), cars = (process.env.CARS ?? 'hatch,buggy,rally,jeep').split(',');
  const routes: [string, Course][] = [['Weg', c], ...(process.env.ONLYWEG || !c.branches ? [] : [['Umwege', viaBranches(c, all)] as [string, Course]]), ...(process.env.EACH ? all.map((i) => [`Ast${i + 1}`, viaBranches(c, [i])] as [string, Course]) : [])];
  for (const [name, k] of routes) for (const id of cars) {
    const r = driveBot(k, CARS[id as keyof typeof CARS], { maxSecs: 300 });
    console.log(`MG ${name.padEnd(6)} ${id.padEnd(6)} ${r.finished ? r.time.toFixed(1) + ' s' : 'DNF@' + Math.round(r.s)} (${k.length.toFixed(0)} m) stuck ${r.stuck} flips ${r.flips} Sterne ${r.stars}/${k.stars.length}`);
  }
}, 600_000);
type Course = import('../src/level').Course;

// Draufsicht-Daten für die Karte: MGDUMP=<datei.json>
import { writeFileSync } from 'node:fs';
it.skipIf(!process.env.MGDUMP)('Matschgrube ausgeben', () => {
  const c = WORLDS.find((w) => w.id === 'offroad')!.levels.find((l) => l.id === (process.env.LV ?? 'matschgrube'))!.make();
  const line = (r: Course['route']) => Array.from({ length: Math.floor(r.length / 3) + 1 }, (_, i) => { const p = r.at(i * 3); return [+p.x.toFixed(1), +p.z.toFixed(1)]; });
  const half = (c.terrain as any).half as number, mud: number[][] = [];
  for (let x = -half; x < half; x += 2) for (let z = -half; z < half; z += 2) if (c.terrain.surface(x, z).name === 'Matsch') mud.push([x, z]);
  writeFileSync(process.env.MGDUMP!, JSON.stringify({ route: line(c.route), branches: (c.branches ?? []).map((b) => line(b.route)), trees: c.trees.map((t) => [t.x, t.z]), rocks: c.rocks.map((t) => [t.x, t.z]), circles: c.obstacles.circles.map((q) => [q.x, q.z, q.r]), boxes: c.obstacles.boxes, stars: c.stars, mud, brook: line(c.brook!.route), half }));
});

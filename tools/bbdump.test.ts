// Prüfbericht: Streckengeometrie als JSON für tools/bbmap.py – BBDUMP=<datei.json> npx vitest run tools/bbdump.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { WORLDS } from '../src/levels';

it.skipIf(!process.env.BBDUMP)('Strecken ausgeben', () => {
  const out: Record<string, unknown> = {};
  for (const w of WORLDS) for (const lv of w.levels) {
    const c = lv.make(), pts: [number, number, number, string][] = [];
    for (let s = 0; s <= c.length; s += 4) { const p = c.route.at(s); pts.push([+p.x.toFixed(1), +p.z.toFixed(1), +c.terrain.height(p.x, p.z).toFixed(2), c.terrain.surface(p.x, p.z).name]); }
    out[lv.id] = {
      world: w.id, name: lv.name, length: c.length, width: c.roadWidth, pts, stars: c.stars, start: c.start, goal: c.goal,
      jumps: c.jumps.map((j) => ({ s: j.s, ...(() => { const p = c.route.at(j.s); return { x: p.x, z: p.z }; })() })),
      fords: c.fords.map((f) => ({ s0: f.s0, s1: f.s1 })), tunnels: c.tunnels.map((t) => ({ s0: t.s0, s1: t.s1 })), bridges: c.bridgeSpans,
      branches: (c.branches ?? []).map((b) => ({ a: b.a, b: b.b, len: b.route.length, pts: Array.from({ length: Math.floor(b.route.length / 4) + 1 }, (_, i) => { const p = b.route.at(i * 4); return [+p.x.toFixed(1), +p.z.toFixed(1)]; }) })),
      jeepLine: c.jeepLine ?? null, free: !!(c as any).free,
    };
  }
  writeFileSync(process.env.BBDUMP!, JSON.stringify(out));
}, 300_000);

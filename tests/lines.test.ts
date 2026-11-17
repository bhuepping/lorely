// Ideallinie: Sterne liegen auf der Minimal-Krümmungs-Linie, nie neben der Fahrbahn, bei Gegenverkehr nur auf der eigenen Spur, nicht auf Stegen;
// der Bot fährt die Linie und sammelt ALLE Sterne. Die JSONs müssen zur Berechnung passen (Generatoren: danach `LINES=1 WRITE=1 npx vitest run tools/lines.test.ts`).
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { courseLine, HAND } from '../src/ideal';
import { driveBot } from '../tools/bot';
import { pick } from './slow';

const ROAD = WORLDS.flatMap((w) => w.levels).filter((l) => !['matschgrube', 'huegel', 'furtwald', 'steilhang', 'moorwald'].includes(l.id));
const halfAt = (c: ReturnType<typeof ROAD[0]['make']>, s: number) => { if (!c.net) return c.roadWidth / 2; const p = c.route.at(s), h = c.net.nearest(p.x, p.z); return (h ? h.edge.def.w : c.roadWidth) / 2; };

describe('Sterne auf der Ideallinie', () => {
  for (const lv of ROAD) it(`${lv.id}: auf der Fahrbahn, eigene Spur, nicht auf Stegen, passend zur Berechnung`, () => {
    const c = lv.make(), hand = HAND[lv.id];
    const fixed = c.stars.map(([x, z]) => c.route.nearest(x, z)).filter((h) => hand && h.s >= hand[0] && h.s <= hand[1]).map((h) => [h.s, h.lat] as [number, number]);
    const line = courseLine(c, fixed), oncoming = c.net !== null || (c.traffic?.oncoming ?? 0) > 0;
    expect(c.stars.length).toBeGreaterThanOrEqual(10);
    for (const [x, z] of c.stars) {
      const h = c.route.nearest(x, z), half = halfAt(c, h.s);
      expect(Math.abs(h.lat), `${lv.id} s${h.s | 0}`).toBeLessThanOrEqual(half - 0.9);          // auf der Fahrbahn
      expect(c.net !== null && c.bridgeSpans.some(([a, b]) => h.s > a - 2 && h.s < b + 2), `Steg s${h.s | 0}`).toBe(false);
      const inHand = hand && h.s >= hand[0] && h.s <= hand[1];
      if (oncoming && !inHand) expect(h.lat, `${lv.id} s${h.s | 0} Gegenspur`).toBeLessThanOrEqual(-0.5);   // links der Mitte fährt der Gegenverkehr
      if (!inHand) expect(Math.abs(h.lat - line(h.s)), `${lv.id} s${h.s | 0} Linie`).toBeLessThan(0.2);
    }
  });
});

describe('Bot auf der Ideallinie', () => {
  for (const lv of pick(ROAD, ['waldweg', 'kehrenhang', 'neonallee', 'etappe_vorstadt', 'loreley'])) it(`${lv.id}: sammelt (fast) alle Sterne (Kompakter und Buggy)`, () => {
    const c = lv.make(), hand = HAND[lv.id];
    const fixed = c.stars.map(([x, z]) => c.route.nearest(x, z)).filter((h) => hand && h.s >= hand[0] && h.s <= hand[1]).map((h) => [h.s, h.lat] as [number, number]);
    const line = courseLine(c, fixed);
    for (const id of ['hatch', 'buggy']) {
      const r = driveBot(c, CARS[id], { line, maxSecs: 400 });
      expect(r.finished, `${lv.id} ${id}`).toBe(true);
      expect(r.stars, `${lv.id} ${id}`).toBeGreaterThanOrEqual(c.stars.length - 2);   // der Bot verfehlt auf Eis/Sand/engen Stellen höchstens zwei
    }
  });
});

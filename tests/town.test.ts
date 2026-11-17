import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { FLOOR_H } from '../src/town';

const c = WORLDS.flatMap((w) => w.levels).find((l) => l.id === 'koelner_ufer')!.make();
describe('Kölner Ufer: Altstadt', () => {
  it('Häuser, Kirchen, Kranhäuser; Grundrisse sind feste Hindernisse', () => {
    const k = (kind: string) => c.town.filter((h) => h.kind === kind).length;
    expect(c.town.length).toBeGreaterThan(120); expect(k('kirche')).toBeGreaterThanOrEqual(2); expect(k('kran')).toBeGreaterThanOrEqual(1);
    for (const h of c.town) expect(c.obstacles.boxes.some((b) => b.x === h.x && b.z === h.z)).toBe(true);
  });
  it('Altstadt zweistöckig, ca. jedes 5. Haus dreistöckig', () => {
    const hs = c.town.filter((h) => h.kind === 'giebel' || h.kind === 'traufe'), fl = hs.map((h) => Math.round(h.h / FLOOR_H * 1e6) / 1e6);
    expect(fl.every((f) => f === 2 || f === 3)).toBe(true);
    const three = fl.filter((f) => f === 3).length / fl.length; expect(three).toBeGreaterThan(0.1); expect(three).toBeLessThan(0.32);
    expect(Math.max(...hs.map((h) => h.h))).toBeLessThan(11);   // Dom 150 m: überragt alles
  });
  it('nichts auf der Straße, im Wasser oder im Dom; keine Bäume in Häusern', () => {
    for (const h of c.town) {
      const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
      for (const [lx, lz] of [[0, 0], [-h.hx, -h.hz], [h.hx, -h.hz], [h.hx, h.hz], [-h.hx, h.hz]]) {
        const x = h.x + cs * lx + sn * lz, z = h.z - sn * lx + cs * lz;
        expect(c.route.nearestWithin(x, z, c.roadWidth / 2 + 1), `Haus ${h.x.toFixed(0)},${h.z.toFixed(0)} auf Straße`).toBeNull();
        expect(c.waterAt(x, z), 'Haus im Wasser').toBeLessThan(-1e8);
      }
      for (const t of c.trees) expect(Math.abs(cs * (t.x - h.x) - sn * (t.z - h.z)) < h.hx && Math.abs(sn * (t.x - h.x) + cs * (t.z - h.z)) < h.hz, 'Baum im Haus').toBe(false);
    }
  });
  it('Fluss tief: Brücke mindestens 5 m über dem Wasser', () => {
    expect(c.bridge!.deckY((c.bridge!.s0 + c.bridge!.s1) / 2) - c.river!.level).toBeGreaterThan(5);
  });
});

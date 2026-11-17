// Steilhang: Gabelungen (guter Weg = riskante Linie, Äste = lange sichere Linien), geschlossene Sperren zwischen den Ästen, Jeep fährt jeden Ast,
// Kran setzt auf den nächsten Ast, Relief deutlich über dem Hügel.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { viaBranch } from '../src/levels/offroad';
import type { Course } from '../src/level';
import { driveBot } from '../tools/bot';
import { shortestPath } from '../tools/detour';

const W = WORLDS.find((w) => w.id === 'offroad')!;
const c = W.levels.find((l) => l.id === 'steilhang')!.make();
const br = c.branches!;

describe('Steilhang: Gabelungen', () => {
  it('3 Gabeln in Folge; jeder Ast beginnt und endet auf dem guten Weg und ist länger als sein Stück davon', () => {
    expect(br.length).toBe(3);
    br.forEach((b, i) => {
      const a = c.route.at(b.a), e = c.route.at(b.b), p0 = b.route.at(0), p1 = b.route.at(b.route.length);
      expect(Math.hypot(a.x - p0.x, a.z - p0.z), `Ast ${i + 1} Gabel`).toBeLessThan(1.5); expect(Math.hypot(e.x - p1.x, e.z - p1.z), `Ast ${i + 1} Mündung`).toBeLessThan(1.5);
      expect(b.route.length, `Ast ${i + 1} länger`).toBeGreaterThan((b.b - b.a) * 1.3);
      if (i) expect(b.a).toBeGreaterThan(br[i - 1].b - 1);
    });
    expect(c.length).toBeGreaterThan(900);
  });

  it('keine Abkürzung zwischen den Ästen: von der Mitte des guten Wegs zur Mitte des Asts geht es nur über Gabel oder Mündung', () => {
    br.forEach((b, i) => {
      const sm = (b.a + b.b) / 2, bm = b.route.length / 2, A = c.route.at(sm), B = b.route.at(bm);
      const viaJunction = Math.min(sm - b.a + bm, b.b - sm + b.route.length - bm);
      const p = shortestPath({ ...c, start: { x: A.x, z: A.z, yaw: 0 }, goal: { ...c.goal!, x: B.x, z: B.z } } as Course, { slope: 9, mud: true, goalR: 3 });
      expect(p.len, `Ast ${i + 1}: Weg ${p.len.toFixed(0)} m, über die Gabel ${viaJunction.toFixed(0)} m`).toBeGreaterThan(viaJunction * 0.7);
    });
  });

  it('Jeep-Bot fährt den guten Weg und jeden Ast bis ins Ziel ohne Kippen; der gute Weg ist je Gabel schneller als der Ast', () => {
    const main = driveBot(c, CARS.jeep, { maxSecs: 220 });
    expect(main.finished && main.flips === 0, `guter Weg ${main.time.toFixed(1)} s flips ${main.flips}`).toBe(true);
    br.forEach((_, i) => {
      const r = driveBot(viaBranch(c, i), CARS.jeep, { maxSecs: 260 });
      expect(r.finished && r.flips === 0, `Ast ${i + 1}: ${r.finished ? r.time.toFixed(1) + ' s' : 'DNF@' + r.s.toFixed(0)} flips ${r.flips}`).toBe(true);
      expect(r.time, `Ast ${i + 1} ${r.time.toFixed(1)} s, guter Weg ${main.time.toFixed(1)} s`).toBeGreaterThan(main.time + 4);
    });
  });

  it('Kran: ein Auto auf einem Ast wird auf den Ast zurückgestellt, nicht auf den guten Weg', () => {
    const b = br[0], p = b.route.at(b.route.length * 0.45), r = c.recoverAt!(p.x, p.z);
    expect(b.route.nearest(r.x, r.z).d).toBeLessThan(1); expect(c.route.nearest(r.x, r.z).d).toBeGreaterThan(8);
    const q = c.route.at(c.route.length * 0.2), r2 = c.recoverAt!(q.x, q.z); expect(c.route.nearest(r2.x, r2.z).d).toBeLessThan(1);
  });
});

/** Gelände-Kennzahlen entlang des guten Wegs: Höhenspanne, Höhenmeter, Anteil Querneigung > 30 % (±3 m) */
const relief = (k: Course) => {
  const T = k.terrain, r = k.route; let lo = 1e9, hi = -1e9, climb = 0, q = 0, n = 0, py = T.height(r.at(0).x, r.at(0).z);
  for (let s = 1; s <= r.length; s++) {
    const a = r.at(s), y = T.height(a.x, a.z), [lx, lz] = r.offset(s, 3), [rx, rz] = r.offset(s, -3);
    lo = Math.min(lo, y); hi = Math.max(hi, y); climb += Math.max(0, y - py); py = y; n++; if (Math.abs(T.height(lx, lz) - T.height(rx, rz)) / 6 > 0.3) q++;
  }
  return { span: hi - lo, climb, quer: q / n };
};
describe('Steilhang: Relief', () => {
  it('Spanne, Höhenmeter und Hangquerung deutlich über dem Hügel', () => {
    const h = W.levels.find((l) => l.id === 'huegel')!.make(), a = relief(c), b = relief(h);
    expect(a.span).toBeGreaterThan(b.span * 5); expect(a.climb).toBeGreaterThan(b.climb * 2);
    expect(a.quer).toBeGreaterThan(0.07); expect(a.quer).toBeGreaterThan(b.quer * 3);
  });
  it('12–15 Sterne', () => { expect(c.stars.length).toBeGreaterThanOrEqual(12); expect(c.stars.length).toBeLessThanOrEqual(15); });
});

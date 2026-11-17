// Moorwald: Gabelungen (guter Weg = riskante Linie, Äste = lange sichere Linien), geschlossene Sperren zwischen den Ästen, Jeep fährt jeden Ast,
// Kran setzt auf den nächsten Ast, Relief deutlich über dem Furtwald. Sterne auf der Jeep-Linie: tests/offroad.test.ts.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { viaBranch } from '../src/levels/offroad';
import type { Course } from '../src/level';
import { driveBot, fromS } from '../tools/bot';
import { shortestPath } from '../tools/detour';

const W = WORLDS.find((w) => w.id === 'offroad')!;
const c = W.levels.find((l) => l.id === 'moorwald')!.make();
const br = c.branches!;

describe('Moorwald: Gabelungen', () => {
  it('3 Gabeln in Folge; jeder Ast beginnt und endet auf dem guten Weg und ist länger als sein Stück davon', () => {
    expect(br.length).toBe(3);
    br.forEach((b, i) => {
      const a = c.route.at(b.a), e = c.route.at(b.b), p0 = b.route.at(0), p1 = b.route.at(b.route.length);
      expect(Math.hypot(a.x - p0.x, a.z - p0.z), `Ast ${i + 1} Gabel`).toBeLessThan(1.5); expect(Math.hypot(e.x - p1.x, e.z - p1.z), `Ast ${i + 1} Mündung`).toBeLessThan(1.5);
      expect(b.route.length, `Ast ${i + 1} länger`).toBeGreaterThan((b.b - b.a) * 1.3);
      if (i) expect(b.a).toBeGreaterThan(br[i - 1].b - 1);
    });
    expect(c.length).toBeGreaterThan(950);
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
    const main = driveBot(c, CARS.jeep, { maxSecs: 240 });
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
describe('Moorwald: Schwerstes zuerst', () => {
  const routes = [['Weg', c], ...br.map((_, i) => [`Ast ${i + 1}`, viaBranch(c, i)] as [string, Course])] as [string, Course][];
  const weak = ['hatch', 'buggy', 'rally'] as const;
  it('Kompakter scheitert an Gabel 1 (Weg und Ast 1), Buggy auf dem Weg, alle drei schwächeren Autos wenn überhaupt in den ersten 25 % des Wegs; der Jeep ist auf jedem Weg am schnellsten', () => {
    for (const [name, k] of routes) {
      const jeep = driveBot(k, CARS.jeep, { maxSecs: 200 });
      expect(jeep.finished, `${name} Jeep`).toBe(true);
      for (const id of weak) {
        const r = driveBot(k, CARS[id], { maxSecs: 200 });
        if (r.finished) expect(r.time, `${name} ${id} ${r.time.toFixed(0)} s, Jeep ${jeep.time.toFixed(0)} s`).toBeGreaterThan(jeep.time);
        else expect(r.s, `${name} ${id} hängt bei ${r.s.toFixed(0)} m von ${k.length.toFixed(0)}`).toBeLessThan(k.length * 0.25);
        if ((id === 'hatch' && (name === 'Weg' || name === 'Ast 1')) || (id === 'buggy' && name === 'Weg')) expect(r.finished, `${name} ${id} muss an Gabel 1 scheitern`).toBe(false);   // Buggy und Rallye kommen mit der schleifenden Kupplung auch den Ast 1 hoch (Buggy 173 s, Rallye 162 s, Jeep 107 s)
      }
    }
  }, 120_000);
  it('ab hinter Gabel 1 (Weg-Meter 250) schaffen alle Autos jeden Weg bis ins Ziel', () => {
    for (const [name, k] of routes) for (const id of weak) {
      const r = driveBot(fromS(k, 250), CARS[id], { maxSecs: 260 });
      expect(r.finished, `${name} ${id} ab 250 hängt bei ${r.s.toFixed(0)} m`).toBe(true);
    }
  }, 120_000);
});

describe('Moorwald: Relief', () => {
  it('Spanne und Höhenmeter deutlich über dem Furtwald', () => {
    const f = W.levels.find((l) => l.id === 'furtwald')!.make(), a = relief(c), b = relief(f);
    expect(a.span).toBeGreaterThan(b.span * 1.8); expect(a.climb).toBeGreaterThan(b.climb * 1.2);
  });
  it('12–15 Sterne; zwei Furten (Bach quert den guten Weg zweimal)', () => {
    expect(c.stars.length).toBeGreaterThanOrEqual(12); expect(c.stars.length).toBeLessThanOrEqual(15);
    let n = 0, wet = false;
    for (let s = 0; s <= c.length; s += 1) { const p = c.route.at(s), w = c.brook!.route.nearest(p.x, p.z).d < 3; if (w && !wet) n++; wet = w; }
    expect(n).toBe(2);
  });
});

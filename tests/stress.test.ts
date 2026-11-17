// Extremlagen auf echten Offroad-Leveln – keine NaN, keine Energiezunahme, kein Durchrutschen durch Boden/Hindernis, kein Zittern im Stand, Kran setzt sauber.
// Werkzeug und volle Läufe: tools/stress.ts (STRESS=1 node_modules/.bin/vitest run tools/stress.test.ts, FUZZ=40 SEED=n für Zufallsfälle).
import { describe, it, expect } from 'vitest';
import { cases, fuzz, run, report } from '../tools/stress';

const check = (rs: ReturnType<typeof run>[]) => { const bad = report(rs); expect(bad, bad.join('\n')).toEqual([]); };

describe('Stresslagen', () => {
  // Hang, Sturz aus 20/40 m, Baum/Sperre frontal, Dach, Wand, Furt, Kante – je ein Level pro Auto
  for (const [lv, car] of [['steilhang', 'jeep'], ['furtwald', 'buggy'], ['matschgrube', 'hatch'], ['moorwald', 'rally']])
    it(`${lv}/${car}: alle Standardlagen`, () => check(cases(lv, car).map(run)));
  // Zufallsfälle mit Saaten, die vor den Fixes Boden-/Baum-Durchdringung und Überschlag nach dem Kran zeigten
  it('Zufall steilhang/buggy (Seite am Hang, Dach in den Boden)', () => check(fuzz('steilhang', 'buggy', 25, 2).map(run)));
  it('Zufall huegel/rally (Überschlag am Baum, Grundriss auf der Seite)', () => check(fuzz('huegel', 'rally', 3, 3).map(run)));
  it('Zufall matschgrube/jeep (Aufprall in der Grube)', () => check(fuzz('matschgrube', 'jeep', 12, 4).map(run)));
});

// Jeder Anzeigetext (beide Sprachen) ist in der Pixelschrift darstellbar; Namen kurz; Umlaute/ß haben eigene Glyphen.
import { describe, it, expect } from 'vitest';
import { allTexts } from '../src/i18n';
import { F } from '../src/pixel';
import { WORLDS } from '../src/levels';
import { levelName, worldName, setLang } from '../src/i18n';

describe('i18n', () => {
  it('alle Texte haben Glyphen (auch Ä Ö Ü ß)', () => {
    const miss = new Set<string>();
    for (const txt of allTexts()) for (const ch of txt) { if (ch === ' ') continue; const u = ch === 'ß' ? ch : ch.toUpperCase(); if (!F[u]) miss.add(ch); }
    expect([...miss]).toEqual([]);
    for (const g of ['Ä', 'Ö', 'Ü', 'ß']) expect(F[g]).toBeTruthy();
  });
  it('jede Welt/Strecke hat in beiden Sprachen einen kurzen Namen (<= 12 Zeichen)', () => {
    for (const l of ['de', 'en'] as const) {
      setLang(l);
      for (const w of WORLDS) {
        expect(worldName(w.id, '?!'), w.id).not.toBe('?!');
        for (const lv of w.levels) { const n = levelName(lv.id, '?!'); expect(n, lv.id).not.toBe('?!'); expect(n.length, n).toBeLessThanOrEqual(12); }
      }
    }
    setLang('de');
  });
});

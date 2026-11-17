// Ideallinie → Sterne: `LINES=1 [WRITE=1] [LV=a,b] npx vitest run tools/lines.test.ts`
// Berechnet je Strecke die Minimal-Krümmungs-Linie (src/ideal.ts) und setzt die seitlichen Werte der Sterne darauf (s bleibt, Anzahl bleibt).
// Ohne WRITE nur Ausgabe. Nach JEDEM Lauf der Generatoren gen_*.py einmal mit WRITE=1 wiederholen (die Generatoren schreiben lat 0).
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { WORLDS } from '../src/levels';
import { courseLine, HAND } from '../src/ideal';


it.skipIf(!process.env.LINES)('Ideallinie → Sterne', () => {
  for (const w of WORLDS) for (const lv of w.levels) {
    if (lv.id === 'matschgrube' || lv.id === 'huegel' || lv.id === 'furtwald' || lv.id === 'steilhang' || lv.id === 'moorwald') continue;
    if (process.env.LV && !process.env.LV.split(',').includes(lv.id)) continue;
    const file = new URL(`../src/levels/${lv.id}.json`, import.meta.url);
    const def = JSON.parse(readFileSync(file, 'utf8')) as { objects: { stars: [number, number][] } };
    const c = lv.make(), hand = HAND[lv.id];
    const fixed = hand ? def.objects.stars.filter(([s]) => s >= hand[0] && s <= hand[1]) : [];
    const line = courseLine(c, fixed);
    const out = def.objects.stars.map(([s, lat]) => (fixed.some(([fs]) => fs === s) ? [s, lat] : [s, Math.round(line(s) * 10) / 10]) as [number, number]);
    console.log(lv.id.padEnd(16), out.map(([s, l]) => `${s | 0}:${l}`).join(' '));
    if (process.env.WRITE) {   // nur das Sterne-Feld ersetzen, Formatierung der JSON bleibt
      const txt = readFileSync(file, 'utf8'), m = /"stars":\s*(\[\s*\[[\s\S]*?\]\s*\])/.exec(txt);
      if (!m) throw new Error('stars? ' + lv.id);
      const sp = /\[\d+, /.test(m[1]) ? ' ' : '', fmt = '[' + out.map(([s, l]) => `[${s},${sp}${l}]`).join(',' + sp) + ']';
      writeFileSync(file, txt.replace(m[1], fmt));
    }
  }
}, 600_000);

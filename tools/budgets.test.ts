// Zeitkonten je Auto: `BUDGETS=1 [FACTOR=1.18] [WRITE=1] [LV=a,b] [OUT=/pfad.json] npx vitest run tools/budgets.test.ts`
// Bot fährt jede Zeitstrecke mit jedem Auto auf der IDEALLINIE (Sterne-Linie, src/ideal.ts; Offroad: der gute Weg), mit Verkehr wie im Spiel, ohne Sterne-Bonus.
// Budget = round(Bot × FACTOR) (Standard 1,18); nie lockerer als der bisherige Wert; Ausreißer-Bot (> 1,35 × schnellstes Auto) wird auf 1,35 × gedeckelt. Bot-DNF zählt als maxSecs (400 s) und wird markiert (dann Wert von Hand prüfen).
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { courseLine } from '../src/ideal';
import { viaBranches } from '../src/levels/offroad';
import { driveBot } from './bot';

export const FACTOR = 1.18, OUTLIER = 1.35;
export const budgetFrom = (bot: number, f = FACTOR) => Math.round(bot * f);

it.skipIf(!process.env.BUDGETS)('Zeitkonten je Auto', () => {
  const f = Number(process.env.FACTOR ?? FACTOR);
  const out: Record<string, Record<string, { bot: number; finished: boolean; budget: number; old: number }>> = {};
  for (const w of WORLDS) for (const lv of w.levels) {
    if (process.env.LV && !process.env.LV.split(',').includes(lv.id)) continue;   // nur diese Level (LV=a,b)
    const c = lv.make(), row: string[] = [], res: Record<string, { bot: number; finished: boolean; budget: number; old: number }> = {}, line = courseLine(c);
    // Matschgrube: der Jeep fährt den guten Weg durch die Gruben, die anderen über die Umwege
    const detours = lv.id === 'matschgrube' ? viaBranches(c, c.branches!.map((_, i) => i)) : c;
    const runs = Object.entries(CARS).map(([cid, P]) => [cid, driveBot(lv.id === 'matschgrube' && cid !== 'jeep' ? detours : c, P, { traffic: true, line })] as const);
    const best = Math.min(...runs.map(([, r]) => (r.finished ? r.time : 400)));
    for (const [cid, r] of runs) {
      const bot = r.finished ? r.time : 400, eff = Math.min(bot, OUTLIER * best), old = c.timeBudgets?.[cid] ?? c.timeBudget, budget = c.free ? budgetFrom(eff, f) : Math.min(budgetFrom(eff, f), old);   // nie lockerer als bisher (Offroad: alte Werte waren grob)
      res[cid] = { bot: Math.round(bot * 10) / 10, finished: r.finished, budget, old };
      row.push(`${cid} ${r.finished ? bot.toFixed(1) : 'DNF@' + Math.round(r.s)}s ${old}->${budget}${eff < bot ? ' (gedeckelt)' : ''}`);
    }
    out[lv.id] = res;
    console.log(`${lv.id.padEnd(16)} ${row.join(' | ')}`);
  }
  if (process.env.WRITE) {   // src/levels/budgets.json (Quelle für Generatoren + Offroad) und das time.budget-Feld der Level-JSONs
    const file = new URL('../src/levels/budgets.json', import.meta.url);
    const all = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, number>>;
    for (const [id, r] of Object.entries(out)) {
      all[id] = Object.fromEntries(Object.entries(r).map(([cid, x]) => [cid, x.budget]));
      if (['matschgrube', 'huegel', 'furtwald', 'steilhang', 'moorwald'].includes(id)) continue;
      const jf = new URL(`../src/levels/${id}.json`, import.meta.url), txt = readFileSync(jf, 'utf8'), re = /("time"\s*:\s*\{\s*"budget"\s*:\s*)\{[^}]*\}/;
      if (!re.test(txt)) throw new Error('time.budget? ' + id);
      writeFileSync(jf, txt.replace(re, `$1${JSON.stringify(all[id]).replace(/:/g, ': ').replace(/,/g, ', ')}`));
    }
    writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
  }
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
}, 3_600_000);

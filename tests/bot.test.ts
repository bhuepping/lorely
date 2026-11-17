import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { driveBot } from '../tools/bot';
import { timeBudgetFor } from '../src/level';

describe('Bot (Ideallinie)', () => {
  it('fährt Waldweg und Loreley mit allen Autos ins Ziel, ohne Überschlag, im Zeitkonto', () => {
    for (const id of ['waldweg', 'loreley']) {
      const lv = WORLDS.flatMap((w) => w.levels).find((l) => l.id === id)!, c = lv.make();
      for (const [cid, P] of Object.entries(CARS)) {
        const r = driveBot(c, P);
        expect(r.finished, `${id} ${cid} @${Math.round(r.s)}`).toBe(true);
        expect(r.flips, `${id} ${cid}`).toBe(0);
        expect(r.time, `${id} ${cid}`).toBeLessThan(timeBudgetFor(c, cid));
      }
    }
  }, 120000);
});

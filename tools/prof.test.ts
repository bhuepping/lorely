// CPU-Profil des Level-Aufbaus: PROF=<datei.cpuprofile> LV=welt npx vitest run tools/prof.test.ts
import { it } from 'vitest';
import inspector from 'node:inspector';
import { writeFileSync } from 'node:fs';
import { WORLDS } from '../src/levels';
it.skipIf(!process.env.PROF)('prof', async () => {
  const lv = WORLDS.find((w) => w.id === (process.env.LV ?? 'vorstadt'))!.levels[0]; lv.make();
  const s = new inspector.Session(); s.connect();
  await new Promise<void>((r) => s.post('Profiler.enable', () => s.post('Profiler.start', () => r())));
  for (let r = 0; r < 3; r++) lv.make();
  await new Promise<void>((r) => s.post('Profiler.stop', (_e, { profile }) => { writeFileSync(process.env.PROF!, JSON.stringify(profile)); r(); }));
}, 60000);

// Partikel-Screenshots + Messung: SC=<ordner> [DIST=<build>] [SCEN=tag1,tag2] node tools/fxshots.mjs (vorher vite build; DIST=<ordner> für andere Ausgabe)
// Szene = [tag, welt, level, suche, v0, tasten, ms]; suche = {surf:'Schotter'} | {ford:1} | {s:123}. Fährt wirklich (Tasten), loggt dc, fps, Teilchen.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC;
const SCENES = [
  ['schotter', 'Rhein', 'loreley', { surf: 'Schotter' }, 18, ['ArrowUp'], 1800],
  ['schnee', 'Schnee', 'waldweg', { s: 150 }, 22, ['ArrowUp'], 1800],
  ['sand', 'Strand', 'duenenpfad', { surf: 'Weicher Sand' }, 15, ['ArrowUp'], 1800],
  ['qualm', 'Strand', 'promenade', { s: 200 }, 24, ['ArrowUp', 'Space', 'ArrowLeft'], 1100],
  ['spritz', 'City', 'regenfahrt', { surf: 'Nasser Asphalt' }, 26, ['ArrowUp'], 1500],
  ['furt', 'Strand', 'etappe_strand', { s: 940 }, 20, ['ArrowUp'], 1200],
  ['auspuff', 'City', 'neonallee', { s: 120 }, 2, ['ArrowUp'], 1200],
  ['blaetter', 'Rhein', 'weinberg', { s: 150 }, 20, ['ArrowUp'], 2500],
  ['funken', 'City', 'neonallee', { s: 300 }, 22, ['ArrowUp'], 100, 'sparks'],
  ['landung', 'Schnee', 'etappe_schnee', { s: 0 }, 22, ['ArrowUp'], 100, 'land'],
];
const only = process.env.SCEN ? process.env.SCEN.split(',') : null;
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4179', '--strictPort', ...(process.env.DIST ? ['--outDir', process.env.DIST] : [])], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4179/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 412), height: +(process.env.VH ?? 915) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-car', 'rally'); } catch {} });
await page.goto('http://127.0.0.1:4179/'); await sleep(800);
for (const [tag, world, id, find, v0, keys, ms, extra] of SCENES) {
  if (only && !only.includes(tag)) continue;
  if (!(await page.isVisible(`button[data-level="${id}"]`))) await page.click(`.rs-tile.world[title="${world}"]`); if (!(await page.locator(`button[data-level="${id}"].on`).count())) await page.click(`button[data-level="${id}"]`); await page.waitForSelector(`.rs-menu button[data-level="${id}"].on`); await page.click(".rs-go");
  await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
  const info = await page.evaluate(([find, v0, extra]) => {
    const g = window.__rennspiel, c = g.run.course; let s = find.s ?? 0;
    if (find.surf || find.ford) {
      s = -1;
      for (let t = 40; t < c.length - 40; t += 3) { const a = c.route.at(t); const ok = find.ford ? c.shallowAt(a.x, a.z) > 0 : c.terrain.surface(a.x, a.z).name === find.surf; if (ok) { s = t - 25; break; } }
      if (s < 0) return { none: true };
    }
    const a = c.recover(s); g.car.reset(a.x, a.z, a.yaw); if (v0) g.car.launch(v0);
    return { s, name: c.terrain.surface(a.x, a.z).name };
  }, [find, v0, extra]);
  console.log(tag, JSON.stringify(info));
  if (info.none) { await page.click('button[title="Pause"]'); await page.waitForSelector('#rs-pause:not(.hidden)'); await page.click('#rs-pause button.back'); await page.waitForSelector('.rs-menu:not(.hidden)'); continue; }
  if (extra === 'sparks') { await sleep(300); await page.evaluate(() => { const g = window.__rennspiel, S = g.session; S.fx.impact(g.car, 12); }); }
  if (extra === 'land') { await sleep(300); await page.evaluate(() => { const g = window.__rennspiel; g.car.landing = 9; }); }
  for (const k of keys) await page.keyboard.down(k);
  await sleep(ms);
  await page.screenshot({ path: `${SC}/fx-${tag}.png` });
  // fps über 2 s mitteln
  const fps = []; for (let i = 0; i < 4; i++) { await sleep(500); fps.push(await page.evaluate(() => document.getElementById('rs-fps').dataset.t)); }
  console.log(tag, JSON.stringify(await page.evaluate(() => { const g = window.__rennspiel, f = g.session.fx; return { dc: g.calls, v: Math.round(g.car.speed), alive: f ? f.pool.alive : -1, em: f ? f.emitted : null }; })), fps.join(' | '));
  for (const k of keys) await page.keyboard.up(k);
  await page.click('button[title="Pause"]'); await page.waitForSelector('#rs-pause:not(.hidden)'); await page.click('#rs-pause button.back'); await page.waitForSelector('.rs-menu:not(.hidden)');
}
await b.close(); srv.kill();

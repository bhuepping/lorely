// Screenshots einzelner Streckenstellen: SC=<ordner> SHOTS='[[welt, level, s, moverZeit|null, tag, v0, kurz]]' node tools/shots.mjs (vorher vite build)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC, shots = JSON.parse(process.env.SHOTS);
const srv = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort', ...(process.env.DIST ? ['--outDir', process.env.DIST] : [])], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4179/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 560) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text()); });
await page.goto('http://127.0.0.1:4179/'); await sleep(800);
for (const [world, id, s, t, tag, v, ahead] of shots) {
  if (!(await page.isVisible(`button[data-level="${id}"]`))) await page.click(`.rs-tile.world[title="${world}"]`); if (!(await page.locator(`button[data-level="${id}"].on`).count())) await page.click(`button[data-level="${id}"]`); await page.waitForSelector(`.rs-menu button[data-level="${id}"].on`); await page.click(".rs-go");
  await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
  await page.evaluate(([s, t, v]) => { const g = window.__rennspiel, c = g.run.course, a = c.recover(s); g.car.reset(a.x, a.z, a.yaw); if (v) g.car.launch(v); if (g.movers && t !== null) g.movers.t = t; }, [s, t, v ?? 0]);
  await sleep(ahead ? 600 : 1300);
  await page.screenshot({ path: `${SC}/el-${tag}.png` });
  console.log(tag, JSON.stringify(await page.evaluate(() => ({ dc: window.__rennspiel.calls, mt: window.__rennspiel.movers?.t, v: window.__rennspiel.car.speed }))));
  await page.click('button[title="Pause"]'); await page.waitForSelector('#rs-pause:not(.hidden)'); await page.click('#rs-pause button.back'); await page.waitForSelector('.rs-menu:not(.hidden)');
}
await b.close(); srv.kill();

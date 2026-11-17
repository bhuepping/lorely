// Freie Kamera-Screenshots: SC=<ordner> CAMS='[[tag,welt,level,[x,y,z],[lx,ly,lz],elapsed?],...]' [VW VH] node tools/camshots.mjs (vorher vite build)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC, cams = JSON.parse(process.env.CAMS);
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4180', '--strictPort', ...(process.env.DIST ? ['--outDir', process.env.DIST] : [])], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4180/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 500) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); } catch {} });
await page.goto('http://127.0.0.1:4180/'); await sleep(800);
for (const [tag, world, id, pos, look, el] of cams) {
  if (!(await page.isVisible(`button[data-level="${id}"]`))) await page.click(`.rs-tile.world[title="${world}"]`);
  for (let p = 0; p < 4 && !(await page.isVisible(`button[data-level="${id}"]`)); p++) await page.click('.pg.next');   // Menü blättert (5 je Seite)
  if (!(await page.locator(`button[data-level="${id}"].on`).count())) await page.click(`button[data-level="${id}"]`);
  await page.click('.rs-go'); await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
  await page.evaluate(([pos, look, el]) => { const g = window.__rennspiel; g.freeCam = true; g.car.reset(0, 0, 0); if (el) g.run.elapsed = el; g.camera.position.set(...pos); g.camera.lookAt(...look); document.querySelector('.rs-top')?.style.setProperty('display', 'none'); }, [pos, look, el ?? 0]);
  await sleep(1200);
  await page.evaluate(([pos, look]) => { const g = window.__rennspiel; g.camera.position.set(...pos); g.camera.lookAt(...look); }, [pos, look]);
  await sleep(300);
  await page.screenshot({ path: `${SC}/cam-${tag}.png` });
  console.log(tag, JSON.stringify(await page.evaluate(() => ({ dc: window.__rennspiel.calls }))));
  await page.reload(); await sleep(800);
}
await b.close(); srv.kill();

// Bilder: Menü (Zeitfahren/Sammeln mit Bestwerten unter den Autos) + Endkarte Zeitfahren: SC=<ordner> node tools/bashots.mjs (vorher vite build)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC ?? '.', PORT = process.env.PORT ?? '4186';
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: 412, height: 915 } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); localStorage.setItem('rs-world', 'snow'); localStorage.setItem('rs-car', 'buggy');
  if (!localStorage.getItem('rs-save')) localStorage.setItem('rs-save', JSON.stringify({ _v: 4, waldweg: { cars: { hatch: { time: 83.4, stars: 6 }, buggy: { time: 71.2, stars: 9 }, rally: { time: 64.8 } } }, kuppenstrecke: { cars: { buggy: { time: 102.5, stars: 4 } } }, see: { cars: { hatch: { stars: 12 } } } })); } catch {} });
await page.goto(`http://127.0.0.1:${PORT}/`); await sleep(1000);
await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
await page.click('button[title^="Zeitfahren"]'); await sleep(300);
await page.screenshot({ path: `${SC}/ba-menue-zeitfahren.png` });
await page.click('button[title^="Sammeln"]'); await sleep(300);
await page.screenshot({ path: `${SC}/ba-menue-sammeln.png` });
await page.click('button[title^="Zeitfahren"]'); await sleep(200);
await page.click('.rs-go');
await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(500);
// Zielnähe: Auto 25 m vor das Ziel, Gas -> Ziel -> Endkarte
await page.evaluate(() => { const g = window.__rennspiel, r = g.run, c = r.course, s = c.goal.s - 25, a = c.route.at(s); g.car.reset(a.x, a.z, c.route.yawAt(s)); g.car.launch(14); r.tracker.s = s; r.tracker.maxS = s; for (const i of r.cps.got.keys()) r.cps.got[i] = 1; r.elapsed = 66.8; });
await page.keyboard.down('ArrowUp');
await page.waitForSelector('#rs-end:not(.hidden)', { timeout: 60000 }); await page.keyboard.up('ArrowUp'); await sleep(400);
await page.screenshot({ path: `${SC}/ba-endkarte.png` });
console.log(await page.evaluate(() => [...document.querySelectorAll('#rs-end .card canvas.px')].map((c) => c.dataset.t).join(' ')));
await b.close(); srv.kill(); process.exit(0);

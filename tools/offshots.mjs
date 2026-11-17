// Offroad-Screenshots: SC=<ordner> [VW VH] node tools/offshots.mjs (vorher vite build). Jeep-Modell + je Level eine Stelle.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC;
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4181', '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4181/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 520) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); } catch {} });
await page.goto('http://127.0.0.1:4181/'); await sleep(900);
// [Tag, Level, Auto, JS (läuft nach dem Start im Spiel), Wartezeit ms]
const SHOTS = JSON.parse(process.env.SHOTS);
for (const [tag, id, car, js, wait] of SHOTS) {
  await page.evaluate((c) => localStorage.setItem('rs-car', c), car); await page.reload(); await sleep(900);
  await page.click(`.rs-tile.world[title="${process.env.WORLD ?? 'Offroad'}"]`);
  if (!(await page.locator(`button[data-level="${id}"].on`).count())) await page.click(`button[data-level="${id}"]`);
  await page.waitForSelector(`.rs-menu button[data-level="${id}"].on`); await page.click('.rs-go');
  await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
  if (js) await page.evaluate(new Function('return (async () => {' + js + '})()'));
  await sleep(wait ?? 1500);
  await page.screenshot({ path: `${SC}/${tag}.png` });
  console.log(tag, JSON.stringify(await page.evaluate(() => ({ dc: window.__rennspiel.calls, v: window.__rennspiel.car.speed, surf: window.__rennspiel.car.surfaceName }))));
}
await b.close(); srv.kill();

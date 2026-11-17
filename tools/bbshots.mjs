// Prüfbericht: Startbild aus der Fahrersicht je Strecke – SC=<ordner> [LV=a,b] [PORT=4183] [CAR=rally] [VW VH] node tools/bbshots.mjs (vorher vite build)
// Je Level: <id>-start.png (Auto steht, Ampel aus) und <id>-start3.png (3 s Vollgas). Karten: tools/bbmap.py
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`, PORT = process.env.PORT ?? 4183;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC, only = process.env.LV?.split(',');
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 520) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.addInitScript((car) => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); if (car) localStorage.setItem('rs-car', car); } catch {} }, process.env.CAR ?? '');
await page.goto(`http://127.0.0.1:${PORT}/`); await sleep(900);
const worlds = await page.$$eval('.rs-tile.world', (a) => a.map((e) => e.title));
const levels = {};
// Menü blättert (5 je Seite): je Welt alle Seiten durchgehen
for (const w of worlds) { await page.click(`.rs-tile.world[title="${w}"]`); for (let p = 0; p < 4; p++) { for (const id of await page.$$eval('button[data-level]', (a) => a.map((e) => e.dataset.level))) levels[id] = w; if (await page.locator('.pg.next:not([disabled])').count()) await page.click('.pg.next'); else break; } while (await page.locator('.pg.prev:not([disabled])').count()) await page.click('.pg.prev'); }
if (process.env.DEBUG) console.log(JSON.stringify(levels));
for (const [id, w] of Object.entries(levels)) {
  if (only && !only.includes(id)) continue;
  if (!(await page.isVisible(`button[data-level="${id}"]`))) { await page.click(`.rs-tile.world[title="${w}"]`); for (let p = 0; p < 4 && !(await page.isVisible(`button[data-level="${id}"]`)); p++) await page.click('.pg.next'); } if (!(await page.locator(`button[data-level="${id}"].on`).count())) await page.click(`button[data-level="${id}"]`);
  await page.waitForSelector(`.rs-menu button[data-level="${id}"].on`); await page.click('.rs-go');
  await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(1200);
  await page.screenshot({ path: `${SC}/${id}-start.png` });
  await page.keyboard.down('ArrowUp'); await sleep(3000); await page.screenshot({ path: `${SC}/${id}-start3.png` }); await page.keyboard.up('ArrowUp');
  console.log(id, 'ok');
  await page.keyboard.press('Escape'); await page.waitForSelector('#rs-pause:not(.hidden)'); await page.click('#rs-pause button.back'); await page.waitForSelector('.rs-menu:not(.hidden)');
}
await b.close(); srv.kill();

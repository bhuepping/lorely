// Fahrersicht an Stellen der Strecke – SC=<ordner> LV=<id> S=120,300,… [LS=Schlüssel=Wert,…] [PORT=4184] [CAR=rally] node tools/bbfahrt.mjs (vorher vite build)
// Setzt das Auto bei Strecke s (minus BACK m) auf die Ideallinie, Kamera folgt wie im Spiel; Bild je Stelle: <id>-s<s>.png
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`, PORT = process.env.PORT ?? 4184;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC, id = process.env.LV, S = (process.env.S ?? '0').split(',').map(Number), BACK = +(process.env.BACK ?? 0);
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 520) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.addInitScript((car) => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); if (car) localStorage.setItem('rs-car', car); } catch {} }, process.env.CAR ?? '');
await page.goto(`http://127.0.0.1:${PORT}/`); await sleep(900);
const worlds = await page.$$eval('.rs-tile.world', (a) => a.map((e) => e.title));
let found = false;
for (const w of worlds) { await page.click(`.rs-tile.world[title="${w}"]`); for (let p = 0; p < 5; p++) { if (await page.isVisible(`button[data-level="${id}"]`)) { found = true; break; } if (await page.locator('.pg.next:not([disabled])').count()) await page.click('.pg.next'); else break; } if (found) break; }
if (!found) { console.log('Level nicht gefunden'); process.exit(1); }
if (!(await page.locator(`button[data-level="${id}"].on`).count())) await page.click(`button[data-level="${id}"]`);
await page.click(".rs-go");
await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(1500);
for (const s of S) {
  await page.evaluate(([s, back]) => { const g = window.__rennspiel, c = g.session.course, r = c.route, p = r.at(Math.max(0, s - back)); g.car.reset(p.x, p.z, Math.atan2(-p.dx, -p.dz)); g.run.elapsed = 0; document.querySelector('.rs-top')?.style.setProperty('display', 'none'); }, [s, BACK]);
  await sleep(1300);
  if (BACK) { await page.keyboard.down('ArrowUp'); await sleep(BACK * 70); await page.keyboard.up('ArrowUp'); }
  await page.screenshot({ path: `${SC}/${id}-s${s}.png` });
  console.log(id, s, 'ok');
}
await b.close(); srv.kill();

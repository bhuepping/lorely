// Vorstadt-Kamerabilder relativ zum Gelände: SC=<ordner> CAMS='[[tag,[x,hoehe_ueber_Boden,z],[lx,hoehe_ueber_Boden,lz]],...]' [VW VH] node tools/vshots.mjs (vorher npm run build)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC ?? '/tmp/vs'; mkdirSync(SC, { recursive: true });
const cams = JSON.parse(process.env.CAMS);
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4182', '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4182/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 500) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); } catch {} });
await page.goto('http://127.0.0.1:4182/'); await sleep(800);
await page.click('.rs-tile.world[title="Vorstadt"]'); if (!(await page.locator('button[data-level="etappe_vorstadt"].on').count())) await page.click('button[data-level="etappe_vorstadt"]');
await page.click('.rs-go'); await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
await page.evaluate(() => { const g = window.__rennspiel; g.freeCam = true; g.car.reset(0, 0, 0); g.session.sigT = 3; document.querySelectorAll('#rs-hud, .rs-hud').forEach((e) => (e.style.display = 'none')); });
if (process.env.TOP) await page.evaluate(() => { window.__top = true; });
for (const [tag, p, l] of cams) {
  await page.evaluate(([p, l]) => { const g = window.__rennspiel, T = g.session.course.terrain; if (window.__top) g.camera.up.set(0, 0, -1); if (g.scene) g.scene.fog = null; g.camera.position.set(p[0], T.height(p[0], p[2]) + p[1], p[2]); g.camera.lookAt(l[0], T.height(l[0], l[2]) + l[1], l[2]); }, [p, l]);
  await sleep(900);
  await page.screenshot({ path: `${SC}/${tag}.png` });
  console.log(tag, JSON.stringify(await page.evaluate(() => ({ dc: window.__rennspiel.calls }))));
}
await b.close(); srv.kill(); process.exit(0);

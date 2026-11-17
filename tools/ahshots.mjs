// Screenshots: Offroad-Level von oben mit den Jeep-Sternen: SC=<ordner> node tools/ahshots.mjs (vorher vite build)

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC, ONLY = process.env.ONLY?.split(',');
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4185', '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4185/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 560) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); } catch {} });
await page.goto('http://127.0.0.1:4185/'); await sleep(800);
const start = async (world, id) => {
  if (!(await page.isVisible(`button[data-level="${id}"]`))) await page.click(`button.rs-tile.world[data-world="${world}"]`);
  if (!(await page.locator(`button[data-level="${id}"].on`).count())) await page.click(`button[data-level="${id}"]`);
  await page.waitForSelector(`.rs-menu button[data-level="${id}"].on`); await page.click('.rs-go'); await page.waitForSelector('#rs-speed', { state: 'visible', timeout: 8000 }).catch(async (e) => { await page.screenshot({ path: `${SC}/fail.png` }); throw e; }); await sleep(300);
};
const back = async () => { await page.click('button[title="Pause"]'); await page.waitForSelector('#rs-pause:not(.hidden)'); await page.click('#rs-pause button.back'); await page.waitForSelector('.rs-menu:not(.hidden)'); };
const shots = [['matschgrube', 'matschgrube', 0, 0, 125], ['huegel', 'huegel', 0, 0, 200], ['furtwald', 'furtwald', 0, 0, 200], ['steilhang', 'steilhang', -30, 0, 540], ['moorwald', 'moorwald', 0, 0, 540]];
for (const [id, tag, cx, cz, hh] of shots) {
  if (ONLY && !ONLY.includes(id)) continue;
  await start('offroad', id);
  const info = await page.evaluate(([cx, cz, hh]) => {
    const g = window.__rennspiel; g.freeCam = true; for (const [k, v] of [["near", 1e5], ["far", 2e5]]) Object.defineProperty(g.scene.fog, k, { get: () => v, set: () => {} }); document.querySelectorAll('#rs-hud, .rs-hud').forEach((e) => (e.style.display = 'none'));
    const c = g.session.course, h = c.terrain.height(cx, cz);
    g.camera.far = 3000; g.camera.updateProjectionMatrix(); g.camera.up.set(0, 0, -1); g.camera.position.set(cx, h + hh, cz + 0.01); g.camera.lookAt(cx, h, cz);
    return { n: c.stars.length, id: c.id };
  }, [cx, cz, hh]);
  await sleep(1500);
  await page.screenshot({ path: `${SC}/${process.env.PFX ?? 'jeepsterne'}-${tag}.png` });
  console.log(tag, JSON.stringify(info));
  await page.evaluate(() => { window.__rennspiel.freeCam = false; window.__rennspiel.camera.up.set(0, 1, 0); document.querySelectorAll('#rs-hud, .rs-hud').forEach((e) => (e.style.display = '')); });
  await back();
}
await b.close(); srv.kill(); process.exit(0);

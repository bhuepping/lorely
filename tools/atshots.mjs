// Kartenfoto (ohne Overlay) vorher/nachher, Holz, Zielkreis als PNG. Aufruf: PORT=4191 SHOT_DIR=… node tools/atshots.mjs karte|holz|ziel
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const PORT = Number(process.env.PORT || 4191), OUT = process.env.SHOT_DIR || '/tmp', what = process.argv[2] || 'karte';
mkdirSync(OUT, { recursive: true });
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const br = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await br.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 800 } })).newPage();
const start = async (world, id, ls = {}) => {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.evaluate((l) => { localStorage.clear(); localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); for (const k in l) localStorage.setItem(k, l[k]); }, ls);
  await page.reload(); await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
  if (!(await page.evaluate(() => document.querySelector('button[title="Zeitrennen"]')?.classList.contains('on')))) await page.click('button[title="Zeitrennen"]');
  await page.click(`.rs-tile.world[title="${world}"]`); if (!(await page.evaluate((i) => !!document.querySelector(`button[data-level="${i}"]`)?.classList.contains('on'), id))) await page.click(`button[data-level="${id}"]`); await page.click('.rs-go');
  await page.waitForSelector('#rs-speed', { state: 'visible' });
};
try {
  if (what === 'karte') for (const [world, id] of [['Strand', 'duenenpfad'], ['Strand', 'muschelweg'], ['Strand', 'promenade'], ['Strand', 'wasserlinie']]) for (const v of ['vorher', 'nachher']) {
    await start(world, id, v === 'vorher' ? { 'rs-maptint': '0' } : {});
    await page.waitForFunction(() => window.__rsMap?.ok, null, { timeout: 60000 });
    const b64 = await page.evaluate(() => { const c = window.__rsMap.photo, o = document.createElement('canvas'); o.width = o.height = 640; o.getContext('2d').drawImage(c, 0, 0, 640, 640); return o.toDataURL('image/png').split(',')[1]; });
    writeFileSync(`${OUT}/at-karte-${id}-${v}.png`, Buffer.from(b64, 'base64'));
    console.log(id, v, JSON.stringify(await page.evaluate(() => ({ ...window.__rsMap, photo: 0 }))));
  }
  if (what === 'holz') {
    await start('Strand', 'promenade'); await page.keyboard.down('ArrowUp'); await sleep(2500); await page.keyboard.up('ArrowUp'); await sleep(300);
    await page.screenshot({ path: `${OUT}/at-holz-${process.argv[3] || 'nachher'}.png` });
  }
} finally { await br.close(); srv.kill(); }

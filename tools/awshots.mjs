// Straßenbreite im Kartenbild messen (mess) und Vergleichsbilder A ohne Rand / B dunkel / C hell (bild). Aufruf: PORT=4198 SHOT_DIR=… node tools/awshots.mjs mess|bild [levelId,…]
// Schalter im Spiel: rs-mapband=0 = Straßenband aus
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
const page = await (await br.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 800 }, deviceScaleFactor: what === 'bild' ? 3 : 1 })).newPage();
page.on('pageerror', (e) => console.log('PAGEERR', String(e))); page.on('console', (m) => m.type() === 'error' && console.log('CONERR', m.text()));
const start = async (world, id, ls = {}) => {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.evaluate((l) => { localStorage.clear(); localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); for (const k in l) localStorage.setItem(k, l[k]); }, ls);
  await page.reload(); await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
  if (!(await page.evaluate(() => document.querySelector('button[title="Zeitrennen"]')?.classList.contains('on')))) await page.click('button[title="Zeitrennen"]');
  await page.click(`.rs-tile.world[title="${world}"]`); if (!(await page.evaluate((i) => !!document.querySelector(`button[data-level="${i}"]`)?.classList.contains('on'), id))) await page.click(`button[data-level="${id}"]`); await page.click('.rs-go');
  await page.waitForSelector('#rs-speed', { state: 'visible', timeout: 20000 }).catch(async (e) => { await page.screenshot({ path: OUT + '/dbg.png' }); throw e; });
};
const ROAD = { Schnee: ['waldweg', 'kuppenstrecke', 'see', 'kehrenhang'], City: ['neonallee', 'hochhausring', 'regenfahrt', 'kreiselviertel'], Strand: ['promenade', 'wasserlinie', 'duenenpfad', 'muschelweg'], Rhein: ['weinberg', 'uferstrasse', 'loreley', 'burgweg'] };
const ids = process.argv[3] ? process.argv[3].split(',') : null;
try {
  const rows = [];
  for (const [world, list] of Object.entries(ROAD)) for (const id of list) {
    if (ids && !ids.includes(id)) continue;
    await start(world, id, what === 'bild' ? { 'rs-mapband': 'a' } : {});
    await page.waitForFunction(() => window.__rsMap?.ok, null, { timeout: 90000 });
    await page.click('.rs-map'); await page.waitForSelector('.rs-bigmap:not(.hidden)');
    const m = await page.evaluate(() => ({ span: window.__rsMap.span, roadW: window.__rsMap.roadW, big: document.querySelector('.rs-bigmap').clientWidth, small: document.querySelector('.rs-map').clientWidth }));
    const r = { world, id, ...m, photoPx: +(m.roadW / m.span * 1024).toFixed(2), bigPx: +(m.roadW / m.span * m.big).toFixed(2), smallPx: +(m.roadW / m.span * m.small).toFixed(2) };
    rows.push(r); console.log(JSON.stringify(r));
    if (what === 'bild') {
      const shots = [];
      for (const v of ['a', 'b', 'c']) {
        if (v !== 'a') { await start(world, id, { 'rs-mapband': v }); await page.waitForFunction(() => window.__rsMap?.ok, null, { timeout: 90000 }); await page.click('.rs-map'); await page.waitForSelector('.rs-bigmap:not(.hidden)'); }
        const bigS = (await page.locator('.rs-bigmap').screenshot()).toString('base64');
        await page.click('.rs-bigmap'); await page.waitForSelector('.rs-bigmap', { state: 'hidden' });   // Tipp schließt; kleine Karte ablichten
        shots.push([bigS, (await page.locator('.rs-map').screenshot()).toString('base64')]);
      }
      const out = await page.evaluate(async ([imgs, label]) => {
        const L = ['A ohne Rand', 'B dunkler Rand', 'C heller Rand'], load = (b) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + b; });
        const big = await Promise.all(imgs.map((x) => load(x[0]))), sm = await Promise.all(imgs.map((x) => load(x[1])));
        const BW = 600, SW = 270, c = document.createElement('canvas'); c.width = BW * 3 + 20; c.height = 44 + BW + 10 + SW + 44;
        const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.imageSmoothingQuality = 'high';
        big.forEach((i, k) => { g.drawImage(i, k * (BW + 10), 44, BW, BW); g.fillText(L[k], k * (BW + 10) + 8, 31); g.drawImage(sm[k], k * (BW + 10), 44 + BW + 10, SW, SW); });
        g.font = '22px sans-serif'; g.fillText(label + ' (oben große Karte, unten kleine, 3x vergrößert)', 8, 44 + BW + 10 + SW + 30);
        return c.toDataURL('image/png').split(',')[1];
      }, [shots, `${world} ${id}: Straße ${r.roadW} m = ${r.bigPx} px groß, ${r.smallPx} px klein`]);
      writeFileSync(`${OUT}/aw-${id}.png`, Buffer.from(out, 'base64'));
    }
  }
  writeFileSync(`${OUT}/aw-mess.json`, JSON.stringify(rows, null, 1));
} finally { await br.close(); srv.kill(); }

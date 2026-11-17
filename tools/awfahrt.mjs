// Bilder der Karte beim Fahren (Übersicht + Nah) auf Handy-Maßen. Aufruf: PORT=4197 SHOT_DIR=… node tools/awfahrt.mjs [Welt Level]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const PORT = Number(process.env.PORT || 4197), OUT = process.env.SHOT_DIR || '/tmp', world = process.argv[2] || 'Rhein', id = process.argv[3] || 'loreley';
mkdirSync(OUT, { recursive: true });
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const br = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [w, h] of [[844, 390], [390, 844], [360, 740]]) {
    const ctx = await br.newContext({ locale: 'de-DE', viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); } catch {} });
    const pg = await ctx.newPage();
    await pg.goto(`http://127.0.0.1:${PORT}/?touch=1`); await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
    if (!(await pg.evaluate(() => document.querySelector('button[title="Zeitrennen"]')?.classList.contains('on')))) await pg.click('button[title="Zeitrennen"]');
    await pg.click(`.rs-tile.world[title="${world}"]`); await pg.click(`button[data-level="${id}"]`); await pg.click('.rs-go');
    await pg.waitForSelector('#rs-speed', { state: 'visible' }); await pg.waitForFunction(() => window.__rsMap?.ok, null, { timeout: 90000 });
    await sleep(800); await pg.tap('.rs-map'); await sleep(500);
    await pg.screenshot({ path: `${OUT}/aw-fahrt-${w}-uebersicht.png` });
    await pg.tap('.rs-bigmap .zoom'); await sleep(600);
    await pg.screenshot({ path: `${OUT}/aw-fahrt-${w}-nah.png` });
    await ctx.close();
  }
} finally { await br.close(); srv.kill(); }

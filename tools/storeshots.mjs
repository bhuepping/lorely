// Store-Bilder je Sprache (Handy 411x914 CSS-px, 1080 px breit): Vorstadt mit schwebendem Abbiegepfeil, Gelände mit Staub, Strand,
// erst hochkant (1-3), dann quer (4-6).
// Aufruf (vorher npm run build): node tools/storeshots.mjs   -> fastlane/metadata/android/{de-DE,en-US}/images/phoneScreenshots/1-6.png
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const PORT = Number(process.env.PORT ?? 4193), OUT = process.env.OUT ?? 'fastlane/metadata/android';
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// Szenen: Welt, Strecke, Auto (0 Kompakt, 1 Buggy, 2 Rallye, 3 Jeep), Start je nach Szene
const SCENES = [
  { world: 'vorstadt', level: 'etappe_vorstadt', car: 2, turn: 1, back: 48, backQ: 30, v: 12, wait: 450, freeze: true, keys: ['ArrowUp'] },
  { world: 'offroad', level: 'huegel', car: 3, v: 9, wait: 1500, keys: ['ArrowUp'] },
  { world: 'beach', level: 'promenade', car: 1, v: 22, wait: 1300, keys: ['ArrowUp'] },
];
const W = 411, H = 914, DSF = 1080 / W;
let n = 0;
for (const lang of ['de-DE', 'en-US']) for (const [w, h] of [[W, H], [H, W]]) {
  if (w === W) n = 0;
  mkdirSync(`${OUT}/${lang}/images/phoneScreenshots`, { recursive: true });
  const ctx = await b.newContext({ locale: lang, viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: DSF });
  await ctx.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); } catch {} });
  for (const sc of SCENES) {
    const pg = await ctx.newPage(); pg.on('pageerror', (e) => console.log('ERR', String(e)));
    await pg.goto(`http://127.0.0.1:${PORT}/?touch=1`); await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
    await pg.click(`.rs-tile.world[data-world="${sc.world}"]`); await pg.click(`button[data-level="${sc.level}"]`);
    await pg.evaluate((n) => document.querySelectorAll('button.mode.car')[n].click(), sc.car); await pg.evaluate(() => document.querySelector('.rs-go').click());
    await pg.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(600);
    await pg.evaluate((sc) => {
      const g = window.__rennspiel, S = g.session, c = S.course;
      if (sc.turn !== undefined) { const q = S.ar.turns[sc.turn], p = c.route.at(q.s - (innerWidth > innerHeight && sc.backQ ? sc.backQ : sc.back)); g.car.reset(p.x, p.z, Math.atan2(-p.dx, -p.dz)); }
    }, sc);
    if (sc.turn !== undefined) await sleep(1800);   // Kamera holt auf
    await pg.evaluate((v) => window.__rennspiel.car.launch(v), sc.v);
    for (const k of sc.keys ?? []) await pg.keyboard.down(k);
    await sleep(sc.wait);
    if (sc.freeze) { await pg.keyboard.press('KeyP'); await pg.addStyleTag({ content: '#rs-pause{display:none!important}' }); await sleep(300); }   // Bild einfrieren: Auto bleibt auf der Straße
    await pg.screenshot({ path: `${OUT}/${lang}/images/phoneScreenshots/${++n}.png`, clip: { x: 0, y: 0, width: ((w === W ? 1080 : 2400) + .4) / DSF, height: ((w === W ? 2400 : 1080) + .4) / DSF } });   // Pixel 8: 1080x2400
    await pg.close();
  }
  await ctx.close();
}
await b.close(); srv.kill();

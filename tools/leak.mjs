// Leck-Messung im echten Browser: viele Fahrten nacheinander (Menü → Level → fahren → Pause → Menü) und Titel-Kameraflug.
// Gibt GPU-Objekte (Geometrien, Texturen, Shader) und JS-Heap je Runde aus; wächst eine Zahl stetig, leckt etwas.
// Aufruf: npm run build && node tools/leak.mjs   (N=Runden, LVS=komma-Liste von Level-ids)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const PORT = process.env.PORT || '4179', N = Number(process.env.N || 8);
const srv = spawn('npx', ['vite', 'preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); } catch {} });
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
const mem = async () => { await page.evaluate(() => window.gc?.()); return page.evaluate(() => window.__rsMem()); };
const row = (k, m) => console.log(k.padEnd(22), `geo ${m.geometries}`.padEnd(9), `tex ${m.textures}`.padEnd(8), `prog ${m.programs}`.padEnd(9), `heap ${(m.heap / 1e6).toFixed(1)} MB`);
const all = process.env.LVS ? process.env.LVS.split(',') : null;
row('start', await mem());
if (process.env.LONG) {   // eine lange Fahrt: Objekte in der Szene, GPU, Heap und Bildzeit alle 20 s
  await page.click('.rs-tile.level.on');
  await page.waitForFunction(() => window.__rennspiel?.session?.sigT > 0.2, null, { timeout: 30000 });
  for (let t = 0; t < Number(process.env.LONG); t += 20) {
    await page.keyboard.down('ArrowUp'); await page.keyboard.down(t % 40 ? 'ArrowLeft' : 'ArrowRight'); await sleep(20000); await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowRight');
    const n = await page.evaluate(() => { let k = 0; window.__rennspiel.scene.traverse(() => k++); const f = []; return new Promise((res) => { let p = performance.now(), c = 0; const g = (q) => { f.push(q - p); p = q; if (++c < 60) requestAnimationFrame(g); else res({ k, ms: f.sort((a, b) => a - b)[30].toFixed(1), max: f[59].toFixed(0) }); }; requestAnimationFrame(g); }); });
    row(`${t + 20} s obj ${n.k} ${n.ms}/${n.max} ms`, await mem());
  }
  await browser.close(); srv.kill(); process.exit(0);
}
for (let i = 0; i < N; i++) {
  const worlds = await page.evaluate(() => [...document.querySelectorAll('.rs-tile.world')].map((b) => b.dataset.world));
  const w = worlds[i % worlds.length];
  await page.click(`.rs-tile.world[data-world="${w}"]`); await sleep(200);
  if (all) await page.click(`button[data-level="${all[i % all.length]}"]`);
  const lv = await page.getAttribute('.rs-tile.level.on', 'data-level');
  await page.click('.rs-tile.level.on');   // markierte Kachel startet
  await page.waitForFunction(() => window.__rennspiel?.session?.sigT > 0.2, null, { timeout: 30000 });
  await page.keyboard.down('ArrowUp'); await sleep(2500); await page.keyboard.up('ArrowUp');
  row(`${i + 1} fahrt ${lv}`, await mem());
  await page.keyboard.press('KeyP'); await sleep(100);
  await page.click('#rs-pause .back'); await sleep(1500);
}
console.log('Titel-Kameraflug 60 s …'); await sleep(60000); row('nach titel', await mem());
await browser.close(); srv.kill(); process.exit(0);

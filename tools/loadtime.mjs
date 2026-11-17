// Ladezeit: Level wählen -> GO -> bis das Fahr-HUD steht und zwei Frames gezeichnet sind. Gleiche Methode vorher/nachher:
//   DIR=<ordner mit dist/> [N=5] [LV=welt:level,..] node tools/loadtime.mjs   (vorher `npm run build` im Ordner; ohne DIR = dieser Ordner)
// Ausgabe je Level: Median Gesamt (ms) + Abschnitte aus window.__rsLoad (ms). Headless-Chromium mit Software-GL: Zahlen nur untereinander vergleichen.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const DIR = process.env.DIR ?? '.', N = +(process.env.N ?? 5), PORT = 4190 + Math.floor(Math.random() * 50);
const LV = (process.env.LV ?? 'vorstadt:etappe_vorstadt,city:neonallee,offroad:furtwald,snow:kehrenhang').split(',').map((s) => s.split(':'));
const srv = spawn(`${process.cwd()}/node_modules/.bin/vite`, ['preview', '--port', String(PORT), '--strictPort'], { cwd: DIR, stdio: 'ignore' });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const [world, id] of LV) {
  const tot = [], parts = {}; let dc = 0;
  for (let k = 0; k < N + 1; k++) {   // der erste Lauf wärmt Cache/JIT auf und zählt nicht
    const page = await b.newPage({ locale: 'de-DE', viewport: { width: 900, height: 520 } });
    await page.addInitScript((LS) => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); for (const kv of (LS ?? '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); localStorage.setItem(k, v); } } catch {} }, process.env.LS);
    await page.goto(`http://127.0.0.1:${PORT}/`); await sleep(1200);
    if (!(await page.isVisible(`button[data-level="${id}"]`))) await page.click(`button.rs-tile.world[data-world="${world}"]`);
    if (!(await page.locator(`button[data-level="${id}"].on`).count())) await page.click(`button[data-level="${id}"]`);
    await page.waitForSelector(`.rs-menu button[data-level="${id}"].on`);
    const r = await page.evaluate(() => new Promise((res) => {
      const t0 = performance.now(); document.querySelector('.rs-go').click();
      const tick = () => { const sp = document.querySelector('#rs-speed'); if (sp && sp.offsetParent !== null && window.__rennspiel?.session) requestAnimationFrame(() => requestAnimationFrame(() => res({ ms: performance.now() - t0, load: { ...window.__rsLoad }, dc: window.__rennspiel.calls }))); else setTimeout(tick, 5); };
      tick();
    }));
    if (k) { tot.push(r.ms); dc = r.dc; for (const [p, v] of Object.entries(r.load ?? {})) (parts[p] ??= []).push(v); }
    await page.close();
  }
  console.log(`${id.padEnd(16)} gesamt ${Math.round(med(tot))} ms (min ${Math.round(Math.min(...tot))}, max ${Math.round(Math.max(...tot))}) | ${Object.entries(parts).map(([p, v]) => `${p} ${Math.round(med(v))}`).join(' · ')} | dc ${dc}`);
}
await b.close(); srv.kill();

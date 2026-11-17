// Wahrzeichen-Bilder aus Fahrerhöhe: SC=<ordner> [ONLY=restaurant,kita] node tools/lmshots.mjs (vorher npm run build).
// Kamera 1,5 m über dem Boden auf der Rennstrecke 24 m vor der Stelle, die dem Wahrzeichen am nächsten liegt, Blick auf das Wahrzeichen.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC ?? '/tmp/lm'; mkdirSync(SC, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4183', '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4183/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 500) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); } catch {} });
await page.goto('http://127.0.0.1:4183/'); await sleep(800);
await page.click('.rs-tile.world[title="Vorstadt"]'); if (!(await page.locator('button[data-level="etappe_vorstadt"].on').count())) await page.click('button[data-level="etappe_vorstadt"]');
await page.click('.rs-go'); await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
await page.evaluate(() => { const g = window.__rennspiel; g.freeCam = true; g.car.reset(0, 0, 0); g.session.sigT = 3; document.querySelectorAll('#rs-hud, .rs-hud').forEach((e) => (e.style.display = 'none')); });
const list = await page.evaluate(() => {
  const c = window.__rennspiel.session.course, K = ['restaurant', 'apotheke', 'doppel', 'holz', 'bungalow', 'kasten', 'steg', 'kita', 'villa'], seen = {}, out = [];
  for (const h of c.suburb.houses) { if (!K.includes(h.kind)) continue; const n = (seen[h.kind] = (seen[h.kind] ?? 0) + 1); const r = c.route.nearest(h.x, h.z); out.push({ tag: h.kind + (n > 1 ? n : ''), x: h.x, z: h.z, s: r.s, d: r.d }); }
  const hw = c.suburb.houses.find((h) => h.kind === 'haus' && h.rc === 0xc0392b); if (hw) { const r = c.route.nearest(hw.x, hw.z); out.push({ tag: 'weisshaus', x: hw.x, z: hw.z, s: r.s, d: r.d }); }
  const pl = c.suburb.patches.find((p) => p.c === 'plaza'); if (pl) { const r = c.route.nearest(pl.x, pl.z); out.push({ tag: 'pflaster', x: pl.x, z: pl.z, s: r.s, d: r.d }); }
  return out;
});
for (const m of list) {
  if (only && !only.some((o) => m.tag.startsWith(o))) continue;
  const back = +(process.env.BACK ?? 24);
  await page.evaluate(([m, back]) => { const g = window.__rennspiel, c = g.session.course, T = c.terrain, a = c.route.at(Math.max(0, m.s - back)); g.camera.position.set(a.x, T.height(a.x, a.z) + 1.5, a.z); g.camera.lookAt(m.x, T.height(m.x, m.z) + 3, m.z); }, [m, back]);
  await sleep(900);
  await page.screenshot({ path: `${SC}/${m.tag}.png` });
  console.log(m.tag, JSON.stringify({ s: Math.round(m.s), d: Math.round(m.d), dc: await page.evaluate(() => window.__rennspiel.calls) }));
}
await b.close(); srv.kill(); process.exit(0);

// Vorstadt: Fahrt zu jedem Abzweig – Screenshot (Fahrersicht mit HUD) vor dem Abzweig, HUD-Pfeil an/aus, Draw Calls mit/ohne Pfeile.
// SC=<ordner> [PORT=4173] [CAR=jeep] node tools/abbiegen.mjs   (vorher npm run build)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`, PORT = process.env.PORT ?? 4173, SC = process.env.SC ?? '/tmp/abbiegen';
mkdirSync(SC, { recursive: true });
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', PORT, '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: 900, height: 520 } });
let fails = 0; const fail = (m) => { fails++; console.log('FEHLER', m); };
page.on('pageerror', (e) => fail(String(e)));
await page.addInitScript((car) => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); if (car) localStorage.setItem('rs-car', car); } catch {} }, process.env.CAR ?? 'jeep');
await page.goto(`http://127.0.0.1:${PORT}/`); await sleep(900);
await page.click('.rs-tile.world[title="Vorstadt"]').catch(async () => { for (const w of await page.$$eval('.rs-tile.world', (a) => a.map((e) => e.title))) { await page.click(`.rs-tile.world[title="${w}"]`); if (await page.isVisible('button[data-level="etappe_vorstadt"]')) break; } });
if (!(await page.locator('button[data-level="etappe_vorstadt"].on').count())) await page.click('button[data-level="etappe_vorstadt"]');
await page.click('.rs-go'); await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(1500);
// Abzweigliste aus dem Spiel: Abbiegepunkte per Routenrichtung (wie netturns.ts, hier unabhängig geprüft)
const list = await page.evaluate(() => { const c = window.__rennspiel.session.course, r = c.route, out = []; for (const n of c.net.nodes.values()) { const h = r.nearest(n.x, n.z); if (h.d > 14) continue; const p = r.at(h.s - 24), q = r.at(h.s + 24), t = Math.atan2(p.dx * q.dz - p.dz * q.dx, p.dx * q.dx + p.dz * q.dz); if (Math.abs(t) > 0.5) out.push({ s: h.s, side: t > 0 ? 'rechts' : 'links' }); } return out.sort((a, b) => a.s - b.s); });
console.log('Abzweige', JSON.stringify(list.map((q) => `${Math.round(q.s)} ${q.side}`)));
const place = (s) => page.evaluate((s) => { const g = window.__rennspiel, r = g.session.course.route, p = r.at(s); g.car.reset(p.x, p.z, Math.atan2(-p.dx, -p.dz)); g.run.cps?.got.fill(1); }, s);
const state = () => page.evaluate(() => { const g = window.__rennspiel; return { on: g.run.arrowOn, nav: document.querySelector('.rs-nav').classList.contains('on'), s: g.run.tracker.s, calls: g.calls }; });
await page.keyboard.down('ArrowUp');
let n = 0;
for (const q of list) {
  n++;
  await place(q.s - 80); await sleep(1500);
  let st = await state(); if (st.on) fail(`Pfeil schon 80 m vor ${Math.round(q.s)} an`);
  // fahren, bis 52 m vor dem Abzweig
  for (let i = 0; i < 80; i++) { st = await state(); if (st.s >= q.s - 52) break; await sleep(100); }
  await page.evaluate(() => { document.querySelector('.rs-top')?.style.removeProperty('display'); });
  await sleep(150); st = await state();
  if (!st.on || !st.nav) fail(`kein HUD-Pfeil bei ${Math.round(st.s)} (Abzweig ${Math.round(q.s)})`);
  const withA = await state(); await page.evaluate(() => { window.__rennspiel.scene.getObjectByName('turnArrows').visible = false; }); await sleep(250);
  const without = await state(); await page.evaluate(() => { window.__rennspiel.scene.getObjectByName('turnArrows').visible = true; }); await sleep(100);
  console.log(`Abzweig ${n} (${Math.round(q.s)} ${q.side}): HUD-Pfeil ${st.nav}, Draw Calls ${without.calls} -> ${withA.calls}`);
  if (withA.calls - without.calls > 1) fail('mehr als ein Draw Call');
  await page.evaluate((s) => { const g = window.__rennspiel, r = g.session.course.route, p = r.at(s), lat = -(g.session.course.net.nearest(p.x, p.z)?.edge.half ?? 5) / 2, x = p.x + p.dz * lat, z = p.z - p.dx * lat; g.car.reset(x, z, Math.atan2(-p.dx, -p.dz)); }, q.s - 46); await sleep(900);   // Auto in die rechte Spur: Sicht eines Fahrers, der rechts fährt
  await page.screenshot({ path: `${SC}/abzweig-${n}-${q.side}.png` });
  // durch den Abzweig fahren (Auto auf die Linie nach dem Abzweig setzen), Pfeil muss weggehen
  await place(q.s + 45); await sleep(2500); st = await state();
  if (st.on || st.nav) fail(`HUD-Pfeil nach dem Abbiegen noch an (${Math.round(q.s)})`);
}
for (const [k, q] of list.entries()) {
  n = k + 1;
  if (n === 1 || n === 3) for (const d of [40, 25, 10]) { await page.evaluate((s) => { const g = window.__rennspiel, r = g.session.course.route, p = r.at(s), lat = -(g.session.course.net.nearest(p.x, p.z)?.edge.half ?? 5) / 2, x = p.x + p.dz * lat, z = p.z - p.dx * lat; g.car.reset(x, z, Math.atan2(-p.dx, -p.dz)); }, q.s - d - 8); await sleep(900); await page.screenshot({ path: `${SC}/abzweig-${n}-${q.side}-${d}m.png` }); }
}
await page.keyboard.up('ArrowUp');
console.log(fails ? 'FEHLER: ' + fails : 'ok'); await b.close(); srv.kill(); process.exit(fails ? 1 : 0);

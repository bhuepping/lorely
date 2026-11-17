// Screenshots vom Netzverkehr, Fahrerhöhe: (1) Ampelkreuzung mit wartender Schlange, (2) Wohnstraße mit Verkehr.
// SC=<ordner> [VW VH] node tools/netshots.mjs (vorher npm run build). Spult den Verkehr in der Seite vor (traffic.step), bis eine Schlange steht.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC ?? '/tmp/net'; mkdirSync(SC, { recursive: true });
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4182', '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4182/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 500) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); } catch {} });
await page.goto('http://127.0.0.1:4182/'); await sleep(800);
await page.click('.rs-tile.world[title="Vorstadt"]'); if (!(await page.locator('button[data-level="etappe_vorstadt"].on').count())) await page.click('button[data-level="etappe_vorstadt"]'); await page.click('.rs-go');
await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
for (const mode of ['queue', 'wohn']) {
  const info = await page.evaluate(([mode, nth]) => {
    const g = window.__rennspiel, S = g.session, tr = g.traffic, T = S.course.terrain, sg = S.course.signals;
    // Kandidaten: Schlange (>= 2 stehende Autos vor einer Ampel) bzw. Wohnstraße mit Auto in 20…60 m
    const cand = () => {
      const out = [];
      for (const L of tr.lanes) {
        if (mode === 'queue') {
          if (!L.node.signal) continue;
          const q = L.cars.filter((c) => c.speed < 0.3 && L.length - c.s < 30).sort((a, b) => a.s - b.s);
          if (q.length >= 2 && q[0].s > 18) out.push({ L, back: q[0], n: q.length });
        } else if (L.edge.def.kind === 'wohn' && L.cars.length && L.length > 90) {
          const c = L.cars.find((c) => c.s > 40 && c.s < L.length - 40 && c.speed > 3); if (c) out.push({ L, back: c, n: 1 });
        }
      }
      return out;
    };
    let found = cand();
    for (let k = 0; k < 400 && !found.length; k++) { for (let i = 0; i < 480; i++) tr.step(1 / 120, g.car.pos[0], g.car.pos[2]); S.sigT += 4; found = cand(); }
    if (!found.length) return null;
    found.sort((a, b) => b.n - a.n); const f = found[Math.min(nth, found.length - 1)], L = f.L, c = f.back;
    const s0 = Math.max(2, c.s - (mode === 'queue' ? 16 : 20)), p = L.route.at(s0), lat = 0.9;   // Fahrerhöhe: in der Spur (rechts), 1,5 m über der Fahrbahn
    const cx = p.x - p.dz * 0 + p.dz * 0, cz = p.z;
    const ty = c.pc.route.at(Math.min(L.length, c.s + 14));
    g.freeCam = true; g.car.reset(p.x - p.dx * 12, p.z - p.dz * 12, Math.atan2(-p.dx, -p.dz)); g.car.launch(0);
    g.camera.position.set(cx, T.height(cx, cz) + 1.55, cz); g.camera.lookAt(ty.x, T.height(ty.x, ty.z) + 1.4, ty.z); g.camera.updateMatrixWorld();
    return { edge: L.edge.id, node: L.node.id, n: f.n, cars: tr.active, kinds: found.length, dc: g.calls };
  }, [mode, +(process.env.NTH ?? 0)]);
  console.log(mode, JSON.stringify(info));
  if (!info) continue;
  await page.evaluate(() => { window.__rennspiel.session.sigT -= 0; }); await sleep(700);
  await page.screenshot({ path: `${SC}/net-${mode}.png` });
  console.log(mode, JSON.stringify(await page.evaluate(() => ({ dc: window.__rennspiel.calls, act: window.__rennspiel.traffic?.active }))));
}
await b.close(); srv.kill();

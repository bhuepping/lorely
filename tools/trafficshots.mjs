// Screenshots mit Verkehr: SC=<ordner> SHOTS='[[welt, level, tag, "lead"|"onc", abstand]]' node tools/trafficshots.mjs (vorher vite build; DIST=<ordner> für andere Ausgabe)
// Setzt den Spieler hinter (lead) bzw. vor (onc) ein vorhandenes Verkehrsauto der gewählten Art. Viewport VW/VH (Standard 412x915).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC, shots = JSON.parse(process.env.SHOTS);
const srv = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort', ...(process.env.DIST ? ['--outDir', process.env.DIST] : [])], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4179/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 412), height: +(process.env.VH ?? 915) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); } catch {} });
await page.goto('http://127.0.0.1:4179/'); await sleep(800);
for (const [world, id, tag, mode, dist] of shots) {
  await page.click(`.rs-tile.world[title="${world}"]`); await page.click(`button[data-level="${id}"]`); await page.waitForSelector(`.rs-menu button[data-level="${id}"].on`); await page.click('.rs-go');
  await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
  const info = await page.evaluate(([mode, dist]) => {
    const g = window.__rennspiel, c = g.run.course, tr = g.traffic; if (!tr) return null;
    const cars = tr.cars.filter((k) => k.on && (mode === 'lead' ? k.dir > 0 : k.dir < 0) && k.sT > 60);
    if (!cars.length) return { none: true, active: tr.active };
    const k = cars[+(window.__pick ?? 0) % cars.length], H = g.session.course.terrain;
    // freie Kamera: hinter (lead) bzw. schräg vor (onc) dem Verkehrsauto, Auto im Blick
    const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw), y = H.height(k.x, k.z), d = mode === 'lead' ? -dist : dist;
    g.freeCam = true; g.camera.position.set(k.x + fx * d + fz * 3.2, y + 2.6, k.z + fz * d - fx * 3.2); g.camera.lookAt(k.x, y + 1, k.z); g.camera.updateMatrixWorld();
    g.car.reset(k.x + fx * (d > 0 ? 80 : -80), k.z + fz * (d > 0 ? 80 : -80), k.yaw);
    return { kind: k.kind, active: tr.active, s: k.sT };
  }, [mode, dist ?? 16]);
  console.log(tag, JSON.stringify(info));
  await sleep(+(process.env.WAIT ?? 350));
  await page.screenshot({ path: `${SC}/tr-${tag}.png` });
  console.log(tag, JSON.stringify(await page.evaluate(() => ({ dc: window.__rennspiel.calls, act: window.__rennspiel.traffic?.active, v: window.__rennspiel.car.speed }))));
  await page.evaluate(() => { window.__rennspiel.freeCam = false; }); await page.click('button[title="Pause"]'); await page.waitForSelector('#rs-pause:not(.hidden)'); await page.click('#rs-pause button.back'); await page.waitForSelector('.rs-menu:not(.hidden)');
}
await b.close(); srv.kill();

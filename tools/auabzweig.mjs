// Screenshots Au-Abzweig, Fahrerhöhe vor dem Abzweig + Sicht von oben. SC=<ordner> BACK=<m vor dem Knoten x_of> node tools/auabzweig.mjs (vorher npm run build).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC ?? '/tmp/au'; mkdirSync(SC, { recursive: true });
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4183', '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4183/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 500) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); } catch {} });
await page.goto('http://127.0.0.1:4183/'); await sleep(800);
await page.click('.rs-tile.world[title="Vorstadt"]'); if (!(await page.locator('button[data-level="etappe_vorstadt"].on').count())) await page.click('button[data-level="etappe_vorstadt"]'); await page.click('.rs-go');
await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
for (const [tag, back, up, ahead] of [['fahrer', +(process.env.BACK ?? 38), 1.55, 12], ['nah', 14, 1.55, 14], ['oben', 30, 34, 14]]) {
  const info = await page.evaluate(([back, up, ahead]) => {
    const g = window.__rennspiel, S = g.session, c = S.course, T = c.terrain, xo = c.net.nodes.get('x_of');
    let sOf = 0, bd = 1e9; for (let s = 0; s < c.length; s += 0.5) { const p = c.route.at(s), d = Math.hypot(p.x - xo.x, p.z - xo.z); if (d < bd) { bd = d; sOf = s; } }
    const p = c.route.at(sOf - back), q = c.route.at(sOf + ahead), y = T.height(p.x, p.z);
    S.traffic?.cars.forEach((k) => { k.on = false; });
    g.freeCam = true; g.car.reset(p.x - p.dx * 14, p.z - p.dz * 14, Math.atan2(-p.dx, -p.dz)); g.car.launch(0);
    g.camera.position.set(p.x - p.dz * 0.9, y + up, p.z + p.dx * 0.9); g.camera.lookAt(q.x, T.height(q.x, q.z) + (up > 5 ? 0 : 1.0), q.z); g.camera.updateMatrixWorld();
    return { sOf, cps: S.run.cps.list.filter((k) => Math.abs(k.s - sOf) < 90).map((k) => Math.round(sOf - k.s)), stars: c.stars.filter(([x, z]) => Math.hypot(x - xo.x, z - xo.z) < 30).length };
  }, [back, up, ahead]);
  console.log(tag, JSON.stringify(info)); await sleep(700);
  await page.screenshot({ path: `${SC}/au-${tag}.png` });
}
await b.close(); srv.kill();

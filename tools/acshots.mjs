// Screenshots: SC=<ordner> [ONLY=tag,..] node tools/acshots.mjs (vorher vite build)
//  Sterne: je Welt eine Kehre von oben (Freikamera). Ziel/Endkarte: Rennen fast zu Ende fahren (Auto vor dem Ziel aufstellen).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC, ONLY = process.env.ONLY?.split(',');
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4183', '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4183/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 560) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); } catch {} });
await page.goto('http://127.0.0.1:4183/'); await sleep(800);
const start = async (world, id) => {
  if (!(await page.isVisible(`button[data-level="${id}"]`))) await page.click(`button.rs-tile.world[data-world="${world}"]`);
  if (!(await page.locator(`button[data-level="${id}"].on`).count())) await page.click(`button[data-level="${id}"]`);
  await page.waitForSelector(`.rs-menu button[data-level="${id}"].on`); await page.click('.rs-go'); await page.waitForSelector('#rs-speed', { state: 'visible', timeout: 8000 }).catch(async (e) => { await page.screenshot({ path: `${SC}/fail.png` }); throw e; }); await sleep(300);
};
const back = async () => { await page.click('button[title="Pause"]'); await page.waitForSelector('#rs-pause:not(.hidden)'); await page.click('#rs-pause button.back'); await page.waitForSelector('.rs-menu:not(.hidden)'); };
const stars = [['snow', 'kehrenhang', 'schnee'], ['city', 'neonallee', 'city'], ['beach', 'etappe_strand', 'strand'], ['rhein', 'loreley', 'rhein'], ['offroad', 'huegel', 'offroad'], ['vorstadt', 'etappe_vorstadt', 'vorstadt']];
for (const [world, id, tag] of stars) {
  if (ONLY && !ONLY.includes('stars') && !ONLY.includes(tag)) continue;
  await start(world, id);
  const info = await page.evaluate(() => {
    const g = window.__rennspiel; g.freeCam = true; document.querySelectorAll('#rs-hud, .rs-hud').forEach((e) => (e.style.display = 'none'));
    const c = g.session.course, R = c.route; let best = -1, bs = 0;
    c.stars.forEach(([x, z], i) => { const s = R.nearest(x, z).s; if (s < 40 || s > R.length - 40) return; const a = R.at(s - 40), m = R.at(s), d = R.at(s + 40); let dh = Math.atan2(d.dz, d.dx) - Math.atan2(a.dz, a.dx); while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; if (Math.abs(dh) > best) { best = Math.abs(dh); bs = s; } });
    if (c.id === 'etappe_vorstadt') bs = 1430;
    const m = R.at(bs), T = c.terrain, h = T.height(m.x, m.z);
    g.car.reset(m.x, m.z, c.recover(bs).yaw);
    g.camera.up.set(0, 0, -1); g.camera.position.set(m.x, h + (c.free ? 130 : 110), m.z + 0.01); g.camera.lookAt(m.x, h, m.z);
    return { s: bs, ang: best, n: c.stars.length, id: c.id };
  });
  await sleep(1200);
  await page.screenshot({ path: `${SC}/sterne-${tag}.png` });
  console.log(tag, JSON.stringify(info));
  await page.evaluate(() => { window.__rennspiel.freeCam = false; window.__rennspiel.camera.up.set(0, 1, 0); document.querySelectorAll('#rs-hud, .rs-hud').forEach((e) => (e.style.display = '')); });
  await back();
}
await b.close(); srv.kill(); process.exit(0);

// Ampel-Screenshots: aus Fahrerhöhe jeder Zufahrt jeder Ampelkreuzung (grüne Phase), prüft per Pixelzählung, dass der Signalkopf zu sehen ist.
// SC=<ordner> [ONLY=x_hu] [VW VH] node tools/sigshots.mjs (vorher npm run build)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SC = process.env.SC ?? '/tmp/sig'; mkdirSync(SC, { recursive: true });
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', '4181', '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4181/')).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 900), height: +(process.env.VH ?? 500) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); } catch {} });
await page.goto('http://127.0.0.1:4181/'); await sleep(800);
await page.click('.rs-tile.world[title="Vorstadt"]'); if (!(await page.locator('button[data-level="etappe_vorstadt"].on').count())) await page.click('button[data-level="etappe_vorstadt"]'); await page.click('.rs-go');
await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
const heads = await page.evaluate(() => window.__rennspiel.session.course.signals.heads.map((h) => ({ k: h.k, id: (h.node ? h.node.id : 'ped') + '_' + h.edge.id + (h.dir > 0 ? 'p' : 'm') })));
let bad = 0;
for (const hd of heads) {
  if (process.env.ONLY && !hd.id.startsWith(process.env.ONLY)) continue;
  const want = hd.id.startsWith('ped') ? 'rot' : 'gruen';
  await page.evaluate(([k, want]) => {
    const g = window.__rennspiel, S = g.session, sg = S.course.signals, h = sg.heads[k], T = S.course.terrain;
    let t = 0; while (t < 200 && sg.phaseOf(k, t) !== (want === 'gruen' ? 0 : 2)) t += 0.5; S.sigT = t; g.freeCam = true; g.car.reset(0, 0, 0);
    const d = 22, cx = h.lx - h.tx * d + h.rx * h.half * 0.5, cz = h.lz - h.tz * d + h.rz * h.half * 0.5;
    g.camera.position.set(cx, T.height(cx, cz) + 1.5, cz); g.camera.lookAt(h.lx + h.tx * 6, T.height(h.lx, h.lz) + 3, h.lz + h.tz * 6);
  }, [hd.k, want]);
  await sleep(700);
  const buf = await page.screenshot({ path: `${SC}/sig-${hd.id}.png` });
  const n = await page.evaluate(async ([b64, want]) => {
    const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
    const x = c.getContext('2d'); x.drawImage(bm, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], bl = d[i + 2]; if (want === 'gruen' ? g > 200 && r < 120 && bl < 140 : r > 235 && g < 80 && bl < 70) n++; }
    return n;
  }, [buf.toString('base64'), want]);
  const ok = n >= 3; if (!ok) bad++;
  console.log(hd.id, want, n, ok ? 'ok' : 'FEHLT');
}
console.log(JSON.stringify(await page.evaluate(() => ({ dc: window.__rennspiel.calls }))));
await b.close(); srv.kill(); process.exit(bad ? 1 : 0);

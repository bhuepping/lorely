// Flimmer-Suche: je Kamerapose zwei Bilder mit minimal verschobener Kamera (a, b) und eines unverschoben (c, Rauschen).
// Aufruf: OUT=<ordner> MODE=bridge|car [CAR=0..3] [BRIDGE=0|1] [VW=640 VH=400] node tools/zfight.mjs   (vorher npm run build)
// Auswertung: python3 tools/zfight.py <ordner>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const OUT = process.env.OUT ?? '/tmp/zf', MODE = process.env.MODE ?? 'bridge', PORT = Number(process.env.PORT ?? 4183);
mkdirSync(OUT, { recursive: true });
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ locale: 'de-DE', viewport: { width: +(process.env.VW ?? 640), height: +(process.env.VH ?? 400) } });
page.on('pageerror', (e) => console.log('ERR', String(e)));
await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-scale', '1'); } catch {} });
await page.goto(`http://127.0.0.1:${PORT}/`); await sleep(800);
const world = process.env.WORLD ?? 'Vorstadt', level = process.env.LEVEL ?? 'etappe_vorstadt';
await page.click(`.rs-tile.world[title="${world}"]`); if (!(await page.locator(`button[data-level="${level}"].on`).count())) await page.click(`button[data-level="${level}"]`);
await page.locator('button.mode.car').nth(+(process.env.CAR ?? 0)).click();
await page.click('.rs-go'); await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(500);
await page.keyboard.press('KeyP'); await sleep(300);
await page.addStyleTag({ content: '#rs-pause,.rs-top,.rs-hud,#rs-hud,.rs-touch,.rs-fps,.rs-map,.rs-goal{display:none!important}' });
// Posen berechnen
const poses = await page.evaluate(([mode, bi]) => {
  const g = window.__rennspiel, S = g.session, T = S.course.terrain, out = [];
  if (mode === 'bridge') {
    const br = S.course.bridges[bi], r = br.route;
    for (const dir of [1, -1]) for (const back of [6, 14, 30, 60]) for (const h of [1.5, 3.3, 8]) {
      const sc = dir > 0 ? br.s0 - back : br.s1 + back, st = dir > 0 ? br.s0 + 12 : br.s1 - 12;   // Blick auf die Brücke bis zur Mitte
      const [cx, cz] = r.offset(sc, -1.5 * dir), [tx, tz] = r.offset(dir > 0 ? br.s1 + 40 : br.s0 - 40, -1.5 * dir);
      out.push({ n: `b${bi}_${dir > 0 ? 'f' : 'r'}${back}_h${h}`, p: [cx, br.deckY(dir > 0 ? br.s0 : br.s1) + h, cz], t: [tx, br.deckY(dir > 0 ? br.s1 : br.s0) + 1, tz] });
    }
    // auf dem Deck, Blick entlang
    for (const dir of [1, -1]) for (const off of [-3, 0, 3]) {
      const sc = br.def.s - dir * 6, [cx, cz] = r.offset(sc, off), [tx, tz] = r.offset(br.def.s + dir * 50, off * 0.5);
      out.push({ n: `b${bi}_deck${dir > 0 ? 'f' : 'r'}${off}`, p: [cx, br.deckY(sc) + 1.6, cz], t: [tx, br.deckY(br.def.s) + 0.5, tz] });
    }
    // seitlich/schräg von der Böschung und von unten (Wasserlinie)
    for (const sd of [1, -1]) for (const al of [-9, 0, 9]) { const [cx, cz] = r.offset(br.def.s + al, sd * 14), [tx, tz] = r.offset(br.def.s + al * 0.3, 0); out.push({ n: `b${bi}_side${sd}_${al}`, p: [cx, br.deckY(br.def.s) + 2.5, cz], t: [tx, br.deckY(br.def.s), tz] }); }
  } else {
    const c = S.car, p0 = [c.pos[0], c.pos[1], c.pos[2]];
    for (const el of [0.6, 1.4, 3, 6]) for (let k = 0; k < 8; k++) for (const R of [4.5]) { const a = k * Math.PI / 4; out.push({ n: `c_e${el}_a${k}_r${R}`, p: [p0[0] + Math.sin(a) * R, p0[1] + el, p0[2] + Math.cos(a) * R], t: [p0[0], p0[1] + 0.1, p0[2]] }); }
  }
  g.freeCam = true;
  return out;
}, [MODE, +(process.env.BRIDGE ?? 0)]);
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
let nOut = 0;
for (const po of poses) {
  if (only && !only.test(po.n)) continue;
  const set = (d) => page.evaluate(([p, t, d]) => { const g = window.__rennspiel, c = g.camera; c.position.set(p[0] + d, p[1] + d * 0.7, p[2] - d * 0.5); c.lookAt(t[0], t[1], t[2]); c.updateMatrixWorld(); }, [po.p, po.t, d]);
  if (MODE === 'car') await page.evaluate(() => { const g = window.__rennspiel; g.car.reset?.(g.car.pos[0], g.car.pos[2], 0); });
  await set(0); await sleep(250); await page.screenshot({ path: `${OUT}/${po.n}-a.png` });
  await set(0); await sleep(120); await page.screenshot({ path: `${OUT}/${po.n}-c.png` });
  await set(0.004); await sleep(120); await page.screenshot({ path: `${OUT}/${po.n}-b.png` });
  nOut++;
}
console.log('poses', nOut);
await b.close(); srv.kill();

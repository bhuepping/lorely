// App-Icon aus dem Spiel selbst: der Rallye-Wagen mit der echten Spielgeometrie, leicht quer in der Ecke der Vorstadt-Runde, Staubteilchen,
// dahinter die Straße. Hintergrund und Vordergrund entstehen aus zwei Bildern derselben Pose (mit und ohne Wagen/Teilchen).
// Aufruf (vorher npm run build): node tools/icon.mjs      -> 3 Varianten als Vorschau in $OUT (Standard /tmp/icon) + Übersicht sheet.png,
//   die Variante $PICK (Standard 3) wird als Android-Icon (mipmap-*, Hintergrundebene) und fastlane/.../icon.png (512) geschrieben.
// Adaptive Icons: Vordergrund (Wagen + Staub) liegt in der sicheren Mitte (Kreis, 66 % der 108-dp-Fläche), Hintergrund ist eine eigene Ebene.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const OUT = process.env.OUT ?? '/tmp/icon', PICK = Number(process.env.PICK ?? 3), PORT = Number(process.env.PORT ?? 4187);
const res = 'android/app/src/main/res';
mkdirSync(OUT, { recursive: true });
// Varianten: Blickrichtung relativ zum Wagen (vorn = 0, positiv = zur rechten Seite), Abstand, Höhe über dem Boden, Brennweite, Driftwinkel des Wagens
const VARIANTS = [
  { name: 'v1-vorne-rechts', az: 0.42, dist: 5.2, h: 0.3, fov: 46, slide: 0.5 },
  { name: 'v2-vorne-links', az: -0.42, dist: 5.6, h: 0.28, fov: 44, slide: 0.55 },
  { name: 'v3-hinten-rechts', az: 2.75, dist: 6.4, h: 0.7, fov: 44, slide: 0.5 },
];
const srv = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const SZ = 240;   // Spielpixel des Quellbilds (quadratisch)
const shots = [];
for (const v of VARIANTS) {
  const page = await b.newPage({ locale: 'de-DE', viewport: { width: SZ, height: SZ } });
  page.on('pageerror', (e) => console.log('ERR', String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-scale', '1'); } catch {} });
  await page.goto(`http://127.0.0.1:${PORT}/`); await sleep(800);
  await page.click('.rs-tile.world[title="Vorstadt"]'); if (!(await page.locator('button[data-level="etappe_vorstadt"].on').count())) await page.click('button[data-level="etappe_vorstadt"]');
  await page.locator('button.mode.car').nth(2).click();   // Rallye 4x4
  await page.click('.rs-go'); await page.waitForSelector('#rs-speed', { state: 'visible' });
  await page.addStyleTag({ content: '#rs-pause,.rs-top,.rs-hud,#rs-hud,.rs-touch,.rs-fps,.rs-map,.rs-goal,.rs-cd,#rs-cd,.rs-prog,#rs-prog{display:none!important}' });
  // Pose: Ecke am Ostende der Runde (Knoten x_of), Wagen fährt hinein und rutscht leicht quer
  await page.evaluate(([v]) => {
    const g = window.__rennspiel, S = g.session, c = S.course, xo = c.net.nodes.get('x_of');
    S.traffic?.cars.forEach((k) => { k.on = false; });
    let sOf = 0, bd = 1e9; for (let s = 0; s < c.length; s += 0.5) { const p = c.route.at(s), d = Math.hypot(p.x - xo.x, p.z - xo.z); if (d < bd) { bd = d; sOf = s; } }
    const p = c.route.at(sOf - 7), head = Math.atan2(-p.dx, -p.dz);
    g.freeCam = true; g.car.reset(p.x, p.z, head - v.slide); g.car.launch(0);
    const f = [-Math.sin(head), -Math.cos(head)]; g.car.vel = [f[0] * 17, 0, f[1] * 17];
    g.car.angVel = [0, -1.1, 0];
    window.__pose = { p, head, sOf };
  }, [v]);
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space');
  await sleep(1000);
  await page.evaluate(() => { const g = window.__rennspiel, fx = g.session.fx; for (let i = 0; i < 4; i++) fx.land(g.car, 14); });
  await sleep(450);
  // jetzt einfrieren (Pause), Kamera auf den Wagen setzen
  await page.keyboard.press('KeyP'); await sleep(200);
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight'); await page.keyboard.up('Space');
  const info = await page.evaluate(([v]) => {
    const g = window.__rennspiel, car = g.car, cam = g.camera, fw = g.car.axes().f, yaw = Math.atan2(-fw[0], -fw[2]);
    const a = yaw + v.az, cx = car.pos[0] + (-Math.sin(a)) * v.dist, cz = car.pos[2] + (-Math.cos(a)) * v.dist, gy = g.session.course.terrain.height(cx, cz);
    cam.fov = v.fov; cam.aspect = 1; cam.updateProjectionMatrix();
    cam.position.set(cx, Math.max(gy + v.h, gy + 0.25), cz); cam.lookAt(car.pos[0], car.pos[1] - 0.05, car.pos[2]); cam.updateMatrixWorld();
    return { speed: car.speed.toFixed(1), n: g.session.fx.points?.geometry?.drawRange };
  }, [v]);
  console.log(v.name, JSON.stringify(info));
  await sleep(400);
  const A = await page.screenshot();
  await page.evaluate(() => { const g = window.__rennspiel; g.carMesh.root.visible = false; g.session.fx.points.visible = false; });
  await sleep(300);
  const B = await page.screenshot();
  writeFileSync(`${OUT}/${v.name}-mit.png`, A); writeFileSync(`${OUT}/${v.name}-ohne.png`, B);
  shots.push([A, B]);
  await page.close();
}
// Zusammensetzen im Browser (Canvas): Maske = Pixel, die sich zwischen mit/ohne unterscheiden (Wagen und Staub)
const page = await b.newPage();
await page.setContent('<canvas id=c></canvas>');
const urls = shots.map(([A, B]) => [A.toString('base64'), B.toString('base64')]);
const outs = await page.evaluate(async ({ urls, SZ, sizes }) => {
  const load = (b64) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
  const out = [];
  for (const [a64, b64] of urls) {
    const A = await load(a64), B = await load(b64);
    const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const ca = cv(SZ), cb = cv(SZ); ca.getContext('2d').drawImage(A, 0, 0); cb.getContext('2d').drawImage(B, 0, 0);
    const da = ca.getContext('2d').getImageData(0, 0, SZ, SZ), db = cb.getContext('2d').getImageData(0, 0, SZ, SZ);
    let x0 = SZ, y0 = SZ, x1 = 0, y1 = 0;
    const fg = cv(SZ), fctx = fg.getContext('2d'), fd = fctx.createImageData(SZ, SZ);
    for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
      const i = (y * SZ + x) * 4; const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
      const al = Math.min(1, d / 40); if (al < 0.15) continue;
      for (let k = 0; k < 3; k++) fd.data[i + k] = Math.max(0, Math.min(255, (da.data[i + k] - db.data[i + k] * (1 - al)) / al));
      fd.data[i + 3] = Math.round(al * 255);
      if (d > 25) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    fctx.putImageData(fd, 0, 0);
    out.push({ fg, bg: cb, box: [x0, y0, x1, y1] });
  }
  window.__layers = out;
  // Ebenen: 108-Einheiten-Fläche; Vordergrund so skaliert, dass die Box in den Kreis mit 66 % Durchmesser passt, Mitte der Box = Mitte
  const render = (L, size, kind) => {
    const c = document.createElement('canvas'); c.width = c.height = Math.round(size); const g = c.getContext('2d'); g.imageSmoothingEnabled = size >= SZ * 0.9 ? false : true; g.imageSmoothingQuality = 'high';
    const [x0, y0, x1, y1] = L.box, bw = x1 - x0 + 1, bh = y1 - y0 + 1, diag = Math.hypot(bw, bh), cxs = (x0 + x1) / 2, cys = (y0 + y1) / 2;
    const k = size * 0.66 / diag;       // Quellpixel -> Zielpixel (Fläche = 108 dp = size)
    const drawLayer = (img, soft) => { g.save(); if (soft) g.filter = 'blur(' + Math.max(1, size / 70) + 'px) saturate(0.85) brightness(0.9)'; g.drawImage(img, size / 2 - cxs * k, size / 2 - cys * k, SZ * k, SZ * k); g.restore(); };
    if (kind === 'fg') { drawLayer(L.fg, false); return c; }
    if (kind === 'bg') { g.fillStyle = '#20242c'; g.fillRect(0, 0, size, size); const k2 = Math.max(k, size / SZ * 1.15); g.save(); g.filter = 'blur(' + Math.max(1, size / 60) + 'px) saturate(0.85) brightness(0.9)'; g.drawImage(L.bg, size / 2 - SZ * k2 / 2, size / 2 - SZ * k2 / 2 - size * 0.04, SZ * k2, SZ * k2); g.restore(); return c; }
    // legacy: Hintergrund + Vordergrund, auf 72/108 der Fläche beschnitten
    const full = render(L, size / 0.667, 'bg'), fgl = render(L, size / 0.667, 'fg'); const fc = full.getContext('2d'); fc.drawImage(fgl, 0, 0);
    const lc = document.createElement('canvas'); lc.width = lc.height = Math.round(size); const lg = lc.getContext('2d'); lg.imageSmoothingQuality = 'high';
    const m = (full.width - size) / 2; lg.drawImage(full, m, m, size, size, 0, 0, size, size);
    if (kind === 'round') { const rc = document.createElement('canvas'); rc.width = rc.height = Math.round(size); const rg = rc.getContext('2d'); rg.beginPath(); rg.arc(size / 2, size / 2, size / 2, 0, 7); rg.clip(); rg.drawImage(lc, 0, 0); return rc; }
    return lc;
  };
  window.__render = render;
  const res = [];
  for (let i = 0; i < out.length; i++) { const o = {}; for (const [name, size, kind] of sizes) o[name] = render(out[i], size, kind).toDataURL('image/png'); res.push(o); }
  // Übersicht: je Variante Hintergrund+Vordergrund (256), kleinste Größe 48 und rund
  const sheet = document.createElement('canvas'); sheet.width = out.length * 290; sheet.height = 330; const sg = sheet.getContext('2d'); sg.fillStyle = '#fff'; sg.fillRect(0, 0, sheet.width, sheet.height);
  out.forEach((L, i) => { const l = render(L, 256, 'legacy'), r = render(L, 48, 'legacy'), q = render(L, 48, 'round'); sg.drawImage(l, i * 290 + 17, 10); sg.drawImage(r, i * 290 + 17, 274); sg.drawImage(q, i * 290 + 80, 274); sg.drawImage(r, i * 290 + 160, 274, 24, 24); });
  res.sheet = sheet.toDataURL('image/png');
  return { res, sheet: sheet.toDataURL('image/png') };
}, { urls, SZ, sizes: [['preview', 432, 'legacy'], ['fgPreview', 432, 'fg'], ['bgPreview', 432, 'bg']] });
const save = (file, url) => { mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true }); writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); };
save(`${OUT}/sheet.png`, outs.sheet);
VARIANTS.forEach((v, i) => { save(`${OUT}/${v.name}-icon.png`, outs.res[i].preview); save(`${OUT}/${v.name}-fg.png`, outs.res[i].fgPreview); save(`${OUT}/${v.name}-bg.png`, outs.res[i].bgPreview); });
// gewählte Variante in die App schreiben
const jobs = [['fastlane/metadata/android/en-US/images/icon.png', 512, 'legacy']];
for (const [d, s] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  jobs.push([`${res}/mipmap-${d}/ic_launcher.png`, s, 'legacy'], [`${res}/mipmap-${d}/ic_launcher_round.png`, s, 'round'], [`${res}/mipmap-${d}/ic_launcher_foreground.png`, s * 9 / 4, 'fg'], [`${res}/drawable-${d}/ic_launcher_background.png`, s * 9 / 4, 'bg']);
}
const picked = await page.evaluate(async ({ idx, jobs }) => jobs.map(([f, s, k]) => [f, window.__render(window.__layers[idx], s, k).toDataURL('image/png')]), { idx: PICK - 1, jobs });
for (const [f, u] of picked) { save(f, u); console.log(f); }
await b.close(); srv.kill();

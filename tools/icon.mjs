// Icon aus der Pixelschrift des Spiels (5x7, Glyphen L und R aus src/pixel.ts nachgebaut): node tools/icon.mjs
// Schreibt fastlane/.../icon.png (512) und die Android-Icons (mipmap-*: legacy, rund, adaptiver Vordergrund) + Hintergrundfarbe.
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${PW}/${readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'))}/chrome-headless-shell-linux64/chrome-headless-shell`;
const BG = '#060a16', A = '#39e6ff', R = '#ff4a5a';
const res = 'android/app/src/main/res';
const jobs = [['fastlane/metadata/android/en-US/images/icon.png', 512, 'full']];
for (const [d, s] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  jobs.push([`${res}/mipmap-${d}/ic_launcher.png`, s, 'full'], [`${res}/mipmap-${d}/ic_launcher_round.png`, s, 'round'], [`${res}/mipmap-${d}/ic_launcher_foreground.png`, s * 9 / 4, 'fg']);
}
const b = await chromium.launch({ executablePath: exe });
const page = await b.newPage();
await page.setContent('<canvas id=c></canvas>');
for (const [file, size, kind] of jobs) {
  const url = await page.evaluate(([size, kind, BG, A, R]) => {
    const L = [16, 16, 16, 16, 16, 16, 31], Rr = [30, 17, 17, 30, 20, 18, 17];
    const c = document.getElementById('c'); c.width = c.height = Math.round(size); const g = c.getContext('2d');
    g.clearRect(0, 0, size, size);
    if (kind === 'round') { g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, 7); g.clip(); }
    if (kind !== 'fg') { g.fillStyle = BG; g.fillRect(0, 0, size, size); }
    // Raster: 17 Spalten LRL, 7 Zeilen, 2 Zeilen Abstand, 1 Zeile Straßenstrich; Vordergrund bleibt in der 66/108-Sicherheitszone
    const u = kind === 'fg' ? size * 0.60 / 17 : size * 0.76 / 17, W = 17 * u, H = 10 * u, x0 = (size - W) / 2, y0 = (size - H) / 2;
    const cell = (x, y, w, h) => { const l = Math.round(x0 + x * u), t = Math.round(y0 + y * u); g.fillRect(l, t, Math.round(x0 + (x + w) * u) - l, Math.round(y0 + (y + h) * u) - t); };
    g.fillStyle = A;
    [L, Rr, L].forEach((gl, k) => gl.forEach((row, y) => { for (let x = 0; x < 5; x++) if (row & (16 >> x)) cell(k * 6 + x, y, 1, 1); }));
    g.fillStyle = R;
    for (let x = 0; x < 17; x += 7) cell(x, 9, 3, 1);
    return c.toDataURL('image/png');
  }, [size, kind, BG, A, R]);
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log(file, Math.round(size));
}
writeFileSync(`${res}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
await b.close();

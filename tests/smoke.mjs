// Browser-Smoketest über den echten Weg: Build ausliefern, Seite öffnen, Pfeil-hoch halten, km/h steigt.
// Voraussetzung: `npm run build` (macht `npm test`). Browser: vorhandene Playwright-Installation.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
const clk = async (p) => { const [m, sec] = (await T(p, '#rs-time')).split(':').map(Number); return m * 60 + sec; };   // Uhr „m:ss“ in Sekunden
const T = (p, sel) => p.evaluate((q) => { const e = document.querySelector(q); return [...(e.matches('canvas.px') ? [e] : e.querySelectorAll('canvas.px'))].map((c) => c.dataset.t).join(' '); }, sel);
import { setTimeout as sleep } from 'node:timers/promises';

const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const shellDir = readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'));
const exe = `${PW}/${shellDir}/chrome-headless-shell-linux64/chrome-headless-shell`;
// Zählt Kartenpixel (dark = dunkler Rand des Straßenbands): Stern gelb, Checkpoint cyan, Weglinie hellgrau (#f2f2f2; das Start/Ziel-Karo ist reines Weiss)
const mapPx = (page, sel = '.rs-map') => page.evaluate((sel) => { const c = document.querySelector(sel + ' .map-cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let star = 0, cp = 0, line = 0, fork = 0, opaque = 0, dark = 0; const cols = new Set(); for (let i = 0; i < d.length; i += 4) { const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (!a) continue; opaque++; cols.add((r >> 4) + ',' + (g >> 4) + ',' + (b >> 4)); if (r === 255 && g === 217 && b === 59) star++; else if (r === 57 && g === 230 && b === 255) cp++; else if (r === 242 && g === 242 && b === 242) line++; else if (r < 50 && g < 50 && b < 50) dark++; else if (r === 255 && g === 159 && b === 67) fork++; } return { star, cp, line, dark, fork, w: c.width, opaque: opaque / (d.length / 4), cols: cols.size }; }, sel);
// kleine Karte antippen -> große Karte wächst in der Ecke oben rechts (≈ 45 % der kurzen Seite), Spiel läuft weiter (keine Pause), Foto + Overlay gemalt; Tipp auf die Karte verkleinert. Gibt die Messwerte der großen Karte zurück.
const bigMap = async (page, shot) => {
  if (!(await page.waitForFunction(() => window.__rsMap?.ok, null, { timeout: 40000 }).then(() => true, () => false))) await fail('Kartenfoto entsteht nicht: ' + JSON.stringify(await page.evaluate(() => window.__rsMap))); await page.waitForFunction(() => window.__rennspiel.session.sigT > 0.3, null, { timeout: 20000 }); await sleep(300);   // Foto entsteht kurz nach dem Start; Spiel läuft (Ampel vorbei: sigT zählt)
  const t0 = await page.evaluate(() => window.__rennspiel.session.sigT);
  await page.click('.rs-map'); await sleep(400);
  const o = await page.evaluate(() => { const b = document.querySelector('.rs-bigmap'), r = b.getBoundingClientRect(), pb = document.getElementById('rs-pause'); return { open: !b.classList.contains('hidden') && r.width > 60, corner: r.right > innerWidth * 0.85 && r.top < innerHeight * 0.4, paused: window.__rsPaused(), menu: !pb.classList.contains('hidden'), w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, arrow: getComputedStyle(b.querySelector('.dot')).clipPath !== 'none' }; });
  const m = await mapPx(page, '.rs-bigmap');
  if (shot) await page.screenshot({ path: shot });
  const t1 = await page.evaluate(() => window.__rennspiel.session.sigT); await sleep(600);
  const t2 = await page.evaluate(() => window.__rennspiel.session.sigT);
  await page.click('.rs-bigmap'); await sleep(400);   // Tipp auf die Karte verkleinert
  const c = await page.evaluate(() => ({ closed: document.querySelector('.rs-bigmap').classList.contains('hidden'), paused: window.__rsPaused() }));
  const t3 = await page.evaluate(() => window.__rennspiel.session.sigT); await sleep(700);
  const t4 = await page.evaluate(() => window.__rennspiel.session.sigT);
  if (!o.open || o.paused || o.menu || !o.corner || !o.inside || Math.abs(o.w - o.h) > 1 || Math.abs(o.w / Math.min(o.vw, o.vh) - 0.45) > 0.03 || !o.arrow) await fail('Große Karte: nicht offen/in der Ecke/45 %/im Bild oder pausiert: ' + JSON.stringify(o));
  if (m.opaque < 0.95 || m.cols < 25 || m.w < 150) await fail('Große Karte: Foto leer oder zu klein: ' + JSON.stringify(m));
  if (!(t2 > t1)) await fail(`Große Karte: Spiel steht bei offener Karte (Signaluhr) (${t1} -> ${t2})`);
  if (!c.closed || c.paused || !(t4 > t3)) await fail('Große Karte: Tipp schließt nicht oder Spiel läuft nicht weiter: ' + JSON.stringify([c, t3, t4, t0]));
  return m;
};
// große Karte in zwei Stufen. Mit Knopf: Nahansicht ums Auto (Pfeil in der Mitte, Weg sichtbar, Ausschnitt fährt mit dem Auto mit), zurück zur Übersicht; ohne Knopf (kleine Welt): kein Lupen-Element sichtbar. Spiel läuft immer weiter, Tipp verkleinert.
const nearMap = async (page, want, shotPre) => {
  if (!(await page.waitForFunction(() => window.__rsMap?.ok, null, { timeout: 40000 }).then(() => true, () => false))) await fail('Kartenfoto entsteht nicht'); await page.waitForFunction(() => window.__rennspiel.session.sigT > 0.3, null, { timeout: 20000 }); await sleep(300);
  await page.click('.rs-map'); await sleep(400);
  const st = () => page.evaluate(() => { const b = document.querySelector('.rs-bigmap'), z = b.querySelector('.zoom'), zr = z.getBoundingClientRect(), br = b.getBoundingClientRect(), d = b.querySelector('.dot'); return { btn: zr.width > 0, inside: zr.left >= br.left && zr.top >= br.top && zr.right <= br.right && zr.bottom <= br.bottom, pw: zr.width, title: z.title, on: z.classList.contains('on'), x: parseFloat(d.style.getPropertyValue('--x')), y: parseFloat(d.style.getPropertyValue('--y')), open: !b.classList.contains('hidden'), paused: window.__rsPaused() }; });
  const a = await st(); if (!a.open || a.paused) await fail('Karte: nicht offen oder Spiel pausiert: ' + JSON.stringify(a));
  if (!!a.btn !== want) await fail(`Karte: Lupen-Knopf ${a.btn}, erwartet ${want}: ` + JSON.stringify(a));
  if (want) {
    if (!a.inside || !a.title || a.on) await fail('Karte: Knopf nicht im Bild/ohne Tooltip: ' + JSON.stringify(a));
    const m0 = await mapPx(page, '.rs-bigmap'); if (shotPre) await page.screenshot({ path: `${shotPre}-uebersicht.png` });
    await page.click('.rs-bigmap .zoom'); await sleep(600);
    const b = await st(), m1 = await mapPx(page, '.rs-bigmap'); if (shotPre) await page.screenshot({ path: `${shotPre}-nah.png` });
    if (!b.open || b.paused) await fail('Karte Nah: Knopf schließt die Karte oder Spiel pausiert: ' + JSON.stringify(b));
    if (!b.on || b.title === a.title) await fail('Karte Nah: Knopf/Tooltip wechseln nicht: ' + JSON.stringify([a.title, b]));
    if (Math.abs(b.x - 50) > 1 || Math.abs(b.y - 50) > 1) await fail('Karte Nah: Auto-Pfeil nicht in der Mitte: ' + JSON.stringify(b));
    if (m1.opaque < 0.95 || m1.cols < 25 || !(m1.line > 0)) await fail('Karte Nah: Foto leer oder Weg fehlt: ' + JSON.stringify(m1));
    // Overlay stimmt: Weglinie liegt durch die Bildmitte (Auto steht auf dem Weg), Sterne in der Nähe sind gelb gezählt (Kontrolle: Übersicht hatte welche, wenn welche da sind)
    const mid = await page.evaluate(() => { const c = document.querySelector('.rs-bigmap .map-cv'), g = c.getContext('2d'), r = Math.round(c.width * 0.08), d = g.getImageData(c.width / 2 - r, c.width / 2 - r, 2 * r, 2 * r).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 242 && d[i + 1] === 242 && d[i + 2] === 242) n++; return n; });
    if (!(mid > 5)) await fail('Karte Nah: Weg nicht um das Auto: ' + mid);
    // Ausschnitt fährt mit: Auto gibt Gas, Pfeil bleibt in der Mitte, das Bild (Foto + Weg) ändert sich
    const hash = () => page.evaluate(() => { const c = document.querySelector('.rs-bigmap .map-cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; });
    const pos = () => page.evaluate(() => window.__rennspiel.session.car.pos.slice(0, 3).map(Math.round).join(','));
    const h0 = await hash(), p0 = await pos();
    await page.keyboard.down('ArrowUp'); await sleep(1800); await page.keyboard.up('ArrowUp'); await sleep(300);
    const h1 = await hash(), p1 = await pos(), f = await st();
    if (p0 === p1) await fail('Karte Nah: Auto fährt nicht (Test)');
    if (h0 === h1) await fail(`Karte Nah: Ausschnitt fährt nicht mit (${p0} -> ${p1})`);
    if (!f.open || f.paused || Math.abs(f.x - 50) > 1 || Math.abs(f.y - 50) > 1) await fail('Karte Nah: nach der Fahrt nicht mehr offen/mittig: ' + JSON.stringify(f));
    await page.click('.rs-bigmap .zoom'); await sleep(500);
    const c = await st(), m2 = await mapPx(page, '.rs-bigmap');
    if (c.on || c.title !== a.title || Math.abs(c.x - a.x) > 8 || Math.abs(c.y - a.y) > 8 || Math.abs(m2.line - m0.line) > m0.line * 0.1 + 20) await fail('Karte zurück: Übersicht nicht wiederhergestellt: ' + JSON.stringify([a, c, m0.line, m2.line]));
    console.log('Karte Nah:', JSON.stringify({ line: m1.line, star: m1.star, mid, pfeil: [b.x, b.y] }));
  }
  await page.click('.rs-bigmap', { position: { x: 60, y: 60 } }); await sleep(400);
  const e = await page.evaluate(() => ({ closed: document.querySelector('.rs-bigmap').classList.contains('hidden'), paused: window.__rsPaused() }));
  if (!e.closed || e.paused) await fail('Karte: Tipp verkleinert nicht: ' + JSON.stringify(e));
};
const SHOTS = process.env.SHOT_DIR || '/tmp/claude-1000/-home-bjoern-claude/c64cc155-436c-40c0-a272-3a30ed13aea1/scratchpad';
mkdirSync(SHOTS, { recursive: true });
const PORT = Number(process.env.PORT || 4173);
// Abschnitte einzeln: ONLY=kern,touch (Komma) oder SKIP=layout; ohne beides läuft alles. Namen: siehe `want('…')` unten.
const ONLY = process.env.ONLY?.split(',').filter(Boolean), SKIP = (process.env.SKIP || '').split(',');
const want = (n) => (!ONLY || ONLY.includes(n)) && !SKIP.includes(n);
// HUD oben hat nur Pause + Vollbild; Ton, ▦, Neigen, Menü, Kran liegen im Pause-Menü (echter Nutzerweg: erst Pause)
const openPause = async (p) => { if (!(await p.evaluate(() => window.__rsPaused()))) await p.click('button[data-act="pause"]'); await p.waitForSelector('#rs-pause:not(.hidden)'); };
const toMenu = async (p) => { await openPause(p); await p.click('#rs-pause button.back'); };
// Strecke wählen und starten: Kachel antippen wählt nur aus, GO startet (eine schon markierte Kachel startet direkt)
// jeder Abschnitt startet in der Auswahl (Zeitfahren), egal wo der vorige aufgehört hat
const home = async (p = page) => {
  if (await p.evaluate(() => document.querySelector('.rs-menu')?.classList.contains('hidden') ?? true)) await toMenu(p);
  await p.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
  if (!(await p.evaluate(() => document.querySelector('button[title^="Zeitfahren"]')?.classList.contains('on')))) await p.click('button[title^="Zeitfahren"]');
};
const pick = async (p, id, tap = false) => {
  const on = await p.evaluate((i) => !!document.querySelector(`button[data-level="${i}"]`)?.classList.contains('on'), id);
  if (!on) { if (tap) await p.tap(`button[data-level="${id}"]`); else await p.click(`button[data-level="${id}"]`); await p.waitForSelector(`.rs-menu button[data-level="${id}"].on`); }
  if (tap) await p.tap('.rs-go'); else await p.click('.rs-go');
};

// Bekannte Fehler: erwartet rot. Wird einer grün, schlägt der Test an -> Eintrag hier streichen.
const KNOWN_RED = new Set([]);
const verdict = async (key, problem) => {
  const known = KNOWN_RED.has(key);
  if (problem && !known) await fail(`${key}: ${problem}`);
  if (!problem && known) await fail(`${key}: unerwartet grün – aus KNOWN_RED streichen`);
  console.log(`${key}: ${problem ? 'ERWARTET ROT – ' + problem : 'ok'}`);
};
let page;
const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
const fail = async (msg) => { console.error('FAIL:', msg); await browser?.close(); srv.kill(); process.exit(1); };
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
  browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  page = await browser.newPage({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); localStorage.setItem('rs-debug', '1'); } catch {} });   // Startampel nur im eigenen Test; kein Auto-Vollbild (eigener Abschnitt 'vollbild')
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await sleep(1500);
  if (want('grund')) {
    let att = null; for (let i = 0; i < 30 && !att; i++) { att = await page.evaluate(() => window.__rsAttract()); if (!att) await sleep(200); }   // unter Last startet der Flug später
    if (!att) await fail('Titel: kein Kameraflug im Hintergrund');
    console.log('Titel-Hintergrund:', att);
    // Welt-Kachel antippen -> Titel-Hintergrund wechselt (Fade) zu dieser Welt und bleibt dort
    await page.click('.rs-tile.world[title="Strand"]');
    let bg = null; for (let i = 0; i < 40 && bg !== 'beach'; i++) { await sleep(250); bg = await page.evaluate(() => window.__rsAttractWorld()); }
    if (bg !== 'beach') await fail('Titel-Hintergrund wechselt nicht zur gewählten Welt: ' + bg);
    await page.click('.rs-tile.world[title="Schnee"]');
    bg = null; for (let i = 0; i < 40 && bg !== 'snow'; i++) { await sleep(250); bg = await page.evaluate(() => window.__rsAttractWorld()); }
    if (bg !== 'snow') await fail('Titel-Hintergrund wechselt nicht zurück: ' + bg);
    // Echter Weg: Auswahl -> Level „Waldweg“ antippen -> fahren
    await page.waitForSelector('.rs-menu:not(.hidden) button[data-level="waldweg"]');
    await page.click('button[title="Buggy"]');
    await pick(page, 'waldweg');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    await sleep(500);
    if (!(await page.evaluate(() => window.__rennspiel.carMesh.root.children.some((m) => m.material && m.material.color && m.material.color.getHex() === 0x2b2c30 && m.position.y < 0)))) await fail('Buggy: keine Bodenplatte');
    const v0 = Number(await T(page, '#rs-speed'));
    const t0 = await clk(page);
    await page.keyboard.down('ArrowUp');
    await sleep(1500);
    const shot = `${SHOTS}/rennspiel-smoke.png`;
    await page.screenshot({ path: shot });
    const v1 = Number(await T(page, '#rs-speed'));
    await page.keyboard.up('ArrowUp');
    await sleep(600);
    const fps = await T(page, '#rs-fps');
    const t1 = await clk(page);
    const calls = await page.evaluate(() => window.__rennspiel.calls);
    const surf = await T(page, '#rs-surface');
    const px = await page.evaluate(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; });
    console.log(`km/h vorher ${v0}, nach 1,5 s Gas ${v1}; Untergrund ${surf}; ${fps}; Canvas ${px.join('x')}; Uhr ${t0} -> ${t1} s; Draw Calls ${calls}; Screenshot ${shot}`);
    if (!(t1 > t0)) await fail(`Uhr zählt nicht hoch (${t0} -> ${t1})`);
    if (calls > 40) await fail(`zu viele Draw Calls: ${calls}`);
    // Partikel: Gas auf Schnee -> Schneegischt wird erzeugt und ist aktiv (1 Pool, in den dc enthalten)
    const fxs = await page.evaluate(() => { const f = window.__rennspiel.session.fx; return { alive: f.pool.alive, em: f.emitted, inScene: window.__rennspiel.scene.children.includes(f.points) }; });
    console.log(`Partikel: ${fxs.alive} aktiv, ${JSON.stringify(fxs.em)}`);
    if (!fxs.inScene || !((fxs.em.schnee ?? 0) + (fxs.em.staub ?? 0) > 20)) await fail('Partikel: kein Schneegischt/Staub beim Gasgeben: ' + JSON.stringify(fxs));
    if (!(v1 > v0 && v1 > 5)) await fail(`Geschwindigkeit stieg nicht (${v0} -> ${v1})`);
    if (px[0] > 700) await fail(`Auflösung nicht reduziert: ${px}`);
    if (errors.length) await fail('Konsolenfehler: ' + errors.join(' | '));
    // ── Vollbild: Knopf -> nur das Spiel im Vollbild (Header-Attrappe der Seite draußen, Spiel füllt den Viewport), nochmal -> raus ──
    await page.evaluate(() => { const h = document.createElement('div'); h.id = 'fake-header'; h.style.cssText = 'position:fixed;top:0;left:0;right:0;height:52px;background:#c00;z-index:99;pointer-events:none'; document.body.appendChild(h); });
    const rootH0 = await page.evaluate(() => document.getElementById('rennspiel').getBoundingClientRect().height);
    await page.evaluate(() => { window.__fsCalls = 0; const o = Element.prototype.requestFullscreen; Element.prototype.requestFullscreen = function (...a) { window.__fsCalls++; return o.apply(this, a); }; });
    await page.evaluate(() => { const b = document.querySelector('.rs-tools button[title^="Vollbild"]'); b.click(); b.click(); b.click(); });   // mehrfaches Antippen
    await sleep(400);
    const fsCalls = await page.evaluate(() => window.__fsCalls);
    if (fsCalls !== 1) await fail('requestFullscreen mehrfach aufgerufen: ' + fsCalls);
    const fs1 = await page.evaluate(() => ({ el: document.fullscreenElement && document.fullscreenElement.id, w: document.getElementById('rennspiel').getBoundingClientRect().width, h: document.getElementById('rennspiel').getBoundingClientRect().height, iw: innerWidth, ih: innerHeight, top: document.elementFromPoint(20, 20)?.closest('#rennspiel,#fake-header')?.id }));
    await page.click('.rs-tools button[title^="Vollbild"]'); await sleep(1500);
    const fs2 = await page.evaluate(() => !!document.fullscreenElement);
    console.log('Vollbild:', JSON.stringify(fs1), fs2);
    if (fs1.el !== 'rennspiel' || fs1.w !== fs1.iw || fs1.h !== fs1.ih || fs1.top === 'fake-header' || fs2) await fail('Vollbild-Knopf: ' + JSON.stringify([fs1, fs2]));
    await page.evaluate(() => document.getElementById('fake-header').remove());
    if (await page.evaluate(() => window.__rsPaused())) await page.click('button[title="Weiter"]');   // Vollbild verlassen pausiert
    void rootH0;
    // ── Ton: nach Tastendruck läuft der AudioContext, Taste schaltet aus und merkt es ──
    const st = await page.evaluate(() => window.__rennspiel.audio.ctx?.state);
    const sndOn = await page.evaluate(async () => { const a = window.__rennspiel.audio; await new Promise((r) => setTimeout(r, 300)); return [a.ctx?.state, a.ctx?.currentTime > 0]; });
    console.log(`Ton: ${st} / ${sndOn}`);
    if (sndOn[0] !== 'running' || !sndOn[1]) await fail(`AudioContext läuft nicht (${sndOn})`);
    if (!(await page.evaluate(() => window.__rennspiel.audio.live && window.__rennspiel.audio.level > 0))) await fail('Motorsound während der Fahrt nicht aktiv');
    await openPause(page);
    await page.click('button[title="Ton an/aus"]'); await sleep(200);
    const off = await page.evaluate(() => [window.__rennspiel.audio.ctx.state, localStorage.getItem('rs-sound'), document.querySelector('button[title="Ton an/aus"] canvas').dataset.t]);
    if (off[0] !== 'suspended' || off[1] !== '0' || off[2] !== '{mute}') await fail(`Ton-Taste: ${off}`);
    await page.click('button[title="Ton an/aus"]'); await sleep(200);
    if ((await page.evaluate(() => window.__rennspiel.audio.ctx.state)) !== 'running') await fail('Ton ließ sich nicht wieder einschalten');
    await page.click('button[title="Weiter"]');

    // ── Minimap: sichtbar, Punkt bewegt sich beim Fahren, immer an, Antippen ändert nichts ──
    {
      await page.keyboard.down('ArrowUp'); await sleep(800);
      const m0 = await page.evaluate(() => { const b = document.querySelector('.rs-map'); const r = b.getBoundingClientRect(); return { vis: r.width > 20 && !b.classList.contains('off'), p: b.querySelector('.dot').dataset.p }; });
      await sleep(2500);
      const m1 = await page.evaluate(() => document.querySelector('.rs-map .dot').dataset.p);
      await page.keyboard.up('ArrowUp');
      if (!m0.vis || !m0.p || m0.p === m1) await fail('Minimap: nicht sichtbar oder Punkt bewegt sich nicht: ' + JSON.stringify([m0, m1]));
      // Zeitfahren – die Karte zeigt Checkpoints + Weglinie, keine Sterne; ein Checkpoint, durch den man fährt, verschwindet von der Karte
      const mp0 = await mapPx(page); await page.locator('.rs-map').screenshot({ path: `${SHOTS}/rennspiel-karte-strasse.png` });
      const mb = await bigMap(page, `${SHOTS}/rennspiel-karte-strasse-gross.png`);
      if (!(mb.star === 0 && mb.cp > 0 && mb.line > 0)) await fail('Große Karte Straße: Checkpoints/Linie fehlen oder Sterne da: ' + JSON.stringify(mb));
      await page.evaluate(() => { const g = window.__rennspiel, r = g.run, a = r.cps.list[r.cps.got.indexOf(0)]; g.car.reset(a.x, a.z, r.course.route.yawAt(a.s)); });
      await sleep(500);
      const mp1 = await mapPx(page);
      if (!(mp0.star === 0 && mp0.cp > 0) || !(mp1.cp < mp0.cp)) await fail('Minimap: Checkpoints fehlen, Sterne da oder Checkpoint verschwindet nicht: ' + JSON.stringify([mp0, mp1]));
      console.log('Minimap: ok', m0.p, '->', m1, JSON.stringify([mp0, mp1]));
    }
    // ── Pause: Uhr und Auto stehen, Weiter läuft wieder; Tab im Hintergrund pausiert; P-Taste ──
    await page.keyboard.down('ArrowUp'); await sleep(1000);
    const PS = () => page.evaluate(() => ({ st: window.__rennspiel.run.stars, t: window.__rennspiel.run.elapsed, x: window.__rennspiel.car.pos[0], z: window.__rennspiel.car.pos[2], paused: window.__rsPaused(), vis: !document.getElementById('rs-pause').classList.contains('hidden') }));
    await page.click('button[data-act="pause"]'); await sleep(250);
    const q1 = await PS(); await sleep(1300); const q2 = await PS();
    if (!q1.paused || !q1.vis || q1.t !== q2.t || q1.x !== q2.x || q1.z !== q2.z) await fail('Pause friert nicht ein: ' + JSON.stringify([q1, q2]));
    await page.click('button[title="Weiter"]'); await sleep(1500);
    const q3 = await PS();
    if (q3.paused || q3.vis || !(q3.t > q2.t + 0.4) || Math.hypot(q3.x - q2.x, q3.z - q2.z) < 1) await fail('Weiter läuft nicht (oder Zeitsprung): ' + JSON.stringify([q2, q3]));
    if (q3.t - q2.t > 4) await fail('Zeitsprung nach der Pause: ' + (q3.t - q2.t));
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    if (!(await PS()).paused) await fail('Tab im Hintergrund pausiert nicht');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
    await page.keyboard.press('KeyP'); await sleep(200);
    if ((await PS()).paused) await fail('P-Taste setzt nicht fort');
    await page.keyboard.up('ArrowUp');
    console.log('Pause: ok');

  }
  // ── Kern (quick): je Welt eine Strecke – Auswahl -> GO -> Gas; keine Fehler, Draw Calls im Rahmen ──
  if (want('kern')) {
    for (const [world, id] of [['Schnee', 'waldweg'], ['City', 'neonallee'], ['Strand', 'promenade'], ['Rhein', 'uferstrasse']]) {
      await home(); await page.click(`.rs-tile.world[title="${world}"]`); await pick(page, id);
      await page.waitForSelector('#rs-speed', { state: 'visible' });
      await page.keyboard.down('ArrowUp'); await sleep(2200);
      const m = await page.evaluate(() => ({ dc: window.__rennspiel.calls, kmh: document.getElementById('rs-speed').dataset.t }));
      await page.keyboard.up('ArrowUp');
      console.log(`Kern ${world}/${id}: ${m.kmh} km/h, ${m.dc} dc`);
      if (m.dc > 45) await fail(`Kern ${id}: zu viele Draw Calls ${m.dc}`);
      if (!(Number(m.kmh) > 8)) await fail(`Kern ${id}: Auto fährt nicht (${m.kmh})`);
      if (errors.length) await fail(`Kern ${id}: Konsolen-/JS-Fehler: ` + errors.join(' | '));
    }
  }
  if (want('ansicht')) {   // Rückwärts-Kamera + Ansichten-Knopf auf dem echten Fahrweg
    await home(); await page.click('.rs-tile.world[title="Schnee"]'); await pick(page, 'waldweg');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    const CAM = () => page.evaluate(() => { const r = window.__rennspiel, c = r.car, V = r.camera.position.constructor; const n = new V(c.pos[0], c.pos[1] + 0.6, c.pos[2]).project(r.camera); return { h: r.camera.position.y - c.pos[1], fv: c.forwardSpeed, ndc: [n.x, n.y, n.z], vis: r.carMesh.root.visible, view: r.view, fov: r.camera.fov, title: document.querySelector('[data-act=view]').title }; });
    await page.keyboard.down('ArrowUp'); await sleep(3500);
    const f0 = await CAM(); await page.keyboard.up('ArrowUp');
    await page.keyboard.down('ArrowDown');
    let b = await CAM(); for (let i = 0; i < 60 && !(b.fv < -1.5); i++) { await sleep(150); b = await CAM(); }
    await sleep(1200); b = await CAM(); await page.screenshot({ path: `${SHOTS}/rennspiel-ansicht-rueckwaerts.png` });
    await page.keyboard.up('ArrowDown');
    console.log('Rückwärts-Kamera: Höhe', f0.h.toFixed(1), '->', b.h.toFixed(1), 'ndc', b.ndc.map((v) => v.toFixed(2)).join(','));
    if (!(b.fv < -1) || !(b.h > 12) || Math.abs(b.ndc[0]) > 0.9 || Math.abs(b.ndc[1]) > 0.9 || b.ndc[2] > 1) await fail('Rückwärts-Kamera: ' + JSON.stringify([f0, b]));
    await page.keyboard.down('ArrowUp'); await sleep(3000); let f1 = await CAM(); for (let i = 0; i < 30 && !(f1.fv > 3 && f1.h < f0.h + 1.2); i++) { await sleep(200); f1 = await CAM(); } await page.keyboard.up('ArrowUp');
    if (!(f1.fv > 3) || !(f1.h < f0.h + 1.2)) await fail('Kamera kehrt vorwärts nicht zurück: ' + JSON.stringify([f0, f1]));
    // Ansichten-Knopf (Auge): Folgen -> Dach -> Folgen
    const seen = [f1];
    for (const nm of ['dach', 'folgen']) {
      await page.click('[data-act=view]'); await sleep(900);
      await page.screenshot({ path: `${SHOTS}/rennspiel-ansicht-${nm}.png` }); seen.push(await CAM());
    }
    console.log('Ansichten:', seen.map((c) => `${c.view}:${c.h.toFixed(1)}m fov${Math.round(c.fov)} "${c.title}"`).join(' | '));
    const [v0, v1, v2] = seen;
    if (v1.view !== 1 || v1.vis || v1.h > 2.5 || Math.round(v1.fov) !== 75) await fail('Dachansicht: ' + JSON.stringify(v1));
    if (v2.view !== 0 || !v2.vis || v0.title === v1.title || v2.title !== v0.title) await fail('Ansichten-Knopf: ' + JSON.stringify(seen));
    if (errors.length) await fail('Ansicht: Konsolen-/JS-Fehler: ' + errors.join(' | '));
  }
  if (want('stadt')) { await home();
    // ── Nachtstadt: Welt-Kachel antippen, jedes Level fahren, Screenshot, Draw Calls / fps ──
    await page.waitForSelector('.rs-menu:not(.hidden)');
    await page.click('.rs-tile.world[title="City"]');
    for (const id of ['neonallee', 'hochhausring', 'regenfahrt']) {
      await pick(page, id);
      await page.waitForSelector('#rs-speed', { state: 'visible' });
      await page.keyboard.down('ArrowUp'); await sleep(3500);
      await page.screenshot({ path: `${SHOTS}/rennspiel-stadt-${id}.png` });
      const m = await page.evaluate(() => ({ dc: window.__rennspiel.calls, fps: document.getElementById('rs-fps').dataset.t, kmh: document.getElementById('rs-speed').dataset.t, rain: (() => { const r = window.__rennspiel.session.rain; return r ? { f: r.f, vis: r.mesh.visible } : null; })() }));
      await page.keyboard.up('ArrowUp');
      if (process.env.DCDEBUG) console.log(await page.evaluate(() => { const o = {}; window.__rennspiel.scene.traverse((m) => { if (m.isMesh) { const k = m.geometry.type + ':' + (m.material.map ? 'map' : m.material.vertexColors ? 'vc' : 'm'); o[k] = (o[k] || 0) + 1; } }); return JSON.stringify(o); }));
      if (id === 'neonallee') {   // Kran-Haken: 30 m vor den weitesten Punkt, nicht an den Start
        const before = await page.evaluate(() => ({ s: window.__rennspiel.run.tracker.s, m: window.__rennspiel.run.tracker.maxS, t: window.__rennspiel.run.elapsed, st: window.__rennspiel.run.stars }));
        await openPause(page); await page.click('#rs-pause button[title^="Zurück auf die"]'); await sleep(400);
        const after = await page.evaluate(() => ({ s: window.__rennspiel.run.tracker.s, v: window.__rennspiel.car.speed, t: window.__rennspiel.run.elapsed, st: window.__rennspiel.run.stars, lat: Math.abs(window.__rennspiel.run.tracker.lat) }));
        const plus = await T(page, '.rs-plus');
        if (plus !== '+3') await fail('Kran-Strafe nicht im HUD: ' + plus);
        console.log(`Haken: s ${before.s.toFixed(0)} -> ${after.s.toFixed(0)}, v ${after.v.toFixed(1)}, Uhr ${before.t.toFixed(1)} -> ${after.t.toFixed(1)}`);
        if (!(before.s > 40 && after.s > before.m - 34 && after.s < before.m - 26 && after.v < 3 && after.lat < 1 && after.t - before.t > 2.9 && after.t - before.t < 6)) await fail('Haken setzt nicht auf die Strecke zurück: ' + JSON.stringify([before, after]));
      }
      console.log(`Stadt ${id}: ${m.kmh} km/h, ${m.fps}, ${m.dc} dc`);
      if (id === 'regenfahrt' && !(m.rain && m.rain.vis && m.rain.f > 0.9)) await fail('Regenfahrt: Regen nicht aktiv ' + JSON.stringify(m.rain));
      if (id === 'neonallee' && m.rain && m.rain.f > 0.01) await fail('Neonallee: Regen am Start (trocken) ' + JSON.stringify(m.rain));
      if (m.dc > 45) await fail(`Stadt ${id}: zu viele Draw Calls ${m.dc}`);
      if (!(Number(m.kmh) > 20)) await fail(`Stadt ${id}: Auto fährt nicht (${m.kmh})`);
      await toMenu(page);
      await page.waitForSelector('.rs-menu:not(.hidden)');
    }
    if (errors.length) await fail('Konsolenfehler Stadt: ' + errors.join(' | '));

  }
  if (want('strand')) { await home();
    // ── Strand: Welt-Kachel antippen, jedes Level fahren (mit Rallye-Auto), Screenshot, Draw Calls / fps ──
    await page.click('.rs-tile.world[title="Strand"]');
    for (const [id, surfName, tDrive] of [['promenade', 'Holz', 1800], ['wasserlinie', 'Nasser Sand|Weicher Sand', 3500], ['duenenpfad', 'Nasser Sand|Weicher Sand', 3500]]) {   // Promenade: nur kurz geradeaus (danach kommt der Schwung)
      await pick(page, id);
      await page.waitForSelector('#rs-speed', { state: 'visible' });
      await page.keyboard.down('ArrowUp'); await sleep(tDrive);
      await page.screenshot({ path: `${SHOTS}/rennspiel-strand-${id}.png` });
      const m = await page.evaluate(() => ({ dc: window.__rennspiel.calls, fps: document.getElementById('rs-fps').dataset.t, kmh: document.getElementById('rs-speed').dataset.t, surf: document.getElementById('rs-surface').dataset.t, name: window.__rennspiel.car.p.name }));
      await page.keyboard.up('ArrowUp');
      console.log(`Strand ${id}: ${m.name} ${m.kmh} km/h, ${m.surf}, ${m.fps}, ${m.dc} dc`);
      if (m.dc > 45) await fail(`Strand ${id}: zu viele Draw Calls ${m.dc}`);
      if (!(Number(m.kmh) > 20)) await fail(`Strand ${id}: Auto fährt nicht (${m.kmh})`);
      if (!surfName.split('|').includes(m.surf)) await fail(`Strand ${id}: Untergrund ${m.surf}, erwartet ${surfName}`);   // Sandstreifen: je nach Bildrate schon im weichen Sand
      await toMenu(page);
      await page.waitForSelector('.rs-menu:not(.hidden)');
    }
  }
  if (want('absaufen')) { await home(); await page.click('.rs-tile.world[title="Strand"]');
    // ── Absaufen: ins Meer fahren -> steht, Kran blinkt -> Kran -> wieder fahrbar ──
    await pick(page, 'wasserlinie');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    await sleep(300);
    const placed = await page.evaluate(() => {   // Startpunkt 25 m vor dem Wasser (Debug-Platzierung), Fahren dann nur per Tastatur
      const c = window.__rennspiel.car, t = c.terrain, x0 = c.pos[0], z0 = c.pos[2];
      for (const dir of [1, -1]) for (let d = 0; d < 250; d++) if (t.height(x0 + dir * d, z0) < -1.3) { c.reset(x0 + dir * (d - 25), z0, dir > 0 ? -Math.PI / 2 : Math.PI / 2); return { dir, d }; }
      return null;
    });
    if (!placed) await fail('Absaufen: kein Meer gefunden');
    await page.keyboard.down('ArrowUp');
    for (let i = 0; i < 40 && !(await page.evaluate(() => window.__rennspiel.car.drowned)); i++) await sleep(500);   // je nach Last (fps) dauert es unterschiedlich lang
    await sleep(300);
    const D1 = await page.evaluate(() => ({ drowned: window.__rennspiel.car.drowned, v: window.__rennspiel.car.speed, alert: document.querySelector('button[title^="Zurück auf"]').classList.contains('alert'), x: window.__rennspiel.car.pos[0] }));
    await sleep(1500);
    const D2 = await page.evaluate(() => ({ x: window.__rennspiel.car.pos[0], v: window.__rennspiel.car.speed }));
    await page.keyboard.up('ArrowUp');
    console.log('Absaufen:', JSON.stringify([placed, D1, D2]));
    if (!D1.drowned || !(D1.v < 0.8) || !D1.alert || Math.abs(D2.x - D1.x) > 1.5) await fail('Absaufen: Auto steht nicht/Kran blinkt nicht ' + JSON.stringify([D1, D2]));
    await page.click('button[title^="Zurück auf"]'); await sleep(300);
    await page.keyboard.down('ArrowUp'); await sleep(1500);
    const D3 = await page.evaluate(() => ({ drowned: window.__rennspiel.car.drowned, v: window.__rennspiel.car.speed, alert: document.querySelector('button[title^="Zurück auf"]').classList.contains('alert') }));
    await page.keyboard.up('ArrowUp');
    if (D3.drowned || D3.alert || !(D3.v > 3)) await fail('Absaufen: nach dem Kran nicht wieder fahrbar ' + JSON.stringify(D3));
    await toMenu(page);
    await page.waitForSelector('.rs-menu:not(.hidden)');
    if (errors.length) await fail('Konsolenfehler Strand: ' + errors.join(' | '));

  }
  if (want('kippen')) { await home();
    // ──: Offroad Hügel, Auto auf dem Dach (Debug-Platzierung, langsam) -> bleibt liegen (kein Aufrichten), Kran blinkt -> Kran-Tipp stellt es wieder auf die Räder ──
    await page.click('.rs-tile.world[title="Offroad"]');
    await pick(page, 'huegel');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    await page.evaluate(() => { const c = window.__rennspiel.car; c.reset(c.pos[0], c.pos[2], 0); c.q = [0, 0, 1, 0]; c.pos[1] += 1.2; });   // 180° um die Längsachse: Dach unten
    await sleep(3000);
    const K1 = await page.evaluate(() => { const c = window.__rennspiel.car; return { up: c.axes().u[1], v: c.speed, alert: document.querySelector('button[title^="Zurück auf"]').classList.contains('alert') }; });
    await sleep(1500);
    const K2 = await page.evaluate(() => window.__rennspiel.car.axes().u[1]);
    console.log('Kippen:', JSON.stringify([K1, K2]));
    if (!(K1.up < 0.35) || !K1.alert || !(K2 < 0.35)) await fail('Kippen: Auto liegt nicht/Kran blinkt nicht ' + JSON.stringify([K1, K2]));
    await page.click('button[title^="Zurück auf"]'); await sleep(600);
    const K3 = await page.evaluate(() => ({ up: window.__rennspiel.car.axes().u[1], alert: document.querySelector('button[title^="Zurück auf"]').classList.contains('alert') }));
    if (!(K3.up > 0.9) || K3.alert) await fail('Kippen: Kran stellt das Auto nicht auf ' + JSON.stringify(K3));
    await toMenu(page);
    await page.waitForSelector('.rs-menu:not(.hidden)');
  }
  if (want('rallye')) { await home();
    // ── Rallye 4x4 über das Menü wählen (echter Nutzerweg), fahren, merken ──
    await page.click('.rs-tile.world[title="Schnee"]');
    await page.click('button[title="Rallye 4x4"]');
    await pick(page, 'waldweg');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    await sleep(400);
    const rv0 = Number(await T(page, '#rs-speed'));
    await page.keyboard.down('ArrowUp'); await sleep(2500);
    await page.screenshot({ path: `${SHOTS}/rennspiel-rallye.png` });
    const rally = await page.evaluate(() => ({ name: window.__rennspiel.car.p.name, drive: window.__rennspiel.car.p.drive, kmh: document.getElementById('rs-speed').dataset.t, dc: window.__rennspiel.calls, saved: localStorage.getItem('rs-car') }));
    await page.keyboard.up('ArrowUp');
    // Autolichter im echten Fahrweg: Bremse -> Bremslicht, danach Rückwärts -> Rückfahrlicht
    const LI = () => page.evaluate(() => { const m = window.__rennspiel.carMesh; return { brake: m.lit.brake, rev: m.lit.reverse, red: m.tailRed(), v: window.__rennspiel.car.forwardSpeed }; });
    await sleep(300);
    const l0 = await LI();
    await page.keyboard.down('ArrowDown'); await sleep(400);
    const l1 = await LI();
    let l2 = l1; for (let i = 0; i < 40 && !(l2.v < -0.5); i++) { await sleep(150); l2 = await LI(); }
    await page.keyboard.up('ArrowDown'); await sleep(300);
    const l3 = await LI();
    console.log('Lichter:', JSON.stringify([l0, l1, l2, l3].map((l) => [l.brake, l.rev, +l.red.toFixed(2)])));
    if (l0.brake || !(l0.red < 0.6) || !l1.brake || !(l1.red > 0.9) || l1.rev || !l2.rev || l3.brake) await fail('Autolichter: ' + JSON.stringify([l0, l1, l2, l3]));
    console.log(`Rallye: ${rally.name} ${rally.drive}, ${rv0} -> ${rally.kmh} km/h, ${rally.dc} dc, gemerkt ${rally.saved}`);
    if (rally.name !== 'Rallye 4x4' || rally.drive !== 'AWD' || rally.saved !== 'rally' || !(Number(rally.kmh) > 25) || rally.dc > 40) await fail('Rallye-Auto: ' + JSON.stringify(rally));
    if (!(await page.evaluate(() => window.__rennspiel.carMesh.root.children.some((m) => m.material && m.material.color && m.material.color.getHex() === 0x2b2c30 && m.position.y < 0)))) await fail('Rallye: keine Bodenplatte');
    const wheelCols = await page.evaluate(() => window.__rennspiel.carMesh.wheels.map((w) => w.spin.material.color.getHex()));
    if (new Set(wheelCols).size !== 1 || wheelCols[0] === 0xff2a1a) await fail('Räder im Rennen nicht einheitlich/normal: ' + wheelCols);
    await toMenu(page);
    await page.waitForSelector('.rs-menu:not(.hidden)');
    const sel = await page.evaluate(() => [...document.querySelectorAll('.rs-menu button.mode.on')].map((b) => b.title));
    if (!sel.includes('Rallye 4x4')) await fail('Menü merkt das Rallye-Auto nicht: ' + sel);

  }
  if (want('ziel')) { await home();
    // ── Ziel: Offroad-Matschgrube im Zeitfahren (dann im Sammeln), 4 m vor dem letzten Jeep-Stern (liegt im Hohlweg, ~30 m vor dem Ziel) auf dem guten Weg aufgestellt (Debug-Platzierung), geradeaus fahren -> Stern, Endanzeige, Bestzeit in der Auswahl ──
    await page.click('button[title="Rallye 4x4"]');   // Endkarte/Kachel erwarten das Rallye-Symbol
    await page.click('.rs-tile.world[title="Offroad"]');
    await pick(page, 'matschgrube');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    const place = () => page.evaluate(() => { const g = window.__rennspiel, c = g.run.course, st = c.stars.reduce((m, q) => (Math.hypot(q[0] - c.goal.x, q[1] - c.goal.z) < Math.hypot(m[0] - c.goal.x, m[1] - c.goal.z) ? q : m)), d = Math.hypot(c.goal.x - st[0], c.goal.z - st[1]), a = { x: st[0] - (c.goal.x - st[0]) / d * 4, z: st[1] - (c.goal.z - st[1]) / d * 4 }; g.car.reset(a.x, a.z, Math.atan2(-(c.goal.x - a.x), -(c.goal.z - a.z))); });;   // Blick genau aufs Ziel (am Rand der Welt würde sonst der Randschutz auslösen)
    await place();
    { const mo = await mapPx(page); if (mo.star !== 0 || mo.cp !== 0) await fail('Minimap Offroad (Zeitfahren): weder Sterne noch Checkpoints erwartet: ' + JSON.stringify(mo)); await page.screenshot({ path: `${SHOTS}/rennspiel-karte-offroad.png` }); }
    await page.keyboard.down('ArrowUp');
    // Ziel: Fahrzeit groß („2:41,3“) + Konfetti, dann die Endkarte (mit derselben Zeit)
    await page.waitForSelector('#rs-finish:not(.hidden)', { timeout: 60000 });
    // 0,5 s nach der Ziellinie muss das Konfetti im Bild zu sehen sein (viele satte, bunte Bildpunkte – Rot/Gelb/Cyan/Grün/Rosa, kein Schnee/Asphalt)
    await sleep(300);
    const shotBuf = await page.screenshot({ path: `${SHOTS}/rennspiel-konfetti.png` });
    const conf = Number(spawnSync('python3', ['-c', 'import sys,io;from PIL import Image;im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("HSV");w,h=im.size;px=im.load();print(sum(1 for y in range(215) for x in range(260,w) if px[x,y][1]>170 and px[x,y][2]>170))'], { input: shotBuf }).stdout.toString().trim());
    console.log('Konfetti-Pixel:', conf);
    if (!(conf > 600)) await fail('Konfetti 0,5 s nach dem Ziel kaum sichtbar: ' + conf + ' bunte Bildpunkte');
    const fin = await page.evaluate(() => ({ txt: [...document.querySelectorAll('#rs-finish canvas.px')].map((c) => c.dataset.t).join('|'), conf: window.__rennspiel.session.fx.emitted.konfetti ?? 0 }));
    if (!/^\{clock\}\|\d+:\d\d,\d$/.test(fin.txt) || fin.conf < 50) await fail('Ziel ohne große Fahrzeit/Konfetti: ' + JSON.stringify(fin));
    await page.screenshot({ path: `${SHOTS}/rennspiel-ziel-fahrzeit.png` });
    await page.waitForSelector('#rs-end:not(.hidden)', { timeout: 60000 });
    await page.keyboard.up('ArrowUp');
    await sleep(400);
    const endSnd = await page.evaluate(() => [window.__rennspiel.audio.live, window.__rennspiel.audio.level]);
    if (endSnd[0] || endSnd[1] !== 0) await fail('Motorsound läuft nach dem Ziel weiter: ' + endSnd);
    const end = await page.evaluate(() => ({ won: !!document.querySelector('#rs-end .card.won'), txt: [...document.querySelectorAll('#rs-end .card canvas.px')].map((c) => c.dataset.t).join(' ') }));
    console.log('Ende:', end.txt);
    if (!end.won || !/\{flag\}/.test(end.txt) || !/\{trophy\} \d+:\d\d,\d/.test(end.txt) || /\{star\}/.test(end.txt) || !/\{rally_AWD\}/.test(end.txt) || !end.txt.includes(fin.txt.split('|')[1])) await fail('Endanzeige ohne Sieg/Pokal/Fahrzeit oder mit Sternen (Zeitfahren): ' + end.txt + ' ' + await page.evaluate(() => { const r = window.__rennspiel.run, c = window.__rennspiel.car; return JSON.stringify({ st: r.state, el: r.elapsed, s: r.tracker.s, d: r.tracker.d, x: c.pos[0], z: c.pos[2], up: c.axes().u[1] }); }));
    { // gespeichert als Fahrzeit des Autos (Zehntel), kein Zeitkonto, keine Sterne im Zeitfahren
      const ba = await page.evaluate(() => JSON.parse(localStorage.getItem('rs-save') || '{}').matschgrube?.cars?.rally);
      if (!ba || typeof ba.time !== 'number' || ba.time <= 0 || ba.stars !== undefined) await fail('Zeitfahren: Fahrzeit des Autos nicht (allein) gespeichert: ' + JSON.stringify(ba));
    }
    await page.screenshot({ path: `${SHOTS}/rennspiel-ende-tablet-quer.png` });
    await page.setViewportSize({ width: 844, height: 390 }); await sleep(200);
    await page.screenshot({ path: `${SHOTS}/rennspiel-ende-handy-quer.png` });
    const eb = await page.evaluate(() => [...document.querySelectorAll('#rs-end button:not(.log)')].map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
    if (eb.length !== 2 || eb[0][2] > eb[1][0] || eb.some((r) => r[0] < 0 || r[2] > 844 || r[1] < 0 || r[3] > 390)) await fail('Endknöpfe überlappen/ragen raus: ' + JSON.stringify(eb));
    // End-Karte in allen Größen: kein Text/Knopf ragt aus der Karte oder dem Viewport (Karte baut sich bei Größenänderung neu auf)
    for (const [vw, vh] of [[360, 740], [390, 844], [320, 568], [844, 390], [800, 1280], [1280, 800]]) {
      await page.setViewportSize({ width: vw, height: vh }); await sleep(400);
      const bad = await page.evaluate(([W, H]) => {
        const card = document.querySelector('.rs-end .card').getBoundingClientRect(), out = [];
        for (const e of document.querySelectorAll('.rs-end .card *')) {
          const r = e.getBoundingClientRect(); if (!r.width) continue;
          if (r.left < card.left - 0.5 || r.right > card.right + 0.5 || r.left < 0 || r.right > W + 0.5 || r.top < 0 || r.bottom > H + 0.5 || e.scrollWidth > e.clientWidth + 1) out.push((e.dataset.t || e.className || e.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
        }
        return out;
      }, [vw, vh]);
      if (vw === 360 || vw === 320) await page.screenshot({ path: `${SHOTS}/rennspiel-ende-${vw}x${vh}.png` });
      if (bad.length) await fail(`End-Karte ${vw}x${vh}: ragt raus: ${bad}`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('#rs-end button.back');
    await page.waitForSelector('.rs-menu:not(.hidden)');
    if (await page.evaluate(() => window.__rennspiel.audio.live)) await fail('Motorsound läuft im Menü');
    await sleep(500);
    if (!(await page.evaluate(() => window.__rsAttract()))) await fail('Titel: nach der Fahrt kein Kameraflug');
    // Menü nach der Fahrt – der Auto-Knopf zeigt die Zeit (Anfang der Endkartenzeit), die Kachel dieselbe, andere Autos „--“
    const carVal = (title) => page.evaluate((t) => document.querySelector(`.rs-menu button.mode.car[title="${t}"] canvas.bv`).dataset.t, title);
    const endTime = end.txt.match(/\d+:\d\d,\d/)[0];
    const tile = await T(page, 'button[data-level="matschgrube"]');
    console.log('Kachel:', tile, '| Rallye-Knopf', await carVal('Rallye 4x4'));
    if ((await carVal('Rallye 4x4')) !== endTime.split(',')[0] || (await carVal('Kompakt')) !== '--' || !tile.includes('{rally_AWD} ' + endTime.split(',')[0]) || /\{star\}/.test(tile)) await fail('Menü nach Zeitfahren: Knopf/Kachel passen nicht zur Endkarte ' + endTime + ': ' + tile);
    // Autowechsel: Kachel zeigt den Wert des anderen Autos (Kompakter noch leer), zurück -> Rallye-Zeit wieder da
    await page.click('button[title="Kompakt"]'); await sleep(150);
    const tileH = await T(page, 'button[data-level="matschgrube"]');
    if (!/\{clock0\} --/.test(tileH)) await fail('Kompakter: Kachel zeigt fremde Zeit: ' + tileH);
    await page.click('button[title="Rallye 4x4"]'); await sleep(150);
    if (!(await T(page, 'button[data-level="matschgrube"]')).includes('{rally_AWD} ' + endTime.split(',')[0])) await fail('Rallye-Zeit nach dem Rückwechseln fehlt');
    // Sammeln: dieselbe Stelle, Stern einsammeln -> Endkarte zeigt Sterne, keine Uhr; Auto-Knopf zeigt ★ n
    await page.click('button[title^="Sammeln"]');
    await pick(page, 'matschgrube');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    await place();
    await page.waitForFunction(() => window.__rsMap?.ok, null, { timeout: 40000 }).catch(() => {}); await sleep(300);   // größere Karte, Foto braucht länger
    { const mo = await mapPx(page); if (!(mo.star > 0)) await fail('Minimap Sammeln: Sterne erwartet: ' + JSON.stringify(mo)); }
    if (await page.evaluate(() => !document.querySelector('.rs-goal').classList.contains('stars') || !window.__rennspiel.session.starMesh.mesh.visible)) await fail('Sammeln: Uhr sichtbar oder Sterne unsichtbar');
    await page.keyboard.down('ArrowUp');
    await page.waitForSelector('#rs-end:not(.hidden)', { timeout: 60000 });
    await page.keyboard.up('ArrowUp');
    const end2 = await page.evaluate(() => ({ won: !!document.querySelector('#rs-end .card.won'), txt: [...document.querySelectorAll('#rs-end .card canvas.px')].map((c) => c.dataset.t).join(' '), fin: !document.getElementById('rs-finish').classList.contains('hidden') }));
    console.log('Ende (Sammeln):', end2.txt);
    const n2 = (end2.txt.match(/\{star\} ([1-9]\d*)/) || [])[1];
    if (!end2.won || !n2 || !/\{trophy\}/.test(end2.txt) || /\d+:\d\d/.test(end2.txt) || end2.fin) await fail('Endkarte Sammeln: Sterne/Pokal erwartet, keine Zeit: ' + end2.txt);
    await page.click('#rs-end button.back'); await page.waitForSelector('.rs-menu:not(.hidden)'); await sleep(300);
    const tile2 = await T(page, 'button[data-level="matschgrube"]');
    if ((await carVal('Rallye 4x4')) !== '{star} ' + n2 || (await carVal('Kompakt')) !== '--' || !tile2.includes('{rally_AWD} {star} ' + n2)) await fail('Menü nach Sammeln: Knopf/Kachel zeigen nicht ★ ' + n2 + ': ' + tile2 + ' | ' + await carVal('Rallye 4x4'));
    // Zeitfahren-Wert des Autos ist unberührt
    await page.click('button[title^="Zeitfahren"]'); await sleep(150);
    if ((await carVal('Rallye 4x4')) !== endTime.split(',')[0]) await fail('Zeitfahren-Wert nach Sammeln verändert: ' + await carVal('Rallye 4x4'));

    // ── Auto-Symbole aus den 3D-Modellen: im Menü (4 Autos) und auf der Bestzeit-Kachel vorhanden, nicht leer, verschieden, ohne Überlappung ──
    {
      const icons = await page.evaluate(() => [...document.querySelectorAll('.rs-menu button.mode.car canvas.px, .rs-menu button.level canvas.px')]
        .filter((c) => /^\{(car|buggy|rally|jeep)_/.test(c.dataset.t)).map((c) => {
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, cols = new Set(); let op = 0, red = 0, sum = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { op++; cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); sum += d[i] + d[i + 1] + d[i + 2]; if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 90) red++; }
          const r = c.getBoundingClientRect();
          return { t: c.dataset.t.slice(0, 14), op, cols: cols.size, red, lum: Math.round(sum / Math.max(1, op) / 3), w: c.width, h: c.height, box: [r.left, r.top, r.right, r.bottom], car: !!c.closest('.car') };
        }));
      console.log('Auto-Symbole:', JSON.stringify(icons.map(({ box, ...q }) => q)));
      const menuIcons = icons.filter((i) => i.car);
      if (menuIcons.length < 4 || icons.length < 5) await fail('Auto-Symbole fehlen: ' + JSON.stringify(icons));
      for (const i of icons) if (i.cols < 10 || i.op < 150 || i.lum < 45 || i.lum > 210 || i.h < 13) await fail('Auto-Symbol leer/zu dunkel/hell/Rückfall-Sprite: ' + JSON.stringify(i));
      if (new Set(menuIcons.map((i) => i.t + i.op + i.cols)).size < 4) await fail('Auto-Symbole nicht verschieden');
      if (menuIcons.filter((i) => i.red > 8).length < 4) await fail('Antriebsräder nicht rot: ' + JSON.stringify(menuIcons));
      for (let a = 0; a < icons.length; a++) for (let b = a + 1; b < icons.length; b++) { const p = icons[a].box, q = icons[b].box; if (p[0] < q[2] && q[0] < p[2] && p[1] < q[3] && q[1] < p[3]) await fail('Auto-Symbole überlappen'); }
      await page.screenshot({ path: `${SHOTS}/rennspiel-menue-icons.png` });
    }

  }
  if (want('karte')) { await home();
    // ── Karten: Gelände mit Gabelungen – große Karte zeigt Foto + Weg + orange Äste; Antippen schließt, das Spiel läuft weiter ──
    await page.click('.rs-tile.world[title="Offroad"]');
    await page.click('button[title^="Sammeln"]');   // Sterne zeigt die Karte nur im Sammeln-Modus
    for (const [id, minFork] of [['matschgrube', 200], ['moorwald', 200], ['steilhang', 200]]) {
      await pick(page, id);
      await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(600);
      const mp = await bigMap(page, `${SHOTS}/rennspiel-karte-${id}-gross.png`);
      await page.locator('.rs-map').screenshot({ path: `${SHOTS}/rennspiel-karte-${id}-klein.png` });
      console.log(`Karte ${id}:`, JSON.stringify(mp), JSON.stringify(await page.evaluate(() => window.__rsMap)));
      if (!(mp.star > 0 && mp.line > 0 && mp.fork > minFork)) await fail(`Karte ${id}: Sterne/Weg/Gabeln fehlen: ` + JSON.stringify(mp));
      { const r = await page.evaluate(() => window.__rsMap); if (r.tinted || !(r.contrast >= 80)) await fail(`Karte ${id}: guter Kontrast darf nicht getönt werden: ` + JSON.stringify(r)); }   // Gelände-Straße unverändert
      await toMenu(page); await page.waitForSelector('.rs-menu:not(.hidden)');
    }
    // ── Karte lesbar: Strand/Dünen (Sand auf Sand) werden fürs Foto getönt, Kontrast danach über der Schwelle; Straße mit gutem Kontrast bleibt ungetönt ──
    for (const [world, id, tint] of [['Strand', 'duenenpfad', null], ['Strand', 'promenade', false], ['Strand', 'wasserlinie', null], ['Strand', 'muschelweg', null], ['Strand', 'etappe_strand', true]]) {   // Promenade: Holz seit dunkel genug; Sand seit durch die dunklere Fahrspur (Kontrast >= 80, Tönung nur noch Rückfall)
      await home(); await page.click(`.rs-tile.world[title="${world}"]`);
      await pick(page, id);
      await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(600);
      const mp = await bigMap(page, `${SHOTS}/rennspiel-karte-${id}-gross.png`);
      const r = await page.evaluate(() => window.__rsMap);
      console.log(`Karte ${id}: Kontrast ${r.contrast?.toFixed(1)} -> ${r.after?.toFixed(1)}${r.tinted ? ' (getönt)' : ''}`);
      if (tint !== null && r.tinted !== tint) await fail(`Karte ${id}: Tönung ${r.tinted}, erwartet ${tint}: ` + JSON.stringify(r));
      if (!(r.after >= 80)) await fail(`Karte ${id}: Fahrbahn-Kontrast zu klein: ` + JSON.stringify(r));
      if (!(mp.line > 0 || mp.dark > 30)) await fail(`Karte ${id}: Weglinie/Straßenband fehlt`);
      // Spielbild gleich: Straßenfarbe nach dem Schuss wieder die der Strecke (Material-Tönung zurück)
      const tintBack = await page.evaluate(() => { let bad = 0; window.__rennspiel.session.scene.traverse((o) => { if (o.userData.mapTint && o.material.color.getHex() !== 0xffffff) bad++; }); return bad; });
      if (tintBack) await fail(`Karte ${id}: Fahrbahn-Material nicht zurückgestellt`);
    }
    // ── Straßenband: Brandung (Straße 1–2 px) zeigt auf Minikarte, großer Karte und in der Nahansicht ein Band (dunkler Rand + Straßenfarbe), Weglinie ersetzt ──
    await home(); await page.click('.rs-tile.world[title="Strand"]'); await pick(page, 'wasserlinie');
    await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(600);
    { const small = await mapPx(page), mb = await bigMap(page, `${SHOTS}/rennspiel-karte-wasserlinie-gross.png`);
      await page.locator('.rs-map').screenshot({ path: `${SHOTS}/rennspiel-karte-wasserlinie-klein.png` });
      if (!(small.dark > 20 && small.line === 0)) await fail('Straßenband: Minikarte ohne Band: ' + JSON.stringify(small));
      if (!(mb.dark > 100 && mb.line === 0)) await fail('Straßenband: Fahrkarte ohne Band: ' + JSON.stringify(mb)); }
    // ── Karte in zwei Stufen: große Welt (Vorstadt) mit Lupe -> Nah ums Auto -> zurück; kleine Welt ohne Knopf ──
    await home(); await page.click('.rs-tile.world[title="Vorstadt"]'); await pick(page, 'etappe_vorstadt');
    await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(600);
    await nearMap(page, true, `${SHOTS}/rennspiel-karte-vorstadt`);
    await page.setViewportSize({ width: 360, height: 740 }); await sleep(300);   // Handy hochkant: Knopf im Bild, beide Stufen
    await nearMap(page, true); await page.setViewportSize({ width: 1280, height: 800 });
    await home(); await page.click('.rs-tile.world[title="Offroad"]'); await pick(page, 'furtwald');
    await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(600);
    await nearMap(page, false);
  }
  if (want('zielkreis')) { await home();
    // ── Zielkreis: Offroad hat statt Tor einen rot-weißen Kreis (Radius = Zielradius) auf dem Gelände; Jeep rollt in den Kreis -> Ziel ──
    await page.click('button[title="Rallye 4x4"]');
    await page.click('.rs-tile.world[title="Offroad"]');
    await pick(page, 'matschgrube');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    const ci = await page.evaluate(() => { const g = window.__rennspiel, sc = g.session.scene; let circ = 0, gate = 0; sc.traverse((o) => { if (o.userData.goalCircle) circ = o.userData.goalCircle; });
      const c = g.run.course; return { circ, free: c.free, gx: c.goal.x, gz: c.goal.z }; });
    if (!ci.free || ci.circ !== 7) await fail('Zielkreis fehlt oder falscher Radius: ' + JSON.stringify(ci));
    await page.evaluate(() => { const g = window.__rennspiel, c = g.run.course, st = c.stars.reduce((m, q) => (Math.hypot(q[0] - c.goal.x, q[1] - c.goal.z) < Math.hypot(m[0] - c.goal.x, m[1] - c.goal.z) ? q : m)), d = Math.hypot(c.goal.x - st[0], c.goal.z - st[1]), a = { x: c.goal.x - (c.goal.x - st[0]) / d * 14, z: c.goal.z - (c.goal.z - st[1]) / d * 14 }; g.car.reset(a.x, a.z, Math.atan2(-(c.goal.x - a.x), -(c.goal.z - a.z))); });
    await sleep(700); await page.screenshot({ path: `${SHOTS}/rennspiel-zielkreis.png` });
    if (await page.evaluate(() => window.__rennspiel.run.state === 'won')) await fail('Ziel schon vor dem Kreis erreicht');
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => window.__rennspiel.run.state === 'won', null, { timeout: 40000 }).catch(async () => fail('Jeep fährt in den Kreis, aber kein Ziel: ' + JSON.stringify(await page.evaluate(() => { const g = window.__rennspiel, c = g.run.course; return { d: Math.hypot(g.car.pos[0] - c.goal.x, g.car.pos[2] - c.goal.z), st: g.run.state }; }))));
    await page.keyboard.up('ArrowUp');
    const dg = await page.evaluate(() => { const g = window.__rennspiel, c = g.run.course; return Math.hypot(g.car.pos[0] - c.goal.x, g.car.pos[2] - c.goal.z); });
    if (!(dg < 7.5)) await fail('Ziel außerhalb des Kreises: ' + dg);
    await toMenu(page).catch(() => {});
  }
  if (want('auswahl')) { await home();
    // ── Auswahl hochkant mit langen Namen/Zeiten: keine Zeile läuft über (Snow: „Zugefrorener See“, Bestzeit 1:40, 30 Sterne) ──
    await page.evaluate(() => localStorage.setItem('rs-car', 'hatch'));   // die Bestzeiten unten gehören dem Kompakten; vorher gefahrene Abschnitte (ziel: Rallye) dürfen die Auswahl nicht verstellen
    await page.evaluate(() => localStorage.setItem('rs-save', JSON.stringify({ _v: 4, 'see#2': { cars: { hatch: { time: 100.2, stars: 30 } } }, 'kuppenstrecke#2': { cars: { hatch: { time: 599.9, stars: 12 } } }, 'waldweg#2': { cars: { rally: { time: 55.3, stars: 9 } } } })));
    for (const [vw, vh] of [[360, 740], [320, 640], [390, 844]]) {
      await page.setViewportSize({ width: vw, height: vh }); await page.reload();
      await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
      await page.click('.rs-tile.world[title="Schnee"]'); await sleep(250);
      if (vw === 360) await page.screenshot({ path: `${SHOTS}/rennspiel-auswahl-lange-namen-360.png` });
      const bad = await page.evaluate((W) => [...document.querySelectorAll('.rs-menu button.level')].flatMap((b) => { const r = b.getBoundingClientRect(); return [...b.children].filter((c) => { const q = c.getBoundingClientRect(); return q.right > r.right + 0.5 || q.left < r.left - 0.5; }).map((c) => b.dataset.level + ':' + c.dataset.t).concat(r.right > W || r.left < 0 ? [b.dataset.level + ' ragt aus dem Bild'] : []); }), vw);
      if (bad.length) await fail(`Auswahl ${vw}x${vh}: Überlauf ${bad}`);
      const low = await page.evaluate(() => { const t = [...document.querySelectorAll('.rs-menu button.level')]; const r = t[t.length - 1].getBoundingClientRect(); return [t.length, Math.round(r.bottom), innerHeight]; });
      if (low[1] > low[2]) await fail(`Auswahl ${vw}x${vh}: ${low[0]} Level-Kacheln passen nicht in die Höhe (${low[1]} > ${low[2]})`);
    }
    // ── Zurücksetzen: Abbrechen ändert nichts, Ja löscht Zeiten + Sterne, Einstellungen bleiben, Kacheln sofort leer ──
    await page.setViewportSize({ width: 1280, height: 800 }); await page.evaluate(() => { localStorage.setItem('rs-scale', '2'); }); await page.reload(); await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
    await page.click('.rs-tile.world[title="Schnee"]'); await sleep(200);
    const shown = () => page.evaluate(() => [...document.querySelectorAll('.rs-menu button.level .meta canvas.px')].map((c) => c.dataset.t).join('|'));
    if (!/1:40/.test(await shown()) || !/9:59/.test(await shown())) await fail('Zurücksetzen: Ausgangsdaten nicht in den Kacheln: ' + await shown());
    {   // unter jedem Auto-Knopf der Bestwert des Autos für die markierte Strecke (Waldweg: nur die Rallye hat Werte), je nach Modus
      const vals = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.rs-menu button.mode.car')].map((b) => [b.title, b.querySelector('canvas.bv').dataset.t])));
      const v1 = await vals(); await page.click('button[title^="Sammeln"]'); await sleep(150); const v2 = await vals(); const tiles2 = await shown();
      if (v1['Rallye 4x4'] !== '0:55' || v1['Kompakt'] !== '--' || v2['Rallye 4x4'] !== '{star} 9' || v2['Kompakt'] !== '--' || !/\{star\} 30/.test(tiles2)) await fail('Auto-Knöpfe zeigen nicht den Bestwert im Modus: ' + JSON.stringify([v1, v2, tiles2]));
      await page.click('button[title^="Zeitfahren"]'); await sleep(100);
    }
    await page.click('.rs-menu button.gear'); await page.click('.rs-cfg .rs-reset'); await page.click('.rs-ask .no');
    if (!(await page.evaluate(() => localStorage.getItem('rs-save')))) await fail('Zurücksetzen: Abbrechen hat gelöscht');
    await page.click('.rs-menu button.gear'); await page.screenshot({ path: `${SHOTS}/rennspiel-zahnrad.png` }); await page.click('.rs-cfg .rs-reset'); await page.screenshot({ path: `${SHOTS}/rennspiel-zuruecksetzen.png` }); await page.click('.rs-ask .yes'); await sleep(200);
    if (await page.evaluate(() => localStorage.getItem('rs-save'))) await fail('Zurücksetzen: Speicher nicht leer');
    if (/\{(?!clock0|star0)/.test(await shown())) await fail('Zurücksetzen: Kacheln zeigen noch Werte: ' + await shown());
    if (await page.evaluate(() => localStorage.getItem('rs-scale')) !== '2') await fail('Zurücksetzen: Einstellung gelöscht');
    await page.evaluate(() => { localStorage.removeItem('rs-scale'); localStorage.setItem('rs-car', 'rally'); }); await page.reload(); await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');   // die folgenden Abschnitte fahren mit der Rallye (wie nach ziel)

  }
  if (want('etappen')) { await home();
    // ── Lange Etappen: übers Menü starten, fahren, Minimap feiner als bei normalen Strecken, Draw Calls im Rahmen ──
    for (const [world, id] of [['Schnee', 'etappe_schnee'], ['City', 'etappe_stadt'], ['Strand', 'etappe_strand'], ['Rhein', 'etappe_rhein']]) {
      await page.click(`.rs-tile.world[title="${world}"]`);
      await pick(page, id);
      await page.waitForSelector('#rs-speed', { state: 'visible' });
      await page.keyboard.down('ArrowUp'); await sleep(3500);
      await page.screenshot({ path: `${SHOTS}/rennspiel-${id.replace('_', '-')}.png` });
      const m = await page.evaluate(() => ({ dc: window.__rennspiel.calls, kmh: document.getElementById('rs-speed').dataset.t, n: window.__rsMap.size, len: window.__rennspiel.run.course.length, t: window.__rennspiel.run.timeLeft }));
      await page.keyboard.up('ArrowUp');
      console.log(`Etappe ${id}: ${m.kmh} km/h, ${m.dc} dc, Karte ${m.n}, ${Math.round(m.len)} m, ${m.t} s`);
      if (m.dc > 45) await fail(`Etappe ${id}: zu viele Draw Calls ${m.dc}`);
      if (!(Number(m.kmh) > 10)) await fail(`Etappe ${id}: Auto fährt nicht (${m.kmh})`);
      if (!(Number(m.n) >= 512)) await fail(`Etappe ${id}: Kartenfoto fehlt (${m.n})`);
      await toMenu(page); await page.waitForSelector('.rs-menu:not(.hidden)');
    }

  }
  if (want('rhein')) { await home();
    // ── Rheinsteig: jedes Level fahren; Etappe Rheinbogen: über die Rheinbrücke (Tastatur, ohne Absaufen) ──
    await page.click('.rs-tile.world[title="Rhein"]');
    for (const id of ['weinberg', 'uferstrasse', 'loreley', 'etappe_rhein']) {
      await pick(page, id);
      await page.waitForSelector('#rs-speed', { state: 'visible' });
      await page.keyboard.down('ArrowUp'); await sleep(3000);
      await page.screenshot({ path: `${SHOTS}/rennspiel-rhein-${id}.png` });
      const m = await page.evaluate(() => ({ dc: window.__rennspiel.calls, fps: document.getElementById('rs-fps').dataset.t, kmh: document.getElementById('rs-speed').dataset.t }));
      console.log(`Rheinsteig ${id}: ${m.kmh} km/h, ${m.fps}, ${m.dc} dc`);
      if (m.dc > 45) await fail(`Rheinsteig ${id}: zu viele Draw Calls ${m.dc}`);
      if (!(Number(m.kmh) > 15)) await fail(`Rheinsteig ${id}: Auto fährt nicht (${m.kmh})`);
      if (id === 'etappe_rhein') {
        await page.keyboard.up('ArrowUp');
        await page.evaluate(() => { const g = window.__rennspiel, r = g.run.course.route, b = g.run.course.bridge, s = b.s0 + 4, a = r.at(s); g.car.reset(a.x, a.z, r.yawAt(s)); window.__brs1 = b.s1; });
        await page.keyboard.down('ArrowUp');
        let ok = false, drowned = false;
        let shot = false;
        for (let i = 0; i < 120 && !ok && !drowned; i++) {
          await sleep(250); [ok, drowned] = await page.evaluate(() => [window.__rennspiel.run.tracker.s > window.__brs1 + 10, window.__rennspiel.car.drowned]);
          if (!shot && (await page.evaluate(() => { const b = window.__rennspiel.run.course.bridge; return window.__rennspiel.run.tracker.s > b.s0 + b.def.len * 0.35; }))) { shot = true; await page.screenshot({ path: `${SHOTS}/rennspiel-rhein-bruecke.png` }); }   // Auto auf der Brücke, Bogen im Bild
        }
        if (drowned || !ok) await fail(`Rheinbrücke: nicht überquert (abgesoffen ${drowned})`);
        console.log('Rheinbrücke: überquert');
      }
      await page.keyboard.up('ArrowUp');
      await toMenu(page);
      await page.waitForSelector('.rs-menu:not(.hidden)');
    }
    if (errors.length) await fail('Konsolenfehler Rheinsteig: ' + errors.join(' | '));

  }
  if (want('vorstadt')) { await home();
    // ── Vorstadt: Welt-Kachel, Etappe fahren (Straßennetz, Draw Calls, keine Konsolenfehler), Matsch bremst, Startampel = 3D-Ampel ──
    await page.click('.rs-tile.world[title="Vorstadt"]'); await pick(page, 'etappe_vorstadt');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    await page.keyboard.down('ArrowUp'); await sleep(3000);
    const v = await page.evaluate(() => { const S = window.__rennspiel.session; return { dc: window.__rennspiel.calls, kmh: document.getElementById('rs-speed').dataset.t, net: !!S.course.net, junctions: S.course.net.junctions.length, bridges: S.course.bridges.length, light: !!S.startLight }; });
    console.log(`Vorstadt: ${v.kmh} km/h, ${v.dc} dc, ${v.junctions} Kreuzungen, ${v.bridges} Brücken`);
    if (!v.net || !v.light || v.junctions < 10 || v.bridges !== 2) await fail('Vorstadt: Netz/Startampel fehlt ' + JSON.stringify(v));
    if (v.dc > 45) await fail(`Vorstadt: zu viele Draw Calls ${v.dc}`);
    if (!(Number(v.kmh) > 15)) await fail(`Vorstadt: Auto fährt nicht (${v.kmh})`);
    await page.screenshot({ path: `${SHOTS}/rennspiel-vorstadt.png` });
    await page.keyboard.up('ArrowUp');
    // Netzverkehr: Autos da und gezeichnet, Draw Calls im Rahmen; Anstoßen eines Autos in der Spur schiebt es ein Stück und es findet zurück
    const nt = await page.evaluate(() => { const g = window.__rennspiel, S = g.session, t = g.traffic; return { n: t ? t.active : -1, net: !!(t && t.lanes), drawn: S.trafficMesh ? S.trafficMesh.group.children.reduce((a, m) => a + (m.visible ? m.count : 0), 0) : 0, dc: g.calls }; });
    console.log(`Vorstadt-Verkehr: ${nt.n} Autos, ${nt.drawn} gezeichnet, ${nt.dc} dc`);
    if (!nt.net || !(nt.n >= 15) || !(nt.drawn > 0)) await fail('Vorstadt: Netzverkehr fehlt ' + JSON.stringify(nt));
    if (nt.dc > 45) await fail(`Vorstadt: Draw Calls mit Verkehr ${nt.dc}`);
    const nset = await page.evaluate(() => { const g = window.__rennspiel, t = g.traffic, k = t.cars.find((c) => c.on && c.pc.kind === 'lane' && c.pc.length - c.s > 40 && c.s > 14 && c.speed > 3); if (!k) return false; const p = k.pc.route.at(k.s - 9); g.car.reset(p.x, p.z, Math.atan2(-p.dx, -p.dz)); g.car.launch(30); window.__tk = k; window.__tmax = 0; return true; });
    if (!nset) await fail('Vorstadt: kein Auto zum Anstoßen');
    await page.keyboard.down('ArrowUp');
    let nhit = 0;
    for (let i = 0; i < 24 && nhit < 0.3; i++) { await sleep(100); nhit = Math.max(nhit, await page.evaluate(() => (window.__tmax = Math.max(window.__tmax, window.__tk.err)))); }
    await page.keyboard.up('ArrowUp');
    console.log(`Vorstadt-Verkehr: Anstoß schiebt das Auto um ${nhit.toFixed(2)} m`);
    if (!(nhit >= 0.3) || !(nhit < 6.5)) await fail(`Vorstadt: Anstoß wirkungslos/übertrieben (${nhit})`);
    // Matsch: im Matsch-Abschnitt Vollgas -> Untergrund heißt Matsch und das Auto bleibt deutlich langsamer als auf Asphalt
    const mud = await page.evaluate(() => { const g = window.__rennspiel, c = g.run.course, z = c.roadSurfAt, n = Math.floor(c.length); let a = -1; for (let s = 1; s < n; s++) if (z(s).name === 'Matsch' && z(s + 30).name === 'Matsch') { a = s; break; } const p = c.recover(a + 5); g.car.reset(p.x, p.z, p.yaw); return a; });
    if (mud < 0) await fail('Vorstadt: kein Matsch-Abschnitt');
    await page.keyboard.down('ArrowUp'); await sleep(1500);   // kurz genug, dass auch die schnelle Rallye den Matsch-Abschnitt (30 m) nicht verlässt
    const mv = await page.evaluate(() => ({ surf: window.__rennspiel.car.surfaceName, v: window.__rennspiel.car.speed }));
    await page.keyboard.up('ArrowUp');
    console.log(`Matsch: ${mv.surf}, ${mv.v.toFixed(1)} m/s`);
    if (mv.surf !== 'Matsch') await fail('Vorstadt: Untergrund Matsch nicht erreicht: ' + mv.surf);
    if (!(mv.v < 22)) await fail(`Vorstadt: Matsch bremst nicht (${mv.v})`);
    if (errors.length) await fail('Konsolenfehler Vorstadt: ' + errors.join(' | '));
    await toMenu(page); await page.waitForSelector('.rs-menu:not(.hidden)');
  }
  if (want('verkehr')) { await home();
    // ── Verkehr: Etappe Stadtring fahren – Fahrzeuge da und gezeichnet, Draw Calls im Rahmen, Anstoßen bewegt das Auto (Ton-Pfad = Obstacles.onImpact) ──
    for (const [world, id] of [['City', 'etappe_stadt'], ['Schnee', 'etappe_schnee']]) {
      await page.click(`.rs-tile.world[title="${world}"]`); await pick(page, id);
      await page.waitForSelector('#rs-speed', { state: 'visible' });
      await page.keyboard.down('ArrowUp'); await sleep(2500);
      const tr = await page.evaluate(() => { const g = window.__rennspiel, S = g.session, t = g.traffic; return { n: t ? t.active : -1, drawn: S.trafficMesh ? S.trafficMesh.group.children.reduce((a, m) => a + (m.visible ? m.count : 0), 0) : 0, dc: g.calls, kmh: document.getElementById('rs-speed').dataset.t }; });
      console.log(`Verkehr ${id}: ${tr.n} Fahrzeuge, ${tr.drawn} gezeichnet, ${tr.dc} dc, ${tr.kmh} km/h`);
      if (!(tr.n > 0) || !(tr.drawn > 0)) await fail(`Verkehr ${id}: keine Fahrzeuge sichtbar ${JSON.stringify(tr)}`);
      if (tr.dc > 45) await fail(`Verkehr ${id}: zu viele Draw Calls ${tr.dc}`);
      // Anstoßen: Spieler 12 m hinter ein Vorausfahrer-Auto setzen, Gas halten -> das Auto wird aus der Spur gedrückt
      await page.keyboard.up('ArrowUp');
      const set = await page.evaluate(() => { const g = window.__rennspiel, t = g.traffic, k = t.cars.find((c) => c.on && c.dir > 0); if (!k) return false; const s = k.sT - 9, p = g.run.course.route.offset(s, k.lat), a = g.run.course.recover(s); g.car.reset(p[0], p[1], a.yaw); g.car.launch(22); window.__tk = k; window.__tmax = 0; return true; });
      if (!set) await fail(`Verkehr ${id}: kein Vorausfahrer zum Anstoßen`);
      await page.keyboard.down('ArrowUp');
      let hit = 0;
      for (let i = 0; i < 24 && hit < 0.3; i++) { await sleep(100); hit = Math.max(hit, await page.evaluate(() => (window.__tmax = Math.max(window.__tmax, window.__tk.err)))); }
      await page.keyboard.up('ArrowUp');
      console.log(`Verkehr ${id}: Anstoß schiebt das Auto um ${hit.toFixed(2)} m`);
      if (!(hit >= 0.3) || !(hit < 6.5)) await fail(`Verkehr ${id}: Anstoß wirkungslos/übertrieben (${hit})`);
      await page.screenshot({ path: `${SHOTS}/rennspiel-verkehr-${id}.png` });
      await toMenu(page); await page.waitForSelector('.rs-menu:not(.hidden)');
    }
    // ──Gipfelpass – Gegenverkehr weicht dem Pflug in die Bucht aus (keine Durchdringung), Foto der Bucht ──
    await page.click('.rs-tile.world[title="Schnee"]'); await pick(page, 'etappe_schnee');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    await page.keyboard.down('ArrowUp'); await sleep(2500); await page.keyboard.up('ArrowUp');
    let bayWait = 0, overlap = 0, shot = false;
    for (let i = 0; i < 40; i++) {
      const r = await page.evaluate(() => { const g = window.__rennspiel, m = g.movers, pl = m.convoys[0], rt = g.run.course.route; const ps = pl.def.s0 + Math.min(m.t, (pl.def.s1 - pl.def.s0) / pl.def.speed) * pl.def.speed;
        const s = Math.max(6, ps - 90), a = rt.at(s); g.car.reset(a.x, a.z, rt.yawAt(s)); g.car.launch(0);
        let w = 0, o = 0; for (const c of g.traffic.cars) { if (!c.on || c.dir > 0) continue; if (c.bay && c.speed < 0.3) w++; if (pl.moving && Math.abs(c.sT - ps) < c.hz + 3.9 && Math.abs(c.lat - pl.def.lat) < c.hx + 1.75) o++; }
        return { w, o, ps }; });
      bayWait = Math.max(bayWait, r.w); overlap += r.o;
      if (r.w > 0 && !shot) { shot = true; await page.evaluate(() => { const g = window.__rennspiel, c = g.traffic.cars.find((q) => q.on && q.bay), rt = g.run.course.route, a = rt.at(c.sT + 28); g.car.reset(a.x, a.z, rt.yawAt(c.sT + 28) + Math.PI); g.car.launch(0); }); await sleep(600); await page.screenshot({ path: `${SHOTS}/rennspiel-bucht.png` }); }
      await sleep(700);
    }
    console.log(`Pflug: max ${bayWait} Autos warten in der Bucht, Durchdringungen ${overlap}`);
    await verdict('pflug gegenverkehr ohne durchdringung', overlap === 0 ? '' : `Gegenverkehr im Pflug (${overlap} Schritte)`);
    await toMenu(page); await page.waitForSelector('.rs-menu:not(.hidden)');
    // ──Verkehr wartet vor der geschlossenen Schranke und fährt danach weiter (nichts verschwindet) ──
    await page.click('.rs-tile.world[title="City"]'); await pick(page, 'etappe_stadt');
    await page.waitForSelector('#rs-speed', { state: 'visible' });
    await page.keyboard.down('ArrowUp'); await sleep(2500); await page.keyboard.up('ArrowUp');
    for (let i = 0; i < 120; i++) { if (await page.evaluate(() => window.__rennspiel.movers.crossings[0].warn)) break; await sleep(250); }
    await page.evaluate(() => { const g = window.__rennspiel, r = g.run.course.route, X = g.movers.crossings[0].def.s, a = r.at(X - 130); g.car.reset(a.x, a.z, r.yawAt(X - 130)); g.car.launch(0); window.__wX = X; });
    await sleep(300);
    await page.evaluate(() => { window.__wk = window.__rennspiel.traffic.place(1, window.__wX - 50, 9); });
    await sleep(6000);
    const w1 = await page.evaluate(() => { const k = window.__wk, m = window.__rennspiel.movers.crossings[0]; return { v: k.speed, sT: k.sT, on: k.on, warn: m.warn, X: window.__wX }; });
    console.log('Verkehr wartet:', JSON.stringify(w1));
    await verdict('verkehr wartet an der Schranke', w1.warn && w1.on && w1.v < 0.3 && w1.sT < w1.X - 8 && w1.sT > w1.X - 40 ? '' : `Auto hält nicht vor der Schranke ${JSON.stringify(w1)}`);
    for (let i = 0; i < 100; i++) { if (!(await page.evaluate(() => window.__rennspiel.movers.crossings[0].warn))) break; await sleep(250); }
    await sleep(6000);
    const w2 = await page.evaluate(() => ({ on: window.__wk.on, sT: window.__wk.sT, X: window.__wX }));
    await verdict('verkehr fährt weiter', w2.on && w2.sT > w2.X + 3 ? '' : `Auto fährt nach dem Öffnen nicht weiter ${JSON.stringify(w2)}`);
    // abgedrängt über die Toleranz (25 m), Spieler schaut hin: Auto bleibt da und findet zurück
    await page.evaluate(() => { const g = window.__rennspiel, r = g.run.course.route, X = window.__wX, a = r.at(X - 130); g.car.reset(a.x, a.z, r.yawAt(X - 130)); g.car.launch(0); });
    await sleep(300);
    await page.evaluate(() => { const k = window.__rennspiel.traffic.place(1, window.__wX - 105, 0); k.x += 4; k.z += 3; k.x += 30; window.__wk = k; });
    await sleep(1200);
    const w3 = await page.evaluate(() => ({ on: window.__wk.on, err: window.__wk.err }));
    await verdict('verkehr verschwindet nicht im Blick', w3.on ? '' : `abgedrängtes Auto im Blick verschwunden ${JSON.stringify(w3)}`);
    await toMenu(page); await page.waitForSelector('.rs-menu:not(.hidden)');
    if (errors.length) await fail('Konsolenfehler Verkehr: ' + errors.join(' | '));

  }
  if (want('pfeil')) { await home();
    // ── Richtungspfeil: falsch herum fahren -> Pfeil erscheint erst nach Verzögerung, umdrehen -> weg; Sammeln nie ──
    for (const mode of ['time', 'stars']) {
      await page.click('.rs-tile.world[title="Schnee"]');
      await page.click(mode === 'time' ? 'button[title^="Zeitfahren"]' : 'button[title^="Sammeln"]');
      await pick(page, 'waldweg');
      await page.waitForSelector('#rs-speed', { state: 'visible' });
      const nav = () => page.evaluate(() => { const n = document.querySelector('.rs-nav'); return { on: n.classList.contains('on') && Number(getComputedStyle(n).opacity) > 0.5, el: window.__rennspiel.run.elapsed }; });
      await page.keyboard.down('ArrowUp'); await sleep(2500);
      if ((await nav()).on) await fail(`Pfeil ${mode}: schon auf Kurs sichtbar`);
      await page.evaluate(() => { const g = window.__rennspiel, c = g.car, r = g.run, a = r.course.route.at(r.tracker.s); c.reset(c.pos[0], c.pos[2], r.course.route.yawAt(r.tracker.s) + Math.PI); c.launch(12); });
      const e0 = (await nav()).el;
      let n = await nav(); if (n.on) await fail(`Pfeil ${mode}: sofort sichtbar (keine Verzögerung)`);
      for (let i = 0; i < 400 && n.el - e0 < 4.5 && !(mode === 'time' && n.on); i++) { await sleep(100); n = await nav(); }
      if (mode === 'time') {
        if (!n.on) await fail('Pfeil: falsch herum gefahren, nie erschienen');
        if (n.el - e0 < 1.5) await fail(`Pfeil: erschien zu früh (${(n.el - e0).toFixed(1)} s)`);
        await page.screenshot({ path: `${SHOTS}/rennspiel-pfeil.png` });
        await page.evaluate(() => { const g = window.__rennspiel, c = g.car, r = g.run, a = r.course.route.at(r.tracker.s); c.reset(a.x, a.z, r.course.route.yawAt(r.tracker.s)); c.launch(12); });
        let off = false; for (let i = 0; i < 300 && !off; i++) { await sleep(100); off = !(await nav()).on; }
        if (!off) await fail('Pfeil: verschwindet nicht nach dem Umdrehen');
      } else if (n.on) await fail('Pfeil beim Sammeln sichtbar');
      console.log(`Pfeil ${mode}: ok`);
      await page.keyboard.up('ArrowUp');
      await toMenu(page); await page.waitForSelector('.rs-menu:not(.hidden)');
    }
    await page.click('button[title^="Zeitfahren"]');
    if (errors.length) await fail('Konsolenfehler Pfeil: ' + errors.join(' | '));

  }
  // ── Schranke: Etappe Stadtring, Auto 32 m vor dem Übergang geparkt. Vor dem Zug muss die Schranke zu sehen sein (offen: oben, nicht im Boden; zu: breit genug im Bild)
  //    und sie bleibt ohne Berührung heil. ──
  if (want('schranke')) { await home();
    await page.click('.rs-tile.world[title="City"]'); await pick(page, 'etappe_stadt');
    await page.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(500);
    await page.evaluate(() => { const g = window.__rennspiel, r = g.run.course.route, s = g.movers.crossings[0].def.s - 32, a = r.at(s); g.car.reset(a.x, a.z, r.yawAt(s)); });
    const bar = () => page.evaluate(() => {
      const g = window.__rennspiel, m = g.movers.crossings[0], cam = g.camera, cv = document.querySelector('canvas').getBoundingClientRect(); let arm = null;
      g.scene.traverse((o) => { if (o.userData?.len && o.userData?.pivot) arm = o; });
      const bb = arm.geometry.boundingBox || (arm.geometry.computeBoundingBox(), arm.geometry.boundingBox), v = arm.position.clone();
      arm.updateWorldMatrix(true, false); cam.updateMatrixWorld();
      const gnd = g.car.terrain.height(m.gx, m.gz); let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, q0 = 1e9, q1 = -1e9;
      for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
        arm.localToWorld(v.set(x, y, z)); y0 = Math.min(y0, v.y - gnd); y1 = Math.max(y1, v.y - gnd);
        v.project(cam); const sx = (v.x + 1) / 2 * cv.width, sy = (1 - v.y) / 2 * cv.height; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); q0 = Math.min(q0, sy); q1 = Math.max(q1, sy);
      }
      return { gate: m.gate, train: m.train, warn: m.warn, broken: m.broken, vis: arm.visible, y0, y1, w: (x1 - x0) * innerWidth / cv.width, h: (q1 - q0) * innerHeight / cv.height };
    });
    let open = null, shut = null, everBroken = false;
    for (let i = 0; i < 80 && !(open && shut); i++) {
      const b = await bar(); everBroken ||= b.broken;
      if (!open && !b.train && !b.warn && b.gate === 0) { open = b; await page.screenshot({ path: `${SHOTS}/rennspiel-schranke-offen.png` }); }
      if (!shut && b.gate === 1) { shut = b; await page.screenshot({ path: `${SHOTS}/rennspiel-schranke-zu.png` }); }
      await sleep(500);
    }
    console.log('Schranke offen:', JSON.stringify(open), 'zu:', JSON.stringify(shut));
    if (!open || !shut) await fail('Schranke: nie offen/zu beobachtet');
    await verdict('schranke offen sichtbar', open.vis && open.y0 >= -0.3 && open.y1 >= 1.8 ? '' : `Arm im Boden/unsichtbar (Höhe ${open.y0.toFixed(1)}…${open.y1.toFixed(1)} m über Grund)`);
    await verdict('schranke zu sichtbar', shut.vis && shut.w >= 60 && shut.h >= 6 ? '' : `Arm im Bild zu klein (${shut.w.toFixed(0)}x${shut.h.toFixed(0)} px)`);
    for (let i = 0; i < 20; i++) { everBroken ||= (await bar()).broken; await sleep(500); }   // weiter ohne Berührung: bleibt heil
    await verdict('schranke heil ohne Berührung', everBroken ? 'zerbrach ohne Berührung' : '');
    // Durchfahrt im geschlossenen Zustand: bricht, Arm weg, Bruchstücke rot-weiß
    for (let i = 0; i < 120; i++) { const b = await bar(); if (b.gate === 1) break; await sleep(250); }
    await page.evaluate(() => { const g = window.__rennspiel, r = g.run.course.route, s = g.movers.crossings[0].def.s - 14, a = r.at(s); g.car.reset(a.x, a.z, r.yawAt(s)); g.car.launch(16); });
    await sleep(1500);
    const brk = await page.evaluate(() => { const g = window.__rennspiel, m = g.movers.crossings[0], col = g.session.pylons.mesh.instanceColor, n = g.session.props.n; let arm = null;
      g.scene.traverse((o) => { if (o.userData?.len && o.userData?.pivot) arm = o; });
      const pc = []; for (let i = n - 4; i < n; i++) pc.push([col.getX(i), col.getY(i), col.getZ(i)].map((v) => +v.toFixed(2)).join(','));
      return { broken: m.broken, vis: arm.visible, pc }; });
    await page.screenshot({ path: `${SHOTS}/rennspiel-schranke-bruch.png` });
    await verdict('schranke bricht bei Durchfahrt', brk.broken && !brk.vis ? '' : 'Schranke nicht kaputt/Arm noch sichtbar ' + JSON.stringify(brk));
    const rgb = brk.pc.map((c) => c.split(',').map(Number)), red = rgb.some(([r, g]) => r > 0.6 && g < 0.3), white = rgb.some(([r, g, bl]) => r > 0.8 && g > 0.8 && bl > 0.8);
    await verdict('schranke Bruchstücke rot-weiß', red && white ? '' : 'Farben ' + brk.pc.join(' '));
  }

  // ── HUD mit echter dreistelliger Geschwindigkeit (Auto fährt wirklich > 100 km/h, Text nicht gefälscht) und dreistelliger Restzeit:
  //    Tempo, Restzeit, Untergrund, Knöpfe und Minimap haben mindestens 8 px Abstand. 340x700 steht für schmale Handys (große Anzeigegröße). ──
  if (want('hud')) {
    for (const [w, h] of [[320, 700], [340, 740], [360, 740], [411, 862], [800, 1280]]) {   // 411x862 = Pixel 8 (411x914 CSS-px) abzüglich piGallery-Kopf 52 px
      const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
      await ctx.addInitScript(() => { try { localStorage.setItem('rs-fs', '0'); localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-debug', '1'); } catch {} });
      const pg = await ctx.newPage(); await pg.goto(`http://127.0.0.1:${PORT}/?touch=1`);
      await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
      await pg.tap('.rs-tile.world[title="City"]'); await pick(pg, 'regenfahrt', true);   // Nasser Asphalt = längster Untergrundname
      await pg.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(400);
      await pg.evaluate(() => { const g = window.__rennspiel, r = g.run.course.route, a = r.at(700); g.car.reset(a.x, a.z, r.yawAt(700)); g.run.elapsed = 188; g.car.launch(40); window.__rsFlash(3, '#ff4a5a'); });
      let m = null;
      for (let i = 0; i < 20 && !(m && m.kmh >= 100); i++) {
        await sleep(150);
        m = await pg.evaluate(() => {
          const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; };
          const parts = [['Tempo', '.rs-hud'], ['Uhr', '.rs-goal'], ['Plus', '.rs-plus'], ['Untergrund', '.rs-surf'], ['Minimap', '.rs-map'], ...[...document.querySelectorAll('.rs-tools button')].map((b) => [b.title, b])]
            .map(([n, q]) => ({ n, e: typeof q === 'string' ? document.querySelector(q) : q })).filter(({ e }) => e && e.offsetParent !== null).map(({ n, e }) => ({ n, ...R(e) }));
          return { kmh: Number(document.getElementById('rs-speed').dataset.t), time: document.getElementById('rs-time').dataset.t, parts };
        });
      }
      let worst = 1e9, who = '';
      for (let i = 0; i < m.parts.length; i++) for (let j = i + 1; j < m.parts.length; j++) {
        const a = m.parts[i], c = m.parts[j];
        if (!['Tempo', 'Uhr', 'Untergrund', 'Plus'].some((n) => n === a.n || n === c.n) || a.n + c.n === 'TempoUntergrund') continue;   // Anzeigen gegeneinander/gegen Knöpfe; Tempo über Untergrund und Knöpfe untereinander stehen bewusst eng
        const gap = Math.max(a.x - c.r, c.x - a.r, a.y - c.b, c.y - a.b);   // < 0: überlappen
        if (gap < worst) { worst = gap; who = `${a.n}/${c.n}`; }
      }
      console.log(`HUD ${w}x${h}: ${m.kmh} km/h, Uhr ${m.time}, kleinster Abstand ${worst.toFixed(0)} px (${who})`);
      if (!(m.kmh >= 100)) await fail(`HUD ${w}x${h}: Auto kam nicht über 100 km/h (${m.kmh})`);
      if (w === 360) {   // Gasbalken: Gas halten → voll, loslassen → leer
        const gw = () => pg.evaluate(() => document.querySelector('#rs-gas > div').style.width);
        const until = (w) => pg.waitForFunction((v) => document.querySelector('#rs-gas > div').style.width === v, w, { timeout: 15000 }).catch(() => {});   // pro Frame gerechnet: warten statt Uhr
        await pg.keyboard.down('ArrowUp'); await until('100%'); const full = await gw();
        await pg.keyboard.up('ArrowUp'); await until('0%'); const empty = await gw();
        if (full !== '100%' || empty !== '0%') await fail(`Gasbalken: voll „${full}“, leer „${empty}“ (Soll 100 % / 0 %)`);
      }
      await pg.screenshot({ path: `${SHOTS}/rennspiel-hud-${w}x${h}.png` });
      await verdict(`hud ${w}x${h}`, worst >= 8 ? '' : `${who} nur ${worst.toFixed(0)} px Abstand (Soll 8)`);
      await ctx.close();
    }
  }

  if (want('titel')) { await home();
    // ── Titel hochkant: Seite scrollt nie über den Viewport hinaus (nur die Liste in sich) ──
    for (const [vw, vh] of [[360, 740], [390, 844]]) {
      await page.setViewportSize({ width: vw, height: vh }); await sleep(250);
      const sc = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, body: document.body.scrollHeight, inner: innerHeight, root: document.querySelector('.rs-root').scrollHeight, rootH: document.querySelector('.rs-root').clientHeight, y: (window.scrollTo(0, 99999), scrollY) }));
      if (sc.doc > sc.inner || sc.body > sc.inner || sc.root > sc.rootH || sc.y > 0) await fail(`Titel ${vw}x${vh} scrollt über den Viewport: ${JSON.stringify(sc)}`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });

  }
  if (want('vollbild')) {
    // ── Vollbild Standard: erster Klick im Menü fordert es an (einmal), Zahnrad-Schalter schaltet, Menü-Ende pausiert nicht, Rennen-Ende schon ──
    // Mock: headless gibt kein echtes Vollbild; fullscreenElement/Request/Exit werden nachgebildet (Änderungen = fullscreenchange)
    const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('rs-cd', '0'); localStorage.removeItem('rs-fs'); } catch {} });
    await ctx.addInitScript(() => {
      let on = false; window.__fsLog = [];
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => (on ? document.getElementById('rennspiel') : null) });
      Element.prototype.requestFullscreen = function () { window.__fsLog.push('req'); on = true; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
      Document.prototype.exitFullscreen = function () { window.__fsLog.push('exit'); on = false; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
      window.__fsExternal = () => { on = false; document.dispatchEvent(new Event('fullscreenchange')); };   // Esc / Browser beendet es
      window.__kb = { locks: [], unlocks: 0 };   // Keyboard Lock (Chromium): Esc ans Spiel
      Object.defineProperty(navigator, 'keyboard', { configurable: true, value: { lock: (k) => { window.__kb.locks.push(k); return Promise.resolve(); }, unlock: () => { window.__kb.unlocks++; } } });
    });
    const pg = await ctx.newPage(); await pg.goto(`http://127.0.0.1:${PORT}/`);
    await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
    const log = () => pg.evaluate(() => window.__fsLog.join(','));
    if (await log() !== '') await fail('Vollbild: vor dem ersten Klick schon angefordert');
    await pg.click('.rs-tile.world[title="City"]'); await sleep(200);
    await pg.click('.rs-tile.world[title="City"]'); await sleep(200);
    if (await log() !== 'req') await fail('Vollbild: erster Klick im Menü soll genau einmal anfordern: ' + await log());
    const rs1 = await pg.evaluate(() => [localStorage.getItem('rs-fs'), document.querySelector('.rs-menu') && !document.querySelector('.rs-menu').classList.contains('hidden')]);
    if (rs1[0] === '0' || !rs1[1]) await fail('Vollbild: rs-fs/Menü nach Klick ' + JSON.stringify(rs1));
    // Zahnrad-Feld: Schalter zeigt „an“, tippen = aus (Austritt, rs-fs '0')
    await pg.click('button.mode.gear'); await sleep(150);
    const fsBtn = pg.locator('.rs-cfg button.fs');
    if (!(await fsBtn.isVisible())) await fail('Vollbild: Schalter im Zahnrad-Feld fehlt');
    const t1 = await fsBtn.getAttribute('title'), on1 = await fsBtn.getAttribute('class');
    if (t1 !== 'Vollbild (F)' || !on1.includes('on')) await fail(`Vollbild: Schalter Titel/Zustand ${t1} ${on1}`);
    await fsBtn.click(); await sleep(150);
    if (await log() !== 'req,exit' || await pg.evaluate(() => localStorage.getItem('rs-fs')) !== '0') await fail('Vollbild: Schalter aus fehlerhaft: ' + await log());
    if (await pg.evaluate(() => window.__rsPaused())) await fail('Vollbild: Menü-Schalter pausiert');
    await fsBtn.click(); await sleep(150);
    if (await log() !== 'req,exit,req' || await pg.evaluate(() => localStorage.getItem('rs-fs')) !== '1') await fail('Vollbild: Schalter an fehlerhaft: ' + await log());
    await pg.evaluate(() => document.querySelector('.rs-cfg').classList.add('hidden'));   // Zahnrad-Feld zu (sonst fängt es die Klicks)
    // Browser beendet es im Menü (Esc): rs-fs '0', nicht pausiert, nicht wieder automatisch rein
    { const L = await pg.evaluate(() => window.__kb.locks); if (!L.length || L.some((k) => k.join() !== 'Escape')) await fail('Vollbild: Keyboard Lock fehlt: ' + JSON.stringify(L)); }
    await pg.evaluate(() => window.__fsExternal()); await sleep(150);   // Esc/Browser beendet es im Menü
    if (await pg.evaluate(() => window.__kb.unlocks) < 1) await fail('Vollbild: Keyboard Unlock beim Verlassen fehlt');
    if (await pg.evaluate(() => localStorage.getItem('rs-fs')) !== '0' || await pg.evaluate(() => window.__rsPaused())) await fail('Vollbild: Menü-Ende falsch');
    await pg.keyboard.press('KeyF'); await sleep(150);   // F: an
    if (await log() !== 'req,exit,req,req' || await pg.evaluate(() => localStorage.getItem('rs-fs')) !== '1') await fail('Vollbild: Taste F an: ' + await log());
    await pg.keyboard.press('KeyF'); await sleep(150);   // F: aus
    if (await log() !== 'req,exit,req,req,exit' || await pg.evaluate(() => localStorage.getItem('rs-fs')) !== '0') await fail('Vollbild: Taste F aus: ' + await log());
    await pg.keyboard.press('KeyF'); await sleep(150);   // F: an
    await pg.evaluate(() => window.__fsExternal()); await sleep(150);   // wieder selbst beendet
    await pg.click('.rs-tile.world[title="City"]'); await sleep(150);
    if (await log() !== 'req,exit,req,req,exit,req') await fail('Vollbild: nach Selbst-Beenden wieder rein: ' + await log());
    // Rennen: Knopf im Spiel schaltet an (Ende = Pause)
    await pick(pg, 'regenfahrt');   // GO
    await pg.waitForSelector('#rs-speed', { state: 'visible' }); await sleep(300);
    await pg.click('.rs-tools button[title^="Vollbild"]'); await sleep(150);
    if (await log() !== 'req,exit,req,req,exit,req,req') await fail('Vollbild: Knopf im Rennen: ' + await log());
    if (await pg.evaluate(() => window.__rsPaused())) await fail('Vollbild: Rennen pausiert zu früh');
    await pg.evaluate(() => window.__fsExternal()); await sleep(200);
    if (!(await pg.evaluate(() => window.__rsPaused()))) await fail('Vollbild: Ende im Rennen pausiert nicht');
    await ctx.close();
    console.log('Vollbild: Standard ok, Schalter Menü ok, Menü-Ende ohne Pause, Rennen-Ende pausiert');
  }
  if (want('touch')) {
    // ── Touch: Gas halten, zweiter Finger lenkt mehrfach (auch über die Tastengrenze) -> Gas bleibt die ganze Zeit an ──
    {
      const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await ctx.addInitScript(() => { try { localStorage.setItem('rs-fs', '0'); localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-debug', '1'); } catch {} });
      const pg = await ctx.newPage(); await pg.goto(`http://127.0.0.1:${PORT}/?touch=1`);
      await pg.waitForSelector('button[data-level="matschgrube"], .rs-tile.world');
      await pg.tap('.rs-tile.world[title="Offroad"]'); await pick(pg, 'matschgrube', true);
      await pg.waitForSelector('#rs-speed', { state: 'visible' });
      if (!(await pg.evaluate(() => window.__rennspiel.carMesh.root.children.some((m) => m.material && m.material.color && m.material.color.getHex() === 0x2b2c30 && m.position.y < 0)))) await fail('Kompakter: keine Bodenplatte');
      const cdp = await ctx.newCDPSession(pg);
      const C = (sel) => pg.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
      const gas = await C('.rs-touch button.gas'), left = await C('.rs-touch button.l'), right = await C('.rs-touch button.r');
      const P = (id, x, y) => ({ x, y, id });
      const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
      const g = P(1, gas.x, gas.y);
      await send('touchStart', [g]); await sleep(900);
      const on = (c) => pg.evaluate((q) => document.querySelector('.rs-touch button.' + q).classList.contains('on'), c);
      const sample = async () => pg.evaluate(() => [document.querySelector('.rs-touch button.gas').classList.contains('on'), Number(document.getElementById('rs-speed').dataset.t)]);
      const s0 = await sample(); const gasOn = [s0[0]]; let maxS = s0[1];
      const steer = () => pg.evaluate(() => window.__rennspiel.car.steerAngle);
      for (let k = 0; k < 3; k++) {
        await send('touchStart', [g, P(2, left.x, left.y)]); await sleep(350); { const q = await sample(); gasOn.push(q[0]); maxS = Math.max(maxS, q[1]); }
        const stL = await steer();
        if (!(await on('l')) || await on('r')) await fail('Finger auf ◀: ◀ nicht allein an');
        for (let i = 1; i <= 6; i++) { await send('touchMove', [g, P(2, left.x + (right.x - left.x) * i / 6, left.y)]); await sleep(40); }   // in Schritten über die Grenze bis auf ▶
        await sleep(150); { const q = await sample(); gasOn.push(q[0]); maxS = Math.max(maxS, q[1]); }
        const stR = await steer();
        if (!(await on('r')) || await on('l')) await fail('Lenkfinger von ◀ auf ▶ gerutscht: ▶ nicht allein an');
        if (!(stL * stR < 0)) await fail(`Rutschen ◀→▶ wechselt die Lenkrichtung nicht (${stL} -> ${stR})`);
        await send('touchEnd', [P(2, right.x, right.y)]); await sleep(300); { const q = await sample(); gasOn.push(q[0]); maxS = Math.max(maxS, q[1]); }   // nur Finger 2 loslassen
        if (await on('l') || await on('r')) await fail('Lenkfinger oben: ◀/▶ noch an');
      }
      await sleep(600);
      const s1 = await sample(); gasOn.push(s1[0]);
      await send('touchEnd', [g]); await sleep(150);
      if (await pg.evaluate(() => [...document.querySelectorAll('.rs-touch button')].some((b) => b.classList.contains('on')))) await fail('Alle Finger oben: Taste hängt');
      // Systemabbruch (touchcancel): Taste ist aus, kein Geist
      await send('touchStart', [g]); await sleep(300);
      if (!(await on('gas'))) await fail('Gas-Finger: Taste nicht an');
      await send('touchCancel', []); await sleep(300);
      if (await on('gas')) await fail('touchCancel: Gas bleibt an (Geist)');
      console.log(`Touch Gas+Lenken: ${s0[1]} -> ${s1[1]} km/h, Gas an: ${gasOn.join('')}`);
      if (gasOn.some((v) => !v)) await fail('Gas setzt beim Lenken mit dem zweiten Finger aus: ' + gasOn);
      maxS = Math.max(maxS, s1[1]);
      if (!(maxS >= 5)) await fail(`Auto fährt beim Lenken mit Gas nicht (${s0[1]} -> max ${maxS})`);
      { await pg.tap('.rs-map'); await sleep(400); const o = await pg.evaluate(() => !document.querySelector('.rs-bigmap').classList.contains('hidden') && !window.__rsPaused()); const bb = await pg.evaluate(() => { const r = document.querySelector('.rs-bigmap').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); await pg.touchscreen.tap(bb[0], bb[1]); await sleep(400); const c = await pg.evaluate(() => document.querySelector('.rs-bigmap').classList.contains('hidden')); if (!o || !c) await fail(`Karte per Finger: auf (ohne Pause) ${o}, zu ${c}`); }   // Tipp auf die Minikarte öffnet (Touch-Handler darf den click nicht schlucken), Tipp schließt
      await ctx.close();
    }
  }
  if (want('ampel')) {
    // ── Startampel: rot, rot, grün; Gas vor Grün bewegt nichts, Uhr startet erst bei Grün ──
    {
      const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
      const pg = await ctx.newPage(); await pg.goto(`http://127.0.0.1:${PORT}/`);
      await pg.click('.rs-tile.world[title="Schnee"]'); await pick(pg, 'waldweg');
      await pg.waitForSelector('#rs-speed', { state: 'visible' });
      await pg.keyboard.down('ArrowUp');
      const st = () => pg.evaluate(() => ({ ph: document.getElementById('rs-lights').dataset.ph, vis: !document.getElementById('rs-lights').classList.contains('hidden'), v: window.__rennspiel.car.forwardSpeed, run: window.__rennspiel.run.state, t: window.__rennspiel.run.timeLeft }));
      const seen = new Set(); let early = null;
      for (let i = 0; i < 40; i++) { const a = await st(); if (a.vis) seen.add(a.ph); if (a.ph !== '3' && a.ph !== undefined && (a.v > 0.3 || a.run !== 'ready')) early = a; if (a.ph === '3') break; await sleep(100); }
      let b = await st(); for (let i = 0; i < 60 && !(b.v > 5 && !b.vis); i++) { await sleep(200); b = await st(); }   // SwiftShader: Spielzeit läuft langsamer als Echtzeit
      await pg.keyboard.up('ArrowUp');
      console.log('Startampel:', [...seen].join(','), JSON.stringify(b));
      if (!seen.has('1') || !seen.has('2')) await fail('Startampel: Rotphasen nicht gesehen ' + [...seen]);
      if (early) await fail('Startampel: Auto/Uhr läuft vor Grün ' + JSON.stringify(early));
      if (!(b.v > 5) || b.run !== 'run' || b.vis) await fail('Startampel: nach Grün fährt nichts / Ampel bleibt ' + JSON.stringify(b));
      await ctx.close();
    }

  }
  if (want('sprache')) {
    // ── Sprache: Systemsprache als Standard, Umschalter in Auswahl und Pause-Menü, gemerkt, wirkt sofort ──
    const tiles = (p) => p.evaluate(() => ({ lang: document.documentElement.lang, worlds: [...document.querySelectorAll('.rs-tile.world')].map((b) => b.title), lv: [...document.querySelectorAll('button.level .nm')].map((c) => c.dataset.t), mode: document.querySelector('.rs-menu button.mode').title, go: document.querySelector('.rs-go').title, on: document.querySelector('.rs-cfg button.lang.on')?.dataset.lang }));
    for (const [loc, want2] of [['fr-FR', 'en'], ['de-AT', 'de'], ['en-GB', 'en']]) {
      const ctx = await browser.newContext({ locale: loc, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const pg = await ctx.newPage(); await pg.goto(`http://127.0.0.1:${PORT}/?touch=1`);
      await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.level');
      const a = await tiles(pg);
      if (a.lang !== want2 || a.on !== want2) await fail(`Systemsprache ${loc}: erwartet ${want2}, ist ${JSON.stringify(a)}`);
      if (loc === 'en-GB') {
        if (a.worlds.filter((w) => w !== 'Suburb').join() !== 'Snow,City,Beach,Rhine,Offroad' || a.lv[0] !== 'Woods' || !a.mode.startsWith('Time trial')) await fail('EN-Menü: ' + JSON.stringify(a));
        await pg.tap('.rs-menu button.gear'); await pg.tap('.rs-cfg button.lang[data-lang="de"]'); await pg.touchscreen.tap(3, 3);   // Zahnrad -> Sprache: wirkt sofort; Tipp daneben schliesst das Feld
        const b = await tiles(pg);
        if (b.worlds.filter((w) => w !== 'Vorstadt').join() !== 'Schnee,City,Strand,Rhein,Offroad' || b.lv[0] !== 'Waldweg' || !b.mode.startsWith('Zeitfahren') || b.go !== 'Strecke starten (Enter)') await fail('Wechsel EN->DE in der Auswahl: ' + JSON.stringify(b));
        await pg.reload(); await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.level');
        if ((await tiles(pg)).lang !== 'de') await fail('Sprache nicht gemerkt');
        // Rennen starten, im Pause-Menü zurück auf EN: Beschriftungen, HUD-Titel, Untergrund, Menü danach
        await pg.tap('.rs-tile.world[data-world="snow"]'); await pick(pg, 'waldweg', true);
        await pg.waitForSelector('#rs-speed', { state: 'visible' });
        await pg.tap('button[data-act="pause"]'); await pg.waitForSelector('#rs-pause:not(.hidden)');
        await pg.tap('#rs-pause button.lang[data-lang="en"]'); await sleep(200);
        const c = await pg.evaluate(() => ({ resume: document.querySelector('#rs-pause button.again').title, txt: [...document.querySelectorAll('#rs-pause .btns canvas.px')].map((q) => q.dataset.t).join('|'), head: document.querySelector('#rs-pause .card > canvas.px').dataset.t, pause: document.querySelector('button[data-act="pause"]').title, spd: document.getElementById('rs-speed').title, on: document.querySelector('#rs-pause button.lang.on')?.dataset.lang, lang: document.documentElement.lang }));
        if (c.resume !== 'Resume' || c.txt !== '{play} Resume|Restart|{home} Menu' || c.pause !== 'Pause (P/Esc)' || c.spd !== 'Speed' || c.on !== 'en' || c.lang !== 'en') await fail('Pause-Umschalter: ' + JSON.stringify(c));
        await pg.tap('#rs-pause button.back'); await pg.waitForSelector('.rs-menu:not(.hidden)');
        const d = await tiles(pg);
        if (d.worlds[0] !== 'Snow' || d.on !== 'en') await fail('Menü nach Pause-Wechsel nicht englisch: ' + JSON.stringify(d));
      }
      console.log('Sprache', loc, '->', want2, 'ok');
      await ctx.close();
    }
  }
  if (want('lang')) {
    // ── Menü Offroad mit 5 Leveln: passt ins Bild, ohne Scroll (Handy hoch) ──
    for (const [vw, vh] of [[412, 915], [360, 740]]) {
      await page.setViewportSize({ width: vw, height: vh }); await page.reload();
      await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
      await page.click('.rs-tile.world[title="Offroad"]'); await sleep(250);
      const m = await page.evaluate(() => { const t = [...document.querySelectorAll('.rs-menu button.level')]; const p = t[0].closest('.panel') ?? t[0].parentElement; return { n: t.length, bottom: Math.round(t[t.length - 1].getBoundingClientRect().bottom), H: innerHeight, scroll: p.scrollHeight - p.clientHeight }; });
      if (m.n !== 5 || m.bottom > m.H || m.scroll > 1) await fail(`Offroad-Menü ${vw}x${vh}: ${JSON.stringify(m)}`);
    }
    await page.setViewportSize({ width: 1280, height: 800 }); await page.reload(); await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
    // ── Offroad-Neulinge: Steilhang + Moorwald über die Auswahl wählen, GO, Jeep gibt 3 s Gas -> fährt, kommt voran; Ladezeit loggen ──
    await page.evaluate(() => localStorage.setItem('rs-car', 'jeep'));
    for (const id of ['steilhang', 'moorwald']) {
      await page.reload(); await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
      await page.click('button[title^="Zeitfahren"]').catch(() => {});
      await page.click('.rs-tile.world[title="Offroad"]');
      const tiles = await page.evaluate(() => document.querySelectorAll('.rs-menu button.level').length);
      if (tiles < 5) await fail(`Offroad: ${tiles} Level-Kacheln statt 5`);
      await page.click(`button[data-level="${id}"]`); await page.waitForSelector(`.rs-menu button[data-level="${id}"].on`);
      const t0 = Date.now();
      await page.click('.rs-go');
      await page.waitForSelector('#rs-speed', { state: 'visible', timeout: 60000 });
      const ms = Date.now() - t0;
      const s0 = await page.evaluate(() => window.__rennspiel.run.tracker.s);
      await page.keyboard.down('ArrowUp'); await sleep(3000); await page.keyboard.up('ArrowUp');
      const r = await page.evaluate(() => ({ v: window.__rennspiel.car.speed, s: window.__rennspiel.run.tracker.s, lv: window.__rennspiel.run.course.id ?? null }));
      console.log(`lang ${id}: Laden ${ms} ms, Tempo ${r.v.toFixed(1)} m/s, Fortschritt ${(r.s - s0).toFixed(1)} m`);
      if (!(r.v > 0.5) || !(r.s - s0 > 5)) await fail(`${id}: Jeep fährt nicht los: ${JSON.stringify(r)} (s0 ${s0})`);
      await page.screenshot({ path: `${SHOTS}/rennspiel-lang-${id}.png` });
    }
    await page.evaluate(() => localStorage.setItem('rs-car', 'rally'));
  }
  if (want('seiten')) {
    // ── Streckenauswahl mit Seiten: Rhein (6 Strecken) -> Pfeil/Wisch auf Seite 2, Strecke dort antippen, GO startet genau sie ──
    for (const [vw, vh] of [[412, 915], [360, 740]]) {
      await page.setViewportSize({ width: vw, height: vh }); await page.evaluate(() => { localStorage.setItem('rs-world', 'rhein'); localStorage.removeItem('rs-lv-rhein'); }); await page.reload();
      await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
      const info = () => page.evaluate(() => ({ lv: [...document.querySelectorAll('.rs-menu button[data-level]')].map((b) => b.dataset.level), dots: document.querySelectorAll('.rs-pager .dot').length, on: document.querySelectorAll('.rs-pager .dot.on').length, h: Math.round(document.querySelector('.rs-menu .levels').getBoundingClientRect().height) }));
      const a = await info();
      if (a.lv.length !== 5 || a.dots !== 2 || a.lv.includes('koelner_ufer')) await fail(`Seiten ${vw}x${vh}: Seite 1 falsch ${JSON.stringify(a)}`);
      await page.click('.pg.next'); await sleep(150);
      const b = await info();
      if (b.lv.join() !== 'koelner_ufer' || b.h !== a.h) await fail(`Seiten ${vw}x${vh}: Seite 2 falsch ${JSON.stringify(b)} (Höhe vorher ${a.h})`);
      await page.click('.pg.prev'); await sleep(100);
      // Wischen links auf dem Kachelbereich = Seite 2
      const box = await page.evaluate(() => { const r = document.querySelector('.rs-menu .levels').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
      await page.mouse.move(box[0] + box[2] * 0.8, box[1] + box[3] / 2); await page.mouse.down(); await page.mouse.move(box[0] + box[2] * 0.2, box[1] + box[3] / 2, { steps: 6 }); await page.mouse.up(); await sleep(150);
      const c = await info();
      if (c.lv.join() !== 'koelner_ufer') await fail(`Seiten ${vw}x${vh}: Wischen links bringt nicht auf Seite 2 ${JSON.stringify(c)}`);
      if (vw === 360) await page.screenshot({ path: `${SHOTS}/rennspiel-seiten-2.png` });
      await pick(page, 'koelner_ufer');
      await page.waitForSelector('#rs-speed', { state: 'visible', timeout: 60000 });
      const id = await page.evaluate(() => window.__rennspiel.session.entry.id);
      if (id !== 'koelner_ufer') await fail(`Seiten ${vw}x${vh}: GO startete ${id}`);
      await home();
      // zuletzt gewählte Strecke bestimmt die Startseite
      await page.reload(); await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
      const d = await info();
      if (d.lv.join() !== 'koelner_ufer') await fail(`Seiten ${vw}x${vh}: Startseite folgt nicht der gewählten Strecke ${JSON.stringify(d)}`);
    }
    await page.evaluate(() => localStorage.setItem('rs-world', 'snow')); 
  }
  if (want('tastatur')) {
    // ── nur Tastatur: Welt per ←→, Strecke über die Seite, Enter startet genau sie; Esc = Pause, ↓ Enter = Neustart bzw. Menü ──
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => { localStorage.setItem('rs-world', 'snow'); localStorage.removeItem('rs-lv-rhein'); localStorage.setItem('rs-mode', 'time'); }); await page.reload();
    await page.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
    const K = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(60); } };
    const w0 = await page.evaluate(() => document.querySelector('.rs-tile.world.on').dataset.world);
    await K('ArrowUp'); await K('ArrowRight', 3);
    const w1 = await page.evaluate(() => document.querySelector('.rs-tile.world.on').dataset.world);
    if (w0 !== 'snow' || w1 !== 'rhein') await fail(`Tastatur: Welt ${w0} -> ${w1}`);
    await K('ArrowDown'); await K('ArrowRight', 5); await sleep(150);
    const lv = await page.evaluate(() => ({ on: document.querySelector('.rs-menu button[data-level].on')?.dataset.level, kf: document.querySelectorAll('.rs-menu .kf').length, kb: document.querySelector('.rs-root').classList.contains('kb'), ol: getComputedStyle(document.querySelector('.rs-menu .levels')).outlineStyle }));
    if (lv.on !== 'koelner_ufer' || lv.kf !== 1 || !lv.kb || lv.ol !== 'solid') await fail('Tastatur: Strecke/Fokus ' + JSON.stringify(lv));
    await page.screenshot({ path: `${SHOTS}/rennspiel-tastatur-menue.png` });
    await page.mouse.move(5, 5); await page.mouse.down(); await page.mouse.up();
    if (await page.evaluate(() => document.querySelector('.rs-root').classList.contains('kb'))) await fail('Tastatur: Rahmen bleibt nach Mausklick');
    await K('ArrowLeft'); await K('ArrowRight');
    await K('Enter');
    await page.waitForSelector('#rs-speed', { state: 'visible', timeout: 60000 });
    const id = await page.evaluate(() => window.__rennspiel.session.entry.id);
    if (id !== 'koelner_ufer') await fail('Tastatur: Enter startete ' + id);
    await K('Escape'); if (!(await page.evaluate(() => window.__rsPaused()))) await fail('Tastatur: Esc pausiert nicht');
    await page.screenshot({ path: `${SHOTS}/rennspiel-tastatur-pause.png` });
    const t0 = await page.evaluate(() => window.__rennspiel.session.run.elapsed);
    await K('ArrowDown'); await K('Enter'); await sleep(400);
    const r = await page.evaluate(() => ({ p: window.__rsPaused(), id: window.__rennspiel.session.entry.id, el: window.__rennspiel.session.run.elapsed }));
    if (r.p || r.id !== 'koelner_ufer' || r.el > 2) await fail('Tastatur: Neustart ' + JSON.stringify(r));
    await K('Escape'); await K('ArrowDown', 2); await K('Enter'); await sleep(400);
    if (await page.evaluate(() => document.querySelector('.rs-menu').classList.contains('hidden'))) await fail('Tastatur: Pause-Menü-Eintrag führt nicht ins Menü');
    // Endkarte: Esc = Menü
    await page.evaluate(() => localStorage.setItem('rs-world', 'snow'));
  }
  if (want('debug')) {
    // ── Debug-Modus: Schalter im Zahnrad (gespeichert, Standard aus), FPS-Zeile nur bei an ──
    const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    await ctx.addInitScript(() => {   // Teilen-API gemockt: Datei samt Inhalt landet in window.__shared
      window.__shared = []; window.__shareOn = true;
      navigator.canShare = (d) => window.__shareOn && !!d?.files?.length;
      navigator.share = async (d) => { const f = d.files[0]; window.__shared.push({ name: f.name, type: f.type, text: await f.text() }); };
    });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('dbgInit')) { sessionStorage.setItem('dbgInit', '1'); localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-fs', '0'); } } catch {} });
    const pg = await ctx.newPage(); await pg.goto(`http://127.0.0.1:${PORT}/`);
    await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
    const fpsVis = () => pg.evaluate(() => { const e = document.getElementById('rs-fps'); return getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; });
    const dbgBtn = pg.locator('.rs-cfg button.dbg');
    await pg.click('button.mode.gear'); await sleep(150);
    if (!(await dbgBtn.isVisible()) || (await dbgBtn.getAttribute('class')).includes('on') || await pg.evaluate(() => localStorage.getItem('rs-debug')) === '1') await fail('Debug: Standard nicht aus');
    await pg.evaluate(() => document.querySelector('.rs-cfg').classList.add('hidden'));
    await pg.click('.rs-tile.world[title="City"]'); await pick(pg, 'regenfahrt'); await pg.waitForSelector('#rs-speed', { state: 'visible', timeout: 60000 }); await sleep(900);
    if (await fpsVis()) await fail('Debug aus: FPS-Zeile sichtbar');
    await toMenu(pg); await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
    await pg.click('button.mode.gear'); await sleep(150); await dbgBtn.click(); await sleep(100);
    if (!(await dbgBtn.getAttribute('class')).includes('on') || await pg.evaluate(() => localStorage.getItem('rs-debug')) !== '1') await fail('Debug: Schalter an wirkt nicht');
    await pg.evaluate(() => document.querySelector('.rs-cfg').classList.add('hidden'));
    await pg.click('.rs-tile.world[title="City"]'); await pick(pg, 'regenfahrt'); await pg.waitForSelector('#rs-speed', { state: 'visible', timeout: 60000 });
    await pg.waitForFunction(() => /fps/.test(document.getElementById('rs-fps').dataset.t || ''), null, { timeout: 20000 });
    if (!(await fpsVis())) await fail('Debug an: FPS-Zeile nicht sichtbar');
    // kurze Fahrt mit Gas, Kran (R), Pause/Weiter, zurück ins Menü -> Log hat Kopf, Ereignisse in Reihenfolge, Spur
    await pg.keyboard.down('ArrowUp'); await sleep(1500);
    await pg.keyboard.press('KeyR'); await sleep(500);
    await pg.keyboard.press('KeyP'); await sleep(300); await pg.keyboard.press('KeyP'); await sleep(900);
    await pg.keyboard.up('ArrowUp');
    // Log-Knopf in der Pause -> Teilen-Menü (gemockt) bekommt eine Textdatei mit Kopf + Ereignissen
    await openPause(pg); await pg.click('#rs-pause button.log'); await sleep(300);
    { const sh = await pg.evaluate(() => window.__shared);
      if (sh.length !== 1 || !/^loreley-debug-\d{4}-\d\d-\d\d-\d{4}-regenfahrt\.txt$/.test(sh[0].name) || !/Level: regenfahrt/.test(sh[0].text) || !/ kran /.test(sh[0].text) || !/ start /.test(sh[0].text) || sh[0].type !== 'text/plain') await fail('Log teilen (Pause): ' + JSON.stringify(sh).slice(0, 400)); }
    await toMenu(pg); await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');
    await pg.click('button.mode.gear'); await sleep(150);   // Zahnrad: LOG nach der Fahrt, ohne Teilen-API -> Download
    await pg.evaluate(() => { window.__shareOn = false; });
    const logBtn = pg.locator('.rs-cfg button.log');
    if (!(await logBtn.isVisible()) || await logBtn.isDisabled()) await fail('Log teilen: Knopf im Zahnrad fehlt/gesperrt');
    { const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 10000 }), logBtn.click()]);
      const fs = await import('node:fs'); const p = await dl.path(); const txt = fs.readFileSync(p, 'utf8');
      if (!/^loreley-debug-.*\.txt$/.test(dl.suggestedFilename()) || !/Level: regenfahrt/.test(txt) || !/ menue/.test(txt)) await fail('Log-Download: ' + dl.suggestedFilename() + ' ' + txt.slice(0, 200)); }
    await pg.evaluate(() => document.querySelector('.rs-cfg').classList.add('hidden'));
    { const txt = await pg.evaluate(() => window.__rsDbgText());
      const kinds = [...txt.matchAll(/^\s*[+-]\d+\.\d+\s+(\S+)/gm)].map((m) => m[1]).filter((k) => !/^(fps|vollbild)$/.test(k));
      const rows = (txt.split('surf\n')[1] || '').trim().split('\n').filter(Boolean);
      if (kinds.join() !== 'start,kran,pause,weiter,pause,menue' || !/Level: regenfahrt/.test(txt) || !/Eingabe: Tastatur/.test(txt) || !/Version: /.test(txt) || rows.length < 5) await fail('Debug-Log: Ereignisse/Kopf/Spur: ' + kinds.join() + ' rows ' + rows.length + '\n' + txt.slice(0, 700)); }
    await pg.reload(); await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.world');   // bleibt nach Neuladen
    await pg.click('button.mode.gear'); await sleep(150);
    if (!(await dbgBtn.getAttribute('class')).includes('on')) await fail('Debug: Zustand nach Neuladen weg');
    await dbgBtn.click(); await sleep(100);
    await pg.evaluate(() => document.querySelector('.rs-cfg').classList.add('hidden'));
    await pg.click('.rs-tile.world[title="City"]'); await pick(pg, 'regenfahrt'); await pg.waitForSelector('#rs-speed', { state: 'visible', timeout: 60000 }); await sleep(900);
    if (await fpsVis() || await pg.evaluate(() => localStorage.getItem('rs-debug')) !== '0') await fail('Debug aus: Zeile bleibt');
    await ctx.close();
    console.log('Debug: Standard aus, Schalter speichert, FPS-Zeile nur bei an');
  }
  if (want('layout')) {
    // ── Touch-Layout: keine Überlappung, alles im Viewport, Tap auf Gas wirkt (echter Nutzerweg) ──
    const VPS = [['handy-hoch', 390, 844], ['handy-hoch-klein', 360, 740], ['handy-hoch-gross', 412, 915], ['handy-quer', 844, 390], ['tablet-quer', 1280, 800], ['tablet-hoch', 800, 1280]];
    for (const [name, w, h] of VPS.filter(([, w, h]) => !process.env.VP || process.env.VP.split(',').includes(`${w}x${h}`))) {   // VP=360x740,844x390 beschränkt den Lauf
      const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
      await ctx.addInitScript(() => { try { localStorage.setItem('rs-fs', '0'); localStorage.setItem('rs-cd', '0'); localStorage.setItem('rs-debug', '1'); } catch {} });   // kein Auto-Vollbild: das ändert mitten im Test die Viewport-Größe
      const pg = await ctx.newPage();
      pg.on('pageerror', (e) => errors.push(String(e)));
      await pg.goto(`http://127.0.0.1:${PORT}/?touch=1`);
      await pg.waitForSelector('.rs-menu:not(.hidden) button[data-level="waldweg"]');
      await pg.evaluate(() => { document.getElementById('rennspiel').style.height = 'calc(100vh - 52px)'; });  // piGallery-Kopf
      await sleep(150);
      const measure = (p) => p.evaluate(() => [...document.querySelectorAll('.rs-root button')]
        .filter((b) => b.offsetParent !== null)
        .map((b) => { const r = b.getBoundingClientRect(); return { t: b.title || b.dataset.level, x: r.left, y: r.top, r: r.right, b: r.bottom, sc: !!b.closest('.rs-menu .panel') }; }));
      const check = async (what, boxes, min, scrolls = false) => {   // scrolls: quer scrollt das Panel der Auswahl in sich
        if (boxes.length < min) await fail(`${name} ${what}: nur ${boxes.length} Tasten sichtbar`);
        for (const a of boxes) if (a.x < 0 || a.y < 0 || a.r > w || (a.b > h - 52 && !(scrolls && a.sc))) await fail(`${name} ${what}: ${a.t} ragt aus dem Viewport`);
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          if (a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b) await fail(`${name} ${what}: ${a.t} überlappt ${c.t}`);
        }
      };
      await check('Auswahl', await measure(pg), 7, w > h);     // 2 Modi, 2 Autos, 2 Welten, 3 Level
      if (name !== 'tablet-hoch') await pg.screenshot({ path: `${SHOTS}/rennspiel-auswahl-${name}.png` });
      await pick(pg, 'waldweg', true);
      await pg.waitForSelector('#rs-speed', { state: 'visible' });
      await sleep(150);
      const boxes = await measure(pg);
      await check('Fahrt', boxes, 7);   // Pause, Vollbild, ◀ ▶, Handbremse, Bremse, Gas
      // Obere Leiste: HUD, Restzeit und jeder Knopf überlappen sich nicht; Texte bleiben im Kasten; ▦ ändert Größe/Lage der UI nicht
      const bar = () => pg.evaluate(() => {
        const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; };
        const parts = [['hud', document.querySelector('.rs-hud')], ['restzeit', document.querySelector('.rs-goal')], ...[...document.querySelectorAll('.rs-tools button')].map((b) => [b.title, b])].filter(([, e]) => e.offsetParent !== null).map(([n, e]) => ({ n, ...R(e) }));
        const clipped = [...document.querySelectorAll('.rs-hud canvas, .rs-goal canvas')].filter((c) => c.dataset.t && c.offsetParent && (c.dataset.t = c.dataset.t, true)).filter((c) => { const p = c.closest('.rs-hud, .rs-goal').getBoundingClientRect(), r = c.getBoundingClientRect(); return r.right > p.right + 0.5 || r.left < p.left - 0.5; }).map((c) => c.dataset.t + '@' + Math.round(c.getBoundingClientRect().right) + '>' + Math.round(c.closest('.rs-hud, .rs-goal').getBoundingClientRect().right));
        const t = [...document.querySelectorAll('.rs-touch button')].filter((e) => e.offsetParent !== null).map((e) => R(e));
        return { parts, clipped, touch: t, u: getComputedStyle(document.querySelector('.rs-root')).getPropertyValue('--u') };
      });
      const b0 = await bar();
      const hit = (a, c) => a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b;
      for (let i = 0; i < b0.parts.length; i++) for (let j = i + 1; j < b0.parts.length; j++) if (hit(b0.parts[i], b0.parts[j])) await fail(`${name}: obere Leiste: ${b0.parts[i].n} überlappt ${b0.parts[j].n}`);
      const mr = await pg.evaluate(() => { const r = document.querySelector('.rs-map').getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; });
      if (mr.x < 0 || mr.r > w || mr.y < 0 || mr.b > h) await fail(`${name}: Minimap ragt aus dem Viewport`);
      for (const a of b0.parts) if (hit(a, mr)) await fail(`${name}: Minimap überlappt ${a.n}`);
      for (const c of b0.touch) if (hit(c, mr)) await fail(`${name}: Minimap überlappt Touch-Taste`);
      {   // große Karte (Finger) wächst in der Ecke: im Bild, überdeckt weder Tempo/Restzeit/Knöpfe noch Touch-Tasten
        await pg.tap('.rs-map'); await sleep(400);
        const br = await pg.evaluate(() => { const b = document.querySelector('.rs-bigmap'), r = b.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, open: !b.classList.contains('hidden'), paused: window.__rsPaused() }; });
        if (!br.open || br.paused) await fail(`${name}: große Karte öffnet nicht/pausiert: ` + JSON.stringify(br));
        if (br.x < 0 || br.r > w || br.y < 0 || br.b > h) await fail(`${name}: große Karte ragt aus dem Viewport ` + JSON.stringify(br));
        for (const a of b0.parts) if (hit(a, br)) await fail(`${name}: große Karte überdeckt ${a.n} ${JSON.stringify([a, br])}`);
        for (const c of b0.touch) if (hit(c, br)) await fail(`${name}: große Karte überdeckt Touch-Taste ${JSON.stringify([c, br])}`);
        await pg.tap('.rs-bigmap'); await sleep(300);
        if (!(await pg.evaluate(() => document.querySelector('.rs-bigmap').classList.contains('hidden')))) await fail(`${name}: Tipp verkleinert die Karte nicht`);
      }
      for (const a of b0.parts) { if (a.x < 0 || a.r > w) await fail(`${name}: obere Leiste: ${a.n} ragt seitlich raus`); for (const c of b0.touch) if (hit(a, c)) await fail(`${name}: ${a.n} überlappt Touch-Taste`); }
      if (b0.clipped.length) await fail(`${name}: Text in der oberen Leiste ragt aus dem Kasten: ${b0.clipped}`);
      // fps-Zeile : im Viewport, nichts überdeckt sie (HUD, Restzeit, Knöpfe, Minimap, Touch-Tasten)
      const fr = await pg.evaluate(() => { const e = document.querySelector('.rs-fps'); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, vis: e.offsetParent !== null || getComputedStyle(e).position === 'fixed' }; });
      if (!fr.vis || fr.r - fr.x < 5) await fail(`${name}: fps-Zeile unsichtbar`);
      if (fr.x < 0 || fr.r > w || fr.y < 0 || fr.b > h - 52) await fail(`${name}: fps-Zeile ragt aus dem Viewport ${JSON.stringify(fr)}`);
      for (const a of b0.parts) if (hit(a, fr)) await fail(`${name}: fps-Zeile überlappt ${a.n}`);
      for (const c of b0.touch) if (hit(c, fr)) await fail(`${name}: fps-Zeile überlappt Touch-Taste`);
      if (hit(mr, fr)) await fail(`${name}: fps-Zeile überlappt Minimap`);
      await pg.evaluate(() => document.querySelector('button[title^="Auflösung"]').click()); await sleep(200);
      const b1 = await bar();
      if (b1.u !== b0.u || JSON.stringify(b1.parts.map((p) => [p.n, p.x, p.y, p.r, p.b])) !== JSON.stringify(b0.parts.map((p) => [p.n, p.x, p.y, p.r, p.b])) || JSON.stringify(b1.touch) !== JSON.stringify(b0.touch)) await fail(`${name}: ▦ verändert UI-Größe/Position`);
      await pg.evaluate(() => document.querySelector('button[title^="Auflösung"]').click()); await pg.evaluate(() => document.querySelector('button[title^="Auflösung"]').click()); await pg.evaluate(() => document.querySelector('button[title^="Auflösung"]').click()); await sleep(100);
      if (name === 'handy-hoch' || name === 'handy-hoch-klein') await pg.screenshot({ path: `${SHOTS}/rennspiel-leiste-${name}.png` });
      const g = boxes.find((b) => b.t === 'Gas');
      await sleep(300);
      const s0 = Number(await T(pg, '#rs-speed'));
      // Gas halten: Touch-Pointer per CDP (tap ist zu kurz)
      const cdp = await ctx.newCDPSession(pg);
      const pt = { x: (g.x + g.r) / 2, y: (g.y + g.b) / 2, id: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
      let s1 = 0;
      for (let i = 0; i < 12 && !(s1 > s0 + 5); i++) { await sleep(500); s1 = Number(await T(pg, '#rs-speed')); }   // je nach Last (fps) dauert es
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      if (name !== 'tablet-hoch') await pg.screenshot({ path: `${SHOTS}/rennspiel-waldweg-${name}.png` });
      console.log(`${name} ${w}x${h}: ${boxes.length} Tasten ok, Gas-Touch ${s0} -> ${s1} km/h`);
      if (!(s1 > s0 + 5)) await fail(`${name}: Touch-Gas ohne Wirkung (${s0} -> ${s1})`);
      await ctx.close();
    }
  }
  if (errors.length) await fail('Konsolenfehler: ' + errors.join(' | '));
  console.log('smoke ok');
} catch (e) { await fail(String(e)); }
await browser.close(); srv.kill();

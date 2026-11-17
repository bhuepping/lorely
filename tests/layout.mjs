// Layout-Prüfung der ganzen Oberfläche. Läuft nach dem Smoketest (`npm test`), einzeln: `node tests/layout.mjs`.
// Jede sichtbare Oberfläche (Menü je Welt, Startampel, Fahrt je ▦-Stufe, Pause, Endkarte) wird in 7 Viewports
// gegen dieselben Regeln geprüft (Funktion AUDIT, läuft im Browser):
//  1. alles liegt ganz im Spielbereich (Menü: seitlich; scrollt es, nicht senkrecht)
//  2. Kästen/Knöpfe/Panels/Kacheln/Logo überlappen sich paarweise nicht (Vorfahr/Nachfahr ausgenommen)
//  3. Text/Pixel-Canvas liegt innerhalb der Innenkante (Rahmen abgezogen) seines Knopfes/Panels/der Karte, nichts scrollt im Kasten
//  4. Pixeltext ist nicht gequetscht (Seitenverhältnis), Namen nicht gekürzt (data-t === data-full, keine Ellipse)
//  5. Mindestgrößen: Knöpfe >= 28 px (Touch-Tasten >= 44), Schrift >= 1,5 px je Bildpunkt (fps-Zeile ausgenommen)
//  6. grober Kontrast (WCAG-Verhältnis >= 3) von Text gegen Panel-Hintergrund (Szene dahinter = mittleres Grau angenommen)
// Umgebung: VP=412x915 oder VP=412x915,360x740 (nur diese Viewports), PORT=…, SHOT_DIR=… (Screenshots), STATES=menu,ready,race,pause,end
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PW = process.env.PLAYWRIGHT_BROWSERS_PATH || `${process.env.HOME}/.cache/ms-playwright`;
const shellDir = readdirSync(PW).find((d) => d.startsWith('chromium_headless_shell'));
const exe = `${PW}/${shellDir}/chrome-headless-shell-linux64/chrome-headless-shell`;
const SHOTS = process.env.SHOT_DIR || '/tmp/claude-1000/-home-bjoern-claude/d9adac7b-6390-450b-8a59-bf62b8eaea51/scratchpad/layout';
mkdirSync(SHOTS, { recursive: true });
const PORT = Number(process.env.PORT || 4173);
const ALL = [[320, 700], [340, 740], [360, 740], [390, 844], [412, 915], [844, 390], [915, 412], [800, 1280], [1280, 800]];
const VPS = process.env.VP ? process.env.VP.split(',').map((v) => v.split('x').map(Number)) : ALL;
const LANGS = (process.env.LANG_SET || 'de,en').split(',');   // beide Sprachen: Englisch ist teils länger
const STATES_ALL = (process.env.STATES || 'menu,ready,race,pause,end').split(',');
let STATES = STATES_ALL;   // unter 360 px nur HUD-Zustände (Menü mit 6 Kacheln ist dort bekannt zu hoch, kein Handy-Maß)
// Strecke wählen und starten (wie im Spiel: Kachel wählt aus, GO startet; markierte Kachel startet direkt)
const pickT = async (p, id) => { const on = await p.evaluate((i) => !!document.querySelector(`button[data-level="${i}"]`)?.classList.contains('on'), id); if (!on) await p.tap(`button[data-level="${id}"]`); await p.tap('.rs-go'); };
// Zurückgestellte Regeln (Regex auf die Meldung); leer = alle Regeln gelten hart.
const DEFER = [];
const menuH = {};   // vp -> Welt -> Höhe
const HEAD = 52;   // piGallery-Kopf neben dem Spiel: das Spiel ist 52 px niedriger als der Viewport

// ── läuft im Browser ──
const AUDIT = ({ scope, vscroll, what }) => {
  const root = document.querySelector('.rs-root'), rr = root.getBoundingClientRect();
  const out = [];
  const sc = document.querySelector(scope);
  if (!sc) return [what + ': Bereich ' + scope + ' fehlt'];
  const vis = (e) => {
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false; }
    return true;
  };
  const name = (e) => (e.title || e.dataset?.t || e.dataset?.level || e.className?.baseVal || e.className || e.tagName).toString().slice(0, 28);
  const R = (e) => e.getBoundingClientRect();
  const all = (q) => [...sc.querySelectorAll(q)].filter(vis);
  const boxes = all('button, .pbox, .rs-hud, .rs-goal, .rs-map, .rs-fps, .rs-lights, .card, .panel, canvas.logo, .rs-prog');
  // 1. im Spielbereich
  for (const e of boxes) {
    const r = R(e), t = 0.6;
    if (r.left < rr.left - t || r.right > rr.right + t) out.push(`${what}: ${name(e)} ragt seitlich aus dem Spielbereich (${Math.round(r.left)}..${Math.round(r.right)} von ${Math.round(rr.left)}..${Math.round(rr.right)})`);
    const scrolls = vscroll && e.closest('.rs-menu');
    if (!scrolls && (r.top < rr.top - t || r.bottom > rr.bottom + t)) out.push(`${what}: ${name(e)} ragt oben/unten aus dem Spielbereich (${Math.round(r.top)}..${Math.round(r.bottom)} von ${Math.round(rr.bottom)})`);
  }
  // 2. paarweise Überlappung
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.contains(b) || b.contains(a)) continue;
    const p = R(a), q = R(b), t = 0.5;
    if (p.left < q.right - t && q.left < p.right - t && p.top < q.bottom - t && q.top < p.bottom - t) out.push(`${what}: ${name(a)} überlappt ${name(b)}`);
  }
  // 2b. HUD-Kästen oben: mindestens 8 px Abstand (nicht nur „keine Überlappung“); Tempo über Untergrund steht bewusst eng
  {
    const kind = (e) => e.matches('.rs-hud') ? 'hud' : e.matches('.rs-goal') ? 'goal' : e.matches('.rs-plus') ? 'plus' : e.matches('.rs-surf') ? 'surf' : e.matches('.rs-tools button') ? 'btn' : e.matches('.rs-map') ? 'map' : '';
    const hb = boxes.filter((e) => kind(e));
    for (let i = 0; i < hb.length; i++) for (let j = i + 1; j < hb.length; j++) {
      const ka = kind(hb[i]), kb = kind(hb[j]);
      if (ka === kb || [ka + kb, kb + ka].some((k) => k === 'hudsurf' || k === 'btnmap')) continue;
      const p = R(hb[i]), q = R(hb[j]), gap = Math.max(p.left - q.right, q.left - p.right, p.top - q.bottom, q.top - p.bottom);
      if (gap < 8) out.push(`${what}: ${name(hb[i])}/${name(hb[j])} nur ${Math.round(gap)} px Abstand (Soll 8)`);
    }
  }
  // 3.–6. Text/Pixel-Canvas
  const parse = (c) => { const m = getComputedStyle(c).color; return m; };
  void parse;
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgba = (s) => { const m = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return [m[0], m[1], m[2], m[3] ?? 1]; };
  for (const c of all('canvas.px')) {
    const r = R(c), t = c.dataset.t || '', cell = r.width / c.width;
    if (c.classList.contains('logo')) continue;
    const cont = c.closest('button, .pbox, .card, .panel');
    if (cont && sc.contains(cont)) {
      const cr = R(cont), cs = getComputedStyle(cont);
      const L = cr.left + parseFloat(cs.borderLeftWidth), Rr = cr.right - parseFloat(cs.borderRightWidth), T = cr.top + parseFloat(cs.borderTopWidth), B = cr.bottom - parseFloat(cs.borderBottomWidth);
      if (r.left < L - 0.6 || r.right > Rr + 0.6 || r.top < T - 0.6 || r.bottom > B + 0.6) out.push(`${what}: "${t.slice(0, 24)}" ragt aus ${name(cont)} (${Math.round(r.left)}..${Math.round(r.right)} / ${Math.round(r.top)}..${Math.round(r.bottom)} gegen ${Math.round(L)}..${Math.round(Rr)} / ${Math.round(T)}..${Math.round(B)})`);
      if (cont.scrollWidth > cont.clientWidth + 1) out.push(`${what}: ${name(cont)} läuft über (scrollWidth ${cont.scrollWidth} > ${cont.clientWidth})`);
    }
    if (r.left < rr.left - 0.6 || r.right > rr.right + 0.6) out.push(`${what}: "${t.slice(0, 24)}" ragt seitlich aus dem Spielbereich`);
    // 4. gequetscht / gekürzt
    const asp = (r.width / r.height) / (c.width / c.height);
    if (Math.abs(asp - 1) > 0.04) out.push(`${what}: "${t.slice(0, 24)}" gequetscht (Seitenverhältnis ${asp.toFixed(2)})`);
    if (c.dataset.full && c.dataset.full !== t) out.push(`${what}: Name gekürzt "${t}" statt "${c.dataset.full}"`);
    if (/[A-Za-z0-9ÄÖÜäöü][.]$/.test(t) && c.dataset.full) out.push(`${what}: Ellipse in "${t}"`);
    // 5. Mindestgröße
    const hasText = /[A-Z0-9]/i.test(t.replace(/\{[^}]*\}/g, ''));
    if (hasText && !c.classList.contains('rs-fps') && cell < 1.45) out.push(`${what}: Schrift "${t.slice(0, 20)}" zu klein (${cell.toFixed(2)} px je Bildpunkt)`);
    // 6. Kontrast
    if (hasText && !c.classList.contains('rs-fps')) {
      let bg = [128, 128, 128];
      const chain = []; for (let n = c.parentElement; n && n !== document.documentElement; n = n.parentElement) chain.unshift(n);
      for (const n of chain) { const [r0, g0, b0, a0] = rgba(getComputedStyle(n).backgroundColor); if (a0 > 0) bg = [r0 * a0 + bg[0] * (1 - a0), g0 * a0 + bg[1] * (1 - a0), b0 * a0 + bg[2] * (1 - a0)]; }
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = [0, 0, 0], n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] + d[i + 1] + d[i + 2] > 120) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; }
      if (n) {
        const l1 = lum(s[0] / n, s[1] / n, s[2] / n), l2 = lum(...bg), cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        if (cr < 3) out.push(`${what}: Kontrast "${t.slice(0, 20)}" nur ${cr.toFixed(1)}`);
      }
    }
  }
  // Touch-Tasten: Rand frei für Systemgesten (seitlich/unten >= 8)
  for (const b of all('.rs-touch button')) {
    const r = R(b);
    if (r.left - rr.left < 7.5 || rr.right - r.right < 7.5 || rr.bottom - r.bottom < 7.5) out.push(`${what}: Touch-Taste ${name(b)} zu nah am Rand (links ${Math.round(r.left - rr.left)}, rechts ${Math.round(rr.right - r.right)}, unten ${Math.round(rr.bottom - r.bottom)})`);
  }
  // Knöpfe: Mindestgröße
  for (const b of all('button')) {
    const r = R(b), touch = !!b.closest('.rs-touch'), m = touch ? 58 : 28;
    if (r.width < m - 0.5 || r.height < m - 0.5) out.push(`${what}: Knopf ${name(b)} zu klein (${Math.round(r.width)}x${Math.round(r.height)} < ${m})`);
  }
  return out;
};

const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
const problems = [];
const note = (vp, list) => { for (const p of list) problems.push(`[${vp}] ${p}`); };
const finish = async (code) => { await browser?.close(); srv.kill(); process.exit(code); };
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch {} await sleep(100); }
  browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  for (const [lg, [w, h]] of LANGS.flatMap((l) => VPS.map((v) => [l, v]))) {
    const vp = `${w}x${h}-${lg}`;
    STATES = STATES_ALL;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, locale: lg === 'de' ? 'de-DE' : 'en-GB' });
    await ctx.addInitScript(() => { try { localStorage.setItem('rs-fs', '0'); localStorage.setItem('rs-debug', '1'); } catch {} });   // Debug an: fps-Zeile und Log-Knöpfe werden mitgeprüft; Ampel bleibt an (sie wird mitgeprüft), kein Auto-Vollbild
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push(String(e)));
    pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await pg.goto(`http://127.0.0.1:${PORT}/?touch=1`);
    await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.level');
    await pg.evaluate((H) => { document.getElementById('rennspiel').style.height = `calc(100vh - ${H}px)`; }, HEAD);
    await sleep(200);
    const audit = async (scope, what, vscroll = false) => note(vp, await pg.evaluate(AUDIT, { scope, vscroll, what }));
    const shot = (n) => pg.screenshot({ path: `${SHOTS}/${n}-${vp}.png` });

    // ── Menü: jede Welt, mit langen Zeiten/Sternen (Bestzeit 123,4 s, 30 Sterne, je Level ein anderes Auto) ──
    const ids = [];
    const worlds = await pg.evaluate(() => [...document.querySelectorAll('.rs-tile.world')].map((b) => b.dataset.world));
    for (const wn of worlds) { await pg.click(`.rs-tile.world[data-world="${wn}"]`); for (let k = 0; k < 4; k++) { ids.push(...(await pg.evaluate(() => [...document.querySelectorAll('button.level[data-level]')].map((b) => b.dataset.key || b.dataset.level)))); if (await pg.evaluate(() => !document.querySelector('.pg.next:not(:disabled)'))) break; await pg.click('.pg.next'); } }
    if (STATES.includes('menu')) for (const wn of worlds) {   // zuerst ohne Bestzeiten (Platzhalter: neue/umgebaute Level starten leer)
      await pg.click(`.rs-tile.world[data-world="${wn}"]`); await sleep(150); await audit('.rs-menu', `Menü leer ${wn}`, w / h > 1.3 || h < 700);
    }
    await pg.evaluate((ids) => localStorage.setItem('rs-save', JSON.stringify(Object.fromEntries(ids.map((id) => [id, { rest: { hatch: 123.4, buggy: 123.4, rally: 123.4 }, stars: 30 }])))), ids);
    await pg.reload(); await pg.waitForSelector('.rs-menu:not(.hidden) .rs-tile.level');
    await pg.evaluate((H) => { document.getElementById('rennspiel').style.height = `calc(100vh - ${H}px)`; }, HEAD);
    if (STATES.includes('menu')) {
      for (const wn of worlds) {
        await pg.click(`.rs-tile.world[data-world="${wn}"]`); await sleep(250);
        await audit('.rs-menu', `Menü ${wn}`, w / h > 1.3 || h < 700);
        const sc = await pg.evaluate(() => { const m = document.querySelector('.rs-menu'), p = m.querySelector('.panel'); return [m.scrollHeight - m.clientHeight, p.scrollHeight - p.clientHeight]; });
        if (sc[0] > 1 || sc[1] > 1) problems.push(`[${vp}] Menü ${wn}: scrollt (Menü +${sc[0]} px, Panel +${sc[1]} px)`);
        // feste Höhe: Panel und Kachelbereich in jeder Welt gleich groß (leere Plätze reserviert); Seite 2 ebenso, ohne Überlauf
        const hh = await pg.evaluate(() => { const r = (q) => Math.round(document.querySelector(q).getBoundingClientRect().height); return [r('.rs-menu .panel'), r('.rs-menu .levels')]; });
        (menuH[vp] ??= {})[wn] = hh.join('/');
        if (await pg.evaluate(() => !!document.querySelector('.pg.next:not(:disabled)'))) {
          await pg.click('.pg.next'); await sleep(150); await audit('.rs-menu', `Menü ${wn} Seite 2`, w / h > 1.3 || h < 700);
          const h2 = await pg.evaluate(() => { const r = (q) => Math.round(document.querySelector(q).getBoundingClientRect().height); return [r('.rs-menu .panel'), r('.rs-menu .levels')].join('/'); });
          if (h2 !== hh.join('/')) problems.push(`[${vp}] Menü ${wn}: Seite 2 anders hoch (${h2} statt ${hh.join('/')})`);
          if (wn === 'rhein') await shot('menue-seite2');
          await pg.click('.pg.prev'); await sleep(100);
        }
        if (wn === 'rhein') await shot('menue-rhein');
        if (!(await pg.evaluate(() => { const c = document.querySelectorAll('.rs-menu .brand canvas.logo')[1]; return !!c && getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().height > 4; }))) problems.push(`[${vp}] Menü ${wn}: Untertitel „Low Res Rally“ fehlt`);
        if (wn === 'snow') await shot('menue');
      }
      // Zahnrad-Feld (Sprache, Vollbild-Schalter, Zurücksetzen): Knöpfe passen, Screenshot
      await pg.click('button.mode.gear'); await sleep(150);
      await audit('.rs-cfg', 'Zahnrad-Feld', w / h > 1.3 || h < 700);
      await shot('zahnrad');
      await pg.evaluate(() => document.querySelector('.rs-cfg').classList.add('hidden'));
      const hs = Object.entries(menuH[vp] ?? {});
      if (new Set(hs.map(([, v]) => v)).size > 1) problems.push(`[${vp}] Menühöhe je Welt verschieden: ${hs.map(([k, v]) => k + ' ' + v).join(', ')}`);
    }
    // ── Fahrt starten (Schnee/Waldweg): Ampel, dann je ▦-Stufe ──
    await pg.click('.rs-tile.world[data-world="snow"]'); await pickT(pg, 'waldweg');
    await pg.waitForSelector('#rs-speed', { state: 'visible' });
    if (STATES.includes('ready')) {
      let seen = false;
      for (let i = 0; i < 20 && !seen; i++) { seen = await pg.evaluate(() => { const l = document.getElementById('rs-lights'); return !l.classList.contains('hidden') && getComputedStyle(l).opacity === '1'; }); if (!seen) await sleep(60); }
      if (!seen) problems.push(`[${vp}] Startampel nie sichtbar`);
      else { await audit('.rs-root', 'Ampel/Fahrt', false); await shot('ampel'); }
    }
    // Ampel abwarten (SwiftShader: Spielzeit läuft langsamer)
    await pg.waitForFunction(() => document.getElementById('rs-lights').classList.contains('hidden'), null, { timeout: 60000 });
    // Schlimmster Fall für die Anzeige: dreistellig schnell, lange Untergrund-Namen, volle Sterne, lange Uhr
    await pg.evaluate(() => {
      const rs = window.__rennspiel, car = rs.car, run = rs.run;
      Object.defineProperty(car, 'surfaceName', { configurable: true, get: () => 'Nasser Asphalt', set: () => {} });
      Object.defineProperty(car, 'forwardSpeed', { configurable: true, get: () => 44.4, set: () => {} });
      run.elapsed = 754; run.stars = 12;   // „12:34“
    });
    if (STATES.includes('race')) {
      const cur = async () => pg.evaluate(() => Number(document.querySelector('button[data-act="res"] canvas').dataset.t.replace('{grid}', '')));
      for (let k = 0; k < 4; k++) {
        const s = await cur();
        await sleep(350);   // HUD-Update (100 ms) abwarten
        await audit('.rs-root', `Fahrt ▦${s}`, false);
        if (k === 0) await shot('fahrt');
        // ▦ ändert Größe/Lage der Oberfläche nicht
        const geo = JSON.stringify(await pg.evaluate(() => ['.rs-hud', '.rs-surf', '.rs-goal', '.rs-map', '.rs-tools button', '.rs-touch button'].flatMap((q) => [...document.querySelectorAll(q)].map((e) => { const r = e.getBoundingClientRect(); return [q, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }))));
        if (k === 0) var geo0 = geo; else if (geo !== geo0) problems.push(`[${vp}] ▦${s} verändert Größe/Lage der Oberfläche`);
        await pg.evaluate(() => document.querySelector('button[data-act="res"]').click());
        await sleep(200);
      }
    }
    // +N-Anzeige (Stern/Strafe) neben der Restzeit: eigener Kasten, kein Überlapp
    if (STATES.includes('race')) { await pg.evaluate(() => window.__rsFlash(10)); await sleep(80); await audit('.rs-root', 'Fahrt +10', false); await sleep(1000); }
    // Richtungspfeil + Hinweis „CHECKPOINT“ unter der Restzeit: eigener Kasten, kein Überlapp (Pfeil erzwungen, wie die Worst-Case-Werte oben)
    if (STATES.includes('race')) {
      await pg.evaluate(() => { const run = window.__rennspiel.run; Object.defineProperty(run, 'arrowOn', { configurable: true, get: () => true, set: () => {} }); Object.defineProperty(run, 'missCount', { configurable: true, get: () => 1, set: () => {} }); run.aim = { x: run.aim.x + 40, z: run.aim.z - 10 }; Object.defineProperty(run, 'state', { configurable: true, get: () => 'run', set: () => {} }); });
      let nav = false; for (let i = 0; i < 30 && !nav; i++) { await sleep(100); nav = await pg.evaluate(() => { const n = document.querySelector('.rs-nav'); return n.classList.contains('on') && !n.querySelector('.hint').classList.contains('hidden') && getComputedStyle(n).opacity > 0.8; }); }
      if (!nav) problems.push(`[${vp}] Richtungspfeil/Hinweis nie sichtbar`);
      else { await audit('.rs-root', 'Fahrt Pfeil+Hinweis', false); await shot('pfeil'); }
      await pg.evaluate(() => { const run = window.__rennspiel.run; delete run.arrowOn; delete run.missCount; delete run.state; run.arrowOn = false; run.missCount = 0; run.state = 'run'; });
    }
    // ── Pause ──
    if (STATES.includes('pause')) {
      await pg.evaluate(() => document.querySelector('button[data-act="pause"]').click()); await sleep(250);
      await audit('#rs-pause', 'Pause', false);
      await shot('pause');
      await pg.evaluate(() => document.querySelector('#rs-pause button.again').click()); await sleep(150);
    }
    // ── Notch: sicherer Rand oben 40 px (CSS-Variable --sat): alles Obere beginnt darunter, nichts überlappt ──
    if (STATES.includes('race') && w < h) {
      await pg.evaluate(() => document.querySelector('.rs-root').style.setProperty('--sat', '40px')); await sleep(300);
      await audit('.rs-root', 'Notch 40 px', false);
      const hi = await pg.evaluate(() => { const rr = document.querySelector('.rs-root').getBoundingClientRect(); return [...document.querySelectorAll('.rs-top > *, .rs-map, .rs-fps')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && getComputedStyle(e).display !== 'none'; }).map((e) => [e.className.toString().slice(0, 20), Math.round(e.getBoundingClientRect().top - rr.top)]).filter(([, t]) => t < 39.5); });
      if (hi.length) problems.push(`[${vp}] Notch 40 px: oben zu hoch: ${JSON.stringify(hi)}`);
      await shot('notch');
      await pg.evaluate(() => document.querySelector('.rs-root').style.removeProperty('--sat'));
    }
    // ── Endkarte: Sieg (Rekord, volle Werte) und längste Zeit ──
    if (STATES.includes('end')) {
      await pg.evaluate(() => { const rs = window.__rennspiel, run = rs.run; run.state = 'run'; run.elapsed = 123.4; run.stars = 12; rs.session.newBest = true; run.course.goal = { s: -1 }; run.cps?.got.fill(1); });
      await pg.waitForSelector('#rs-end:not(.hidden)', { timeout: 30000 }); await sleep(300);
      await audit('#rs-end', 'Endkarte Sieg', false);
      await shot('ende');
      await pg.evaluate(() => document.querySelector('#rs-end button.back').click());
      await pg.waitForSelector('.rs-menu:not(.hidden)');
      await pickT(pg, 'waldweg'); await pg.waitForSelector('#rs-speed', { state: 'visible' });
      await pg.waitForFunction(() => document.getElementById('rs-lights').classList.contains('hidden'), null, { timeout: 60000 });
      await pg.evaluate(() => { const run = window.__rennspiel.run; run.state = 'won'; run.elapsed = 754.3; run.stars = 3; });   // Ziel erreicht: Endkarte mit der längsten Zeit
      await pg.waitForSelector('#rs-end:not(.hidden)', { timeout: 30000 }); await sleep(300);
      await audit('#rs-end', 'Endkarte Zeit', false);
    }
    console.log(`${vp}: geprüft (${problems.filter((p) => p.startsWith('[' + vp)).length} Probleme)`);
    await ctx.close();
  }
  if (errors.length) problems.push('Konsolenfehler: ' + [...new Set(errors)].join(' | '));
  if (problems.length) {
    const uniq = [...new Set(problems)].filter((p) => !DEFER.some((d) => d.test(p)));
    if (!uniq.length) { console.log('layout ok (zurückgestellt: ' + DEFER.length + ' Regeln)'); await finish(0); }
    console.error(`FAIL: ${uniq.length} Layout-Probleme\n` + uniq.slice(0, 80).join('\n'));
    await finish(1);
  }
  console.log('layout ok');
  await finish(0);
} catch (e) { console.error('FAIL:', e); await finish(1); }

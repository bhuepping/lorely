// Oberfläche: baut alle Bildschirmelemente (rs-*) und liefert sie mit den kleinen Update-Funktionen zurück. Kennt weder Schleife noch Sitzungsaufbau.
import { CARS, HATCHBACK_80S } from './physics/params';
import { el, fmtDist, fmtClock } from './dom';
import { fsArm, fsSupported, fsOn, fsToggle, onFsChange } from './fullscreen';
import { px, pxSet, pxFit, carSprite } from './pixel';
import { dbg, shareCurrent } from './debuglog';
import { t, lang, setLang, surfName, carName, type Key } from './i18n';
import { CD_GO, type Session } from './session';

const CLOCKW = 23;   // Bildpunkte für „8:88“: die Uhr springt nicht
const DIGITS3 = 17;   // Bildpunkte für „888“ (3 × 5 + 2 Lücken): Tempo und Restzeit reservieren dreistelligen Platz

export function buildHud(root: HTMLElement, opts: { onFsLeave: () => void }) {
  // Sprache: Titel und Pixeltexte lassen sich per Schlüssel binden und werden bei Sprachwechsel neu gesetzt
  const langFns: (() => void)[] = [];
  const ttl = <T extends HTMLElement>(e: T, key: Key): T => { const f = () => { e.title = t(key); }; f(); langFns.push(f); return e; };
  const lab = (c: HTMLCanvasElement, f: () => string, color = '#ffffff', shadow = false) => { const g = () => pxSet(c, f(), color, shadow); g(); langFns.push(g); return c; };

  // ── Oberfläche ──
  const top = el('div', 'rs-top', root);       // obere Leiste: links Tempo/Untergrund, Mitte Restzeit, rechts Pause + Vollbild (jedes Teil für sich, Tests prüfen Überlappung)
  const col0 = el('div', 'rs-col', top);
  const hud = el('div', 'rs-hud pbox', col0);
  const spdEl = px(hud, '0', { k: 3, color: '#ffffff', min: DIGITS3 }); spdEl.id = 'rs-speed'; ttl(spdEl, 'speed');
  const r1 = el('div', 'row', hud);
  lab(px(r1, 'KM/H', { k: 0.75, color: '#39e6ff', shadow: false }), () => t('kmh'), '#39e6ff');
  const starEl = px(r1, '', { k: 0.75, color: '#ffffff', shadow: false }); starEl.id = 'rs-stars'; ttl(starEl, 'stars');
  const gasBox = ttl(el('div', 'rs-gas', hud), 'gas'); gasBox.id = 'rs-gas'; const gasFill = el('div', '', gasBox);   // Gasbalken unter dem Tempo: 0–100 %, ohne Text
  const surfBox = el('div', 'rs-surf pbox empty', col0);
  const surfEl = px(surfBox, '', { k: 0.75, color: '#9fb4d8', shadow: false }); surfEl.id = 'rs-surface'; ttl(surfEl, 'surface');
  const fpsEl = px(root, '', { color: '#888888', k: 0.5, cls: 'rs-fps' }); fpsEl.id = 'rs-fps'; ttl(fpsEl, 'fps');
  const dbgShow = () => { fpsEl.classList.toggle('hidden', !dbg.on); }; dbg.onChange(dbgShow); dbgShow();   // FPS-/Touch-Zeile nur im Debug-Modus
  // Spielziel: Fahrzeit (Zeitfahren, zählt hoch); unten Fortschrittsbalken
  const mid = el('div', 'rs-mid', top);
  const goalBox = ttl(el('div', 'rs-goal pbox', mid), 'clock');
  const secEl = px(goalBox, '0:00', { k: 2.5, color: '#ffffff', min: CLOCKW }); secEl.id = 'rs-time';
  const cpEl = px(goalBox, '', { k: 0.75, color: '#39e6ff', shadow: false, cls: 'cpn' }); cpEl.id = 'rs-cp'; ttl(cpEl, 'checkpoints'); cpEl.classList.add('hidden');
  const plusBox = el('div', 'rs-plus pbox', mid); const plusEl = px(plusBox, '', { k: 0.75, color: '#39e6ff', shadow: false, cls: 'plus' });
  // Richtungspfeil + Checkpoint-Hinweis (Zeitrennen): kleines Pixel-Sprite unter der Restzeit, weich ein-/ausgeblendet
  const navBox = ttl(el('div', 'rs-nav pbox', mid), 'direction'); const navCv = document.createElement('canvas'); navCv.className = 'px nav'; navCv.width = 15; navCv.height = 15; navBox.appendChild(navCv);
  const navHint = px(navBox, 'CHECKPOINT', { k: 0.75, color: '#39e6ff', shadow: false, cls: 'hint' }); lab(navHint, () => t('cpHint'), '#39e6ff'); navHint.classList.add('hidden');
  const NAV_STEPS = 16; let navStep = -1, hintUntil = 0, missSeen = 0;
  const drawNav = (st: number) => {
    const ctx = navCv.getContext('2d')!, a = st / NAV_STEPS * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), N = 15, inside = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {   // Pfeil nach oben, per Rückdrehung in das 15×15-Raster abgetastet
      const x = i - 7, y = j - 7, u = x * ca + y * sa, v = -x * sa + y * ca;   // v < 0 = Spitze
      inside[j * N + i] = (v >= -6.5 && v <= -0.5 && Math.abs(u) <= (v + 6.5) * 0.95 + 0.4) || (v > -0.5 && v <= 6.5 && Math.abs(u) <= 1.6) ? 1 : 0;
    }
    ctx.clearRect(0, 0, N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (inside[j * N + i]) {
      const edge = !(i > 0 && inside[j * N + i - 1] && i < N - 1 && inside[j * N + i + 1] && j > 0 && inside[(j - 1) * N + i] && j < N - 1 && inside[(j + 1) * N + i]);
      ctx.fillStyle = edge ? '#1b8aa6' : '#39e6ff'; ctx.fillRect(i, j, 1, 1);
    }
  };
  const updateNav = (s: Session, now: number, hx: number, hz: number) => {
    const r = s.run, on = r.mode === 'time' && r.state === 'run' && r.arrowOn;
    if (r.missCount !== missSeen) { missSeen = r.missCount; hintUntil = now + 2800; }
    const hint = on && now < hintUntil;
    navBox.classList.toggle('on', on); navHint.classList.toggle('hidden', !hint);
    if (!on) return;
    const fx = s.car.pos[0], fz = s.car.pos[2], tx = r.aim.x - fx, tz = r.aim.z - fz;
    const fwd = tx * hx + tz * hz, rt = -tx * hz + tz * hx;
    const st = (Math.round(Math.atan2(rt, fwd) / (Math.PI * 2) * NAV_STEPS) + NAV_STEPS) % NAV_STEPS;
    if (st !== navStep) { navStep = st; drawNav(st); }
  };
  const prog = ttl(el('div', 'rs-prog', root), 'progress'); const progFill = el('div', '', prog); progFill.id = 'rs-prog';
  const tools = el('div', 'rs-tools', top);
  const btn = (par: HTMLElement, title: Key, ic: string, color?: string) => { const b = ttl(el('button', '', par), title); const c = px(b, ic, { color, shadow: false, k: 1 }); return [b, c] as const; };
  const [bPause] = btn(tools, 'pause', '{pause}'); bPause.dataset.act = 'pause';
  const [bFs] = btn(tools, 'fullscreen', '{fs}'); bFs.title = t('fullscreen') + ' (F)';
  const [bReset] = btn(tools, 'crane', '{hook}');   // erscheint nur, wenn das Auto abgesoffen ist
  bReset.classList.add('hidden');
  const VIEWS = ['vChase', 'vRoof'] as const;   // Ansicht: Folgen ↔ Dach (nur im Spiel, nicht gespeichert)
  let view = 0;
  const [bView, viewIc] = btn(tools, 'vChase', '{vEye}'); bView.dataset.act = 'view';
  const viewShow = () => { bView.title = t(VIEWS[view]); };
  pxSet(viewIc, '{vEye}', '#ffffff', false);
  langFns.push(viewShow);
  const nextView = () => { view = (view + 1) % 2; viewShow(); };
  bView.onclick = nextView;
  // Vollbild: Logik und Zustand in fullscreen.ts (Menü-Zahnrad teilt sie); Knopf nur, wenn die API existiert (iPhone-Safari: nein)
  fsArm(root);   // nur das Spiel im Vollbild (nicht die ganze Seite): der piGallery-Header bleibt draußen
  if (!fsSupported()) bFs.style.display = 'none';
  bFs.onclick = () => fsToggle();
  const fsShow = (on: boolean) => { dbg.ev('vollbild', on ? 'an' : 'aus'); bFs.classList.toggle('on', on); if (!on) opts.onFsLeave(); };   // Vollbild verlassen im Rennen = Pause (im Menü nicht: setPaused ohne Rennen tut nichts)
  bFs.classList.toggle('on', fsOn());
  onFsChange(fsShow);
  let bResume!: HTMLElement, bRestart!: HTMLElement, bToMenu!: HTMLElement;
  const touch = el('div', 'rs-touch', root);
  const coarse = matchMedia('(pointer: coarse)').matches || /[?&]touch=1/.test(location.search);
  if (!coarse) touch.classList.add('hidden');
  const gl = el('div', 'grp gl', touch), gr = el('div', 'grp gr', touch);
  const mk = (par: HTMLElement, cls: string, label: string, title: Key, k = 2) => { const b = ttl(el('button', cls, par), title); px(b, label, { shadow: false, k }); return b; };
  const bL = mk(gl, 'l', '{tl}', 'left'), bR = mk(gl, 'r', '{tr}', 'right');
  const bHb = mk(gr, 'hb', 'P', 'handbrake'), col = el('div', 'col', gr);
  const bBrk = mk(col, 'brk', '{td}', 'brake'), bGas = mk(col, 'gas', '{tu}', 'gas');
  const endBox = el('div', 'rs-end hidden', root); endBox.id = 'rs-end';
  // Ziel (Zeitfahren): Fahrzeit groß („2:41,3“), solange die Endkarte noch nicht da ist
  const finBox = ttl(el('div', 'rs-finish pbox hidden', root), 'clock'); finBox.id = 'rs-finish'; const finLab = px(finBox, '', { k: 2, color: '#bfeaff' }), finEl = px(finBox, '', { k: 5, color: '#4cff6a' });
  const showFinish = (secs: number) => {
    pxSet(finLab, '{clock}', '#bfeaff');   // nur Uhr-Symbol + Wert
    finEl.dataset.k = '5'; finEl.dataset.t = ''; pxSet(finEl, fmtClock(secs, true), '#4cff6a');
    finBox.classList.remove('hidden', 'go'); void finBox.offsetWidth; finBox.classList.add('go');
    pxFit(finEl, root.clientWidth * 0.94 - 12 * (parseFloat(getComputedStyle(root).getPropertyValue('--u')) || 2));   // schmal: Stufe kleiner, nie breiter als der Bildschirm
  };
  // Startampel: rot, rot, grün; vorher steht das Auto (Handbremse), die Uhr läuft erst ab Grün
  const lights = ttl(el('div', 'rs-lights pbox hidden', root), 'start'); lights.id = 'rs-lights';
  const lamps = [el('i', '', lights), el('i', '', lights), el('i', '', lights)];
  const showLights = (cd: number) => {
    const ph = cd < 0 ? 0 : cd < 1 ? 1 : cd < CD_GO ? 2 : 3;
    lamps.forEach((l, i) => { l.className = ph === 3 ? 'g' : i < ph ? 'r' : ''; });
    lights.dataset.ph = String(ph);
    lights.classList.toggle('hidden', cd >= CD_GO + 1.2); lights.classList.toggle('out', cd >= CD_GO + 0.7);
  };
  const pauseBox = el('div', 'rs-end rs-pause hidden', root); pauseBox.id = 'rs-pause';
  let bRes!: HTMLElement, resIc!: HTMLCanvasElement, bTilt!: HTMLElement, bSnd!: HTMLElement, sndIc!: HTMLCanvasElement, bCrane!: HTMLElement;
  { const card = el('div', 'card', pauseBox); lab(px(card, 'PAUSE', { k: 3, color: '#ffffff' }), () => t('pauseTitle'), '#ffffff', true);
    const btns = el('div', 'btns', card);
    const mkb = (cls: string, title: Key, label: () => string) => { const b = ttl(el('button', cls, btns), title); lab(px(b, '', { k: 2, shadow: false }), label); return b; };
    bResume = mkb('again', 'resume', () => '{play} ' + t('resume')); bRestart = mkb('', 'restart', () => t('restart')); bToMenu = mkb('back', 'toMenu', () => '{home} ' + t('menu'));
    const opts = el('div', 'opts', card);
    const mko = (title: Key, ic: string) => { const b = ttl(el('button', '', opts), title); const c = px(b, ic, { shadow: false, k: 1 }); return [b, c] as const; };
    [bRes, resIc] = mko('res', '{grid}'); bRes.dataset.act = 'res';
    [bTilt] = mko('tilt', '{wheel}');
    [bSnd, sndIc] = mko('sound', '{snd}');
    [bCrane] = mko('crane', '{hook}');
    { const b = ttl(el('button', 'log', opts), 'logShare'); px(b, 'LOG', { shadow: false, k: 1 }); b.onclick = () => { void shareCurrent(); };   // Debug-Log teilen, nur bei aktivem Debug-Modus
      const sh = () => b.classList.toggle('hidden', !dbg.on); dbg.onChange(sh); sh(); }
    const lg = el('div', 'langs', opts);
    for (const l of ['de', 'en'] as const) { const b = ttl(el('button', 'lang', lg), 'lang'); b.dataset.lang = l; px(b, l.toUpperCase(), { shadow: false, k: 1 }); b.onclick = () => setLang(l); langFns.push(() => b.classList.toggle('on', lang() === l)); } }


  const showEnd = (s: Session, cb: { again: () => void; menu: () => void; shown: () => void }) => {
    const r = s.run;
    endBox.textContent = ''; finBox.classList.add('hidden');
    const card = el('div', 'card won', endBox);
    const cp = CARS[s.carId] ?? HATCHBACK_80S, cs = carSprite(cp.style ?? 'hatch', cp.drive);
    px(card, '{flag}', { k: 2.5 }).title = t('goal');
    // Hauptzahl groß: Zeitfahren = Fahrzeit, Sammeln = Sterne; Pokal + Gelb bei neuem Rekord des Autos
    const main = r.mode === 'time' ? fmtClock(r.elapsed, true) : `{star} ${r.stars}`;
    px(card, `${s.newBest ? '{trophy} ' : ''}${main}`, { k: 3.5, color: s.newBest ? '#ffe14a' : '#4cff6a' }).title = (s.newBest ? t('record') + ' · ' : '') + (r.mode === 'time' ? t('clock') : t('stars'));
    const bar = el('div', 'bar', card, t('progress')); const f = el('div', '', bar); f.style.width = Math.round(r.fraction * 100) + '%';
    // Raster: Auto | Sterne | Strecke (nur wo sie nicht schon die Hauptzahl ist)
    const info = el('div', 'info', card);
    px(info, `{${cs}}`, { k: 1.5, shadow: false }).title = carName(s.carId, cp.name);
    px(info, fmtDist(r.distance).toUpperCase(), { k: 1.5, color: '#9fb4d8', shadow: false }).title = t('dist');
    const btns = el('div', 'btns', card);
    const again = el('button', 'again', btns, t('again')); px(again, t('againS'), { k: 2, shadow: false }); again.onclick = cb.again;
    const back = el('button', 'back', btns, t('toMenu')); px(back, t('backS'), { k: 2, shadow: false }); back.onclick = cb.menu;
    if (dbg.on) { const lg = el('button', 'log', btns, t('logShare')); px(lg, 'LOG', { k: 1, shadow: false }); lg.onclick = () => { void shareCurrent(); }; }
    endBox.classList.remove('hidden'); cb.shown();
    // Texte in die Karte einpassen (schmale Viewports / große UI-Pixel): Stufe schrittweise kleiner, nie breiter als die Karte
    const inner = () => card.clientWidth - 2 * parseFloat(getComputedStyle(card).paddingLeft);
    for (const c of card.querySelectorAll<HTMLCanvasElement>('canvas.px')) pxFit(c, c.closest('button') ? inner() - 8 * (parseFloat(getComputedStyle(root).getPropertyValue('--u')) || 2) : inner());
  };

  // ── Anzeige ──
  const update = (S: Session) => {
    const r = S.run, c = S.course;
    pxSet(spdEl, String(Math.round(Math.abs(S.car.forwardSpeed) * 3.6)), '#ffffff');
    const sn = S.car.surfaceName; pxSet(surfEl, surfName(sn), '#9fb4d8', false); surfBox.classList.toggle('empty', !sn);
    const stranded = S.car.drowned || S.car.flipT > 1.2 || !!S.edge?.warn;   // abgesoffen oder auf Dach/Seite liegend: Kran-Knopf erscheint und blinkt (kein Text), kein automatisches Zurücksetzen
    bReset.classList.toggle('hidden', !stranded); bReset.classList.toggle('alert', stranded);
    pxSet(starEl, r.mode === 'stars' ? `{star} ${r.stars}/${c.stars.length}` : '', '#ffffff', false);   // Sterne nur im Sammeln
    const pw = Math.round(r.fraction * 100) + '%'; if (progFill.style.width !== pw) progFill.style.width = pw;
    if (r.mode === 'time') pxSet(secEl, fmtClock(r.elapsed), '#ffffff');   // Uhr zählt hoch (ganze Sekunden)
  };
  const flashText = (txt: string, col = '#39e6ff') => { pxSet(plusEl, txt, col, false); plusBox.classList.remove('go'); void plusBox.offsetWidth; plusBox.classList.add('go'); };   // Zwischenzeit am Checkpoint
  const flashPlus = (n: number, col = '#39e6ff') => { pxSet(plusEl, '+' + n, col, false); plusBox.classList.remove('go'); void plusBox.offsetWidth; plusBox.classList.add('go'); };
  (window as any).__rsFlash = flashPlus;

  return {
    langFns, top, fpsEl, goalBox, cpEl, progFill, gasFill, lights, endBox, finBox, pauseBox, touch, coarse,
    bPause, bFs, bReset, bView, bL, bR, bHb, bBrk, bGas, bResume, bRestart, bToMenu, bRes, resIc, bTilt, bSnd, sndIc, bCrane,
    get view() { return view; }, nextView, resetView: () => { view = 0; viewShow(); },
    showFinish, showLights, showEnd, update, updateNav, flashText, flashPlus,
  };
}
export type Hud = ReturnType<typeof buildHud>;

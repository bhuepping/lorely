// Startbildschirm: wortarm. Welt als Kachel, Level als nummerierte Kacheln (Bestwert des gewählten Autos im gewählten Modus), Modus als Symbol-Umschalter (Uhr = Zeitfahren, Stern = Sammeln).
// Strecke antippen = auswählen; die markierte Kachel oder GO startet.
import { el, store, fmtClock } from './dom';
import { px, pxSet, carSprite, logo } from './pixel';
import { WORLDS, type LevelEntry } from './levels';
import { loadSave, resetSave, bestOf } from './save';
import { CARS } from './physics/params';
import type { Mode } from './run';
import { TITLE } from './title';
import { initKb } from './keyfocus';
import { t, lang, setLang, onLang, worldName, levelName, carName, type Lang } from './i18n';
import { fsSupported, fsOn, fsToggle, onFsChange } from './fullscreen';
import { dbg, shareCurrent } from './debuglog';

/** Strecken je Seite: feste Menühöhe in jeder Welt (412x915 und 360x740 ohne Scroll); mehr Strecken = Seiten */
export const PAGE = 5;

export interface MenuOpts {
  mode: Mode;
  car: string;
  onCar: (id: string) => void;
  onMode: (m: Mode) => void;
  onStart: (level: LevelEntry, mode: Mode, car: string) => void;
  /** Welt-Kachel angetippt (Titel-Hintergrund wechselt dorthin) */
  onWorld?: (worldId: string) => void;
}

export function buildMenu(root: HTMLElement, o: MenuOpts) {
  const menu = el('div', 'rs-menu', root);
  const brand = el('div', 'brand', menu);
  const l1 = logo(brand, TITLE.logo, '--lu', TITLE.emph), l2 = logo(brand, TITLE.sub, '--lu2');
  document.title = TITLE.page;
  const panel = el('div', 'panel', menu);
  const pick = el('div', 'rs-pick', panel);   // Modus + Auto (hochkant zwei Zeilen, quer eine)
  const top = el('div', 'rs-mrow', pick);
  const bTime = el('button', 'mode', top); px(bTime, '{clock}', { shadow: false });
  const bStar = el('button', 'mode', top); px(bStar, '{star}', { shadow: false });
  // Sprache und Zurücksetzen hinter einem Zahnrad (kleines Feld)
  const bGear = el('button', 'mode gear', top); px(bGear, '{gear}', { shadow: false });
  const cfg = el('div', 'rs-end rs-ask rs-cfg hidden', menu), cfgCard = el('div', 'card', cfg), cfgBtns = el('div', 'btns', cfgCard);
  const langBtns = (['de', 'en'] as Lang[]).map((l) => { const b = el('button', 'lang', cfgBtns); b.dataset.lang = l; px(b, l.toUpperCase(), { shadow: false }); b.onclick = () => setLang(l); return [l, b] as const; });
  // Vollbild-Schalter im Zahnrad-Feld (gleiche Logik/Zustand wie der Knopf im Spiel); ohne API (iPhone) versteckt
  const bFsM = el('button', 'fs', cfgBtns); px(bFsM, '{fs}', { shadow: false });
  bFsM.onclick = () => fsToggle();
  if (!fsSupported()) bFsM.style.display = 'none';
  const fsRefresh = () => { bFsM.classList.toggle('on', fsOn()); bFsM.title = t('fullscreen') + ' (F)'; };
  onFsChange(fsRefresh);
  // Debug-Schalter: gespeichert in rs-debug, standardmäßig aus; der Tooltip erklärt
  const bDbg = el('button', 'dbg', cfgBtns); px(bDbg, 'DEBUG', { shadow: false });
  bDbg.onclick = () => dbg.set(!dbg.on);
  const dbgRefresh = () => { bDbg.classList.toggle('on', dbg.on); bDbg.title = t('debug'); };
  // Log teilen: nur bei Debug an; ohne aufgezeichnete Fahrt gesperrt
  const bLog = el('button', 'log', cfgBtns); px(bLog, 'LOG', { shadow: false });
  bLog.onclick = () => { void shareCurrent(); };
  const logRefresh = () => { bLog.classList.toggle('hidden', !dbg.on); bLog.disabled = !dbg.has; bLog.title = t('logShare'); };
  dbg.onChange(dbgRefresh); onLang(dbgRefresh); dbgRefresh();
  dbg.onChange(logRefresh); onLang(logRefresh); logRefresh();
  bGear.addEventListener('click', logRefresh);   // beim Öffnen des Zahnrad-Felds: gibt es inzwischen ein Log?
  bGear.onclick = () => cfg.classList.toggle('hidden');
  cfg.onclick = (e) => { if (e.target === cfg) cfg.classList.add('hidden'); };
  const carRow = el('div', 'rs-mrow cars', pick);
  const carBtns = Object.entries(CARS).map(([id, p]) => { const b = el('button', 'mode car', carRow); px(b, '{' + carSprite(p.style ?? 'hatch', p.drive) + '}', { shadow: false }); const v = px(b, '', { shadow: false, k: 0.6, cls: 'bv' }); b.onclick = () => { car = id; o.onCar(id); render(); }; return [id, b, v] as const; });
  const worlds = el('div', 'rs-mrow', panel);
  const levels = el('div', 'levels', panel);
  const pager = el('div', 'rs-pager', panel);   // ‹ ●○ › (immer da, damit die Höhe gleich bleibt; bei einer Seite unsichtbar)
  const bPrev = el('button', 'pg prev', pager), dots = el('div', 'dots', pager), bNext = el('button', 'pg next', pager);
  const go = el('button', 'rs-go', panel); px(go, '{play} GO', { k: 2, color: '#ffe14a', shadow: false });
  // Zeiten & Sterne zurücksetzen, mit Sicherheitsabfrage (Ja/Abbrechen)
  const bReset = el('button', 'rs-reset', cfgCard); const resetTx = px(bReset, '', { shadow: false, color: '#9fb4d8' });
  const about = el('div', 'about', cfgCard); px(about, 'LoReLy · MIT · three.js', { shadow: false, k: 0.8, color: '#7f8fb8' });   // Lizenz-Hinweis (Eigennamen, nicht übersetzt)
  const ask = el('div', 'rs-end rs-ask hidden', menu); const card = el('div', 'card', ask), askTx = px(card, '', { k: 2, color: '#ffffff' });
  const askBtns = el('div', 'btns', card), bYes = el('button', 'yes', askBtns), bNo = el('button', 'no', askBtns);
  const yesTx = px(bYes, '', { k: 2, shadow: false, color: '#ff8a8a' }), noTx = px(bNo, '', { k: 2, shadow: false });
  bReset.onclick = () => { cfg.classList.add('hidden'); ask.classList.remove('hidden'); };
  bNo.onclick = () => ask.classList.add('hidden');
  bYes.onclick = () => { resetSave(); ask.classList.add('hidden'); render(); };
  let car = o.car, mode = o.mode, world = store.get('rs-world') || WORLDS[0].id;
  if (!WORLDS.some((w) => w.id === world)) world = WORLDS[0].id;
  // Vorauswahl je Welt: zuletzt gewählte Strecke dieser Welt, sonst die erste
  const pickOf = (wid: string) => { const W = WORLDS.find((x) => x.id === wid)!; return W.levels.find((l) => l.id === store.get('rs-lv-' + wid)) ?? W.levels[0]; };
  let sel = pickOf(world).id;
  const pageOf = (wid: string, id: string) => Math.max(0, Math.floor(WORLDS.find((x) => x.id === wid)!.levels.findIndex((l) => l.id === id) / PAGE));
  let page = pageOf(world, sel);   // Startseite = die der gewählten/zuletzt gespielten Strecke

  // Logo-Größe: so groß wie Breite/Höhe erlauben (ganze Bildpunkt-Vielfache, dadurch scharf)
  const fit = () => {
    const W = root.clientWidth, H = root.clientHeight, wide = W / Math.max(1, H) > 1.3;
    const bw = wide ? W * 0.42 : W * 0.92, bh = wide ? H * 0.5 : H * 0.115;
    const n1 = Math.max(1, parseFloat(l1.style.width.split('*')[1])), h1 = Math.max(1, parseFloat(l1.style.height.split('*')[1]));
    const n2 = Math.max(1, parseFloat(l2.style.width.split('*')[1])), h2 = Math.max(1, parseFloat(l2.style.height.split('*')[1]));
    const lu = Math.max(2, Math.floor(Math.min(bw / n1, bh / h1)));
    const lu2 = Math.max(2, Math.floor(Math.min(bw * 0.9 / n2, bh * 1.2 / h2)));
    menu.style.setProperty('--lu', lu + 'px'); menu.style.setProperty('--lu2', lu2 + 'px');
    // Untertitel weicht, wenn die Auswahl sonst nicht ins Bild passt (kurze Handys, Welt mit 6 Strecken)
    l2.style.display = ''; menu.classList.remove('tight');
    const over = () => !menu.classList.contains('hidden') && (menu.scrollHeight > menu.clientHeight + 1 || panel.scrollHeight > panel.clientHeight + 1);
    if (over()) { menu.classList.add('tight'); if (over()) l2.style.display = 'none'; }   // erst enger setzen, dann erst den Untertitel opfern
  };
  new ResizeObserver(fit).observe(root); fit();

  const render = () => {
    bReset.title = t('resetTip'); pxSet(resetTx, t('reset').toUpperCase(), '#9fb4d8', false); pxSet(askTx, t('reset').toUpperCase() + '?', '#ffffff'); pxSet(yesTx, t('yes').toUpperCase(), '#ff8a8a', false); pxSet(noTx, t('cancel').toUpperCase(), '#bfeaff', false);
    bTime.title = t('time'); bStar.title = t('collect'); bGear.title = t('settings'); go.title = t('go') + ' (Enter)';
    for (const [l, b] of langBtns) { b.classList.toggle('on', l === lang()); b.title = t('lang'); }
    fsRefresh();
    bTime.classList.toggle('on', mode === 'time'); bStar.classList.toggle('on', mode === 'stars');
    worlds.textContent = ''; levels.textContent = '';
    const save = loadSave();
    const cur = WORLDS.find((x) => x.id === world)!.levels.find((l) => l.id === sel);   // markierte Strecke: unter jedem Auto steht dessen Bestwert (Zeit bzw. Sterne), sonst „--“
    for (const [id, b, v] of carBtns) {
      b.classList.toggle('on', id === car); b.title = carName(id, CARS[id].name);
      const bv = cur ? bestOf(save[cur.key], id, mode) : undefined;
      pxSet(v, bv === undefined ? '--' : mode === 'time' ? fmtClock(bv) : '{star} ' + bv, bv === undefined ? '#6b7cb4' : mode === 'time' ? '#ffe14a' : '#ffffff', false);
      v.title = t('best') + ' ' + carName(id, CARS[id].name);
    }
    for (const w of WORLDS) {
      const b = el('button', 'rs-tile world' + (w.id === world ? ' on' : ''), worlds, worldName(w.id, w.name)); b.dataset.world = w.id;
      px(b, '{' + w.icon + '}', { shadow: false });
      px(b, worldName(w.id, w.name), { shadow: false, color: w.id === world ? '#ffffff' : '#9fb4d8' });
      b.onclick = () => { world = w.id; store.set('rs-world', world); sel = pickOf(world).id; page = pageOf(world, sel); o.onWorld?.(world); render(); };
    }
    const W = WORLDS.find((x) => x.id === world)!;
    const pages = Math.ceil(W.levels.length / PAGE);
    page = Math.min(Math.max(0, page), pages - 1);
    pager.classList.toggle('off', pages < 2);
    bPrev.disabled = page === 0; bNext.disabled = page >= pages - 1;
    bPrev.title = t('prev'); bNext.title = t('next');
    dots.textContent = '';
    for (let i = 0; i < pages; i++) el('span', 'dot' + (i === page ? ' on' : ''), dots);
    W.levels.forEach((lv, i) => {
      if (Math.floor(i / PAGE) !== page) return;
      const s = save[lv.key] ?? {};
      const b = el('button', 'rs-tile level' + (lv.id === sel ? ' on' : ''), levels, levelName(lv.id, lv.name));
      b.dataset.level = lv.id; b.dataset.key = lv.key;
      const on = lv.id === sel;
      px(b, String(i + 1), { color: on ? '#ffffff' : '#ff4fc0', shadow: false, k: 2 });
      const lname = levelName(lv.id, lv.name), cname = carName(car, CARS[car].name);
      const nm = px(b, lname, { color: on ? '#ffffff' : '#e4f3ff', shadow: false, cls: 'nm' }); nm.dataset.full = lname; nm.title = lname;   // Name immer ganz, nie gekürzt
      const meta = el('div', 'meta', b);
      const bt = bestOf(s, car, mode);   // Bestwert des gewählten Autos im gewählten Modus
      if (mode === 'time') {
        if (bt !== undefined) px(meta, '{' + carSprite(CARS[car].style ?? 'hatch', CARS[car].drive) + '} ' + fmtClock(bt), { shadow: false, color: '#ffe14a' }).title = t('best') + ' ' + cname;
        else px(meta, '{clock0} --', { shadow: false, color: on ? '#e6d4ff' : '#6b7cb4' }).title = t('best') + ' ' + cname;
      } else if (bt !== undefined) {   // alle Sterne der Strecke: grün
        const all = lv.stars > 0 && bt >= lv.stars;
        px(meta, '{' + carSprite(CARS[car].style ?? 'hatch', CARS[car].drive) + '} {star} ' + bt, { shadow: false, color: all ? '#3ce07a' : '#ffffff', cls: 'st' }).title = (all ? t('allStars') : t('stars')) + ' ' + cname;
      } else px(meta, '{star0} --', { shadow: false, color: on ? '#e6d4ff' : '#6b7cb4', cls: 'st' }).title = t('stars') + ' ' + cname;
      b.onclick = () => {   // markierte Kachel startet, sonst nur auswählen
        if (sel !== lv.id) { sel = lv.id; store.set('rs-lv-' + world, sel); render(); return; }
        o.onStart(lv, mode, car);
      };
    });
    for (let i = W.levels.slice(page * PAGE, page * PAGE + PAGE).length; i < PAGE; i++) { const g = el('button', 'level ghost', levels); g.tabIndex = -1; g.setAttribute('aria-hidden', 'true'); }   // leere Plätze: gleiche Höhe in jeder Welt
    fit();   // Höhe prüfen: andere Welt = andere Strecken-Anzahl
  };
  const flip = (d: number) => { page += d; render(); };
  bPrev.onclick = () => flip(-1); bNext.onclick = () => flip(1);
  // Wischen auf dem Kachelbereich (waagrecht, > 40 px): links = nächste Seite
  let sx = 0, sy = 0, sid = -1, swiped = false;
  levels.addEventListener('click', (e) => { if (swiped) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  levels.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; sid = e.pointerId; });
  const swipeEnd = (e: PointerEvent) => {
    if (e.pointerId !== sid) return; sid = -1;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; setTimeout(() => { swiped = false; }, 50); flip(dx < 0 ? 1 : -1); }
  };
  levels.addEventListener('pointerup', swipeEnd); levels.addEventListener('pointercancel', () => { sid = -1; });
  levels.style.touchAction = 'pan-y';
  go.onclick = () => { const lv = WORLDS.find((x) => x.id === world)!.levels.find((l) => l.id === sel)!; o.onStart(lv, mode, car); };
  const setMode = (m: Mode) => { mode = m; o.onMode(m); render(); };
  bTime.onclick = () => setMode('time'); bStar.onclick = () => setMode('stars');
  onLang(() => render());
  render();

  // ── Tastatur: ↑↓ Zeile, ←→ wählen, Enter/Leertaste GO, Esc zu. Rahmen nur, solange zuletzt eine Taste benutzt wurde ──
  initKb(root);
  const rowEls = [top, carRow, worlds, levels];
  let row = 3, onGear = false;
  const W_ = () => WORLDS.find((x) => x.id === world)!;
  const kbShow = () => {
    const modal = !ask.classList.contains('hidden') || !cfg.classList.contains('hidden');
    rowEls.forEach((r, i) => r.classList.toggle('kf', !modal && i === row && !(row === 0 && onGear)));
    bGear.classList.toggle('kf', !modal && row === 0 && onGear);
  };
  const clampI = (i: number, n: number) => Math.min(Math.max(0, i), n - 1);
  const move = (d: number) => {
    if (row === 0) {
      if (onGear) { if (d < 0) { onGear = false; setMode('stars'); } }
      else if (mode === 'time') { if (d > 0) setMode('stars'); }
      else if (d < 0) setMode('time'); else onGear = true;
    } else if (row === 1) { const ids = Object.keys(CARS); const n = ids[clampI(ids.indexOf(car) + d, ids.length)]; if (n !== car) carBtns.find(([id]) => id === n)![1].click(); }
    else if (row === 2) { const ws = WORLDS.map((w) => w.id); const n = clampI(ws.indexOf(world) + d, ws.length); if (ws[n] !== world) (worlds.children[n] as HTMLElement).click(); }
    else { const L = W_().levels; const n = L[clampI(L.findIndex((l) => l.id === sel) + d, L.length)]; if (n.id !== sel) { sel = n.id; store.set('rs-lv-' + world, sel); page = pageOf(world, sel); render(); } }
    kbShow();
  };
  let mi = 0;   // Fokus im Zahnrad-Feld bzw. in der Rückfrage
  const modalBtns = () => !ask.classList.contains('hidden') ? [bYes, bNo] : [...cfgBtns.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.classList.contains('hidden') && !b.disabled && b.style.display !== 'none').concat(bReset);
  const modalShow = () => modalBtns().forEach((b, i) => b.classList.toggle('kf', i === mi));
  const modalOpen = () => { mi = !ask.classList.contains('hidden') ? 1 : 0; modalShow(); };
  window.addEventListener('keydown', (e) => {
    if (menu.classList.contains('hidden') || e.ctrlKey || e.altKey || e.metaKey) return;
    const c = e.code, d = c === 'ArrowLeft' || c === 'KeyA' ? [0, -1] : c === 'ArrowRight' || c === 'KeyD' ? [0, 1] : c === 'ArrowUp' || c === 'KeyW' ? [-1, 0] : c === 'ArrowDown' || c === 'KeyS' ? [1, 0] : null;
    const act = c === 'Enter' || c === 'NumpadEnter' || c === 'Space', esc = c === 'Escape';
    if (!d && !act && !esc) return;
    e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur?.();
    if (e.repeat && act) return;
    const askOpen = !ask.classList.contains('hidden'), cfgOpen = !cfg.classList.contains('hidden');
    if (askOpen || cfgOpen) {
      const bs = modalBtns(); modalShow();
      if (esc) { (askOpen ? ask : cfg).classList.add('hidden'); bs.forEach((b) => b.classList.remove('kf')); if (askOpen && cfgOpen) modalOpen(); else kbShow(); return; }
      if (act) { bs[mi]?.click(); bs.forEach((b) => b.classList.remove('kf')); setTimeout(() => { if (!ask.classList.contains('hidden') || !cfg.classList.contains('hidden')) modalOpen(); else kbShow(); }); return; }
      if (d) { mi = clampI(mi + d[0] + d[1], bs.length); modalShow(); }
      return;
    }
    if (esc) return;
    if (act) { if (row === 0 && onGear) { bGear.click(); setTimeout(modalOpen); } else go.click(); return; }
    if (d![0]) { row = clampI(row + d![0], rowEls.length); if (row !== 0) onGear = false; kbShow(); } else move(d![1]);
  });
  kbShow();
  return { el: menu, show: () => { render(); menu.classList.remove('hidden'); fit(); }, hide: () => menu.classList.add('hidden') };
}

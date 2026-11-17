// Karte: kleine Karte in der Ecke, Antippen lässt sie in der Ecke wachsen (das Spiel läuft weiter), Tippen verkleinert.
// Grundbild = „Foto von oben“ (mapphoto.ts, einmal beim Laden), darüber scharf in Gerätepixeln: Hauptweg, Äste, Fluss, Brücke, Start/Ziel, offene Sterne/Checkpoints.
// Norden (−z) oben fest. Pro Frame bewegt sich nur der Auto-Pfeil (DOM-Element); das Bild wird neu gezeichnet, wenn sich Größe oder eingesammelte Sterne ändern.
// Fehlt das Foto: gezeichneter Plan (Höhenschummerung, Wasser).
import { el } from './dom';
import { px as pxIcon } from './pixel';
import type { Course } from './level';
import type { Run } from './run';
import type { MapExt } from './mapphoto';

/** Quadratischer Kartenausschnitt (Mitte + Kantenlänge) aus Route + Ästen (+ Sternen im Gelände) */
export function mapExtent(course: Course): MapExt {
  const pts: [number, number][] = [];
  for (let s = 0; s <= course.route.length; s += 4) { const a = course.route.at(s); pts.push([a.x, a.z]); }
  for (const b of course.branches ?? []) for (let s = 0; s <= b.route.length; s += 6) { const a = b.route.at(s); pts.push([a.x, a.z]); }
  if (course.free) for (const [x, z] of course.stars) pts.push([x, z]);   // freie Wegwahl: Sterne liegen abseits des guten Wegs
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, span: Math.max(60, x1 - x0, z1 - z0) * 1.1 + 24 };
}

/** Kantenlänge der Nahansicht (m); Welten mit Kartenausschnitt darunter (+ Spielraum) bekommen keinen Knopf */
export const NEAR_SPAN = 250, NEAR_MIN_SPAN = 400;
/** Foto-Kantenlänge (px) der Übersicht; große Welten höher, damit der mitfahrende Nah-Ausschnitt (250 m) scharf bleibt */
export const photoSize = (span: number, base = 1024): number => (span >= NEAR_MIN_SPAN ? Math.max(base, 2048) : base);
/** Overlay der großen Karte in der Nahansicht höchstens so oft (ms) neu malen */
const NEAR_REPAINT_MS = 100;

export class Minimap {
  readonly box: HTMLElement; readonly big: HTMLElement;
  private cv: HTMLCanvasElement; private bigCv: HTMLCanvasElement; private dot: HTMLElement; private bigDot: HTMLElement;
  private ext: MapExt; private plan: HTMLCanvasElement | null = null; private sig = ''; private last = '';
  private ro: ResizeObserver | null = null; private dirty = true;
  /** zoom = Knopf, near = Nahansicht (mitfahrender Ausschnitt aus dem Gesamtfoto) */
  readonly zoom: HTMLButtonElement; private near = false; private car = { x: 0, z: 0, fx: 0, fz: -1 }; private nearAt = 0;
  /** Kosten des Zeichnens der großen Karte (Anzahl, Summe ms, Maximum ms) – Debug-Zeile beim Schließen */
  readonly cost = { n: 0, ms: 0, max: 0 };
  /** Texte des Knopf-Tooltips (Sprache wechselt) */
  tips: { near: string; far: string } = { near: 'Nah', far: 'Übersicht' };
  /** Straßenfarbe (Median der Fotofarben entlang der Route), je Foto einmal */
  private roadCol = '';
  /** Vergleichsschalter: localStorage rs-mapband=0 schaltet das Straßenband aus */
  private bandOff = (() => { try { return localStorage.getItem('rs-mapband') === '0'; } catch { return false; } })();
  constructor(root: HTMLElement, private course: Course, private run?: Run, private photo: HTMLCanvasElement | null = null) {
    this.ext = mapExtent(course);
    this.box = el('div', 'rs-map', root);
    this.cv = el('canvas', 'map-cv', this.box) as HTMLCanvasElement; this.dot = el('i', 'dot', this.box);
    this.big = el('div', 'rs-bigmap hidden', root);
    this.bigCv = el('canvas', 'map-cv', this.big) as HTMLCanvasElement; this.bigDot = el('i', 'dot', this.big);
    this.zoom = el('button', 'zoom hidden', this.big) as HTMLButtonElement; pxIcon(this.zoom, '{lupe}', { shadow: false });
    this.zoom.onclick = (e) => { e.stopPropagation(); this.toggleNear(); };
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => { this.dirty = true; }); this.ro.observe(this.box); }
  }
  setPhoto(c: HTMLCanvasElement): void { this.photo = c; this.roadCol = ''; this.dirty = true; if (this.isOpen) { this.zoom.classList.toggle('hidden', !this.canNear); this.paint(this.bigCv, true); } }
  get isOpen(): boolean { return !this.big.classList.contains('hidden'); }
  /** Knopf nur bei großer Welt und wenn ein Foto da ist */
  get canNear(): boolean { return !!this.photo && this.ext.span >= NEAR_MIN_SPAN; }
  get isNear(): boolean { return this.near; }
  open(): void { this.near = false; this.cost.n = this.cost.ms = this.cost.max = 0; this.zoom.classList.toggle('hidden', !this.canNear); this.syncZoom(); this.big.classList.remove('hidden'); this.box.classList.add('under'); this.fit(); this.paint(this.bigCv, true); this.last = ''; this.place(); }
  close(): void { this.big.classList.add('hidden'); this.box.classList.remove('under'); this.near = false; }
  /** Touch-Tasten bleiben frei – würde die Karte eine Taste (Handy quer: rechte Tastengruppe) verdecken, rückt sie links daneben */
  private fit(): void {
    const b = this.big; b.style.right = b.style.top = '';
    const root = b.parentElement!, rr = root.getBoundingClientRect(), hit = (q: DOMRect, r: DOMRect) => q.width > 0 && q.left < r.right && r.left < q.right && q.top < r.bottom && r.top < q.bottom;
    let r = b.getBoundingClientRect(), left = Infinity;
    root.querySelectorAll('.rs-touch button').forEach((t) => { const q = t.getBoundingClientRect(); if (hit(q, r)) left = Math.min(left, q.left); });
    if (left < Infinity) { b.style.right = Math.round(rr.right - left + 6) + 'px'; r = b.getBoundingClientRect(); }
    const g = root.querySelector('.rs-goal')?.getBoundingClientRect();   // Restzeit bleibt frei: Karte rutscht darunter
    if (g && hit(g, r)) b.style.top = Math.round(g.bottom - rr.top + 4) + 'px';
  }
  private syncZoom(): void { this.zoom.title = this.near ? this.tips.far : this.tips.near; this.zoom.classList.toggle('on', !!this.near); }
  /** Stufe wechseln: Nah = Ausschnitt ums Auto, fährt mit (aus dem Gesamtfoto geschnitten) */
  toggleNear(): void {
    this.near = !this.near && this.canNear;
    this.syncZoom(); this.paint(this.bigCv, true); this.last = ''; this.place();
  }
  /** aktueller Kartenausschnitt der großen Karte */
  private view(big: boolean): MapExt { return big && this.near ? { cx: this.car.x, cz: this.car.z, span: NEAR_SPAN } : this.ext; }
  private u(x: number, e: MapExt = this.ext): number { return (x - (e.cx - e.span / 2)) / e.span; }
  private v(z: number, e: MapExt = this.ext): number { return (z - (e.cz - e.span / 2)) / e.span; }
  /** gezeichneter Plan, falls kein Foto: Höhenschummerung + Wasser */
  private planCanvas(): HTMLCanvasElement {
    if (this.plan) return this.plan;
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d')!, img = g.createImageData(N, N), T = this.course.terrain, e = this.ext, st = e.span / N;
    let lo = Infinity, hi = -Infinity; const hs = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const h = T.height(e.cx - e.span / 2 + (i + 0.5) * st, e.cz - e.span / 2 + (j + 0.5) * st); hs[j * N + i] = h; lo = Math.min(lo, h); hi = Math.max(hi, h); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h = hs[j * N + i], sh = ((hs[j * N + Math.max(0, i - 1)] - hs[Math.max(0, j - 1) * N + i]) / st) * 6, t = (h - lo) / Math.max(1, hi - lo);
      const x = e.cx - e.span / 2 + (i + 0.5) * st, z = e.cz - e.span / 2 + (j + 0.5) * st;
      const wet = this.course.waterAt(x, z) > h, k = Math.max(0.55, Math.min(1.4, 1 + sh)), o = (j * N + i) * 4;
      const base = wet ? [40, 90, 160] : [70 + 90 * t, 110 + 60 * t, 60 + 50 * t];
      for (let q = 0; q < 3; q++) img.data[o + q] = Math.min(255, base[q] * k);
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0); return (this.plan = c);
  }
  /** Straßenfarbe = Median der Fotofarben entlang der Route */
  private roadColor(pts: [number, number][]): string {
    const ph = (this.photo ?? this.planCanvas()), S = ph.width, g = ph.getContext('2d')!, r: number[] = [], gg: number[] = [], b: number[] = [];
    for (let i = 0; i < pts.length; i += 3) {
      const x = Math.floor(this.u(pts[i][0]) * S), y = Math.floor(this.v(pts[i][1]) * S);
      if (x < 0 || y < 0 || x >= S || y >= S) continue;
      const d = g.getImageData(x, y, 1, 1).data; r.push(d[0]); gg.push(d[1]); b.push(d[2]);
    }
    const med = (a: number[]) => (a.sort((p, q) => p - q), a[a.length >> 1] ?? 120);
    return `rgb(${med(r)},${med(gg)},${med(b)})`;
  }
  /** Foto + Vektorlinien in die Zielgröße zeichnen */
  private paint(cv: HTMLCanvasElement, big: boolean): void {
    const W = Math.max(8, Math.round(cv.clientWidth * (window.devicePixelRatio || 1)) || (big ? 600 : 160));
    if (cv.width !== W) { cv.width = W; cv.height = W; }
    const g = cv.getContext('2d')!, c = this.course, r = this.run;
    const t0 = big ? performance.now() : 0, nr = big && this.near, E = this.view(big);   // Nahansicht = mitfahrender Ausschnitt desselben Fotos
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = nr ? 'medium' : 'high';
    g.clearRect(0, 0, W, W);
    { const im = this.photo ?? this.planCanvas(), k = im.width / this.ext.span;
      if (nr) g.drawImage(im, (E.cx - E.span / 2 - (this.ext.cx - this.ext.span / 2)) * k, (E.cz - E.span / 2 - (this.ext.cz - this.ext.span / 2)) * k, E.span * k, E.span * k, 0, 0, W, W);   // außerhalb des Fotos: leer, wird vom Rand der Karte geklippt
      else g.drawImage(im, 0, 0, W, W); }
    const lw = Math.max(2, W * (nr ? 0.012 : 0.009)), px = (x: number, z: number): [number, number] => [this.u(x, E) * W, this.v(z, E) * W];
    const line = (list: [number, number][], w: number, col: string) => {
      g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
      list.forEach(([x, z], i) => { const [a, b] = px(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke();
    };
    const samp = (route: { at: (s: number) => { x: number; z: number } }, len: number, step: number, s0 = 0, s1 = len) => {
      const o: [number, number][] = []; for (let s = s0; s <= s1; s += step) { const a = route.at(s); o.push([a.x, a.z]); }
      const a = route.at(s1); o.push([a.x, a.z]); return o;
    };
    if (c.river) { const rp = samp(c.river.route, c.river.route.length, 12); line(rp, lw * 1.6, '#1c4f9a'); line(rp, lw * 0.8, '#4f97da'); }
    const main = samp(c.route, c.route.length, 4);
    // Straße schmaler als 3 Bildschirm-px -> Band in Straßenfarbe mit dunklem Rand statt Weglinie (nur Straßenlevel); nur beim Zeichnen der Karte, nicht je Frame
    const sc = W / Math.max(1, cv.clientWidth || W), bw = Math.max(c.roadWidth / E.span * W, 3 * sc), band = !c.free && !this.bandOff && c.roadWidth / E.span * W < 3 * sc;
    if (band) {
      const col = this.roadCol || (this.roadCol = this.roadColor(main));
      const bands = [main, ...(c.branches ?? []).map((b) => samp(b.route, b.route.length, 5))];
      for (const b of bands) line(b, bw + 2 * sc, '#101010');
      for (const b of bands) line(b, bw, col);
    } else {
      for (const b of c.branches ?? []) { const bp = samp(b.route, b.route.length, 5); line(bp, lw * 1.6, '#000000'); line(bp, lw * 0.8, '#ff9f43'); }   // Äste/Gabelungen orange
      line(main, lw * 1.6, '#000000'); line(main, lw * 0.8, '#f2f2f2');
    }
    if (c.bridge) line(samp(c.route, c.route.length, 4, c.bridge.s0, c.bridge.s1), lw * 0.6, '#ffcc00');
    const mark = (x: number, z: number) => {
      const [mx, mz] = px(x, z), n = 4, q = Math.max(2, W * 0.012);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { g.fillStyle = (i + j) % 2 ? '#000' : '#fff'; g.fillRect(mx - q * n / 2 + i * q, mz - q * n / 2 + j * q, q, q); }
    };
    mark(main[0][0], main[0][1]);
    if (c.goal) mark(c.goal.x, c.goal.z); else mark(main[main.length - 1][0], main[main.length - 1][1]);
    const rad = Math.max(2.2, W * 0.011);
    const dot = (x: number, z: number, col: string) => { const [a, b] = px(x, z); g.fillStyle = '#000'; g.beginPath(); g.arc(a, b, rad + 1.2, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(a, b, rad, 0, 7); g.fill(); };
    c.stars.forEach(([x, z], i) => { if (r?.mode !== 'time' && (!r || !r.got[i])) dot(x, z, '#ffd93b'); });
    if (r?.cps) r.cps.list.forEach((p, i) => { if (!r.cps!.got[i]) dot(p.x, p.z, '#39e6ff'); });   // Checkpoints zuletzt (selten, sollen nicht unter Sternen verschwinden)
    if (big) { const d = performance.now() - t0, k = this.cost; k.n++; k.ms += d; k.max = Math.max(k.max, d); }
  }
  /** Auto-Pfeil (fx, fz = Fahrtrichtung); die kleine Karte wird nur bei Änderung neu gemalt */
  update(x: number, z: number, fx = 0, fz = -1): void {
    const r = this.run, sig = r ? Array.from(r.got).join('') + '|' + (r.cps ? Array.from(r.cps.got).join('') : '') : '';
    if (this.dirty || sig !== this.sig) {
      this.sig = sig;
      if (this.box.offsetWidth > 0) { this.dirty = false; this.paint(this.cv, false); if (this.isOpen) { this.fit(); this.paint(this.bigCv, true); this.nearAt = performance.now(); } }
    }
    this.car = { x, z, fx, fz };
    if (this.near && this.isOpen && performance.now() - this.nearAt >= NEAR_REPAINT_MS) { this.nearAt = performance.now(); this.paint(this.bigCv, true); }   // Ausschnitt fährt mit, Overlay sparsam (10 Hz)
    this.place();
  }
  /** Auto-Pfeile setzen (kleine Karte: Gesamtausschnitt; große: aktuelle Stufe); nur bei Änderung */
  private place(): void {
    const { x, z, fx, fz } = this.car, a = Math.round(Math.atan2(fx, -fz) * 180 / Math.PI / 4) * 4, E = this.view(true);
    const px = Math.round(this.u(x) * 1000), pz = Math.round(this.v(z) * 1000), bx = Math.round(this.u(x, E) * 1000), bz = Math.round(this.v(z, E) * 1000);
    const key = px + ',' + pz + ',' + a + ',' + bx + ',' + bz; if (key === this.last) return;
    this.last = key;
    for (const [d, X, Z] of [[this.dot, px, pz], [this.bigDot, bx, bz]] as const) { d.style.setProperty('--x', String(X / 10)); d.style.setProperty('--y', String(Z / 10)); d.style.setProperty('--a', a + 'deg'); }
    this.dot.dataset.p = px + ',' + pz; this.bigDot.dataset.p = bx + ',' + bz;
  }
  destroy(): void { this.ro?.disconnect(); this.box.remove(); this.big.remove(); }
}

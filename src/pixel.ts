// Arcade-Pixelschrift und Pixel-Sprites. Alles selbst gezeichnet, keine Dateien/CDNs.
// px(parent, 'text {star} 3') legt ein <canvas> an (1 Bildpunkt = 1 Schrift-/Spritepunkt, CSS skaliert per --u hart hoch).
// Neues Icon: unten in SPRITES eintragen (Zeilen aus Palettenzeichen, '.' = leer), dann im Text als {name} benutzen.

const PAL: Record<string, string> = {
  w: '#ffffff', y: '#ffcc00', r: '#ee2211', k: '#000000', x: '#39e6ff', g: '#22dd44', b: '#3399ff', o: '#ff8800', c: '#44ddff', n: '#888888', d: '#c08040',
};

// 5x7-Schrift, je Zeile 5 Bit (Bit 4 = links)
export const F: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
  '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0], '-': [0, 0, 0, 31, 0, 0, 0],
  '–': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0], '/': [1, 1, 2, 4, 8, 16, 16], '%': [24, 25, 2, 4, 8, 19, 3],
  '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], '·': [0, 0, 0, 4, 0, 0, 0], 'ß': [12, 18, 18, 22, 18, 18, 20],
  'Ä': [10, 0, 14, 17, 31, 17, 17], 'Ö': [10, 0, 14, 17, 17, 17, 14], 'Ü': [10, 0, 17, 17, 17, 17, 14],
};
const BOX = [31, 17, 17, 17, 17, 17, 31];

const S = (s: string) => s.trim().split('\n').map((l) => l.trim());
export const SPRITES: Record<string, string[]> = {
  star: S(`
....y....
....y....
...yyy...
yyyyyyyyy
.yyyyyyy.
..yyyyy..
..yyyyy..
.yyy.yyy.
.yy...yy.`),
  lupe: S(`
..www....
.w...w...
w.....w..
w.....w..
w.....w..
.w...w...
..wwwww..
.....www.
......www`),
  clock: S(`
...www...
...www...
.........
..wwwww..
.ww...ww.
.w..y..w.
w...y...w
w...yyy.w
.w.....w.
.ww...ww.
..wwwww..`),
  chair: S(`
.b.......
.wb......
..bw.....
..wbbbbb.
...wwwww.
...dwb.db
..d.dw.d.
.d..d..d.
d...d..d.`),
  gear: S(`
....w....
.w.www.w.
..wwwww..
.www.www.
www...www
.www.www.
..wwwww..
.w.www.w.
....w....`),
  flag: S(`
w.........
wwwkkwwkkw
wwwkkwwkkw
wwwwwkkwwk
wwwwwkkwwk
wwwkkwwkkw
wwwkkwwkkw
w.........
w.........`),
  trophy: S(`
.yyyyyyy.
yyyyyyyyy
y.yyyyy.y
y.yyyyy.y
.yyyyyyy.
...yyy...
....y....
...yyy...
..yyyyy..`),
  snow: S(`
.....c.....
.c...c...c.
..c..c..c..
...c.c.c...
....ccc....
ccccwcccccc
....ccc....
...c.c.c...
..c..c..c..
.c...c...c.
.....c.....`),
  city: S(`
...........
....bb.....
....bb.bb..
.bb.bbybb..
.bybbbbbb.b
.bbbbybbbbb
.bybbbbbyyb
.bbbybbbbbb
.bbbbbbybbb
kkkkkkkkkkk`),
  beach: S(`
..ggg......
.g.g.g.oo..
...g..oooo.
...d..oooo.
...d...oo..
...d.......
..ddd......
bbbbbbbbbbb
.bb.bbb.bb.
bbbbbbbbbbb`),
  rhein: S(`
.....w.w...
.....www...
....nnnnn..
...ggnnngg.
..gggggggg.
.gggggggggg
gggggggggg.
bbbbbbbbbbb
.bb.bbb.bb.
bbbbbbbbbbb`),
  suburb: S(`
.....r.....
...rrrrr.oo
..rrrrrrooo
.rrrrrrrr.d
.wwwwwwww.d
.wbbwwwbw.d
.wbbwwwbw..
.wwwwdwww..
ggggggggggg`),
  offroad: S(`
.....w....
....www...
...nnnnn..
..nnnnnnn.
.nnnnnnnnn
nnnnddnnnn
dddddddddd
dkdkkdkdkd
dddddddddd`),
  golf: S(`
.wrr......
.wrrrr....
.wrrrrrr..
.wrrrr....
.wrr......
.w........
.w........
.w........
gggggggggg`),
  home: S(`
.....y.....
...yyyyy...
.yyyyyyyyy.
yyyyyyyyyyy
.wwwwwwwww.
.wwwwwwwww.
.www.r.www.
.www.r.www.
.www.r.www.`),
  snd: S(`
....w.......
...ww...w...
wwwww....w..
wwwww..w.w..
wwwww..w.w..
wwwww....w..
...ww...w...
....w.......`),
  mute: S(`
....w.......
...ww.......
wwwww.r...r.
wwwww..r.r..
wwwww...r...
wwwww..r.r..
...ww.r...r.
....w.......`),
  map: S(`
.wwwwww.
w.....w
w.ww..w
w..w.ww
ww.w..w
w..ww.w
w.....w
.wwwwww.`),
  pause: S(`
wwww.wwww
wwww.wwww
wwww.wwww
wwww.wwww
wwww.wwww
wwww.wwww
wwww.wwww`),
  play: S(`
ww......
wwww....
wwwwww..
wwwwwwww
wwwwww..
wwww....
ww......`),
  fs: S(`
wwww...wwww
w.........w
w.........w
w.........w
...........
...........
...........
w.........w
w.........w
w.........w
wwww...wwww`),
  grid: S(`
wwww.wwww
wwww.wwww
wwww.wwww
wwww.wwww
.........
wwww.wwww
wwww.wwww
wwww.wwww
wwww.wwww`),
  wheel: S(`
...wwwww...
.ww.....ww.
.w.......w.
w....y....w
w...yyy...w
wwwwwyywwwww
w....y....w
w....y....w
.w...y...w.
.ww..y..ww.
...wwwww...`),
  vEye: S(`
...wwwww...
.ww.....ww.
w...ccc...w
w..cckcc..w
w...ccc...w
.ww.....ww.
...wwwww...`),
  hook: S(`
.........yyy.
.......yyy.n.
......yy...n.
.....yy....n.
....yy.....n.
...yy......n.
..yy.......n.
.yyy.......n.
yyy........n.
nnnnnn.....w.
nnnnnn...w.w.
nnnnnn...www.`),
  tl: S(`
....w
...ww
..www
.wwww
wwwww
.wwww
..www
...ww
....w`),
  tr: S(`
w....
ww...
www..
wwww.
wwwww
wwww.
www..
ww...
w....`),
  tu: S(`
....x....
...xxx...
..xxxxx..
.xxxxxxx.
xxxxxxxxx`),
  td: S(`
rrrrrrrrr
.rrrrrrr.
..rrrrr..
...rrr...
....r....`),
  car: S(`
......rrrrrr.......
.....rwwrwwwr......
....rrwwrwwwrr.....
..rrrrrrrrrrrrrrr..
.rrrrrrrrrrrrrrrrr.
rrrrrrrrrrrrrrrrrrr
rrrrrrrrrrrrrrrrrrr
.nnn..rrrrrr..nnn..
nnannn.......nnfnn.
.nnn...........nnn.`),
  jeep: S(`
..o.....o..........
..oooooooo.........
nnoo.....o..cc.....
nnnoooooooooooooo..
nnnooooooooooooooo.
.ooooooooooooooooo.
.ooooooooooooooooo.
.nnn...........nnn.
nnannn.......nnfnn.
.nnn...........nnn.`),
  buggy: S(`
.rrrrrrr...........
..y...y......cc....
..y...y....cccccc..
..yyyyyyyyyyyyyyyy.
.yyyyyyyrrrrrrryyyy
.yyyyyyyyyyyyyyyy..
...yyyyyyyyyyyyy...
.nnnnn.............
nnnannn........nfn.
.nnnnn.........nnn.`),
  rally: S(`
........bbbbbbbbbbb...............
..nnnnnnbwwwbbbwbbbbbww............
..wnwwnwwwbbbbbwbbbbbbbwww.........
..n....nwwwbbbbbbbbbbbbwwww........
.dwwwwwwwwwwwwwwwwwwwwwwwwwwwww....
.dwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwn..
dwwrrrrrrrrrrrrrrrrrrrrrrrrrrwwwww.
dwwrrrrrrrrrrrrrrrrrrrrrrrrrrrwwwyy
dwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwyy
.dwwnnnnnwwwwwwwwwwwwwwwnnnnnwwwwyo
..wnnnnnnnwwwwwwwwwwwwwnnnnnnnwwyy.
..nnnnnnnnn.............nnnnnnnnn..
..nnnnannnn.............nnnnfnnnn..
...nnnnnnn...............nnnnnnn...`),
};
PAL.a = PAL.w; PAL.f = PAL.w; PAL.q = '#3d4b7d';
// gedämpfte Platzhalter-Symbole (Level noch nicht gefahren)
SPRITES.star0 = SPRITES.star.map((r) => r.replace(/[a-z]/g, 'q'));
SPRITES.clock0 = SPRITES.clock.map((r) => r.replace(/[a-z]/g, 'q'));

/** Auto-Sprite (Seitenansicht, fährt nach rechts) mit roten Antriebsrädern. Gibt den Spritenamen zurück. */
export const carSprite = (style: 'hatch' | 'buggy' | 'rally' | 'jeep', drive: 'FWD' | 'RWD' | 'AWD'): string => {
  const base = style === 'buggy' || style === 'rally' || style === 'jeep' ? style : 'car', key = `${base}_${drive}`;
  if (!SPRITES[key]) {
    // Antrieb: die Reifen der angetriebenen Räder (graue Pixel der untersten 3 Zeilen) rot, Nabe schwarz; linke Hälfte = hinten, rechte = vorn
    const rows = SPRITES[base], n = rows.length, W = rows[0].length;
    const rearDrv = drive !== 'FWD', frontDrv = drive !== 'RWD';
    SPRITES[key] = rows.map((row, y) => y < n - 3 ? row : row.split('').map((ch, x) => {
      const drv = x < W / 2 ? rearDrv : frontDrv;
      if (ch === 'a' || ch === 'f') return 'k';
      return ch === 'n' && drv ? 'r' : ch;
    }).join(''));
  }
  return key;
};

/** Gerenderte Auto-Symbole (aus den 3D-Modellen, siehe caricons.ts), nach Spritename; haben Vorrang vor den gezeichneten Sprites */
const ICONS: Record<string, HTMLCanvasElement> = {};
export const setIcons = (m: Record<string, HTMLCanvasElement>): void => { Object.assign(ICONS, m); };
export const hasIcon = (name: string): boolean => name in ICONS;

type Item = { c: number[]; w: number; h: number; sp?: string[]; bmp?: HTMLCanvasElement };
const parse = (t: string): Item[] => {
  const out: Item[] = [];
  for (let i = 0; i < t.length; i++) {
    let ch = t[i];
    if (ch === '{') {
      const j = t.indexOf('}', i);
      if (j > i && ICONS[t.slice(i + 1, j)]) { const b = ICONS[t.slice(i + 1, j)]; out.push({ c: [], w: b.width, h: b.height, bmp: b }); i = j; continue; }
      if (j > i) { const sp = SPRITES[t.slice(i + 1, j)]; if (sp) { out.push({ c: [], w: Math.max(...sp.map((r) => r.length)), h: sp.length, sp }); i = j; continue; } }
    }
    if (ch === ' ') { out.push({ c: [], w: 3, h: 0 }); continue; }
    if (ch !== 'ß') ch = ch.toUpperCase();   // 'ß'.toUpperCase() wäre „SS“ (keine Glyphe)
    out.push({ c: F[ch] ?? BOX, w: 5, h: 7 });
  }
  return out;
};

/** Zeichnet Text/Sprites in ein Canvas, nur wenn sich Text oder Farbe geändert haben (HUD-Updates bleiben billig). */
export function pxSet(c: HTMLCanvasElement, text: string, color = '#ffffff', shadow = true): void {
  if (c.dataset.t === text && c.dataset.c === color) return;
  c.dataset.t = text; c.dataset.c = color;
  const items = parse(text);
  const H0 = Math.max(8, ...items.map((i) => (i.sp || i.bmp ? i.h : 0)));
  let W = 0; for (const i of items) W += i.w + 1; W = Math.max(1, W - 1);
  const pad = Math.max(0, Number(c.dataset.min || 0) - W);   // reservierte Breite (Bildpunkte), Text rechtsbündig: HUD-Zahlen springen nicht
  W += pad;
  const cw = W + (shadow ? 1 : 0), ch = H0 + (shadow ? 1 : 0);
  c.width = cw; c.height = ch;
  c.style.width = `calc(var(--u,2px) * ${cw} * ${c.dataset.k || 1} * var(--kx,1))`;
  c.style.height = `calc(var(--u,2px) * ${ch} * ${c.dataset.k || 1} * var(--kx,1))`;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, cw, ch);
  let x = pad;
  for (const it of items) {
    if (it.bmp) {
      g.drawImage(it.bmp, x, H0 - it.h);
    } else if (it.sp) {
      const y0 = H0 - it.h;
      it.sp.forEach((row, y) => { for (let xx = 0; xx < row.length; xx++) { const p = PAL[row[xx]]; if (p) { g.fillStyle = p; g.fillRect(x + xx, y0 + y, 1, 1); } } });
    } else if (it.c.length) {
      const rows = it.c;
      const y0 = H0 - 8 + 1;
      for (const pass of shadow ? [1, 0] : [0]) {
        g.fillStyle = pass ? '#000' : color;
        rows.forEach((bits, y) => { for (let b = 0; b < 5; b++) if (bits & (16 >> b)) g.fillRect(x + b + pass, y0 + y + pass, 1, 1); });
      }
    }
    x += it.w + 1;
  }
}

/** Neues Pixel-Element. k = ganzzahlige Vergrößerung (Standard 1). */
export function px(parent: HTMLElement | null, text: string, o: { color?: string; k?: number; cls?: string; shadow?: boolean; min?: number } = {}): HTMLCanvasElement {
  const c = document.createElement('canvas');
  if (o.min) c.dataset.min = String(o.min);
  c.className = 'px' + (o.cls ? ' ' + o.cls : '');
  c.dataset.k = String(o.k ?? 1);
  pxSet(c, text, o.color ?? '#ffffff', o.shadow ?? true);
  parent?.appendChild(c);
  return c;
}
export const pxText = (e: Element) => [...(e.matches('canvas.px') ? [e] : e.querySelectorAll('canvas.px'))].map((c) => (c as HTMLElement).dataset.t).join(' ');

/** Pixeltext in einen Behälter einpassen: Stufe k schrittweise verkleinern, bis der Text hineinpasst (Mindeststufe 0,5). */
export function pxFit(c: HTMLCanvasElement, maxW: number): void {
  let k = Number(c.dataset.k || 1);
  const apply = () => { c.dataset.k = String(k); c.style.width = `calc(var(--u,2px) * ${c.width} * ${k} * var(--kx,1))`; c.style.height = `calc(var(--u,2px) * ${c.height} * ${k} * var(--kx,1))`; };
  apply();
  const u = () => parseFloat(getComputedStyle(c).getPropertyValue('--u')) || 2;   // natürliche Breite (max-width:100% würde sonst quetschen statt verkleinern)
  while (k > 0.5 && c.width * k * u() > maxW + 0.5) { k = Math.max(0.5, k - 0.25); apply(); }
}

/** Chrom-Logo (80er): Schrift als Pixelbild mit Farbverlauf je Zeile (hell oben, dunkler Horizont, Rosa/Orange unten), dunkle Kontur, versetzte Magenta-Kante.
 *  Größe wie bei px(): Breite/Höhe = --lu * Bildpunkte (der Aufrufer setzt --lu am Element oder davor). */
export function logo(parent: HTMLElement | null, text: string, unitVar = '--lu', emph?: number[]): HTMLCanvasElement {
  const items = parse(text);
  let W = 0; for (const i of items) W += i.w + 2; W = Math.max(1, W - 1);
  const PAD = 3, cw = W + PAD * 2 + 3, ch = 7 + 1 + PAD * 2 + 2;       // Umlaut-Punkte brauchen eine Zeile mehr
  const c = document.createElement('canvas'); c.className = 'px logo'; c.width = cw; c.height = ch; c.dataset.t = text;
  c.style.width = `calc(var(${unitVar}, 3px) * ${cw})`; c.style.height = `calc(var(${unitVar}, 3px) * ${ch})`;
  const g = c.getContext('2d')!;
  const chrome = ['#ffffff', '#d6f0ff', '#86c6ff', '#3f63c8', '#ff4fc0', '#ff9a3a', '#ffe14a'];
  const dim = ['#d8ccff', '#a994f0', '#7a66d4', '#5546b0', '#7a4aa8', '#9a4a98', '#b85a98'];   // nicht betonte Buchstaben: Violett statt Chrom
  const glyph = (fill: (row: number) => string, ox0: number, oy: number, tone = false) => {
   for (const ox of [ox0, ox0 + 1]) {          // fett: jeder Strich 2 Bildpunkte breit
    let x = PAD;
    let idx = -1;
    for (const it of items) {
      idx++;
      const fillI = tone && emph && !emph.includes(idx) ? (r: number) => dim[r] : fill;
      if (it.c.length) {
        const rows = it.c, y0 = PAD + 1;
        rows.forEach((bits, y) => { g.fillStyle = fillI(y); for (let b = 0; b < 5; b++) if (bits & (16 >> b)) g.fillRect(x + b + ox, y0 + y + oy, 1, 1); });
      }
      x += it.w + 2;
    }
   }
  };
  for (const [ox, oy] of [[1, 2], [2, 2], [2, 1], [1, 1]]) glyph(() => '#b01480', ox, oy);       // Kante nach rechts unten
  for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) glyph(() => '#10002a', ox, oy);   // Kontur
  glyph((r) => chrome[r], 0, 0, true);
  parent?.appendChild(c);
  return c;
}

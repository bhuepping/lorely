// Debug-Modus: Aufzeichnung für Fehlersuche, standardmäßig AUS (`rs-debug`='1' im Zahnrad-Feld).
// Datenschutz/F-Droid: nichts wird automatisch gesendet, keine Adresse eingebaut; das Log bleibt im Speicher, bis der Nutzer es selbst
// teilt (Teilen-Menü bzw. Download). Bei ausgeschaltetem Modus: keine Listener, kein Puffer, keine Kosten (Spielschleife prüft `dbg.on`).
// Rein von außen: die Physik wird nur gelesen (Zustand je Bild), nie verändert.
import { store } from './dom';
import { isNative } from './native';
import { toast } from './toast';
import { t } from './i18n';

declare const __VER__: string;
export const VERSION = typeof __VER__ !== 'undefined' ? __VER__ : 'dev';

/** Ringpuffer fester Größe: ältestes fällt heraus (`dropped` zählt mit) */
export class Ring<T> {
  private a: T[] = []; private h = 0; dropped = 0;
  constructor(readonly cap: number) {}
  push(v: T): void { if (this.a.length < this.cap) this.a.push(v); else { this.a[this.h] = v; this.h = (this.h + 1) % this.cap; this.dropped++; } }
  get size(): number { return this.a.length; }
  clear(): void { this.a = []; this.h = 0; this.dropped = 0; }
  toArray(): T[] { return this.a.length < this.cap ? this.a.slice() : [...this.a.slice(this.h), ...this.a.slice(0, this.h)]; }
}

export interface Header { [k: string]: string }
export interface Ev { t: number; kind: string; text: string }
/** Zustandsspur: t (s), Position, km/h, Lage in Grad, Gas, Lenkung, Untergrund */
export interface Tr { t: number; x: number; y: number; z: number; kmh: number; yaw: number; pitch: number; roll: number; gas: number; steer: number; surf: string }

const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : String(n));
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : String(n));
const sg = (n: number) => (Number.isFinite(n) ? (n >= 0 ? '+' : '') + n.toFixed(2) : String(n));

/** Lesbares Textlog: Kopfzeilen, Ereignisse (Sekunden ab Rennstart), Zustandsspur als CSV-Block */
export function formatLog(head: Header, evs: Ev[], tr: Tr[], droppedEv = 0): string {
  const L: string[] = ['LoReLy Debug-Log'];
  for (const [k, v] of Object.entries(head)) L.push(`${k}: ${v}`);
  L.push(`Ereignisse: ${evs.length}${droppedEv ? ` (+${droppedEv} ältere verworfen)` : ''}`, '', '--- Ereignisse (s ab Rennstart) ---');
  for (const e of evs) L.push(`${sg(e.t).padStart(8)}  ${e.kind}${e.text ? '  ' + e.text : ''}`);
  L.push('', `--- Zustand alle 0,2 s, letzte ${Math.round(TRACE_S / 60)} min (${tr.length} Zeilen) ---`, 't,x,y,z,kmh,yaw,pitch,roll,gas,steer,surf');
  for (const r of tr) L.push([f2(r.t), f1(r.x), f1(r.y), f1(r.z), Math.round(r.kmh), Math.round(r.yaw), Math.round(r.pitch), Math.round(r.roll), f2(r.gas), f2(r.steer), r.surf].join(','));
  return L.join('\n') + '\n';
}

/** Lage aus dem Quaternion [x,y,z,w] (Y oben, Blick -z): Gier (0 = -z), Nick (+ = Nase hoch), Wank (+ = rechte Seite unten), in Grad */
export function attitude(q: number[]): { yaw: number; pitch: number; roll: number } {
  const [x, y, z, w] = q, D = 180 / Math.PI;
  const fx = -2 * (x * z + w * y), fy = -2 * (y * z - w * x), fz = -(1 - 2 * (x * x + y * y));   // R·(0,0,-1)
  const ry = 2 * (x * y + w * z);                                                               // (R·(1,0,0)).y
  return { yaw: Math.atan2(-fx, -fz) * D, pitch: Math.asin(Math.max(-1, Math.min(1, fy))) * D, roll: Math.asin(Math.max(-1, Math.min(1, -ry))) * D };
}

export const TRACE_DT = 0.2, TRACE_S = 120, EV_CAP = 2000;
const ANOM_GAP = 1;   // Physik-Auffälligkeiten je Art höchstens einmal pro Sekunde (kein Fluten)

/** was die Schleife je Bild liefert (Physik nur gelesen) */
export interface Frame { dt: number; pos: number[]; vel: number[]; q: number[]; omega: number[]; ground: number; kmh: number; gas: number; steer: number; surf: string }

export class DebugLog {
  on = store.get('rs-debug') === '1';
  head: Header = {};
  private evs = new Ring<Ev>(EV_CAP);
  private tr = new Ring<Tr>(Math.round(TRACE_S / TRACE_DT));
  private t0 = 0; private nextTr = 0; private lastAnom = new Map<string, number>();
  private prev: { pos: number[]; speed: number; e: number } | null = null; skipJump = true;
  private subs = new Set<() => void>();
  now = () => performance.now();   // Tests setzen die Uhr
  /** Spiel-Zeit (s) für die Spur: wird je Bild mit dt hochgezählt, steht in Pause still */
  private clock = 0;
  has = false;
  racing = false;
  clk(): number { return this.on ? (this.now() - this.t0) / 1000 : 0; }

  onChange(f: () => void): void { this.subs.add(f); }
  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on; store.set('rs-debug', on ? '1' : '0');
    if (on) this.attach(); else { this.detach(); this.evs.clear(); this.tr.clear(); this.has = false; this.racing = false; }
    this.subs.forEach((f) => f());
  }
  /** beim Laden: war der Modus gespeichert, Listener setzen */
  init(): void { if (this.on) this.attach(); }

  private onErr = (e: ErrorEvent) => this.ev('fehler', `${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`);
  private onRej = (e: PromiseRejectionEvent) => this.ev('fehler', 'Promise: ' + String((e.reason as Error)?.message ?? e.reason));
  private attach(): void { window.addEventListener('error', this.onErr); window.addEventListener('unhandledrejection', this.onRej); }
  private detach(): void { window.removeEventListener('error', this.onErr); window.removeEventListener('unhandledrejection', this.onRej); }

  /** Rennstart: Puffer leeren, Kopf setzen, Zeit 0 */
  begin(head: Header): void {
    if (!this.on) return;
    this.evs.clear(); this.tr.clear(); this.lastAnom.clear();
    this.t0 = this.now(); this.clock = 0; this.nextTr = 0; this.prev = null; this.skipJump = true; this.has = true; this.racing = true;
    this.head = { Version: VERSION, Datum: new Date().toISOString(), ...head };
    this.ev('start', head.Level ?? '');
  }
  end(): void { this.racing = false; }
  ev(kind: string, text = ''): void { if (this.on && (this.racing || kind === 'fehler')) this.evs.push({ t: this.clk(), kind, text }); }
  /** Auto wurde versetzt (Kran/Rand): der nächste Positionssprung ist gewollt */
  teleported(): void { this.skipJump = true; }
  private anom(kind: string, text: string): void {
    const t = this.clk(); if (t - (this.lastAnom.get(kind) ?? -9) < ANOM_GAP) return;
    this.lastAnom.set(kind, t); this.ev('physik:' + kind, text);
  }

  /** je Bild bei laufendem Rennen: Spur (0,2 s) + Auffälligkeiten (NaN, Sprung, Rad/Auto unter Gelände, Energiegewinn) */
  frame(f: Frame): void {
    if (!this.on || !this.racing) return;
    this.clock += f.dt;
    const { pos, vel, q, omega } = f;
    if (![...pos, ...vel, ...q, ...omega].every(Number.isFinite)) { this.anom('nan', `pos ${pos.map(f1)} vel ${vel.map(f1)}`); this.prev = null; return; }
    const speed = Math.hypot(vel[0], vel[1], vel[2]), e = 0.5 * speed * speed + 9.81 * pos[1];
    if (this.prev && !this.skipJump) {
      const d = Math.hypot(pos[0] - this.prev.pos[0], pos[1] - this.prev.pos[1], pos[2] - this.prev.pos[2]);
      if (d > 1.5 + 2 * Math.max(speed, this.prev.speed) * f.dt) this.anom('sprung', `${f1(d)} m in ${f2(f.dt)} s bei ${f1(speed * 3.6)} km/h`);
      if (f.dt >= 1 / 120 && (e - this.prev.e) / f.dt > ENERGY_W) this.anom('energie', `+${Math.round((e - this.prev.e) / f.dt)} W/kg bei ${f1(speed * 3.6)} km/h`);
    }
    this.skipJump = false; this.prev = { pos: pos.slice(), speed, e };
    if (pos[1] < f.ground - UNDER) this.anom('unter-gelaende', `Auto ${f1(f.ground - pos[1])} m unter Gelände bei ${f1(pos[0])}, ${f1(pos[2])}`);
    if (this.clock >= this.nextTr) {
      this.nextTr = this.clock + TRACE_DT;
      const a = attitude(q);
      this.tr.push({ t: this.clk(), x: pos[0], y: pos[1], z: pos[2], kmh: f.kmh, yaw: a.yaw, pitch: a.pitch, roll: a.roll, gas: f.gas, steer: f.steer, surf: f.surf });
    }
  }

  text(): string { return formatLog(this.head, this.evs.toArray(), this.tr.toArray(), this.evs.dropped); }
  fileName(level: string): string {
    const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
    return `loreley-debug-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${level.replace(/[^\w-]+/g, '')}.txt`;
  }
}
const ENERGY_W = 600;   // W/kg: Motor ≈ 80–150, Rampen/Landung liefern nie mehr als die Schwerkraft herausgibt
const UNDER = 0.4;      // m: Auto-Schwerpunkt so weit unter dem Gelände

export const dbg = new DebugLog();
dbg.init();

/** Teilen: Web Share mit Datei (Handy: Mail/Messenger als Anhang); in der App ohne Share: Zwischenablage; sonst Download. Gibt zurück, wie es ging. */
export async function shareLog(text: string, name: string): Promise<'share' | 'download' | 'abbruch' | 'clipboard'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
  try {
    const file = new File([text], name, { type: 'text/plain' });
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try { await nav.share({ files: [file], title: name }); return 'share'; }
      catch (e) { if ((e as Error)?.name === 'AbortError') return 'abbruch'; /* sonst Download */ }
    }
  } catch { /* File-Konstruktor fehlt: Download */ }
  if (!nav.share && isNative()) { try { await navigator.clipboard.writeText(text); return 'clipboard'; } catch { /* Download */ } }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'download';
}

/** aktuelles Log teilen/speichern (Knöpfe im Zahnrad, in der Pause und auf der Endkarte) */
export const shareCurrent = async () => { const r = await shareLog(dbg.text(), dbg.fileName((dbg.head.Level ?? 'log').split(' ')[0])); if (r === 'clipboard') toast(t('copied')); return r; };

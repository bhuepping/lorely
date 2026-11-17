export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement, title?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (title) e.title = title;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
};
export const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};
import { dec } from './i18n';
export const fmtDist = (m: number) => m >= 1000 ? dec((m / 1000).toFixed(2)) + ' km' : Math.round(m) + ' m';
export const fmtTime = (s: number) => dec(s.toFixed(1)) + ' s';
/** Uhrzeit: 161,3 s -> „2:41“, mit tenths „2:41,3“ (zehntelgerundet; Sekunden abgeschnitten, damit „2:41“ der Anfang von „2:41,3“ ist) */
export const fmtClock = (s: number, tenths = false) => {
  const tt = Math.max(0, Math.round(s * 10)), m = Math.floor(tt / 600), sec = Math.floor((tt % 600) / 10);
  return m + ':' + String(sec).padStart(2, '0') + (tenths ? dec('.' + (tt % 10)) : '');
};

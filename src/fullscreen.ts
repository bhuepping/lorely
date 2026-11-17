// Vollbild für das Spiel (Container `root`, nicht die ganze Seite). Standard: an, wo die API existiert.
// Menü (Zahnrad-Feld) und Spiel (Knopf) teilen sich Zustand und Logik. iPhone-Safari: keine API -> kein Knopf.
// `rs-fs`='0' = der Nutzer hat es selbst beendet -> nicht automatisch wieder rein.
import { store } from './dom';
import { isNative } from './native';

const d = document as any;
let target: HTMLElement | null = null;
let armed = false;   // der Auto-Versuch läuft höchstens einmal (Chrome zeigt bei jedem Eintritt einen Hinweis)
let pending = false;
const subs = new Set<(on: boolean) => void>();

export const fsSupported = (): boolean => !isNative() && !!target && !!((target as any).requestFullscreen || (target as any).webkitRequestFullscreen);
export const fsOn = (): boolean => !!(d.fullscreenElement || d.webkitFullscreenElement);
/** Zustand-Wechsel (Eintritt/Austritt) an Knöpfe und Spiel melden */
export const onFsChange = (cb: (on: boolean) => void) => { subs.add(cb); };

// Esc: im Vollbild hält der Browser Esc sonst für das Ende. Mit Keyboard Lock kommt Esc ans Spiel (kurz = Pause);
// nur langes Halten beendet das Vollbild (Browser-Standard).
const kb = (): any => (navigator as any).keyboard;
const lockKeys = () => { try { const p = kb()?.lock?.(['Escape']); void Promise.resolve(p).catch(() => {}); } catch { /* egal */ } };
const unlockKeys = () => { try { kb()?.unlock?.(); } catch { /* egal */ } };

const enter = (): void => {
  if (!target || fsOn() || pending) return;
  const t = target as any;
  pending = true;
  try {
    const p = t.requestFullscreen ? t.requestFullscreen({ navigationUI: 'hide' }) : t.webkitRequestFullscreen();
    Promise.resolve(p).then(() => { if (fsOn()) lockKeys(); }, () => {}).finally(() => { pending = false; });
  } catch { pending = false; }
};
const exit = (): void => {
  try { void Promise.resolve(d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.()).catch(() => {}); } catch { /* egal */ }
};

/** Knopf/Schalter: an -> aus (merkt `rs-fs`='0'), aus -> an */
export function fsToggle(): void {
  if (!fsSupported()) return;
  // Zustand-Meldung erst über fullscreenchange (sonst Pause, bevor es wirklich aus ist)
  if (fsOn()) { store.set('rs-fs', '0'); exit(); } else { store.set('rs-fs', '1'); enter(); }
}

const notify = () => { const on = fsOn(); for (const cb of subs) cb(on); };

/** Einmalig einrichten: erste Berührung/Klick im Spiel (Menü zählt) fordert Vollbild an, wenn Standard = an */
export function fsArm(root: HTMLElement): void {
  target = root;
  if (armed || !fsSupported()) return;
  armed = true;
  const first = () => {
    root.removeEventListener('pointerdown', first, true); root.removeEventListener('keydown', first, true);
    if (store.get('rs-fs') !== '0') enter();
  };
  root.addEventListener('pointerdown', first, true);
  root.addEventListener('keydown', first, true);
  const change = () => {
    if (!fsOn()) unlockKeys();
    // selbst beendet (Esc, Browser) = nicht wieder automatisch rein
    if (!fsOn() && store.get('rs-fs') !== '0') store.set('rs-fs', '0');
    notify();
  };
  document.addEventListener('fullscreenchange', change);
  // F: Vollbild umschalten (Spiel und Menü, nicht in Textfeldern)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    if (!fsSupported()) return;
    e.preventDefault(); fsToggle();
  });
  document.addEventListener('webkitfullscreenchange', change);
}

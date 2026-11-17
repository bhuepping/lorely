// Bestwerte je Strecke und Auto – nur lokal (localStorage, überall try/catch). Keine Serien, keine Belohnungen.
// Zeitfahren = kleinste Fahrzeit (`time`), Sammeln = meiste Sterne (`stars`), je Auto getrennt.
import type { Mode } from './run';
import { CARS } from './physics/params';

export interface CarBest { time?: number; stars?: number }
export interface LevelSave { cars?: Record<string, CarBest> }
const KEY = 'rs-save', VER = 4;   // Version 4: je Auto time + stars; alte Restzeiten (rest/run) verfallen, das alte Sterne-Maximum je Strecke wird Startwert jedes Autos

/** Bestwert des Autos im Modus: Fahrzeit in s (Zeitfahren) bzw. Sternzahl (Sammeln); undefined = noch nicht gefahren */
export function bestOf(s: LevelSave | undefined, car: string, mode: Mode): number | undefined {
  const b = s?.cars?.[car];
  return mode === 'time' ? b?.time : b?.stars;
}

/** Altformat -> aktuelles Format. changed, wenn umgeschrieben werden muss. */
export function migrateSave(v: unknown): { save: Record<string, LevelSave>; changed: boolean } {
  const save: Record<string, LevelSave> = {};
  let changed = false;
  if (!v || typeof v !== 'object') return { save, changed: false };
  if ((v as Record<string, unknown>)._v !== VER && Object.keys(v).length) changed = true;   // leerer Speicher bleibt leer
  for (const [id, e] of Object.entries(v as Record<string, any>)) {
    if (id === '_v') continue;
    if (!e || typeof e !== 'object') { changed = true; continue; }
    const cars: Record<string, CarBest> = {};
    if (e.cars && typeof e.cars === 'object') {
      for (const [c, b] of Object.entries(e.cars as Record<string, any>)) {
        const o: CarBest = {};
        if (b && typeof b.time === 'number') o.time = b.time;
        if (b && typeof b.stars === 'number') o.stars = b.stars;
        if (Object.keys(o).length) cars[c] = o;
      }
    } else if (typeof e.stars === 'number') {   // Altstand: ein Sterne-Maximum je Strecke -> Startwert für jedes Auto
      for (const c of Object.keys(CARS)) cars[c] = { stars: e.stars };
    }
    if ('rest' in e || 'run' in e || 'best' in e || 'car' in e || 'stars' in e) changed = true;
    save[id] = Object.keys(cars).length ? { cars } : {};
  }
  if ('uebungsplatz' in save) { delete save.uebungsplatz; changed = true; }   // Übungsplatz ist weg
  return { save, changed };
}
function writeSave(all: Record<string, LevelSave>): void {
  try { localStorage.setItem(KEY, JSON.stringify({ _v: VER, ...all })); } catch { /* egal */ }
}
export function loadSave(): Record<string, LevelSave> {
  let raw: unknown = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { raw = {}; }
  const { save, changed } = migrateSave(raw);
  if (changed) writeSave(save);
  return save;
}
/** Fahrt im Ziel: Zeitfahren zählt die Fahrzeit (kleiner ist besser), Sammeln die Sterne (mehr ist besser). Der erste Wert ist immer ein Rekord. */
export function recordResult(id: string, r: { won: boolean; mode: Mode; stars: number; car?: string; elapsed?: number }): { newBest: boolean } {
  if (!r.won) return { newBest: false };
  const all = loadSave(), s = all[id] ?? {}, car = r.car || 'hatch', b = ((s.cars ??= {})[car] ??= {});
  let newBest = false;
  if (r.mode === 'time') {
    const t = Math.round((r.elapsed ?? 0) * 10) / 10;
    if (t > 0 && (b.time === undefined || t < b.time)) { b.time = t; newBest = true; }
  } else if (r.stars > 0 && r.stars > (b.stars ?? 0)) { b.stars = r.stars; newBest = true; }
  all[id] = s;
  writeSave(all);
  return { newBest };
}
/** alle Bestwerte löschen (Einstellungen liegen in anderen Schlüsseln und bleiben) */
export function resetSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
}

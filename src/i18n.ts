// Zwei Sprachen: Deutsch und British English. Alle sichtbaren Texte stehen hier (t(key)), dazu Namen von Welten, Strecken, Autos, Untergründen.
// Standard = Systemsprache (de* -> DE, sonst EN), Wahl in localStorage `rs-lang`. Save-Schlüssel (Level-id, #v) bleiben unberührt: nur Anzeigenamen.
export type Lang = 'de' | 'en';
const KEY = 'rs-lang';
const read = (): Lang => {
  try { const v = localStorage.getItem(KEY); if (v === 'de' || v === 'en') return v; } catch { /* egal */ }
  try { return /^de/i.test(navigator.language || '') ? 'de' : 'en'; } catch { return 'de'; }
};
let cur: Lang = read();
const subs = new Set<() => void>();
export const lang = (): Lang => cur;
export const onLang = (f: () => void) => { subs.add(f); };
export function setLang(l: Lang): void {
  if (l === cur) return;
  cur = l;
  try { localStorage.setItem(KEY, l); } catch { /* egal */ }
  try { document.documentElement.lang = l; } catch { /* egal */ }
  subs.forEach((f) => f());
}
try { document.documentElement.lang = cur; } catch { /* egal */ }

type P = [string, string];   // [de, en]
const TXT = {
  // Menü
  time: ['Zeitfahren: Uhr zählt hoch, schnellste Zeit gewinnt', 'Time trial: clock counts up, fastest time wins'], collect: ['Sammeln: keine Uhr, meiste Sterne gewinnen', 'Collect: no clock, most stars win'], go: ['Strecke starten', 'Start race'], lang: ['Sprache', 'Language'],
  reset: ['Zurücksetzen', 'Reset'], resetTip: ['Alle Bestzeiten und Sterne löschen (Einstellungen bleiben)', 'Delete all best times and stars (settings stay)'], yes: ['Ja', 'Yes'], cancel: ['Abbrechen', 'Cancel'],
  settings: ['Einstellungen', 'Settings'], prev: ['Vorige Seite', 'Previous page'], next: ['Nächste Seite', 'Next page'], best: ['Bestzeit', 'Best time'], stars: ['Sterne', 'Stars'], allStars: ['Alle Sterne', 'All stars'],
  // HUD
  kmh: ['KM/H', 'KM/H'], speed: ['Geschwindigkeit', 'Speed'], surface: ['Untergrund', 'Surface'], clock: ['Fahrzeit', 'Time'],
  checkpoints: ['Checkpoints', 'Checkpoints'], direction: ['Richtung', 'Direction'], cpHint: ['CHECKPOINT', 'CHECKPOINT'], progress: ['Fortschritt', 'Progress'],
  debug: ['Debug: Aufzeichnung für die Fehlersuche, nichts wird automatisch gesendet', 'Debug: recording for troubleshooting, nothing is sent automatically'], logShare: ['Log teilen oder speichern', 'Share or save log'], copied: ['Kopiert', 'Copied'],
  fps: ['Bilder pro Sekunde · Draw Calls · x = vom System abgebrochene Finger', 'Frames per second · draw calls · x = touches cancelled by the system'],
  mapNear: ['Nah', 'Zoom in'], mapFar: ['Übersicht', 'Overview'],
  pause: ['Pause (P/Esc)', 'Pause (P/Esc)'], fullscreen: ['Vollbild', 'Fullscreen'], crane: ['Zurück auf die Strecke (R)', 'Back on the road (R)'], vChase: ['Ansicht: Folgen (C)', 'View: follow (C)'], vRoof: ['Ansicht: Dach (C)', 'View: roof (C)'], start: ['Start', 'Start'],
  left: ['Links', 'Left'], right: ['Rechts', 'Right'], handbrake: ['Handbremse', 'Handbrake'], brake: ['Bremse', 'Brake'], gas: ['Gas', 'Throttle'],
  // Pause
  pauseTitle: ['PAUSE', 'PAUSE'], resume: ['Weiter', 'Resume'], restart: ['Neustart', 'Restart'], toMenu: ['Zurück zur Auswahl', 'Back to menu'], menu: ['Menü', 'Menu'],
  res: ['Auflösung: Faktor wechseln', 'Resolution: change factor'], tilt: ['Neigen zum Lenken', 'Tilt to steer'], sound: ['Ton an/aus', 'Sound on/off'],
  // Endkarte
  goal: ['Ziel', 'Finish'], record: ['Rekord', 'Record'], split: ['Zwischenzeit', 'Split'], dist: ['Strecke', 'Distance'],
  again: ['Nochmal fahren', 'Drive again'], againS: ['Nochmal', 'Again'], backS: ['Zurück', 'Back'],
} satisfies Record<string, P>;
export type Key = keyof typeof TXT;
export const t = (k: Key): string => TXT[k][cur === 'de' ? 0 : 1];

// Welten (Id -> [DE, EN]). „Rhine“ = englisches Wort für den Fluss.
const WORLD: Record<string, P> = {
  snow: ['Schnee', 'Snow'], city: ['City', 'City'], beach: ['Strand', 'Beach'], rhein: ['Rhein', 'Rhine'], offroad: ['Offroad', 'Offroad'], vorstadt: ['Vorstadt', 'Suburb'],
};
// Strecken (Level-id -> [DE, EN]); je 1 Wort, höchstens 2 kurze
const LEVEL: Record<string, P> = {
  waldweg: ['Waldweg', 'Woods'], kuppenstrecke: ['Kuppen', 'Crests'], see: ['Eissee', 'Ice Lake'], kehrenhang: ['Kehren', 'Hairpins'], etappe_schnee: ['Gipfelpass', 'Summit'],
  neonallee: ['Neonallee', 'Neon Ave'], hochhausring: ['Türme', 'Towers'], regenfahrt: ['Regen', 'Rain'], kreiselviertel: ['Kreisel', 'Circles'], etappe_stadt: ['Stadtring', 'Loop'],
  promenade: ['Promenade', 'Boardwalk'], wasserlinie: ['Brandung', 'Surf'], duenenpfad: ['Dünen', 'Dunes'], muschelweg: ['Muschel', 'Shell'], etappe_strand: ['Küste', 'Coast'],
  weinberg: ['Weinberg', 'Vineyard'], uferstrasse: ['Uferstraße', 'Riverside'], loreley: ['Loreley', 'Loreley'], burgweg: ['Burgweg', 'Castle'], etappe_rhein: ['Rheinbogen', 'Rhine Bend'], koelner_ufer: ['Köln', 'Cologne'],
  matschgrube: ['Matschgrube', 'Mud Pit'], huegel: ['Hügel', 'Hills'], furtwald: ['Furtwald', 'Ford Wood'], steilhang: ['Steilhang', 'Steep Slope'], moorwald: ['Moorwald', 'Bog Forest'], etappe_vorstadt: ['Runde', 'Loop'],
};
const CAR: Record<string, P> = { hatch: ['Kompakt', 'Hatch'], buggy: ['Buggy', 'Buggy'], rally: ['Rallye 4x4', 'Rally 4x4'], jeep: ['Jeep', 'Jeep'] };
// Untergründe (Physik liefert den deutschen Namen)
const SURF: Record<string, P> = {
  Asphalt: ['Asphalt', 'Tarmac'], Schotter: ['Schotter', 'Gravel'], Eis: ['Eis', 'Ice'], Schnee: ['Schnee', 'Snow'], Tiefschnee: ['Tiefschnee', 'Deep snow'],
  'Nasser Asphalt': ['Nasser Asphalt', 'Wet tarmac'], 'Nasser Sand': ['Nasser Sand', 'Wet sand'], 'Weicher Sand': ['Weicher Sand', 'Soft sand'], Holz: ['Holz', 'Wood'],
  Gras: ['Gras', 'Grass'], Kopfstein: ['Kopfstein', 'Cobbles'], Furt: ['Furt', 'Ford'], Matsch: ['Matsch', 'Mud'],
};
const pick = (p: P | undefined, fb: string) => p ? p[cur === 'de' ? 0 : 1] : fb;
export const worldName = (id: string, fb = id) => pick(WORLD[id], fb);
export const levelName = (id: string, fb = id) => pick(LEVEL[id], fb);
export const carName = (id: string, fb = id) => pick(CAR[id], fb);
export const surfName = (de: string) => pick(SURF[de], de);

/** Dezimalzeichen je Sprache */
export const dec = (s: string) => cur === 'de' ? s.replace('.', ',') : s;

/** Alle in Pixelschrift gezeichneten Texte beider Sprachen (Test: jedes Zeichen hat eine Glyphe); reine Tooltips (title) ausgenommen */
const TIPS = new Set<string>(['fps', 'crane', 'res', 'resetTip', 'pause', 'vChase', 'vRoof', 'mapNear', 'mapFar', 'time', 'collect', 'clock', 'split', 'best', 'stars', 'allStars', 'dist', 'record', 'goal']);
export const allTexts = (): string[] => [Object.entries(TXT).filter(([k]) => !TIPS.has(k)).map(([, v]) => v), ...[WORLD, LEVEL, CAR, SURF].map((m) => Object.values(m as Record<string, P>))].flat(2);

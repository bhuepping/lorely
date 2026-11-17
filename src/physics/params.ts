// Auto-Parameter. Alles, was ein Auto vom anderen unterscheidet, steht hier.
export type Drive = 'FWD' | 'RWD' | 'AWD';

export interface CarParams {
  name: string;
  style?: 'hatch' | 'buggy' | 'rally' | 'jeep';   // nur Klötzchenmodell
  mass: number;           // kg
  wheelbase: number;      // m
  track: number;          // m (Spurweite)
  cgHeight: number;       // m, Schwerpunkt über Boden (Ruhelage)
  frontWeight: number;    // 0..1 statischer Gewichtsanteil vorn
  drive: Drive;
  /** 'locked' = automatische Sperre (nur Jeep): Räder ohne Bodenkontakt/ohne Grip bekommen kein Moment, der Rest geht an Räder mit Grip; fehlt = feste Verteilung */
  diff?: 'locked';
  /** Visco-Kupplung (Buggy, Heckantrieb): größter Momentanteil nach vorn; fließt nur bei deutlich schnelleren Hinterrädern (keine Sperre) */
  visco?: number;
  /** Bodenfreiheit der Wanne (m, Standard 0,28) */
  clearance?: number;
  /** Stollenreifen: Griffvielfaches auf losem Untergrund (mu < 0,9), Standard 1 */
  offroad?: number;
  size: { w: number; h: number; l: number };  // Karosseriebox für Trägheit/Kollision
  wheelRadius: number;
  wheelInertia: number;   // kg m²
  springRate: number;     // N/m je Rad
  damping: number;        // Ns/m (Einfedern); Ausfedern x reboundRatio
  reboundRatio: number;
  arbRate: number;        // Stabilisator N/m (Differenz links/rechts)
  suspRest: number;       // m Federlänge ausgefedert
  suspTravel: number;     // m bis Anschlag
  loadSensitivity: number;// 0..~0.3, Reibwertverlust bei Überlast
  torqueCurve: [number, number][]; // [rpm, Nm]
  idleRpm: number;
  /** Motorklang: Zündungen je Umdrehung, Grundton-Faktor, Unrundheit (Blubbern), Helligkeit, Turbopfeifen */
  sound?: { fire: number; sub: number; lope: number; bright: number; whistle: number };
  redlineRpm: number;
  engineBrake: number;    // Nm bei Schub
  gears: number[];
  reverseRatio: number;
  finalDrive: number;
  shiftUpRpm: number;
  shiftDownRpm: number;
  brakeTorque: number;    // Nm je Rad (Summe, vorne/hinten nach Bias)
  brakeBias: number;      // Anteil vorn
  handbrakeTorque: number;
  steer: { maxAngle: number; minAngle: number; vRef: number; rate: number };
  dragCdA: number;        // m² (Cd*A)
  grip: number;           // globaler Haftungsfaktor auf alle mu-Tabellen (Untergrund-Verhältnisse bleiben)
  stability: number;      // Gierdämpfung (1/s) gegen Ausbrechen des Hecks; 0 = aus, Handbremse schaltet sie fast ab
}

/** Drehmomentkurve skalieren (Gas deutlich kräftiger) */
const scaleT = (c: [number, number][], k: number): [number, number][] => c.map(([r, t]) => [r, Math.round(t * k)]);

/** Kantiger Achtziger-Kompakter, Frontantrieb, gutmütig. */
export const HATCHBACK_80S: CarParams = {
  name: 'Kompakter 80er', style: 'hatch', sound: { fire: 2, sub: 0.5, lope: 0.18, bright: 1.15, whistle: 0 },
  mass: 920, wheelbase: 2.45, track: 1.44, cgHeight: 0.52, frontWeight: 0.6, drive: 'FWD',
  size: { w: 1.5, h: 1.3, l: 3.9 },
  wheelRadius: 0.29, wheelInertia: 1.2,
  springRate: 30000, damping: 3000, reboundRatio: 1.25, arbRate: 9000,
  suspRest: 0.26, suspTravel: 0.18, loadSensitivity: 0.12,
  torqueCurve: scaleT([[0, 80], [1000, 95], [2000, 130], [3500, 160], [5000, 165], [6500, 145], [7200, 100]], 1.7),
  idleRpm: 900, redlineRpm: 6800, engineBrake: 28,
  gears: [3.45, 2.0, 1.4, 1.05, 0.82], reverseRatio: 3.2, finalDrive: 4.3,
  shiftUpRpm: 6200, shiftDownRpm: 2400,
  brakeTorque: 2800, brakeBias: 0.65, handbrakeTorque: 4000,
  steer: { maxAngle: 0.6, minAngle: 0.045, vRef: 10, rate: 8 },
  dragCdA: 0.85,
  grip: 1.4, stability: 5,
};

/** Buggy: offen, leicht, Heckantrieb, große Räder, lange Federwege. */
export const BUGGY: CarParams = {
  ...HATCHBACK_80S,
  name: 'Buggy', style: 'buggy', sound: { fire: 2, sub: 0.5, lope: 0.45, bright: 0.85, whistle: 0 },
  mass: 620, wheelbase: 2.3, track: 1.5, cgHeight: 0.55, frontWeight: 0.45, drive: 'RWD', visco: 0.35,
  size: { w: 1.6, h: 1.1, l: 3.2 },
  wheelRadius: 0.36, wheelInertia: 1.8,
  springRate: 22000, damping: 2400, arbRate: 6000,
  suspRest: 0.34, suspTravel: 0.28,
  torqueCurve: scaleT([[0, 70], [1000, 85], [2000, 115], [3500, 145], [5000, 150], [6500, 130], [7200, 90]], 1.75),
  brakeTorque: 2300, handbrakeTorque: 3200,
  grip: 1.3, stability: 3,   // lebhafter: Heck darf mehr kommen
  dragCdA: 0.95,
};

/** Rallye 4x4: Allradler (Momentverteilung 50/50), schwer, Turbo-Charakter: unten zäh, ab ~3500 U/min kräftig. */
export const RALLY: CarParams = {
  ...HATCHBACK_80S,
  name: 'Rallye 4x4', style: 'rally', sound: { fire: 2.5, sub: 0.5, lope: 0.3, bright: 0.9, whistle: 1 },
  mass: 1100, wheelbase: 2.5, track: 1.62, cgHeight: 0.46, frontWeight: 0.57, drive: 'AWD',
  size: { w: 1.7, h: 1.35, l: 4.3 },
  wheelRadius: 0.31, wheelInertia: 1.5,
  springRate: 34000, damping: 3400, arbRate: 10000,
  suspRest: 0.24, suspTravel: 0.18,
  torqueCurve: scaleT([[0, 70], [1000, 80], [2000, 105], [3000, 140], [3500, 200], [4500, 275], [5500, 280], [6500, 235], [7200, 150]], 1.6),
  gears: [3.3, 2.0, 1.45, 1.1, 0.9], finalDrive: 4.1,
  brakeTorque: 3400, handbrakeTorque: 4200,
  grip: 1.4, stability: 5.5,
  dragCdA: 0.8,
};

/** Jeep: offen, Überrollbügel, Stollenreifen, viel Bodenfreiheit, Allrad mit automatischer Sperre. Asphalt: etwas langsamer und kippeliger; Gelände: der beste. */
export const JEEP: CarParams = {
  ...HATCHBACK_80S,
  name: 'Jeep', style: 'jeep', sound: { fire: 2, sub: 0.55, lope: 0.35, bright: 0.8, whistle: 0 },
  mass: 1350, wheelbase: 2.4, track: 1.56, cgHeight: 0.82, frontWeight: 0.52, drive: 'AWD', diff: 'locked', clearance: 0.5, offroad: 1.5,
  size: { w: 1.75, h: 1.7, l: 3.9 },
  wheelRadius: 0.4, wheelInertia: 2.4,
  springRate: 40000, damping: 3800, arbRate: 6000,
  suspRest: 0.42, suspTravel: 0.34,
  torqueCurve: scaleT([[0, 120], [1000, 190], [2000, 250], [3000, 270], [4000, 255], [5000, 220], [6000, 170], [6800, 110]], 1.7),
  redlineRpm: 6400, shiftUpRpm: 5600,
  gears: [3.9, 2.3, 1.55, 1.1, 0.85], reverseRatio: 4.4, finalDrive: 4.4,
  brakeTorque: 3600, handbrakeTorque: 4200,
  grip: 1.12, stability: 4,
  dragCdA: 1.7,
};

export const CARS: Record<string, CarParams> = { hatch: HATCHBACK_80S, buggy: BUGGY, rally: RALLY, jeep: JEEP };

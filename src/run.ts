// Spielziel: Zeitfahren (Uhr zählt hoch, keine Sterne, Checkpoints) und Sammeln (keine Uhr, Sterne). Reine Logik, headless testbar.
import { Tracker, type Course } from './level';

export type Mode = 'time' | 'stars';
export type RunState = 'ready' | 'run' | 'won';
export const KRAN_BACK = 30;     // m: Kran setzt so weit vor den weitesten erreichten Punkt
export const RESET_PENALTY = 3;   // s Strafzeit fürs Zurücksetzen (Kran), nur im Zeitfahren
export const goalWidth = (c: { roadWidth: number }) => 2 * c.roadWidth;
export const FREE_GOAL_R = 7;   // Offroad (freie Wegwahl): so nah am Ziel gilt es als erreicht   // Ziel zählt auch knapp neben der Straße
const PICK_R = 2.8;       // Einsammelradius der Sterne (m, waagerecht)

// ── Checkpoints (nur Zeitfahren, unsichtbar) ──
export const CP_SPACING = 125;      // m, ungefährer Abstand entlang der Route
export const CP_RADIUS = 2;         // × Straßenbreite: so nah (Luftlinie) muss man dem Punkt kommen
export const CP_MIN = 55;              // m: so dicht dürfen zwei Punkte nach dem Verschieben höchstens liegen
const CP_TUNNEL_PAD = 14;           // m Abstand vor/hinter dem Tunnel
const CP_LATE = 25;                 // m: so weit hinter dem Punkt (weitester Streckenfortschritt) gilt er als verpasst
const CP_AHEAD = 100;               // m: ein Punkt zählt nur, wenn der Fortschritt höchstens so weit davor liegt (Straßenkreuzungen)
export interface Checkpoint { s: number; x: number; z: number }
export class Checkpoints {
  readonly list: Checkpoint[] = [];
  readonly got: Uint8Array;
  private r2: number;
  constructor(course: Pick<Course, 'route' | 'roadWidth' | 'goal' | 'length'> & { hints?: { cp: number[] }; tunnels?: { s0: number; s1: number }[]; bridge?: { s0: number; s1: number } | null; bridgeSpans?: [number, number][] }) {
    const end = course.goal ? course.goal.s : course.length, n = Math.max(1, Math.round(end / CP_SPACING)), step = end / n;
    // gesperrt: Tunnel (+Vorlauf) und Brücke (Geländer, kein Abkürzen) – Punkte dort rutschen zum näheren Rand, bleiben ≥ CP_MIN auseinander
    const blocked: [number, number][] = [...(course.tunnels ?? []).map((t): [number, number] => [t.s0 - CP_TUNNEL_PAD, t.s1 + CP_TUNNEL_PAD])];
    if (course.bridgeSpans) for (const [a, z] of course.bridgeSpans) blocked.push([a - 6, z + 6]);
    else if (course.bridge) blocked.push([course.bridge.s0 - 6, course.bridge.s1 + 6]);
    const placed: number[] = [];
    for (let i = 1; i < n; i++) {
      const s = i * step, b = blocked.find(([a, z]) => s > a && s < z);
      const cand = b ? [b[0], b[1]].sort((p, q) => Math.abs(p - s) - Math.abs(q - s)) : [s];
      const ok = cand.find((c) => c > 20 && c < end - 30 && !blocked.some(([a, z]) => c > a + 1e-6 && c < z - 1e-6) && placed.every((q) => Math.abs(q - c) >= CP_MIN));
      if (ok !== undefined) placed.push(ok);
    }
    for (const pin of (course.hints?.cp ?? []).filter((q) => q > 20 && q < end - 30)) {      // feste Punkte (Abzweig): verdrängen die gleichmäßigen in der Nähe
      for (let i = placed.length - 1; i >= 0; i--) if (Math.abs(placed[i] - pin) < CP_MIN) placed.splice(i, 1);
      placed.push(pin);
    }
    placed.sort((p, q) => p - q);
    for (const sp of placed) { const a = course.route.at(sp); this.list.push({ s: sp, x: a.x, z: a.z }); }
    this.got = new Uint8Array(this.list.length);
    this.r2 = (CP_RADIUS * course.roadWidth) ** 2;
  }
  /** strikt der Reihe nach: nur der erste noch offene Punkt kann zählen (ein späterer nicht, solange ein früherer offen ist) */
  update(x: number, z: number, maxS: number): void {
    let i = 0;
    while (i < this.list.length && this.got[i]) i++;
    if (i >= this.list.length) return;
    const c = this.list[i];
    if (c.s > maxS + CP_AHEAD) return;
    if ((c.x - x) ** 2 + (c.z - z) ** 2 < this.r2) this.got[i] = 1;
  }
  get all(): boolean { for (let i = 0; i < this.got.length; i++) if (!this.got[i]) return false; return true; }
  /** erster verpasster Punkt (der Fortschritt liegt schon > CP_LATE dahinter) oder -1 */
  missed(maxS: number): number { for (let i = 0; i < this.list.length; i++) if (!this.got[i] && this.list[i].s < maxS - CP_LATE) return i; return -1; }
}

// ── Richtungspfeil (Zeitfahren): Stellschrauben ──
export const ARROW_DELAY = 2;       // s falsch herum / abseits, bevor der Pfeil erscheint
export const ARROW_OFF_ZONE = 0.45;  // dasselbe in einer Pfeilzone (Abzweig)
export const ARROW_OFF = 1.5;       // × Straßenbreite neben der Streckenmitte gilt als abseits
const ARROW_AHEAD = 30;             // m voraus auf der Strecke, wohin der Pfeil zeigt
const ARROW_DECAY = 4;              // Abbau des Zählers je Sekunde auf Kurs (Pfeil geht nach ~ARROW_DELAY/4 s weg)

export class Run {
  state: RunState = 'ready';
  /** Fahrzeit (s): zählt ab dem ersten Gas hoch, im Zeitfahren inkl. Kran-Zuschlag */
  elapsed = 0;
  stars = 0;
  readonly got: Uint8Array;
  readonly tracker: Tracker;
  /** nur im Zeitfahren */
  readonly cps: Checkpoints | null;
  /** Index des ersten verpassten Checkpoints oder -1; `missCount` zählt jedes neu verpasste Ereignis (für den Hinweis) */
  missed = -1; missCount = 0;
  /** Richtungspfeil: an/aus + Zielpunkt (Weltkoordinaten) */
  arrowOn = false; aim = { x: 0, z: 0 }; private badT = 0;
  constructor(readonly course: Course, readonly mode: Mode) {
    this.got = new Uint8Array(course.stars.length);
    this.tracker = new Tracker(course.route);
    this.cps = mode === 'time' && !course.free ? new Checkpoints(course) : null;   // freie Wegwahl: keine Checkpoints
  }
  /** gefahrene Strecke (m): weitester Punkt auf der Straße */
  get distance(): number { return Math.min(this.course.length, this.tracker.maxS); }
  /** Offroad: bestes Stück der Luftlinie Start -> Ziel, das je erreicht wurde (0..1); sonst Streckenfortschritt */
  private bestFree = 0;
  get fraction(): number { return this.course.free ? this.bestFree : this.distance / this.course.length; }
  get over(): boolean { return this.state === 'won'; }

  /** Kran-Reset: Strafzeit im Zeitfahren (nur während die Uhr läuft); liefert die Strafe in s (0 = keine). */
  penalize(): number {
    if (this.mode !== 'time' || this.state !== 'run') return 0;
    this.elapsed += RESET_PENALTY;
    return RESET_PENALTY;
  }

  /** Einen Schritt voranschreiten. `moving` = Gas gegeben oder Auto rollt (startet die Uhr). (vx, vz) = tatsächliche Bewegungsrichtung (für den Pfeil). Gibt neu eingesammelte Sterne zurück. */
  update(dt: number, x: number, z: number, moving: boolean, vx = 0, vz = 0): number[] {
    const picked: number[] = [];
    if (this.over) return picked;
    if (this.state === 'ready' && moving) this.state = 'run';
    this.tracker.update(x, z);
    if (this.state !== 'run') return picked;
    this.elapsed += dt;
    const S = this.mode === 'stars' ? this.course.stars : [];   // Zeitfahren: keine Sterne
    for (let i = 0; i < S.length; i++) {
      if (this.got[i] || Math.hypot(S[i][0] - x, S[i][1] - z) > PICK_R) continue;
      this.got[i] = 1; this.stars++; picked.push(i);
    }
    if (this.cps) {
      this.cps.update(x, z, this.tracker.maxS);
      const m = this.cps.missed(this.tracker.maxS);
      if (m >= 0 && m !== this.missed) this.missCount++;
      this.missed = m;
      this.guide(dt, vx, vz);
    }
    const g = this.course.goal;
    if (this.course.free && g) {   // Offroad: Pfeil zeigt immer zum Ziel; gewonnen = nah genug am Ziel
      const dg = Math.hypot(g.x - x, g.z - z), st = this.course.start, d0 = Math.hypot(g.x - st.x, g.z - st.z) || 1;
      this.bestFree = Math.max(this.bestFree, Math.min(1, 1 - dg / d0));
      this.aim.x = g.x; this.aim.z = g.z; this.arrowOn = true;
      if (dg < FREE_GOAL_R) this.state = 'won';
      return picked;
    }
    if (g && this.tracker.s >= g.s && this.tracker.d < goalWidth(this.course) && (!this.cps || this.cps.all)) this.state = 'won';
    return picked;
  }

  /** Kran-Rückstellpunkt (s): `KRAN_BACK` m vor dem weitesten erreichten Punkt (nicht dem nächsten – am Berg wäre das die untere Kehre). Liegt ein noch offener Checkpoint auf/hinter diesem Punkt, davor – so bleibt er durchfahrbar (Reihenfolge). Nichts wird geschenkt (got bleibt). */
  resetS(): number {
    let s = Math.max(6, this.tracker.maxS - KRAN_BACK);
    const q = this.cps?.list.find((c, i) => !this.cps!.got[i]);
    if (q && q.s <= s + 1e-6) s = Math.max(6, q.s - 15);
    return s;
  }

  private guide(dt: number, vx: number, vz: number): void {
    const tr = this.tracker, c = this.course, sp = Math.hypot(vx, vz), a = c.route.at(tr.s);
    const wrong = sp > 3 && (vx * a.dx + vz * a.dz) / sp < -0.3;
    const zone = c.hints.arrow.find(([a, b]) => tr.s >= a && tr.s <= b), delay = zone ? zone[2] : ARROW_DELAY;      // an Abzweigen früher und schon bei 0,45 Straßenbreiten Abstand
    const off = Math.abs(tr.d) > (zone ? ARROW_OFF_ZONE : ARROW_OFF) * c.roadWidth;
    this.badT = wrong || off ? Math.min(this.badT + dt, ARROW_DELAY + 1) : Math.max(0, this.badT - dt * ARROW_DECAY);
    if (this.badT >= delay) this.arrowOn = true; else if (this.badT <= 0) this.arrowOn = false;
    if (this.missed >= 0) this.arrowOn = true;
    if (this.arrowOn) {
      if (this.missed >= 0) { const q = this.cps!.list[this.missed]; this.aim.x = q.x; this.aim.z = q.z; }
      else { const q = c.route.at(Math.min(c.length, tr.s + ARROW_AHEAD)); this.aim.x = q.x; this.aim.z = q.z; }
    }
  }
}

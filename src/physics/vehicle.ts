// Fahrmodell: Starrkörper + 4 Raycast-Räder + vereinfachte Pacejka. Keine Abhängigkeiten.
// Koordinaten: x rechts, y oben, -z vorwärts (wie three). Alles in SI-Einheiten.
import type { CarParams } from './params';
import { TC_DEFAULT, type Terrain, type Surface } from "./terrain";

export interface Input { steer: number; throttle: number; brake: number; handbrake: boolean; }
const TC_KP = 1, TC_KI = 3, TC_MIN = 0.5;   // Traktionskontrolle (schwach, immer an): P (je Schlupfüberschuss), I (1/s), Untergrenze Momentfaktor (nimmt höchstens die Hälfte weg)
const HB_FADE = 0.3;
const STAB_HB = (hb: number, tail: number) => 1 - 0.9 * Math.max(hb, tail * STAB_TAIL);
const STAB_TAIL = 1, HB_YAWD = 12;
// Kontrollierter Drift: Gegenlenken + Gas bei mittlerem Schwimmwinkel -> Stabilitätshilfe und Traktionskontrolle lassen den Drift zu; bei zu großem Winkel greifen sie wieder ein
const DR_ON = 0.12, DR_FULL = 0.2, DR_OFF0 = 0.55, DR_OFF1 = 0.75, DR_STAB = 0.85, DR_HOLD = 0.6, DR_TC = 0.3;
const HB_TAIL = 0.8, RELAX_L = 4, RELAX_VMIN = 4;   // Relaxationslänge (m) / Mindesttempo (m/s)
export const NO_INPUT: Input = { steer: 0, throttle: 0, brake: 0, handbrake: false };

export const DT = 1 / 120;
const RPM2W = 2 * Math.PI / 60;
const CL_SLIP = 12;   // Kupplung: Schlupfdrehzahl (rad/s) bei der das volle Moment übertragen wird
const CL_IE = 0.08;   // Motor-Trägheit kg m²
const G = 9.81;
const ROLL_K = 0.6; // Anteil der Strecke Kontaktpunkt -> Schwerpunkt, an dem Reifenkräfte angreifen (Kippschutz)
const WATER_SINK = 0.75;   // Anteil der Karosseriehöhe unter Wasser, ab dem das Auto absäuft
const V_MIN = 2.5; // m/s, Untergrenze für die Schlupfnormierung (kein 0/0 im Stand)

export interface Pose {
  px: number; py: number; pz: number;
  qx: number; qy: number; qz: number; qw: number;
  susp: number[];   // Federlänge je Rad (m)
  spin: number[];   // Raddrehwinkel (rad)
  steer: number;    // Lenkwinkel vorn (rad)
}
const newPose = (): Pose => ({ px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1,
  susp: [0, 0, 0, 0], spin: [0, 0, 0, 0], steer: 0 });

function torqueAt(curve: [number, number][], rpm: number): number {
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) {
      const [r0, t0] = curve[i - 1], [r1, t1] = curve[i];
      return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Reifenmodell: Schlupf -> (fx, fy) im Reibungskreis. Gibt Kräfte über out zurück. */
export function tireForce(out: number[], omega: number, vlong: number, vlat: number,
                          fz: number, r: number, s: Surface, loadSens: number, fzNom: number, grip = 1): void {
  const vs = Math.max(Math.abs(vlong), V_MIN);
  const kappa = (omega * r - vlong) / vs;
  const lam = -vlat / vs;
  const sigma = Math.hypot(kappa, lam);
  if (sigma < 1e-9) { out[0] = 0; out[1] = 0; return; }
  const mu = s.mu * grip * Math.max(0.5, 1 - loadSens * (fz / fzNom - 1));
  let f = mu * fz * Math.sin(s.C * Math.atan(s.B * sigma));
  if (s.bd) { const x = sigma * s.B / Math.tan(Math.PI / (2 * s.C)) - 1; if (x > 0) f *= 1 + s.bd * (1 - Math.exp(-x / 1.5)); }   // Schiebekeil (loser Untergrund)
  out[0] = f * kappa / sigma;
  out[1] = f * lam / sigma;
}

/** Stollenreifen (CarParams.offroad): Griffvielfaches nur auf losem Untergrund (nicht Eis) */
const gripOn = (P: CarParams, s: Surface): number => P.grip * (P.offroad && s.mu < 0.9 && s.mu > 0.25 ? P.offroad : 1);

const BODY_SLOP = 0.12, BODY_E = 0.1, BODY_PUSH = 0.3;   // Karosserie: erlaubte Eindringtiefe (m) vor dem Stoß, Rückprall, größte Korrektur je Schritt (m)
const BUMP_REB = 3;   // Anschlag: Rückstellkraft / (1 + BUMP_REB·Ausfedertempo m/s)
const AIR_DELAY = 0.1, AIR_K = 14, AIR_C = 5.5, AIR_KY = 16, AIR_CY = 7;   // Flughilfe: Verzögerung (s), Feder (1/s²), Dämpfung (1/s); _Y = Gieren

const clutchCache = new WeakMap<CarParams, { lo: number; hi: number; c: number; tmax: number }>();
/** Kupplung je Auto (Fliehkraft): fasst ab Leerlauf+200, ihr Moment wächst mit Drehzahl² und hält bei der Anfahrdrehzahl (wo das Motormoment 70 % der Spitze erreicht) die Hälfte davon (die Traktionskontrolle nimmt höchstens die Hälfte weg); hält höchstens 1,1 x Spitzenmoment */
function clutchOf(P: CarParams) {
  let c = clutchCache.get(P);
  if (!c) {
    const peak = Math.max(...P.torqueCurve.map((p) => p[1])), lo = P.idleRpm + 200;
    let hi = 3000; for (let r = lo; r < P.redlineRpm; r += 50) if (torqueAt(P.torqueCurve, r) >= 0.7 * peak) { hi = r; break; }
    hi = Math.max(hi, lo + 600); c = { lo, hi, c: 0.35 * peak / (hi * hi - lo * lo), tmax: 1.1 * peak }; clutchCache.set(P, c);
  }
  return c;
}

export class Vehicle {
  readonly p: CarParams;
  // Zustand
  pos = [0, 0, 0]; q = [0, 0, 0, 1]; vel = [0, 0, 0]; angVel = [0, 0, 0];
  omega = [0, 0, 0, 0];     // Raddrehzahlen rad/s
  spin = [0, 0, 0, 0];
  compression = [0, 0, 0, 0];
  contact = [false, false, false, false];
  steerAngle = 0;
  gear = 0; reverse = false; shiftTimer = 0; rpm = 0;
  /** Motordrehzahl (rad/s) – eigene Drehmasse, über die schleifende Kupplung an das Getriebe gekoppelt */
  engW = 0;
  surfaceName = '';
  /** Lichter (Optik): Bremslicht an, Rückfahrlicht an – je Schritt gesetzt */
  brakeOn = false; reverseOn = false;
  /** Wasserspiegel (Meer), -1e9 = kein Wasser; `submerged` = Anteil der Karosseriehöhe unter Wasser 0..1; `drowned` = abgesoffen (bis reset) */
  water = -1e9; submerged = 0; drowned = false;
  /** Furt: Zähigkeit des flachen Wassers (1/s, 0 = trocken), wird vom Spiel je Frame gesetzt */
  shallow = 0;
  /** Flug: Zeit ohne Bodenkontakt (s); `landing` = Aufprallgeschwindigkeit senkrecht (m/s) der letzten Landung nach >0,2 s Flug (0 = nichts offen) */
  airTime = 0; landing = 0; private vyAir = 0; private sinceLand = 9;
  /** Fahrhilfe in der Luft/nach der Landung (Ausrichten, Wanken dämpfen): 1 = voll, 0 = aus (Gelände), vom Spiel je Frame nach Ort gesetzt */
  aid = 1;
  /** Zeit (s), die das Auto auf Dach/Seite liegt und kaum fährt – danach blinkt der Kran */
  flipT = 0;
  sleeping = false; allowSleep = true; private calmTime = 0;
  /** nur Optik (Funken): Andruck des Unterbodens am Boden (N, größter Punkt) und Gleittempo dort (m/s) im letzten Schritt */
  scrape = 0; scrapeV = 0;

  pose = newPose(); prevPose = newPose();

  private inertia: [number, number, number];
  readonly mount: number[][] = [];   // lokal je Rad (Montagepunkt rel. Schwerpunkt)
  private fzNom: number;
  private sag: number;
  private n = [0, 1, 0];
  private tf = [0, 0];

  constructor(p: CarParams, private terrain: Terrain) {
    this.p = p;
    const { w, h, l } = p.size, m = p.mass;
    this.inertia = [m / 12 * (h * h + l * l), m / 12 * (w * w + h * h), m / 12 * (w * w + l * l)];
    const a = p.wheelbase * (1 - p.frontWeight), b = p.wheelbase * p.frontWeight; // COM->vorn / ->hinten
    const staticLoad = m * G / 4;
    this.fzNom = staticLoad;
    this.sag = staticLoad / p.springRate;
    const my = (p.suspRest - this.sag + p.wheelRadius) - p.cgHeight; // Montagepunkt rel. COM
    const hx = p.track / 2;
    this.mount.push([-hx, my, -a], [hx, my, -a], [-hx, my, b], [hx, my, b]);
    this.reset(0, 0, 0);
  }

  /** Auto aufrecht auf den Boden stellen (Heading = yaw, rad; 0 = Blick nach -z). */
  reset(x: number, z: number, yaw: number): void {
    // Aufsetzen wie ein Kran: die Karosserie liegt parallel zum Boden unter den vier Rädern (Ebene durch die Höhen an Bug/Heck/links/rechts), nicht waagerecht in der Welt –
    // sonst steckt auf einem Hang die Talseite im Boden und das Auto wird beim ersten Schritt herausgeschleudert (Überschlag nach dem Kran)
    const T = this.terrain, h0 = T.height(x, z), a = this.p.wheelbase / 2, b = this.p.track / 2;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const gf = (T.height(x + fx * a, z + fz * a) - T.height(x - fx * a, z - fz * a)) / (2 * a), gr = (T.height(x + rx * b, z + rz * b) - T.height(x - rx * b, z - rz * b)) / (2 * b);
    let ux = -(gf * fx + gr * rx), uy = 1, uz = -(gf * fz + gr * rz); const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    let excess = 0;   // Mulden/Kanten unter den Rädern: höher setzen, damit kein Rad im Boden beginnt
    for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const px = x + fx * a * sa + rx * b * sb, pz = z + fz * a * sa + rz * b * sb; excess = Math.max(excess, T.height(px, pz) - (h0 + gf * a * sa + gr * b * sb)); }
    const y = h0 + excess + (this.p.cgHeight + 0.05) / uy;
    this.pos = [x, y, z];
    {   // Drehung mit Spalten r = u × bz, u, bz = -f' (f' = Blickrichtung in der Bodenebene)
      let bx = -fx, by = 0, bzz = -fz; const d = bx * ux + by * uy + bzz * uz; bx -= d * ux; by -= d * uy; bzz -= d * uz; const bl = Math.hypot(bx, by, bzz); bx /= bl; by /= bl; bzz /= bl;
      const cx = uy * bzz - uz * by, cy = uz * bx - ux * bzz, cz = ux * by - uy * bx;   // r
      const m = [cx, ux, bx, cy, uy, by, cz, uz, bzz];   // Zeile-major: m[row*3+col], Spalten r,u,bz
      const tr = m[0] + m[4] + m[8]; let qx: number, qy: number, qz: number, qw: number;
      if (tr > 0) { const k = Math.sqrt(tr + 1) * 2; qw = k / 4; qx = (m[7] - m[5]) / k; qy = (m[2] - m[6]) / k; qz = (m[3] - m[1]) / k; }
      else if (m[0] > m[4] && m[0] > m[8]) { const k = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; qw = (m[7] - m[5]) / k; qx = k / 4; qy = (m[1] + m[3]) / k; qz = (m[2] + m[6]) / k; }
      else if (m[4] > m[8]) { const k = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; qw = (m[2] - m[6]) / k; qx = (m[1] + m[3]) / k; qy = k / 4; qz = (m[5] + m[7]) / k; }
      else { const k = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; qw = (m[3] - m[1]) / k; qx = (m[2] + m[6]) / k; qy = (m[5] + m[7]) / k; qz = k / 4; }
      this.q = [qx, qy, qz, qw];
    }
    this.vel = [0, 0, 0]; this.angVel = [0, 0, 0];
    this.omega = [0, 0, 0, 0]; this.steerAngle = 0; this.gear = 0; this.reverse = false; this.engW = this.p.idleRpm * RPM2W; this.rpm = this.p.idleRpm;
    this.hb = 0; this.hbTail = 0; this.dr = 0; this.tcF = 1; this.tcI = 0; this.tcErr = -9; this.fyF = [0, 0, 0, 0]; this.sleeping = false; this.calmTime = 0; this.flipT = 0; this.drowned = false; this.submerged = 0; this.airTime = 0; this.landing = 0; this.shallow = 0;
    this.writePose(this.pose); this.writePose(this.prevPose);
  }

  /** Mit Geschwindigkeit v (m/s) vorwärts losfahren, Räder passend drehend. */
  launch(v: number): void {
    const f = this.axes().f;
    this.vel = [f[0] * v, f[1] * v, f[2] * v];
    this.omega = [1, 1, 1, 1].map(() => v / this.p.wheelRadius);
    // passender Gang und Motordrehzahl (Kupplung geschlossen), sonst müsste der Motor erst aufholen
    const P = this.p, rpmAt = (g: number) => v / P.wheelRadius * P.gears[g] * P.finalDrive / RPM2W;
    this.gear = 0; while (this.gear < P.gears.length - 1 && rpmAt(this.gear) > P.shiftUpRpm) this.gear++;
    this.engW = Math.max(P.idleRpm, Math.min(P.redlineRpm, rpmAt(this.gear))) * RPM2W; this.rpm = this.engW / RPM2W;
    this.sleeping = false;
  }

  get speed(): number { return Math.hypot(this.vel[0], this.vel[1], this.vel[2]); }
  /** Geschwindigkeit entlang der Fahrtrichtung des Autos (m/s) */
  get forwardSpeed(): number { const f = this.axes().f; return this.vel[0] * f[0] + this.vel[1] * f[1] + this.vel[2] * f[2]; }
  /** Driftwinkel zwischen Fahrzeuglängsachse und Bewegungsrichtung (rad, vorzeichenbehaftet) */
  get slipAngle(): number {
    const { f, r } = this.axes();
    const vl = this.vel[0] * f[0] + this.vel[1] * f[1] + this.vel[2] * f[2];
    const vr = this.vel[0] * r[0] + this.vel[1] * r[1] + this.vel[2] * r[2];
    return Math.atan2(vr, Math.abs(vl) + 1e-6) * (vl >= 0 ? 1 : -1);
  }
  forwardAxis(): number[] { return this.axes().f; }
  fyF = [0, 0, 0, 0];   // gefilterte Seitenkraft je Rad
  tcF = 1; tcI = 0; tcErr = -9;   // Traktionskontrolle: Momentfaktor, Integral, Regelabweichung
  dr = 0;   // Driftanteil 0..1 (kontrolliertes Gegenlenken mit Gas)
  hb = 0; hbTail = 0;   // Handbremsen-Anteil 0..1 (blendet nach dem Loslassen aus)
  get yawRate(): number { return this.angVel[1]; }

  axes() {
    const [x, y, z, w] = this.q;
    const r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)];     // Spalte 0: rechts
    const u = [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)];     // Spalte 1: oben
    const bz = [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];    // Spalte 2: hinten
    return { r, u, f: [-bz[0], -bz[1], -bz[2]], bz };
  }

  private writePose(o: Pose): void {
    o.px = this.pos[0]; o.py = this.pos[1]; o.pz = this.pos[2];
    o.qx = this.q[0]; o.qy = this.q[1]; o.qz = this.q[2]; o.qw = this.q[3];
    for (let i = 0; i < 4; i++) {
      o.susp[i] = this.p.suspRest - this.compression[i];
      o.spin[i] = this.spin[i];
    }
    o.steer = this.steerAngle;
  }

  step(inp: Input, dt: number = DT): void {
    const P = this.p;
    // Pose für die Interpolation sichern
    const t = this.prevPose; this.prevPose = this.pose; this.pose = t;

    // Schlaf: wacht bei Eingabe auf
    const active = inp.throttle > 0.02 || inp.brake > 0.02 || Math.abs(inp.steer) > 0.02;
    if (this.sleeping) {
      if (!active) { this.brakeOn = this.reverseOn = false; this.writePose(this.pose); return; }
      this.sleeping = false; this.calmTime = 0;
    }

    // ── Wasser: tiefer = zäher; ab 75 % der Karosseriehöhe unter Wasser abgesoffen (Eingabe wirkungslos, bis reset) ──
    if (this.water > -1e8) {
      this.submerged = Math.max(0, Math.min(1, (this.water - (this.pos[1] - P.cgHeight)) / P.size.h));
      if (this.submerged >= WATER_SINK) this.drowned = true;
    }
    if (this.drowned) inp = NO_INPUT;
    const { r: AR, u: AU, f: AF } = this.axes();
    const v = this.vel, w = this.angVel, pos = this.pos;
    const fwd = v[0] * AF[0] + v[1] * AF[1] + v[2] * AF[2];
    const speed = Math.hypot(v[0], v[1], v[2]);

    // ── Drift erkennen: Gegenlenken + Gas bei Schwimmwinkel, nicht zu groß ──
    {
      const vr = v[0] * AR[0] + v[1] * AR[1] + v[2] * AR[2], beta = fwd > 3 ? Math.atan2(vr, fwd) : 0, ab = Math.abs(beta);
      const held = inp.steer * beta > 0 ? Math.abs(inp.steer) > 0.1 : Math.abs(this.steerAngle) < DR_HOLD * ab && Math.abs(inp.steer) > 0.1;   // Gegenlenken, oder weniger Lenkeinschlag, als der Schwimmwinkel verlangt (Drift gehalten)
      const counter = held && inp.throttle > 0.2 && AU[1] > 0.7;
      const want = counter ? Math.max(0, Math.min(1, (ab - DR_ON) / (DR_FULL - DR_ON))) * (1 - Math.max(0, Math.min(1, (ab - DR_OFF0) / (DR_OFF1 - DR_OFF0)))) : 0;
      this.dr += (want - this.dr) * (1 - Math.exp(-(want > this.dr ? 10 : 4) * dt));
    }

    // ── Lenkung: geschwindigkeitsabhängiger Maximalwinkel, geglättet ──
    const st = P.steer;
    const maxAng = Math.max(st.minAngle, st.maxAngle / (1 + (speed / st.vRef) ** 2));
    const target = Math.max(-1, Math.min(1, inp.steer)) * maxAng;
    this.steerAngle += (target - this.steerAngle) * (1 - Math.exp(-st.rate * dt));

    // ── Rückwärts-Logik ──
    let thr = inp.throttle, brk = inp.brake;
    if (!this.reverse && brk > 0.1 && thr < 0.1 && fwd < 1.0) this.reverse = true;
    else if (this.reverse && thr > 0.1 && fwd > -1.0) this.reverse = false;
    if (this.reverse) { const bt = thr; thr = brk; brk = fwd < -1.0 ? bt : 0; if (fwd >= -1.0) brk = 0; }

    this.brakeOn = brk > 0.1 || inp.handbrake;
    this.reverseOn = this.reverse && (fwd < -0.3 || thr > 0.1);

    // ── Antrieb: Gang/Drehzahl ──
    const driven = P.drive === 'FWD' ? [0, 1] : P.drive === 'RWD' ? [2, 3] : [0, 1, 2, 3];
    // Sperre (Jeep): Moment nur an Räder mit Bodenkontakt, weniger an durchdrehende; Drehzahl nur aus Rädern am Boden (kein Hochdrehen über ein Luftrad)
    const lw = [0, 0, 0, 0];
    if (P.diff === 'locked') {
      const sp = Math.max(Math.abs(fwd), V_MIN);
      for (const i of driven) if (this.contact[i]) lw[i] = (0.25 + Math.min(1.5, this.compression[i] / P.suspTravel)) / (1 + 3 * Math.max(0, Math.abs(this.omega[i] * P.wheelRadius - fwd) / sp - 0.35));
      if (!driven.some((i) => lw[i] > 0)) for (const i of driven) lw[i] = 1;
    } else for (const i of driven) lw[i] = 1;
    let wAvg = 0, lwSum = 0;
    for (const i of driven) { wAvg += this.omega[i] * lw[i]; lwSum += lw[i]; }
    wAvg /= lwSum;
    const ratioFwd = P.gears[this.gear] * P.finalDrive;
    const ratio = this.reverse ? -P.reverseRatio * P.finalDrive : ratioFwd;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    // geschaltet wird nach Bodengeschwindigkeit, nicht nach durchdrehenden Rädern
    const shiftRpm = Math.max(P.idleRpm, Math.abs(fwd) / P.wheelRadius * Math.abs(ratioFwd) * 60 / (2 * Math.PI));
    if (!this.reverse && this.shiftTimer === 0) {
      if (shiftRpm > P.shiftUpRpm && this.gear < P.gears.length - 1) { this.gear++; this.shiftTimer = 0.18; }
      else if (shiftRpm < P.shiftDownRpm && this.gear > 0) { this.gear--; this.shiftTimer = 0.1; }
    }
    // Motor = eigene Drehmasse; die Reibkupplung (Anfahrautomatik, fliehkraftgeschlossen) überträgt höchstens ihr Moment und schleift, solange Motor- und Getriebedrehzahl auseinanderliegen
    const cl = clutchOf(P), rpm0 = this.engW / RPM2W;
    const wg = wAvg * ratio;   // Getriebeeingang (rad/s), positiv = Antriebsrichtung
    // Kupplungsmoment-Kapazität: Fliehkraft (~ Drehzahl², gleicht bei halbem Motormoment der Anfahrdrehzahl) und Anfahrautomatik (schließt ganz, sobald die Räder schneller drehen als die Anfahrdrehzahl); beim Schalten offen
    const gk = Math.max(0, Math.min(1, (Math.abs(wg) / RPM2W - cl.hi * 0.9) / (cl.hi * 0.5)));
    const cap = this.shiftTimer > 0 ? 0 : Math.min(cl.tmax, Math.max(rpm0 > cl.lo ? cl.c * (rpm0 * rpm0 - cl.lo * cl.lo) : 0, cl.tmax * gk * gk * (3 - 2 * gk)));
    const idleGov = Math.max(0, Math.min(0.3, (P.idleRpm - rpm0) / 300));   // Leerlaufregler hält den Motor am Laufen
    let te = 0;
    if (rpm0 < P.redlineRpm) te = torqueAt(P.torqueCurve, rpm0) * Math.max(thr * this.tcF, idleGov);   // tcF: Traktionskontrolle, nur aufs Gas-Moment (nicht die Motorbremse)
    te -= P.engineBrake * Math.min(1, rpm0 / 4000) * (1 - Math.min(1, thr * 4));   // Motorbremse = Reibung des Motors, wirkt über die Kupplung gegen die Raddrehung
    // implizit gelöst (Motor und Rad-Seite gekoppelt), sonst schwingt die steife Kupplung bei DT
    const nd = driven.length, iwr = P.wheelInertia * nd / (0.9 * ratio * ratio);
    const K = cap / CL_SLIP;
    const s1 = (this.engW - wg + dt * te / CL_IE) / (1 + dt * K * (1 / CL_IE + 1 / iwr));
    const tc = Math.max(-cap, Math.min(cap, K * s1));
    this.engW = Math.max(0, this.engW + dt * (te - tc) / CL_IE);
    this.rpm = this.engW / RPM2W;
    const engT = tc;
    const wheelDriveTotal = engT * ratio * 0.9;
    // Traktionskontrolle (fest an): PI-Regler nimmt das Motormoment zurück, solange der Schlupf der angetriebenen Räder über dem Ziel des Untergrunds liegt
    {
      const e = this.tcErr;   // max(Schlupf - Ziel) im Antriebssinn, aus dem letzten Schritt; -9 = kein Radkontakt
      if (e <= -9) { this.tcI = 0; }
      else { this.tcI = Math.max(0, Math.min(1, this.tcI + TC_KI * e * dt)); }
      this.tcF = e <= -9 ? 1 : Math.max(TC_MIN, Math.min(1, 1 - ((e > 0 ? TC_KP * e : 0) + this.tcI)));
    }
    this.tcErr = -9;
    const driveT = [0, 0, 0, 0];
    for (const i of driven) driveT[i] = wheelDriveTotal * lw[i] / lwSum;
    // Visco-Kupplung (Buggy): Anteil nach vorn wächst mit dem Drehzahlvorsprung der Hinterräder (m/s am Reifen), gedeckelt; ohne Vorsprung kein Moment vorn
    if (P.visco && P.drive === 'RWD') {
      const sg = this.reverse ? -1 : 1, dv = sg * (this.omega[2] + this.omega[3] - this.omega[0] - this.omega[1]) / 2 * P.wheelRadius;
      const f = P.visco * Math.max(0, Math.min(1, (dv - 1) / 3));
      if (f > 0 && (this.contact[0] || this.contact[1])) { const tot = driveT[2] + driveT[3]; driveT[2] = driveT[3] = tot * (1 - f) / 2; driveT[0] = driveT[1] = tot * f / 2; }
    }

    // ── Bremsen ──
    const brakeT = [0, 0, 0, 0];
    const bf = brk * P.brakeTorque * P.brakeBias * 2, br = brk * P.brakeTorque * (1 - P.brakeBias) * 2;
    brakeT[0] = brakeT[1] = bf; brakeT[2] = brakeT[3] = br;
    // Handbremse: greift sofort, lässt über HB_FADE s nach (kein Ruck beim Wiedergreifen der Hinterachse)
    if (!inp.handbrake && this.hb >= 1) this.hbTail = 1;   // gerade gelöst: Seitenkräfte kommen verzögert zurück
    else this.hbTail = Math.max(0, this.hbTail - dt / HB_TAIL);
    this.hb = inp.handbrake ? 1 : Math.max(0, this.hb - dt / HB_FADE);
    if (this.hb > 0) { const ht = P.handbrakeTorque * this.hb; brakeT[2] = Math.max(brakeT[2], ht); brakeT[3] = Math.max(brakeT[3], ht); }

    // ── Rad-Raycasts ──
    const wr = P.wheelRadius, L0 = P.suspRest, maxT = L0 + wr;
    const hit = [false, false, false, false];
    const cx = [0, 0, 0, 0], cy = [0, 0, 0, 0], cz = [0, 0, 0, 0];
    const nrm = [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]];
    const x = [0, 0, 0, 0];
    const surfs: Surface[] = [];
    let surfCenter = this.terrain.surface(pos[0], pos[2]);
    for (let i = 0; i < 4; i++) {
      const m = this.mount[i];
      const ox = pos[0] + AR[0] * m[0] + AU[0] * m[1] + this.axesBz(2, 0) * m[2];
      const oy = pos[1] + AR[1] * m[0] + AU[1] * m[1] + this.axesBz(2, 1) * m[2];
      const oz = pos[2] + AR[2] * m[0] + AU[2] * m[1] + this.axesBz(2, 2) * m[2];
      const dy = AU[1]; // Abwärtsanteil des Strahls (entlang -Up)
      surfs[i] = surfCenter;
      if (dy < 0.25) continue; // Auto liegt auf der Seite/Dach
      let tt = Math.max(0, (oy - this.terrain.height(ox, oz)) / dy);
      for (let k = 0; k < 3; k++) {
        const px = ox - AU[0] * tt, py = oy - AU[1] * tt, pz = oz - AU[2] * tt;
        tt += (py - this.terrain.height(px, pz)) / dy;
        if (tt < 0) tt = 0;
      }
      // Die Festpunkt-Iteration konvergiert nur, wenn das Gelände entlang des Strahls flacher als dy ansteigt; am Steilhang bei schräg liegendem Auto (Hang > ca. 30°) pendelt sie weg
      // und liefert Unsinn (Einfederung am Maximum, obwohl das Rad 2 m über dem Boden hängt -> konstante Riesenkraft, Katapult). Dann: Marsch entlang des Strahls + Bisektion.
      const f = (t: number) => (oy - AU[1] * t) - this.terrain.height(ox - AU[0] * t, oz - AU[2] * t);
      if (Math.abs(f(tt)) > 0.005 && !(tt <= 0 && f(0) <= 0)) {
        tt = maxT;
        if (f(0) <= 0) tt = 0;
        else {
          let t0 = 0;
          for (let k = 1; k <= 12; k++) {
            const t1 = maxT * k / 12;
            if (f(t1) <= 0) { let a = t0, b = t1; for (let j = 0; j < 8; j++) { const m = (a + b) / 2; if (f(m) <= 0) b = m; else a = m; } tt = b; break; }
            t0 = t1;
          }
        }
      }
      if (tt >= maxT) continue;
      hit[i] = true;
      x[i] = maxT - tt;
      cx[i] = ox - AU[0] * tt; cy[i] = oy - AU[1] * tt; cz[i] = oz - AU[2] * tt;
      this.terrain.normal(cx[i], cz[i], this.n);
      nrm[i] = [this.n[0], this.n[1], this.n[2]];
      surfs[i] = this.terrain.surface(cx[i], cz[i]);
    }
    this.surfaceName = (hit[0] ? surfs[0] : surfCenter).name;
    if (hit[0] || hit[1] || hit[2] || hit[3]) {
      // Untergrund: häufigster der Kontaktflächen, sonst Mitte
      const cnt: Record<string, number> = {};
      let best = '', bc = 0;
      for (let i = 0; i < 4; i++) if (hit[i]) { const nm = surfs[i].name; cnt[nm] = (cnt[nm] || 0) + 1; if (cnt[nm] > bc) { bc = cnt[nm]; best = nm; } }
      this.surfaceName = best;
    }

    // Stabilisator
    const arbF = [0, 0, 0, 0];
    if (P.arbRate > 0) {
      const df = P.arbRate * (x[0] - x[1]); arbF[0] = df; arbF[1] = -df;
      const dr = P.arbRate * (x[2] - x[3]); arbF[2] = dr; arbF[3] = -dr;
    }

    // Kräfte/Momente sammeln
    let Fx = 0, Fy = -P.mass * G, Fz = 0, Tx = 0, Ty = 0, Tz = 0;
    const addAt = (fx: number, fy: number, fz: number, px: number, py: number, pz: number) => {
      Fx += fx; Fy += fy; Fz += fz;
      const rx = px - pos[0], ry = py - pos[1], rz = pz - pos[2];
      Tx += ry * fz - rz * fy; Ty += rz * fx - rx * fz; Tz += rx * fy - ry * fx;
    };
    const mShare = P.mass / 4 * 0.6;
    const tf = this.tf;

    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      let om = this.omega[i];
      this.contact[i] = hit[i];
      if (!hit[i]) {
        // in der Luft: nur Antrieb/Bremse
        this.compression[i] += (0 - this.compression[i]) * Math.min(1, dt * 12);
        om += dt / P.wheelInertia * driveT[i];
        const bd = dt * brakeT[i] / P.wheelInertia;
        om = Math.abs(om) <= bd ? 0 : om - Math.sign(om) * bd;
        this.omega[i] = om; this.spin[i] += om * dt;
        continue;
      }
      this.compression[i] = x[i];
      const n = nrm[i];
      const rx = cx[i] - pos[0], ry = cy[i] - pos[1], rz = cz[i] - pos[2];
      // Geschwindigkeit des Kontaktpunkts
      const vcx = v[0] + w[1] * rz - w[2] * ry, vcy = v[1] + w[2] * rx - w[0] * rz, vcz = v[2] + w[0] * ry - w[1] * rx;
      const vn = vcx * n[0] + vcy * n[1] + vcz * n[2];
      // Feder/Dämpfer -> Radlast
      let fn = P.springRate * x[i] + arbF[i];
      if (x[i] > P.suspTravel) fn += P.springRate * 12 * (x[i] - P.suspTravel) / (1 + BUMP_REB * Math.max(0, vn));   // Anschlag unelastisch: beim Ausfedern kaum Rückstellkraft (kein Katapult)
      fn += vn < 0 ? -P.damping * vn : -P.damping * P.reboundRatio * vn;
      if (fn < 0) fn = 0;

      // Radrichtung in der Bodenebene
      const sa = front ? this.steerAngle : 0;
      let dx = AF[0] * Math.cos(sa) + AR[0] * Math.sin(sa);
      let dy = AF[1] * Math.cos(sa) + AR[1] * Math.sin(sa);
      let dz = AF[2] * Math.cos(sa) + AR[2] * Math.sin(sa);
      const dn = dx * n[0] + dy * n[1] + dz * n[2];
      dx -= n[0] * dn; dy -= n[1] * dn; dz -= n[2] * dn;
      const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      // rechts = fwd x n
      const sx = dy * n[2] - dz * n[1], sy = dz * n[0] - dx * n[2], sz = dx * n[1] - dy * n[0];
      const vlong = vcx * dx + vcy * dy + vcz * dz;
      const vlat = vcx * sx + vcy * sy + vcz * sz;
      const surf = surfs[i];

      // Rad implizit: Schlupf <-> Drehzahl stabil koppeln
      tireForce(tf, om, vlong, vlat, fn, wr, surf, P.loadSensitivity, this.fzNom, gripOn(P, surf));
      const f0 = tf[0];
      tireForce(tf, om + 1, vlong, vlat, fn, wr, surf, P.loadSensitivity, this.fzNom, gripOn(P, surf));
      let k = Math.abs(tf[0] - f0); // Betrag: hinter der Kraftspitze ist die Steigung negativ, Dämpfung bleibt nötig
      if (thr < 0.05) {   // ohne Gas (Ausrollen/Stand): Sondierschritt 1 % Schlupf – bei steifen Reifen (Jeep) zeigt 1 rad/s eine viel zu flache Steigung -> Wechselschwingen der Radkraft im 60-Hz-Takt (Phantomantrieb im Stand). Mit Gas bleibt die kalibrierte Beschleunigung.
        const dOm = 0.01 * Math.max(Math.abs(vlong), V_MIN) / wr;
        tireForce(tf, om + dOm, vlong, vlat, fn, wr, surf, P.loadSensitivity, this.fzNom, gripOn(P, surf));
        k = Math.max(k, Math.abs(tf[0] - f0) / dOm);
      }
      let om1 = om + dt / P.wheelInertia * (driveT[i] - f0 * wr) / (1 + dt * wr * k / P.wheelInertia);
      const bd = dt * brakeT[i] / P.wheelInertia;
      om1 = Math.abs(om1) <= bd ? 0 : om1 - Math.sign(om1) * bd;
      this.omega[i] = om1; this.spin[i] += om1 * dt;
      tireForce(tf, om1, vlong, vlat, fn, wr, surf, P.loadSensitivity, this.fzNom, gripOn(P, surf));
      let fxl = tf[0], fyl = tf[1];
      if (driven.includes(i) && driveT[i] !== 0) {   // Schlupf im Antriebssinn für die Traktionskontrolle
        const vs = Math.max(Math.abs(vlong), V_MIN), kap = Math.sign(driveT[i]) * (om1 * wr - vlong) / vs;
        this.tcErr = Math.max(this.tcErr, kap - (surf.tc ?? TC_DEFAULT) - DR_TC * this.dr);
      }
      // Rollwiderstand
      fxl -= surf.rolling * fn * Math.tanh(vlong / 0.4);
      // nie die Bewegung in einem Schritt umkehren (Stand-Stabilität)
      if (fyl * vlat < 0) { const lim = mShare * Math.abs(vlat) / dt; if (Math.abs(fyl) > lim) fyl = Math.sign(fyl) * lim; }
      if (fxl * vlong < 0 && brakeT[i] === 0 && driveT[i] === 0) {
        const lim = mShare * Math.abs(vlong) / dt; if (Math.abs(fxl) > lim) fxl = Math.sign(fxl) * lim;
      }
      // Reifen-Relaxation: Seitenkraft folgt dem Sollwert mit Verzögerung (Relaxationslänge / Tempo) -> kein Ruck, wenn ein rutschendes Rad wieder greift
      { const L = RELAX_L * this.hbTail, a = L > 0.01 ? 1 - Math.exp(-Math.max(Math.hypot(vlong, vlat), RELAX_VMIN) * dt / L) : 1; this.fyF[i] += (fyl - this.fyF[i]) * a; fyl = this.fyF[i]; }
      // Reifenkräfte greifen nur zum Teil am Boden an (Richtung Schwerpunkt verschoben): weniger Wanken/Kippen bei viel Grip
      const tx = fxl * dx + fyl * sx, ty = fxl * dy + fyl * sy, tz = fxl * dz + fyl * sz;
      addAt(tx, ty, tz, cx[i] + (pos[0] - cx[i]) * ROLL_K, cy[i] + (pos[1] - cy[i]) * ROLL_K, cz[i] + (pos[2] - cz[i]) * ROLL_K);
      addAt(fn * n[0], fn * n[1], fn * n[2], cx[i], cy[i], cz[i]);
    }

    // ── Karosserie-Kontakt (Boden/Dach) ──
    {
      const { w: bw, h: bh, l: bl } = P.size;
      // Unterboden: Kontaktpunkte höher und innerhalb der Stoßstangen (wie eine Wanne), damit Kanten/Landungen das Auto nicht festhalten oder umwerfen; Dach = volle Box
      const clearance = P.clearance ?? 0.28;
      this.scrape = 0; this.scrapeV = 0;
      const lowY = -(P.cgHeight - clearance), topY = bh - P.cgHeight;
      for (let c = 0; c < 8; c++) {
        const top = (c & 4) !== 0;
        const lx = (c & 1 ? 1 : -1) * bw / 2 * (top ? 1 : 0.85), lz = (c & 2 ? 1 : -1) * bl / 2 * (top ? 1 : 0.72), ly = top ? topY : lowY;
        const px = pos[0] + AR[0] * lx + AU[0] * ly + this.axesBz(2, 0) * lz;
        const py = pos[1] + AR[1] * lx + AU[1] * ly + this.axesBz(2, 1) * lz;
        const pz = pos[2] + AR[2] * lx + AU[2] * ly + this.axesBz(2, 2) * lz;
        const gh = this.terrain.height(px, pz), d = gh - py;
        if (d <= 0) continue;
        this.terrain.normal(px, pz, this.n);
        const rx = px - pos[0], ry = py - pos[1], rz = pz - pos[2];
        const vx = v[0] + w[1] * rz - w[2] * ry, vy = v[1] + w[2] * rx - w[0] * rz, vz = v[2] + w[0] * ry - w[1] * rx;
        const vn = vx * this.n[0] + vy * this.n[1] + vz * this.n[2];
        const fn = Math.max(0, 60000 * d - 3500 * vn);
        // Reibung am Boden: rutscht (gedeckelt auf einen Teil der Andruckkraft), zäh nur bei kleinem Tempo
        const tx = vx - vn * this.n[0], ty = vy - vn * this.n[1], tz = vz - vn * this.n[2];
        const tl = Math.hypot(tx, ty, tz), fr = Math.min(2500, (top ? 0.6 : 0.3) * fn / Math.max(tl, 1e-3));
        addAt(fn * this.n[0] - fr * tx, fn * this.n[1] - fr * ty, fn * this.n[2] - fr * tz, px, py, pz);
        if (!top && fn > this.scrape) { this.scrape = fn; this.scrapeV = tl; }
      }
    }

    // Wasserwiderstand (zäh, nimmt mit der Tiefe stark zu); abgesoffen = fast Stillstand
    if (this.submerged > 0 || this.drowned) {
      const f = this.submerged, lam = this.drowned ? 10 : 3 * f + 12 * f * f;
      Fx -= P.mass * lam * v[0]; Fz -= P.mass * lam * v[2];
      const wd2 = Math.exp(-lam * 0.5 * dt); w[0] *= wd2; w[1] *= wd2; w[2] *= wd2;
    }
    if (this.shallow > 0 && !this.drowned) {   // flaches Wasser: bremst, ohne abzusaufen
      Fx -= P.mass * this.shallow * v[0]; Fz -= P.mass * this.shallow * v[2];
    }
    // Luftwiderstand
    const dragK = 0.5 * 1.2 * P.dragCdA * speed;
    Fx -= dragK * v[0]; Fy -= dragK * v[1]; Fz -= dragK * v[2];

    // Stabilitätshilfe: Gierrate über der kinematischen Sollrate (aus Lenkwinkel) wird gedämpft; Gegenrichtung voll.
    // Handbremse schaltet sie fast ab (Drift bleibt möglich).
    if (P.stability > 0 && AU[1] > 0.7) {
      const rk = -fwd * Math.tan(this.steerAngle) / P.wheelbase * 1.25;
      const lo = Math.min(0, rk) - 0.12, hi = Math.max(0, rk) + 0.12;
      const wy = w[0] * AU[0] + w[1] * AU[1] + w[2] * AU[2];
      const ex = wy - Math.max(lo, Math.min(hi, wy));
      const sh = STAB_HB(this.hb, this.hbTail) * (1 - DR_STAB * this.dr), k = P.stability * sh * Math.min(1, speed / 6);
      // Schwimmwinkel (Heck bricht aus): zurück in die Fahrtrichtung drehen (Gegenlenkhilfe)
      const vr = v[0] * AR[0] + v[1] * AR[1] + v[2] * AR[2];
      const beta = fwd > 3 ? Math.atan2(vr, fwd) : 0;
      const eb = beta - Math.max(-0.14, Math.min(0.14, beta));
      const acc = -(ex * k) - 8 * P.stability * sh * eb * Math.min(1, speed / 6);
      Tx += AU[0] * this.inertia[1] * acc; Ty += AU[1] * this.inertia[1] * acc; Tz += AU[2] * this.inertia[1] * acc;
    }

    // nach dem Lösen der Handbremse: das Heck greift wieder -> Gierung wird weich eingefangen statt zurückzuschnalzen
    if (this.hbTail > 0 && AU[1] > 0.7) {
      const wy = w[0] * AU[0] + w[1] * AU[1] + w[2] * AU[2], acc = -HB_YAWD * this.hbTail * wy;
      Tx += AU[0] * this.inertia[1] * acc; Ty += AU[1] * this.inertia[1] * acc; Tz += AU[2] * this.inertia[1] * acc;
    }

    // Flughilfe (Arcade): ohne Bodenkontakt richtet sich das Auto sanft nach dem Boden unter ihm aus (Nicken/Wanken), damit Landungen auf allen vier Rädern gelingen
    if (this.aid > 0 && this.airTime > AIR_DELAY && AU[1] > 0.3) {
      const f = AF, hAt = (a: number) => this.terrain.height(pos[0] + f[0] * a, pos[2] + f[2] * a);
      const tp = Math.atan2(hAt(3) - hAt(-3), 6), pitch = Math.asin(Math.max(-1, Math.min(1, f[1]))), roll = Math.asin(Math.max(-1, Math.min(1, AR[1])));
      const wr = w[0] * AR[0] + w[1] * AR[1] + w[2] * AR[2], wf = w[0] * f[0] + w[1] * f[1] + w[2] * f[2];
      const ramp = this.aid * Math.min(1, (this.airTime - AIR_DELAY) / 0.15);
      const ap = ramp * (-AIR_K * (pitch - tp) - AIR_C * wr) * this.inertia[0], ar = ramp * (AIR_K * roll - AIR_C * wf) * this.inertia[2];
      Tx += AR[0] * ap + f[0] * ar; Ty += AR[1] * ap + f[1] * ar; Tz += AR[2] * ap + f[2] * ar;
      // Gieren: Nase dreht in die Flugrichtung, Drehung wird gedämpft -> Landung ohne Schräglauf (sonst reißen die Reifen das Auto herum)
      const vh = Math.hypot(v[0], v[2]);
      if (vh > 5 && v[0] * f[0] + v[2] * f[2] > 0) {
        const th = Math.atan2(f[2] * v[0] - f[0] * v[2], f[0] * v[0] + f[2] * v[2]), wy = w[0] * AU[0] + w[1] * AU[1] + w[2] * AU[2];
        const ay = ramp * (AIR_KY * th - AIR_CY * wy) * this.inertia[1];
        Tx += AU[0] * ay; Ty += AU[1] * ay; Tz += AU[2] * ay;
      }
    }

    // Nach der Landung kurz Nicken/Wanken dämpfen (kein Überschlag nach hartem Aufsetzen)
    if (this.aid > 0 && this.sinceLand < 0.5 && AU[1] > 0.3) {
      const wr = w[0] * AR[0] + w[1] * AR[1] + w[2] * AR[2], wf = w[0] * AF[0] + w[1] * AF[1] + w[2] * AF[2], k = this.aid * (1 - Math.exp(-7 * dt)) * (1 - this.sinceLand / 0.5);
      for (let i = 0; i < 3; i++) w[i] -= k * (AR[i] * wr + AF[i] * wf);
    }

    // ── Integration ──
    const im = 1 / P.mass;
    v[0] += Fx * im * dt; v[1] += Fy * im * dt; v[2] += Fz * im * dt;
    // Drehmoment ins Körpersystem, durch I teilen, zurück
    const { bz } = this.axes();
    const tl = [AR[0] * Tx + AR[1] * Ty + AR[2] * Tz, AU[0] * Tx + AU[1] * Ty + AU[2] * Tz, bz[0] * Tx + bz[1] * Ty + bz[2] * Tz];
    const dl = [tl[0] / this.inertia[0] * dt, tl[1] / this.inertia[1] * dt, tl[2] / this.inertia[2] * dt];
    w[0] += AR[0] * dl[0] + AU[0] * dl[1] + bz[0] * dl[2];
    w[1] += AR[1] * dl[0] + AU[1] * dl[1] + bz[1] * dl[2];
    w[2] += AR[2] * dl[0] + AU[2] * dl[1] + bz[2] * dl[2];
    const wd = Math.exp(-0.15 * dt); w[0] *= wd; w[1] *= wd; w[2] *= wd; // minimale Eigendämpfung

    pos[0] += v[0] * dt; pos[1] += v[1] * dt; pos[2] += v[2] * dt;
    const q = this.q;
    const hx = w[0] * dt * 0.5, hy = w[1] * dt * 0.5, hz = w[2] * dt * 0.5;
    const nx = q[0] + hx * q[3] + hy * q[2] - hz * q[1];
    const ny = q[1] - hx * q[2] + hy * q[3] + hz * q[0];
    const nz = q[2] + hx * q[1] - hy * q[0] + hz * q[3];
    const nw = q[3] - hx * q[0] - hy * q[1] - hz * q[2];
    const ql = Math.hypot(nx, ny, nz, nw);
    q[0] = nx / ql; q[1] = ny / ql; q[2] = nz / ql; q[3] = nw / ql;

    this.bodyLimit();

    // ── Flug / Landung ──
    if (hit[0] || hit[1] || hit[2] || hit[3]) {
      if (this.airTime > 0.2) { this.landing = Math.max(this.landing, -this.vyAir); this.sinceLand = 0; }
      this.airTime = 0; this.sinceLand += dt;
    } else { this.airTime += dt; this.vyAir = v[1]; }
    this.flipT = AU[1] < 0.35 && speed < 3 && !this.drowned ? this.flipT + dt : 0;   // Dach/Seite und (fast) still
    // ── Einschlafen: Stand ohne Eingabe -> exakt ruhig ──
    if (this.allowSleep) {
      const calm = Math.hypot(v[0], v[1], v[2]) < 0.05 && Math.hypot(w[0], w[1], w[2]) < 0.05 && !active && hit.every(Boolean);
      this.calmTime = calm ? this.calmTime + dt : 0;
      if (this.calmTime > 0.5) {
        this.sleeping = true; v[0] = v[1] = v[2] = 0; w[0] = w[1] = w[2] = 0; this.omega = [0, 0, 0, 0];
      }
    }
    this.writePose(this.pose);
  }

  /** Eindringtiefe der Karosserie begrenzen: Die Kontaktfeder (60 kN/m) nimmt bei hartem Aufprall nicht genug Energie auf (½·m·v² = ½·k·d²: aus 10 m/s käme d ≈ 1,3 m) –
   *  das Auto sänke durch Hang oder Kante. Darum hier wie bei einem Starrkörper: Ist ein Kontaktpunkt tiefer als BODY_SLOP im Boden, wird die Annäherungsgeschwindigkeit dort
   *  durch einen Stoß (Rückprall BODY_E, Coulomb-Reibung) aufgehoben und das Auto höchstens BODY_PUSH aus dem Boden geschoben. Die Feder bleibt für Ruhe und sanftes Aufsetzen. */
  private bodyLimit(): void {
    const P = this.p, { w: bw, h: bh, l: bl } = P.size, clearance = P.clearance ?? 0.28, lowY = -(P.cgHeight - clearance), topY = bh - P.cgHeight;
    const nn = [0, 1, 0];
    for (let pass = 0; pass < 2; pass++) {
      const { r: AR, u: AU, bz: AB } = this.axes();
      let any = false;
      // wirksame Masse am Punkt (rx,ry,rz) entlang t: 1/m + Σ ((r×t)·Achse)² / I
      const eff = (rx: number, ry: number, rz: number, tx: number, ty: number, tz: number) => {
        const cx = ry * tz - rz * ty, cy = rz * tx - rx * tz, cz = rx * ty - ry * tx;
        const a = AR[0] * cx + AR[1] * cy + AR[2] * cz, b = AU[0] * cx + AU[1] * cy + AU[2] * cz, e = AB[0] * cx + AB[1] * cy + AB[2] * cz;
        return 1 / P.mass + a * a / this.inertia[0] + b * b / this.inertia[1] + e * e / this.inertia[2];
      };
      // Stoß am Weltpunkt (px,py,pz) mit Normale n: Annäherung weg (Rückprall BODY_E), Reibung mu; push = Verschiebung entlang n
      const hit = (px: number, py: number, pz: number, n: number[], mu: number, push: number): void => {
        const rx = px - this.pos[0], ry = py - this.pos[1], rz = pz - this.pos[2], v = this.vel, w = this.angVel;
        const vx = v[0] + w[1] * rz - w[2] * ry, vy = v[1] + w[2] * rx - w[0] * rz, vz = v[2] + w[0] * ry - w[1] * rx;
        const vn = vx * n[0] + vy * n[1] + vz * n[2];
        if (vn < 0) {
          const jn = -(1 + BODY_E) * vn / eff(rx, ry, rz, n[0], n[1], n[2]);
          let tx = vx - vn * n[0], ty = vy - vn * n[1], tz = vz - vn * n[2];
          const tl = Math.hypot(tx, ty, tz);
          let jx = n[0] * jn, jy = n[1] * jn, jz = n[2] * jn;
          if (tl > 1e-6 && mu > 0) {
            tx /= tl; ty /= tl; tz /= tl;
            const jt = Math.min(mu * jn, tl / eff(rx, ry, rz, tx, ty, tz));
            jx -= tx * jt; jy -= ty * jt; jz -= tz * jt;
          }
          this.applyImpulse(px, py, pz, jx, jy, jz); any = true;
        }
        this.pos[0] += n[0] * push; this.pos[1] += n[1] * push; this.pos[2] += n[2] * push;
      };
      for (let c = 0; c < 8; c++) {
        const top = (c & 4) !== 0;
        const lx = (c & 1 ? 1 : -1) * bw / 2 * (top ? 1 : 0.85), lz = (c & 2 ? 1 : -1) * bl / 2 * (top ? 1 : 0.72), ly = top ? topY : lowY;
        const px = this.pos[0] + AR[0] * lx + AU[0] * ly + AB[0] * lz, py = this.pos[1] + AR[1] * lx + AU[1] * ly + AB[1] * lz, pz = this.pos[2] + AR[2] * lx + AU[2] * ly + AB[2] * lz;
        const dv = this.terrain.height(px, pz) - py;
        if (dv <= BODY_SLOP) continue;
        this.terrain.normal(px, pz, nn);
        const d = dv * nn[1];   // senkrechte Eindringtiefe (am Steilhang viel kleiner als der Höhenunterschied)
        if (d > BODY_SLOP) hit(px, py, pz, nn, top ? 0.6 : 0.3, Math.min(d - BODY_SLOP, BODY_PUSH));
      }
      // Montagepunkte der Räder: liegt einer unter dem Boden (Wand, Hang, Kante), fehlt dem Strahl der Weg (Einfederung bleibt am Maximum, die Federkraft ist dort konstant statt rückstellend
      // und schleudert das Auto heraus) -> hier wie ein Karosseriepunkt behandeln
      for (let i = 0; i < 4; i++) {
        const m = this.mount[i], px = this.pos[0] + AR[0] * m[0] + AU[0] * m[1] + AB[0] * m[2], py = this.pos[1] + AR[1] * m[0] + AU[1] * m[1] + AB[1] * m[2], pz = this.pos[2] + AR[2] * m[0] + AU[2] * m[1] + AB[2] * m[2];
        const dv = this.terrain.height(px, pz) - py; if (dv <= BODY_SLOP) continue;
        this.terrain.normal(px, pz, nn); const d = dv * nn[1]; if (d > BODY_SLOP) hit(px, py, pz, nn, 0.3, Math.min(d - BODY_SLOP, BODY_PUSH));
      }
      if (!any) break;
    }
  }

  /** Trägheit um die Hochachse (genau die, mit der step() und applyImpulse rechnen) */
  get yawInertia(): number { return this.inertia[1]; }

  /** Stoßimpuls J (Ns) im Weltpunkt p auf den Starrkörper (Hindernisse). */
  applyImpulse(px: number, py: number, pz: number, jx: number, jy: number, jz: number): void {
    const m = this.p.mass, v = this.vel, w = this.angVel;
    v[0] += jx / m; v[1] += jy / m; v[2] += jz / m;
    const rx = px - this.pos[0], ry = py - this.pos[1], rz = pz - this.pos[2];
    const tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx;
    const { r: AR, u: AU, bz } = this.axes();
    const l0 = (AR[0] * tx + AR[1] * ty + AR[2] * tz) / this.inertia[0], l1 = (AU[0] * tx + AU[1] * ty + AU[2] * tz) / this.inertia[1], l2 = (bz[0] * tx + bz[1] * ty + bz[2] * tz) / this.inertia[2];
    w[0] += AR[0] * l0 + AU[0] * l1 + bz[0] * l2; w[1] += AR[1] * l0 + AU[1] * l1 + bz[1] * l2; w[2] += AR[2] * l0 + AU[2] * l1 + bz[2] * l2;
    this.sleeping = false;
  }

  private axesBz(_c: number, k: number): number {
    // Spalte 2 (hinten) der Rotationsmatrix, Komponente k
    const [x, y, z, w] = this.q;
    return k === 0 ? 2 * (x * z + y * w) : k === 1 ? 2 * (y * z - x * w) : 1 - 2 * (x * x + y * y);
  }
}

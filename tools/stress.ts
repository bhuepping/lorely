// Stresswerkzeug: Extremlagen mit echten Offroad-Leveln und allen Autos, Messung der Invarianten.
// Läuft nur mit Env-Schalter:  STRESS=1 node_modules/.bin/vitest run tools/stress.test.ts   (STRESS_FULL=1: alle Level x Autos, Bericht je Fall)
// Invarianten je Fall: (1) keine NaN/Infinity, (2) ohne Antrieb keine Energiezunahme, (3) nicht durch den Boden, (4) nicht durch ein Hindernis,
// (5) kein Dauerzittern im Stand (Auslauf ohne Eingabe), (6) der Kran setzt auf eine freie, befahrbare Stelle und das Auto steht dort ruhig.
import type { Course } from '../src/level';
import { Tracker } from '../src/level';
import { WORLDS } from '../src/levels';
import { CARS, type CarParams } from '../src/physics/params';
import { Vehicle, DT, type Input } from '../src/physics/vehicle';
import { Obstacles } from '../src/physics/obstacles';

export const LEVELS = ['huegel', 'matschgrube', 'furtwald', 'steilhang', 'moorwald'];
const W = WORLDS.find((w) => w.id === 'offroad')!;
const cache = new Map<string, Course>();
export const level = (id: string): Course => { let c = cache.get(id); if (!c) { c = W.levels.find((l) => l.id === id)!.make(); cache.set(id, c); } return c; };

type V3 = [number, number, number];
const idle: Input = { steer: 0, throttle: 0, brake: 0, handbrake: false };
const qmul = (a: number[], b: number[]) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];

export interface Spec {
  name: string; level: string; car: string;
  x: number; z: number; yaw: number; lift?: number;            // Start: Boden + lift (m) über dem Schwerpunkt-Ruhelage
  speed?: number;                                              // Anfangstempo vorwärts (m/s)
  roll?: number; pitch?: number;                               // Anfangslage (rad) um Längs-/Querachse
  spin?: V3;                                                   // Anfangs-Winkelgeschwindigkeit (rad/s, Welt)
  drive?: (t: number, car: Vehicle) => Input;                  // Eingaben bis `tDrive`
  tDrive: number; tCoast?: number;                             // Fahrzeit, danach Auslauf ohne Eingabe (Zittern messen)
  powered?: boolean;                                           // Antrieb im Spiel -> keine Energieprüfung
  trace?: (t: number, car: Vehicle, ob: Obstacles) => void;
  crane?: boolean;                                             // am Ende Kran prüfen
  shallow?: boolean;
}
export interface Result {
  name: string; nan: boolean; gain: number; underGround: number; tunnel: string; jitter: number; maxSpeed: number; minZ: number;
  crane: string; flips: boolean; endSpeed: number; end: V3; at?: string; ug?: string;
}

/** Hindernisse nahe (x,z): Kreise und Boxen (Grundriss) – Mittelpunkt des Autos darf nie darin liegen */
function inside(ob: Obstacles, x: number, z: number, pad = 0): string {
  for (const c of ob.circles) { if (Math.abs(c.x - x) > c.r + 1 + pad || Math.abs(c.z - z) > c.r + 1 + pad) continue; if (Math.hypot(c.x - x, c.z - z) < c.r * 0.8 + pad) return `Kreis ${c.x.toFixed(1)},${c.z.toFixed(1)} r${c.r.toFixed(1)}`; }
  for (const b of ob.boxes) {
    if (Math.abs(b.x - x) > Math.hypot(b.hx, b.hz) + 1 || Math.abs(b.z - z) > Math.hypot(b.hx, b.hz) + 1) continue;
    const dx = x - b.x, dz = z - b.z, cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
    if (Math.abs(dx * cs - dz * sn) < b.hx * 0.8 + pad && Math.abs(dx * sn + dz * cs) < b.hz * 0.8 + pad) return `Box ${b.x.toFixed(1)},${b.z.toFixed(1)}`;
  }
  return '';
}

/** Kran-Stelle für die Lage des Autos (wie game.ts: recoverAt, sonst recover am nächsten Streckenmeter, ein Stück zurück) */
export function craneAt(c: Course, x: number, z: number): { x: number; z: number; yaw: number } {
  if (c.recoverAt) return c.recoverAt(x, z);
  const s = new Tracker(c.route).update(x, z);
  return c.recover(Math.max(6, s - 8))!;
}

/** Prüft die Kran-Stelle: im Gelände, frei von Hindernissen/Wasser, flach genug; danach 3 s Stand ohne Eingabe */
export function checkCrane(c: Course, P: CarParams, ob: Obstacles, from: V3): string {
  const r = craneAt(c, from[0], from[2]);
  if (!r || !Number.isFinite(r.x + r.z + r.yaw)) return 'Kran ohne Stelle';
  const car = new Vehicle(P, c.terrain); car.allowSleep = false; car.reset(r.x, r.z, r.yaw);
  const hit = inside(ob, r.x, r.z); if (hit) return `Kran in Hindernis ${hit}`;
  for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 2], [0, -2]]) { const w = c.waterAt(r.x + ox, r.z + oz); if (w > -1e8 && w > c.terrain.height(r.x + ox, r.z + oz) - 0.2) return 'Kran im Wasser'; }
  const n = [0, 1, 0]; c.terrain.normal(r.x, r.z, n); if (n[1] < 0.7) return `Kran am Steilhang (Normale y ${n[1].toFixed(2)})`;
  for (let k = 0; k < 360; k++) { car.step(idle, DT); ob.step(car); }
  const moved = Math.hypot(car.pos[0] - r.x, car.pos[2] - r.z);
  const T = c.terrain, gr = Math.max(Math.abs(T.height(r.x + 3, r.z) - T.height(r.x - 3, r.z)), Math.abs(T.height(r.x, r.z + 3) - T.height(r.x, r.z - 3))) / 6;
  if (car.axes().u[1] < 0.6) return `Kran: Auto steht nicht aufrecht (up ${car.axes().u[1].toFixed(2)}, Stelle ${r.x.toFixed(1)},${r.z.toFixed(1)}, Gefälle ${gr.toFixed(2)}, ${car.speed.toFixed(1)} m/s, ${moved.toFixed(1)} m, Wasser ${c.waterAt(r.x, r.z).toFixed(1)} / Boden ${T.height(r.x, r.z).toFixed(1)})`;
  if (car.drowned) return 'Kran: abgesoffen';
  const flat = gr < 0.008;   // Gefälle unter 0,8 % (±3 m): ein Auto ohne Handbremse bleibt stehen (sonst rollt es wie in Wirklichkeit; Rollwiderstand hält erst ab ≈ 2 %)
  if (flat && (moved > 2 || car.speed > 1)) return `Kran: Auto kommt auf ebener Stelle nicht zur Ruhe (${moved.toFixed(1)} m, ${car.speed.toFixed(2)} m/s)`;
  const h = inside(ob, car.pos[0], car.pos[2]); if (h) return `Kran: Auto rollt in Hindernis ${h}`;
  return '';
}

export function run(s: Spec): Result {
  const c = level(s.level), P = CARS[s.car];
  const ob = new Obstacles(c.obstacles.circles, c.obstacles.boxes);
  const car = new Vehicle(P, c.terrain); car.allowSleep = false;
  car.reset(s.x, s.z, s.yaw);
  car.pos[1] += s.lift ?? 0;
  if (s.roll || s.pitch) { const q = qmul(qmul(car.q, [0, 0, -Math.sin((s.roll ?? 0) / 2), Math.cos((s.roll ?? 0) / 2)]), [Math.sin((s.pitch ?? 0) / 2), 0, 0, Math.cos((s.pitch ?? 0) / 2)]); car.q = q; }
  if (s.speed) car.launch(s.speed);
  if (s.spin) car.angVel = [...s.spin];
  const res: Result = { name: s.name, nan: false, gain: 0, underGround: 0, tunnel: '', jitter: 0, maxSpeed: 0, minZ: 1e9, crane: '', flips: false, endSpeed: 0, end: [0, 0, 0] };
  const E = () => 0.5 * (car.vel[0] ** 2 + car.vel[1] ** 2 + car.vel[2] ** 2) + 9.81 * car.pos[1]
    + 0.5 * (car.angVel[0] ** 2 * 0 + (car.angVel[0] ** 2 + car.angVel[1] ** 2 + car.angVel[2] ** 2) * 0.5);   // Drehenergie grob (spezifisch, I/m ≈ 0,5 m²)
  let E0 = E(), eMax = E0 - 1;
  const tc = s.tCoast ?? 0, N = Math.round((s.tDrive + tc) / DT), tailFrom = Math.round((s.tDrive + tc - 2) / DT);
  let wMax = 0, kNow = 0, lastHit = -9999; const hist: number[][] = [], spH: number[] = [];
  ob.onImpact = () => { lastHit = kNow; };
  for (let k = 0; k < N; k++) {
    const t = k * DT, driving = t < s.tDrive; kNow = k;
    car.water = c.waterAt(car.pos[0], car.pos[2]) > -1e8 ? c.waterAt(car.pos[0], car.pos[2]) : -1e9;
    if (c.free) car.shallow = s.shallow === false ? 0 : c.shallowAt(car.pos[0], car.pos[2]);
    car.aid = 0;   // Gelände: keine Fahrhilfe wie im Spiel (aidField gilt dort nur auf Straßen)
    const inp = driving && s.drive ? s.drive(t, car) : idle;
    car.step(inp, DT); ob.step(car); s.trace?.(t, car, ob);
    const p = car.pos, v = car.vel, w = car.angVel, q = car.q;
    if (![p[0], p[1], p[2], v[0], v[1], v[2], w[0], w[1], w[2], q[0], q[1], q[2], q[3], car.omega[0], car.omega[1], car.omega[2], car.omega[3]].every(Number.isFinite)) { res.nan = true; break; }
    const sp = Math.hypot(v[0], v[1], v[2]); res.maxSpeed = Math.max(res.maxSpeed, sp);
    // Energie ohne Antrieb: nur wenn nie Gas/Handbremse (Bremsen/Reibung nehmen nur weg) -> Zunahme über dem bisherigen Höchstwert zählt
    if (!s.powered) { const e = E(); if (k === 0) { E0 = e; eMax = e; } eMax = Math.max(eMax, e); res.gain = Math.max(res.gain, e - E0); }
    const gh = c.terrain.height(p[0], p[2]);
    {   // tiefste (senkrechte) Eindringtiefe eines Karosseriekontaktpunkts unter dem Boden
      const ax = car.axes(), hw = P.size.w / 2, hl = P.size.l / 2;
      for (let cI = 0; cI < 8; cI++) {
        const top = (cI & 4) !== 0, lx = (cI & 1 ? 1 : -1) * hw * (top ? 1 : 0.85), lz = (cI & 2 ? 1 : -1) * hl * (top ? 1 : 0.72), ly = top ? P.size.h - P.cgHeight : -(P.cgHeight - (P.clearance ?? 0.28));   // dieselben Punkte wie der Karosseriekontakt der Physik
        const cx = p[0] + ax.r[0] * lx + ax.u[0] * ly + ax.bz[0] * lz, cy = p[1] + ax.r[1] * lx + ax.u[1] * ly + ax.bz[1] * lz, cz = p[2] + ax.r[2] * lx + ax.u[2] * ly + ax.bz[2] * lz;
        const nrm = [0, 1, 0]; c.terrain.normal(cx, cz, nrm); const dd = (c.terrain.height(cx, cz) - cy) * nrm[1]; if (k > 30 && dd > res.underGround) { res.underGround = dd; res.ug = `t ${t.toFixed(2)} Punkt ${cI} v ${sp.toFixed(1)} vy ${v[1].toFixed(1)} up ${ax.u[1].toFixed(2)}`; }
      }
    }
    if (!res.tunnel) { const h = inside(ob, p[0], p[2]); if (h) res.tunnel = `${h} @${t.toFixed(2)} s v${sp.toFixed(1)}`; }
    if (k >= tailFrom && tc > 0) {   // Zittern = schnelle Abweichung vom gleitenden Mittel (50 ms) von Winkel-/Vertikalgeschwindigkeit; Taumeln/Rollen ist glatt und zählt nicht
      hist.push([w[0], w[1], w[2], v[1]]); if (hist.length > 7) hist.shift(); spH.push(sp); if (spH.length > 150) spH.shift();
      if (hist.length === 7 && spH.length === 150 && Math.max(...spH) < 0.8 && k - lastHit > 120) for (let i = 0; i < 4; i++) { const m = hist.reduce((a, h) => a + h[i], 0) / 7; { const dv = Math.abs(hist[6][i] - m) * (i < 3 ? 1 : 2); if (dv > wMax) { wMax = dv; res.at = `t ${t.toFixed(2)} ${'wx wy wz vy'.split(' ')[i]} v ${sp.toFixed(2)} w ${Math.hypot(w[0], w[1], w[2]).toFixed(2)} c ${car.contact.map(Number).join('')}`; } } }
      res.endSpeed = sp;
    }
  }
  res.jitter = wMax > 0.5 ? wMax : 0;   // 0,5 rad/s bzw. 0,25 m/s vertikal im Stand = sichtbar
  res.flips = car.axes().u[1] < 0.3;
  res.minZ = car.pos[2]; res.end = [car.pos[0], car.pos[1], car.pos[2]];
  if (s.crane && !res.nan) res.crane = checkCrane(c, P, ob, [car.pos[0], car.pos[1], car.pos[2]]);
  return res;
}

// ── Fälle aus echten Levelpunkten ──
const full: Input = { steer: 0, throttle: 1, brake: 0, handbrake: false };

/** Punkt der Route mit der größten Querneigung (Höhe links − rechts, ±3 m) im s-Bereich */
function steepestCross(c: Course): { s: number; slope: number } {
  let best = { s: 20, slope: 0 };
  for (let s = 10; s < c.length - 10; s += 2) {
    const [lx, lz] = c.route.offset(s, 3), [rx, rz] = c.route.offset(s, -3), sl = Math.abs(c.terrain.height(lx, lz) - c.terrain.height(rx, rz)) / 6;
    if (sl > best.slope) best = { s, slope: sl };
  }
  return best;
}
/** steilste Stelle im ganzen Raster nahe der Route (Gefälle in Fallrichtung) */
function steepestSpot(c: Course): { x: number; z: number; ax: number; az: number } {
  let best = { x: 0, z: 0, ax: 0, az: -1, g: 0 };
  for (let s = 10; s < c.length - 10; s += 3) for (const lat of [-12, -6, 0, 6, 12]) {
    const [x, z] = c.route.offset(s, lat), e = 1.5, gx = (c.terrain.height(x + e, z) - c.terrain.height(x - e, z)) / (2 * e), gz = (c.terrain.height(x, z + e) - c.terrain.height(x, z - e)) / (2 * e), g = Math.hypot(gx, gz);
    if (g > best.g) best = { x, z, ax: gx / g, az: gz / g, g };
  }
  return best;
}
/** nächstes Hindernis (Kreis) zur Route bei s, mit Abstand der Mitte */
function treeAhead(c: Course, s0: number): { x: number; z: number; r: number } | null {
  let best: { x: number; z: number; r: number } | null = null, bd = 1e9;
  for (const o of c.obstacles.circles) { const h = c.route.nearest(o.x, o.z); if (h.s > s0 + 30 && h.s < s0 + 120 && h.d < 14) { const d = Math.hypot(o.x - c.route.at(s0).x, o.z - c.route.at(s0).z); if (d < bd) { bd = d; best = o; } } }
  return best;
}
/** zwei Hindernisse mit engster Lücke (< Autobreite), nahe der Route */
function tightPair(c: Course, w: number): { x: number; z: number; ax: number; az: number } | null {
  const cs = c.obstacles.circles.filter((o) => c.route.nearest(o.x, o.z).d < 18);
  let best: { x: number; z: number; ax: number; az: number } | null = null, bg = 1e9;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j], d = Math.hypot(a.x - b.x, a.z - b.z), gap = d - a.r - b.r;
    if (gap > 0.2 && gap < w * 0.9 && gap < bg && d > 1) { bg = gap; best = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, ax: -(b.z - a.z) / d, az: (b.x - a.x) / d }; }
  }
  return best;
}
const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);   // Blick nach -z = yaw 0; (dx,dz) = Fahrtrichtung

export function cases(levelId: string, car: string): Spec[] {
  const c = level(levelId), P = CARS[car], out: Spec[] = [];
  const base = { level: levelId, car };
  const st = steepestCross(c), p = c.route.at(st.s), yaw0 = c.route.yawAt(st.s);
  // 1) Überschlag am Hang: quer zur Falllinie mit Tempo, Vollgas, volles Lenken bergab
  const spot = steepestSpot(c);
  for (const [nm, sg] of [['quer', 1], ['quer-gegen', -1]] as [string, number][])
    out.push({ ...base, name: `hang-${nm}`, x: spot.x, z: spot.z, yaw: yawOf(-spot.az * sg, spot.ax * sg), speed: 18, lift: 0.3, tDrive: 5, tCoast: 5, crane: true, powered: true,
      drive: (t) => ({ ...full, steer: t > 1 ? sg : 0 }) });
  out.push({ ...base, name: 'hang-querneigung', x: p.x, z: p.z, yaw: yaw0, speed: 22, lift: 0.3, tDrive: 5, tCoast: 5, crane: true, powered: true, drive: (t) => ({ ...full, steer: Math.sin(t * 3) }) });
  // 2) Sturz aus 20 und 40 m (steilste Stelle, Kante), ohne Antrieb
  for (const h of [20, 40]) out.push({ ...base, name: `sturz-${h}m`, x: spot.x, z: spot.z, yaw: yawOf(spot.ax, spot.az), lift: h, speed: 6, roll: 0.6, pitch: 0.4, tDrive: 0.01, tCoast: 8, crane: true });
  // 3) Vollgas frontal in Baum / zwischen zwei Bäume
  const s1 = Math.max(10, c.length * 0.4), tr = treeAhead(c, s1);
  if (tr) { const a = c.route.at(s1), dx = tr.x - a.x, dz = tr.z - a.z, d = Math.hypot(dx, dz);
    out.push({ ...base, name: 'baum-frontal', x: tr.x - dx / d * 40, z: tr.z - dz / d * 40, yaw: yawOf(dx, dz), speed: 20, tDrive: 5, tCoast: 4, crane: true, powered: true, drive: () => full }); }
  const tp = tightPair(c, P.size.w);
  if (tp) out.push({ ...base, name: 'zwischen-baeume', x: tp.x - tp.ax * 40, z: tp.z - tp.az * 40, yaw: yawOf(tp.ax, tp.az), speed: 20, tDrive: 5, tCoast: 4, crane: true, powered: true, drive: () => full });
  // 4) auf dem Dach: Gas, Lenken, Bremse
  out.push({ ...base, name: 'dach-gas', x: p.x, z: p.z, yaw: yaw0, roll: Math.PI, lift: 0.4, tDrive: 6, tCoast: 5, crane: true, powered: true, drive: (t) => ({ steer: t < 3 ? 1 : -1, throttle: 1, brake: 0, handbrake: false }) });
  out.push({ ...base, name: 'seite-gas', x: p.x, z: p.z, yaw: yaw0, roll: Math.PI / 2, lift: 0.4, tDrive: 6, tCoast: 5, crane: true, powered: true, drive: (t) => ({ steer: t < 3 ? 1 : -1, throttle: 1, brake: 0, handbrake: false }) });
  // 5) steile Wand: Vollgas gegen die steilste Hangstelle bergauf
  out.push({ ...base, name: 'wand-bergauf', x: spot.x - spot.ax * 25, z: spot.z - spot.az * 25, yaw: yawOf(spot.ax, spot.az), speed: 26, tDrive: 5, tCoast: 5, crane: true, powered: true, drive: () => full });
  // 6) Furt / Wasser mit Tempo (Furtwald-Bach), sonst: tiefste Stelle der Strecke
  if (c.brook) { const b = c.brook.route, sb = b.length * 0.5, a = b.at(sb), nx = -a.dz, nz = a.dx;
    out.push({ ...base, name: 'furt-tempo', x: a.x - nx * 30, z: a.z - nz * 30, yaw: yawOf(nx, nz), speed: 25, tDrive: 5, tCoast: 5, crane: true, powered: true, drive: () => full }); }
  // 7) Landung auf Kante: aus 4 m mit Querlage auf die steilste Stelle
  out.push({ ...base, name: 'landung-kante', x: spot.x, z: spot.z, yaw: yawOf(spot.az, -spot.ax), lift: 4, speed: 14, roll: 0.5, tDrive: 0.01, tCoast: 6, crane: true });
  return out;
}

export function report(rs: Result[]): string[] {
  const bad: string[] = [];
  for (const r of rs) {
    const why: string[] = [];
    if (r.nan) why.push('NaN');
    if (r.gain > 20) why.push(`Energiezunahme ${r.gain.toFixed(0)} J/kg`);
    if (r.underGround > 0.6) why.push(`unter Boden ${r.underGround.toFixed(2)} m (${r.ug})`);
    if (r.tunnel) why.push(`Hindernis durchtunnelt ${r.tunnel}`);
    if (r.jitter > 0) why.push(`Zittern ${r.jitter.toFixed(2)} (${r.at})`);
    if (r.maxSpeed > 90) why.push(`Tempo ${r.maxSpeed.toFixed(0)} m/s`);
    if (r.crane) why.push(r.crane);
    if (why.length) bad.push(`${r.name}: ${why.join('; ')}`);
  }
  return bad;
}

/** Zufallsfälle (Saat fest): beliebige Stelle nahe der Route, Lage, Tempo bis 45 m/s, Drall, Eingaben wechseln */
export function fuzz(levelId: string, car: string, n: number, seed = 1): Spec[] {
  const c = level(levelId); let a = seed * 2654435761 >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const out: Spec[] = [], ob0 = new Obstacles(c.obstacles.circles, c.obstacles.boxes);
  for (let i = 0; i < n; i++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 50; tries++) { [x, z] = c.route.offset(rnd() * c.length, (rnd() - 0.5) * 30); if (!inside(ob0, x, z, 3)) break; }
    const big = rnd() < 0.3;
    const sched = Array.from({ length: 8 }, () => ({ steer: rnd() * 2 - 1, throttle: rnd() < 0.7 ? 1 : 0, brake: rnd() < 0.15 ? 1 : 0, handbrake: rnd() < 0.15 }));
    out.push({ level: levelId, car, name: `fuzz${i}`, x, z, yaw: rnd() * 6.283, speed: rnd() * 45, lift: big ? rnd() * 12 : rnd() * 1.5,
      roll: rnd() < 0.5 ? (rnd() - 0.5) * 6.28 : 0, pitch: rnd() < 0.3 ? (rnd() - 0.5) * 3 : 0, spin: rnd() < 0.3 ? [(rnd() - 0.5) * 8, (rnd() - 0.5) * 8, (rnd() - 0.5) * 8] : undefined,
      tDrive: 6, tCoast: 5, powered: true, crane: true, drive: (t) => sched[Math.min(7, Math.floor(t / 0.75))] });
  }
  return out;
}

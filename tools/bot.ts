// Test-/Kalibrierfahrer: folgt der Ideallinie (Pure Pursuit), Tempo aus Kurvenkrümmung + Haftung, ohne Rücksicht auf bewegte Hindernisse.
// Benutzt von tests/*.test.ts und tools/calibrate.ts (Zeitkonten/Sterne der langen Etappen).
import { goalWidth, Checkpoints, FREE_GOAL_R } from '../src/run';
import type { Course } from '../src/level';
import { Tracker, Route } from '../src/level';
import { Vehicle, DT } from '../src/physics/vehicle';
import type { CarParams } from '../src/physics/params';
import { FlatTerrain, type Surface, type Terrain } from '../src/physics/terrain';
import { Obstacles } from '../src/physics/obstacles';
import { aidField } from '../src/features';
import { makeTraffic } from '../src/traffic';

export interface BotOpts { line?: (s: number) => number; traffic?: boolean; aLat?: number; vCap?: number; brake?: number; maxSecs?: number; look?: number; obstacles?: boolean; onStep?: (car: Vehicle, s: number, t: number) => void; before?: (car: Vehicle, t: number) => void }
export interface BotResult { time: number; finished: boolean; maxAir: number; flips: number; hits: number; s: number; stars: number; checkpoints: number[]; minSpeedAfter: number; maxLanding: number; drowned: number; cpLeft: number; stuck: number }

/** Sollgeschwindigkeit je Meter der Strecke: Kurvenlimit rückwärts mit Bremsverzögerung geglättet */
export function speedPlan(c: Course, aLat: number, vCap: number, aBrake: number): Float64Array {
  const n = Math.floor(c.length) + 1, v = new Float64Array(n + 1), r = c.route;
  for (let i = 0; i <= n; i++) {
    const s = Math.min(i, c.length), W = 12;
    const a = r.at(Math.max(0, s - W)), b = r.at(s), d = r.at(Math.min(c.length, s + W));
    const h0 = Math.atan2(b.z - a.z, b.x - a.x), h1 = Math.atan2(d.z - b.z, d.x - b.x);
    let dh = h1 - h0; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    const kappa = Math.abs(dh) / (2 * W), p = r.at(s), mu = c.terrain.surface(p.x, p.z).mu;
    v[i] = Math.min(vCap, kappa < 1e-4 ? vCap : Math.sqrt(aLat * Math.min(1, mu) / kappa));
  }
  for (let i = n - 1; i >= 0; i--) { const q = c.route.at(Math.min(i, c.length)), ab = Math.min(aBrake, 0.8 * c.terrain.surface(q.x, q.z).mu * 9.81); v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * ab)); }
  return v;
}


/** Grip-Fahrer: Pure Pursuit + Tempoplan (so fährt der Bot alle Etappen). Luft: nichts tun. */
export function gripCmd(car: Vehicle, route: Course['route'], terrain: Terrain, P: CarParams, plan: Float64Array, s: number, aLat: number, look0: number, air: boolean, lat = 0, followLine = false): { steer: number; throttle: number; brake: number } {
  const v = Math.max(0, car.forwardSpeed);
  const look = look0 + 0.45 * v, tgt0 = route.at(Math.min(route.length, s + look)), tgt = lat ? (([x, z]) => ({ x, z }))(route.offset(Math.min(route.length, s + look), lat)) : tgt0;
  const f = car.forwardAxis(), fx = f[0], fz = f[2];
  const ang = Math.atan2(fx * (tgt.z - car.pos[2]) - fz * (tgt.x - car.pos[0]), fx * (tgt.x - car.pos[0]) + fz * (tgt.z - car.pos[2]));
  const st = P.steer, maxAng = Math.max(st.minAngle, st.maxAngle / (1 + (v / st.vRef) ** 2)), delta = Math.atan(2 * P.wheelbase * Math.sin(ang) / Math.max(4, look));
  const steer = Math.max(-1, Math.min(1, delta / maxAng));
  const here = route.at(s), muHere = Math.min(1, terrain.surface(here.x, here.z).mu), kpp = 2 * Math.abs(Math.sin(ang)) / Math.max(4, look);
  const vPlan = plan[Math.min(plan.length - 1, Math.floor(s + 8 + v * 0.4))], vt = Math.min(vPlan, Math.sqrt(aLat * muHere / Math.max(kpp, 1e-3)) + 4);
  let throttle = 0, brake = 0;
  if (!air) { if (v < vt - 0.5) throttle = Math.min(1, (vt - v) / 3 + 0.3); else if (v > vt + 1.0) brake = Math.min(1, (v - vt) / 2.5) * (followLine ? 1 - 0.7 * Math.abs(steer) : 1); }   // Ideallinie: volle Bremsung bei Lenkausschlag sperrt die Lenkung
  return { steer: air ? 0 : steer, throttle, brake };
}

export function driveBot(c: Course, P: CarParams, o: BotOpts = {}): BotResult {
  const car = new Vehicle(P, c.terrain); car.allowSleep = false;
  car.reset(c.start.x, c.start.z, c.start.yaw);
  const tr = new Tracker(c.route), ob = new Obstacles(c.obstacles.circles, c.obstacles.boxes);
  let planC = c;
  if (o.line) {      // Tempoplan aus der Krümmung der Ideallinie (nicht der Mittellinie): seitliche Wechsel kosten Tempo
    const pts: [number, number][] = []; for (let q = 0; q <= c.length; q += 1.5) pts.push(c.route.offset(q, o.line(q)));
    const lr = new Route(pts); planC = { ...c, route: lr, length: lr.length } as Course;
  }
  const plan = speedPlan(planC, o.aLat ?? (o.line ? 3 : 5.5), o.vCap ?? 60, o.brake ?? 5);
  const got = new Uint8Array(c.stars.length);
  const res: BotResult = { time: 0, finished: false, maxAir: 0, flips: 0, hits: 0, s: 0, stars: 0, checkpoints: [], minSpeedAfter: 99, maxLanding: 0, drowned: 0, cpLeft: 0, stuck: 0 };
  const cps = new Checkpoints(c);
  ob.onImpact = () => res.hits++;
  const tf = o.traffic ? makeTraffic(c) : null; (globalThis as any).TF = tf; if (tf) ob.dynBoxes = [...ob.dynBoxes, ...tf.cars];
  const max = (o.maxSecs ?? 400) / DT, aidAt = aidField(c);
  let latOff = 0, stuckT = 0;
  for (let k = 0; k < max; k++) {
    const t = k * DT;
    o.before?.(car, t);
    car.water = c.waterAt(car.pos[0], car.pos[2]) > -1e8 ? c.waterAt(car.pos[0], car.pos[2]) : (c.sea ? c.sea.level : -1e9);
    if (c.free) car.shallow = c.shallowAt(car.pos[0], car.pos[2]);   // Offroad: Matsch/Bach bremsen (im Spiel setzt das game.ts)
    car.aid = aidAt(car.pos[0], car.pos[2]);
    const s = tr.update(car.pos[0], car.pos[2]); res.s = s;
    if (k % 120 === 0 && s > res.checkpoints.length * 100) res.checkpoints.push(t);
    let want = 0;      // Ausweichen: bei Gegenverkehr rechts halten, Vorausfahrer links überholen
    if (tf) for (const q of tf.cars) {
      if (!q.on) continue;
      const ahead = (q.sT - s) * (q.dir > 0 ? 1 : -1) * 1;      // >0: vor uns (in Fahrtrichtung der Strecke)
      if (q.dir < 0 && q.sT - s > 5 && q.sT - s < 90) want = Math.min(want, -0.9);
      else if (q.dir > 0 && ahead > 4 && ahead < 38 && q.speed < car.forwardSpeed - 3) want = Math.max(want, 0.9);
    }
    if (want > 0 && tf!.cars.some((q) => q.on && q.dir < 0 && q.sT - s > 5 && q.sT - s < 90)) want = 0;
    latOff += Math.max(-2.5 * DT, Math.min(2.5 * DT, want - latOff));
    const lat = o.line ? o.line(Math.min(c.length, s + (o.look ?? 2) + 0.45 * Math.max(0, car.forwardSpeed))) + latOff : latOff;   // Ideallinie
    let { steer, throttle, brake } = gripCmd(car, c.route, c.terrain, P, plan, s, o.aLat ?? 5.5, o.look ?? (o.line ? 2 : 7), car.airTime > 0.05, lat, !!o.line);
    if (tf) {      // vor einem Verkehrsauto in der eigenen Spur rechtzeitig bremsen (Kollisionszeit < 1,8 s)
      const f = car.forwardAxis(), fl = Math.hypot(f[0], f[2]) || 1, fx = f[0] / fl, fz = f[2] / fl;
      for (const q of tf.cars) {
        if (!q.on) continue;
        const dx = q.x - car.pos[0], dz = q.z - car.pos[2], g = dx * fx + dz * fz, l = Math.abs(dx * fz - dz * fx);
        const closing = car.forwardSpeed - (q.vx * fx + q.vz * fz);
        const gap = g - q.hz - P.size.l / 2, net = 'pc' in q;      // Netzverkehr: Bremsweg statt Kollisionszeit (der Bot ist dort bis 45 m/s schnell)
        if (g > 0 && g < (net ? 140 : 70) && l < P.size.w / 2 + q.hx - 0.1 && closing > 2 && (net ? gap < closing * closing / (2 * 5.5) + 5 : gap / closing < 1.4)) { throttle = 0; brake = Math.max(brake, 1); }
      }
    }
    if ((globalThis as any).BOTDBG && k % 30 === 0) console.log(t.toFixed(2), 's', s.toFixed(0), 'v', car.forwardSpeed.toFixed(1), 'steer', steer.toFixed(2), 'thr', throttle.toFixed(2), 'brk', brake.toFixed(2), 'air', car.airTime.toFixed(2), 'plan', plan[Math.floor(s + 8 + car.forwardSpeed * 0.4)].toFixed(1), 'pos', car.pos[0].toFixed(1), car.pos[2].toFixed(1));
    tf?.step(DT, car.pos[0], car.pos[2]);
    car.step({ steer, throttle, brake, handbrake: false }, DT);
    ob.step(car);
    res.maxAir = Math.max(res.maxAir, car.airTime);
    if (car.drowned) { res.drowned++; const q = c.recover(Math.max(6, s - 4))!; car.reset(q.x, q.z, q.yaw); }
    stuckT = k > 600 && Math.abs(car.forwardSpeed) < 0.3 ? stuckT + DT : 0;
    if (stuckT > 5) { stuckT = 0; res.stuck++; const q = c.recover(Math.max(6, s - 8))!; car.reset(q.x, q.z, q.yaw); }      // festgefahren (Baum/Mast): wie der Kran, ohne Strafzeit
    if (car.axes().u[1] < 0.2) { res.flips++; car.reset(...(Object.values(c.recover(Math.max(6, s - 4))!) as [number, number, number])); }
    for (let i = 0; i < c.stars.length; i++) if (!got[i] && Math.hypot(c.stars[i][0] - car.pos[0], c.stars[i][1] - car.pos[2]) < 2.8) { got[i] = 1; res.stars++; }
    res.maxLanding = Math.max(res.maxLanding, car.landing); car.landing = 0;
    o.onStep?.(car, s, t);
    cps.update(car.pos[0], car.pos[2], tr.maxS); res.cpLeft = cps.got.length - cps.got.reduce((a, b) => a + b, 0);
    if (c.free ? Math.hypot(c.goal!.x - car.pos[0], c.goal!.z - car.pos[2]) < FREE_GOAL_R : s >= c.goal!.s && tr.d < goalWidth(c) && cps.all) { res.finished = true; res.time = t; return res; }
  }
  res.time = max * DT; return res;
}

// ── Kehren-Vergleich Grip- vs. Drift-Linie ──
/** Synthetische Kehre: Gerade, Halbkreis (Radius R, Mitte der Straße), Gerade. s-Apex = Mitte des Bogens. */
export function hairpinRoute(R: number, d = 130, left = false): { route: Route; sApex: number; sEnd: number } {
  const pts: [number, number][] = [], sg = left ? -1 : 1;
  for (let z = 0; z >= -d; z -= 10) pts.push([0, z]);
  for (let a = 0.0; a <= Math.PI + 1e-6; a += Math.PI / 24) pts.push([sg * R * (1 - Math.cos(a)), -d - R * Math.sin(a)]);
  for (let z = -d + 10; z <= 0 + 1; z += 10) pts.push([sg * 2 * R, z]);
  const route = new Route(pts);
  return { route, sApex: d + Math.PI * R / 2, sEnd: d + Math.PI * R + d * 0.75 };
}

export interface DriftCtl { dEntry: number; vEntry: number; beta: number; thr0: number; kb: number; tHB: number; kp: number; kd: number; kv: number; kbs?: number; kt?: number }
export interface GripCtl { aLat: number; brake: number; look: number }
export interface SegOpts { v0: number; sApex: number; sEnd: number; maxSecs?: number; maxOff?: number; grip?: GripCtl; drift?: DriftCtl; trace?: (t: number, car: Vehicle, s: number) => void }
export interface SegResult { time: number; ok: boolean; maxSlip: number; minV: number; meanSlip: number; maxOff: number }

/** Fährt s=0 -> sEnd mit Startgeschwindigkeit v0; Zeit bis sEnd. Mit `drift`: vor der Kehre auf vEntry bremsen, einleiten (Lenkimpuls + Handbremse tHB),
 *  Schwimmwinkel per Gegenlenken (PD auf Kurs- und Winkelfehler) und Gas auf den Zielwinkel regeln, nach dem Scheitel zurück in die Grip-Fahrweise. */
export function driveSegment(route: Route, terrain: Terrain, P: CarParams, o: SegOpts): SegResult {
  const fake = { route, length: route.length, terrain } as unknown as Course;
  const car = new Vehicle(P, terrain); car.allowSleep = false;
  const a0 = route.at(0); car.reset(a0.x, a0.z, route.yawAt(0)); car.launch(o.v0);
  const g = o.grip ?? { aLat: 6, brake: 6, look: 7 }, plan = speedPlan(fake, g.aLat, 60, g.brake), tr = new Tracker(route);
  const f0 = route.at(o.sApex - 40), f1 = route.at(o.sApex + 40);
  const dd = Math.sign(f0.dx * f1.dz - f0.dz * f1.dx) || 1;   // +1 = Rechtskurve (Lenkung positiv = rechts, wie in gripCmd)
  let phase = o.drift ? 0 : 2, tDrift = 0, maxSlip = 0, sumSlip = 0, nSlip = 0, minV = 99, maxOff = 0;
  const max = (o.maxSecs ?? 30) / DT, dc = o.drift;
  for (let k = 0; k < max; k++) {
    const t = k * DT, s = tr.update(car.pos[0], car.pos[2]);
    maxOff = Math.max(maxOff, Math.abs(tr.d)); if (maxOff > (o.maxOff ?? 1e9)) return { time: 99, ok: false, maxSlip, minV, meanSlip: nSlip ? sumSlip / nSlip : 0, maxOff };
    const v = Math.max(0, car.forwardSpeed);
    let cmd: { steer: number; throttle: number; brake: number; handbrake?: boolean };
    const gc = gripCmd(car, route, terrain, P, plan, s, g.aLat, g.look, false);
    if (phase === 0 && dc) {
      const vt = Math.sqrt(dc.vEntry ** 2 + 2 * g.brake * Math.max(0, o.sApex - dc.dEntry - s));   // so spät bremsen, dass vEntry an der Einleitstelle erreicht ist
      cmd = { steer: gc.steer, throttle: v < vt - 0.5 ? 1 : 0, brake: v > vt + 0.7 ? Math.min(1, (v - vt) / 2) : 0 };
      if (s >= o.sApex - dc.dEntry) { phase = 1; tDrift = 0; }
    }
    if (phase === 1 && dc) {
      tDrift += DT;
      const look = 6 + 0.45 * v, tgt = route.at(Math.min(route.length, s + look)), f = car.forwardAxis();
      const ang = Math.atan2(f[0] * (tgt.z - car.pos[2]) - f[2] * (tgt.x - car.pos[0]), f[0] * (tgt.x - car.pos[0]) + f[2] * (tgt.z - car.pos[2]));
      const slip = car.slipAngle, slipDes = -dd * dc.beta;
      const e = (ang - slipDes) + dc.kv * (ang - slip), rate = -car.yawRate, st = P.steer, maxAng = Math.max(st.minAngle, st.maxAngle / (1 + (v / st.vRef) ** 2));
      let sr = dc.kp * e - dc.kd * rate;
      if (dc.kbs !== undefined) sr = slip + dc.kp * (ang - slip) + dc.kbs * (slip - slipDes) - dc.kd * rate;   // Vorderräder entlang der Bewegung (Gegenlenken = Schwimmwinkel) + Bahnkorrektur + Winkelregler; Gas regelt den Winkel
      if (tDrift < 0.25) sr = dd * 10;   // Einlenkimpuls
      cmd = { steer: Math.max(-1, Math.min(1, sr / maxAng)), throttle: Math.max(0, Math.min(1, dc.thr0 + (dc.kt ?? dc.kb) * (dc.beta - Math.abs(slip)))), brake: 0, handbrake: tDrift < dc.tHB };
      if (s > o.sApex && Math.abs(ang) < 0.15 && Math.abs(slip) < 0.2) phase = 2;
      maxSlip = Math.max(maxSlip, Math.abs(slip)); sumSlip += Math.abs(slip); nSlip++;
    }
    if (phase === 2) cmd = gc;
    car.step({ steer: cmd!.steer, throttle: cmd!.throttle, brake: cmd!.brake, handbrake: !!cmd!.handbrake }, DT);
    if (s > 10 && s < o.sEnd) minV = Math.min(minV, v);
    o.trace?.(t, car, s);
    if (car.axes().u[1] < 0.2) return { time: 99, ok: false, maxSlip, minV, meanSlip: nSlip ? sumSlip / nSlip : 0, maxOff };
    if (s >= o.sEnd) return { time: t, ok: true, maxSlip, minV, meanSlip: nSlip ? sumSlip / nSlip : 0, maxOff };
  }
  return { time: 99, ok: false, maxSlip, minV, meanSlip: nSlip ? sumSlip / nSlip : 0, maxOff };
}
export { FlatTerrain };
export type { Surface };

/** Kurs ab Weg-Meter s0 (Start dort, Rest unverändert): „schafft ein Auto den Rest, wenn es die erste Gabel geschafft hat?“ */
export function fromS(c: Course, s0: number): Course {
  const pts: [number, number][] = [];
  for (let s = s0; s < c.length; s += 2) { const q = c.route.at(s); pts.push([q.x, q.z]); }
  const e = c.route.at(c.length); pts.push([e.x, e.z]);
  const r = new Route(pts), a = r.at(0);
  return { ...c, route: r, length: r.length, start: { x: a.x, z: a.z, yaw: r.yawAt(0) }, goal: { ...c.goal!, s: r.length }, recover: (s: number) => { const q = r.at(Math.max(0, s)); return { x: q.x, z: q.z, yaw: r.yawAt(Math.max(0, s)) }; } };
}

import { describe, it, expect } from 'vitest';
import { Route } from '../src/level';
import { Traffic, GONE_DIST, gatesFrom, makeTraffic, type TCar } from '../src/traffic';
import { Movers } from '../src/movers';
import { Vehicle, DT } from '../src/physics/vehicle';
import { Obstacles } from '../src/physics/obstacles';
import { HATCHBACK_80S } from '../src/physics/params';
import { FlatTerrain, ASPHALT } from '../src/physics/terrain';
import { WORLDS } from '../src/levels';

const straight = () => new Route([[0, 0], [0, -900]]);          // s wächst nach -z, rechts = +x
const mkTraffic = (route: Route, density = 0, oncoming = 0, seed = 5) => new Traffic(route, 4.25, { density, oncoming }, 'city', seed);
/** Spieler + Verkehr wie im Spiel (Verkehr -> Auto -> Hindernisse) */
function sim(route: Route, tr: Traffic, secs: number, setup: (car: Vehicle) => void, inp: (t: number, car: Vehicle) => { steer: number; throttle: number; brake: number }, each?: (t: number, car: Vehicle) => void) {
  const car = new Vehicle(HATCHBACK_80S, new FlatTerrain(ASPHALT)); car.allowSleep = false; setup(car);
  const obst = new Obstacles([], []); obst.dynBoxes = tr.boxes;
  for (let k = 0; k < secs / DT; k++) {
    const t = k * DT;
    tr.step(DT, car.pos[0], car.pos[2]); car.step({ ...inp(t, car), handbrake: false }, DT); obst.step(car); each?.(t, car);
  }
  return car;
}
const place = (route: Route, car: Vehicle, s: number, lat: number, v: number) => { const [x, z] = route.offset(s, lat); car.reset(x, z, route.yawAt(s)); car.launch(v); };
const overlap = (a: TCar, b: TCar) => {
  for (const [ax, az] of [[Math.cos(a.yaw), -Math.sin(a.yaw)], [Math.sin(a.yaw), Math.cos(a.yaw)], [Math.cos(b.yaw), -Math.sin(b.yaw)], [Math.sin(b.yaw), Math.cos(b.yaw)]]) {
    const r = (c: TCar) => Math.abs(Math.cos(c.yaw) * ax - Math.sin(c.yaw) * az) * c.hx + Math.abs(Math.sin(c.yaw) * ax + Math.cos(c.yaw) * az) * c.hz;
    if (Math.abs((b.x - a.x) * ax + (b.z - a.z) * az) >= r(a) + r(b)) return false;
  }
  return true;
};

describe('Verkehr (Q1)', () => {
  it('Anschieben: Versatz begrenzt, Auto kehrt in die Spur zurück', () => {
    const R = straight(), tr = mkTraffic(R), c = tr.place(1, 200, 12)!;
    let maxErr = 0, hit = 0, late = 9;
    sim(R, tr, 14, (car) => place(R, car, 199, -0.2, 12), (t) => ({ steer: t > 0.3 && t < 3 ? 0.15 : 0, throttle: 0.3, brake: 0 }), (t) => { maxErr = Math.max(maxErr, c.err); if (c.err > 0.3) hit++; if (t > 7.9 && t < 8) late = c.err; });
    expect(hit, 'berührt').toBeGreaterThan(0);
    expect(maxErr).toBeLessThan(GONE_DIST);
    expect(late, 'zurück in der Spur').toBeLessThan(0.15);
    expect(Math.abs(c.yaw - Math.atan2(0, -1) * 0) % (2 * Math.PI)).toBeLessThan(0.1);
  });
  it('zwei Verkehrsautos stoßen nie zusammen (Spawn, Spuren, Kehren)', () => {
    for (const id of ['kehrenhang', 'neonallee']) {
      const course = WORLDS.flatMap((w) => w.levels).find((l) => l.id === id)!.make();
      const tr = new Traffic(course.route, course.roadWidth / 2, { density: 30, oncoming: 0.5 }, course.world, 11);
      let seen = 0, s = 6;
      for (let k = 0; k < 90 / DT; k++) {          // „Spieler“ fährt mit 22 m/s die Route ab
        s = Math.min(course.length - 40, 6 + 22 * k * DT); const p = course.route.at(s);
        tr.step(DT, p.x, p.z);
        const on = tr.cars.filter((c) => c.on);
        seen = Math.max(seen, on.length);
        for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) if (overlap(on[i], on[j])) throw new Error(`${id} t=${(k * DT).toFixed(1)} überlappen`);
      }
      expect(seen, id).toBeGreaterThan(3);
    }
  }, 60000);
  it('Spieler kann ein Auto nicht in ein anderes schieben: das andere bleibt unberührt, nichts fliegt', () => {
    const R = straight(), tr = mkTraffic(R), a = tr.place(1, 200, 12)!, b = tr.place(1, 200, 12, 1, 0.4)!;
    let maxV = 0, bErr = 0, aErr = 0;
    sim(R, tr, 8, (car) => place(R, car, 199, -4.2, 12), (t) => ({ steer: t > 0.3 && t < 1.25 ? -0.12 : 0, throttle: 0.3, brake: 0 }), () => { maxV = Math.max(maxV, Math.hypot(a.vx, a.vz), Math.hypot(b.vx, b.vz)); bErr = Math.max(bErr, b.err); aErr = Math.max(aErr, a.err); });
    expect(maxV, 'kein Wegfliegen').toBeLessThan(12 + 17 + 2);
    expect(aErr, 'A wurde wirklich angeschoben').toBeGreaterThan(0.2);
    expect(bErr, 'zweites Auto unberührt').toBeLessThan(0.05);
  });
  it('Frontalkontakt bremst den Spieler hart, aber kein Pinball', () => {
    const R = straight(), tr = mkTraffic(R), c = tr.place(-1, 330, 14, 0, -0.9)!;
    let vMin = 99, vAfter = 99, contact = -1, maxCarV = 0;
    sim(R, tr, 6, (car) => place(R, car, 250, -0.9, 30), () => ({ steer: 0, throttle: 0, brake: 0 }), (t, car) => {
      if (contact < 0 && Math.hypot(c.x - car.pos[0], c.z - car.pos[2]) < 4.5) contact = t;
      if (contact >= 0) { vMin = Math.min(vMin, car.forwardSpeed); if (t > contact + 1) vAfter = Math.min(vAfter, car.forwardSpeed); }
      maxCarV = Math.max(maxCarV, Math.hypot(c.vx, c.vz));
    });
    expect(contact, 'Kontakt').toBeGreaterThan(0);
    expect(vMin, 'bremst hart').toBeLessThan(20); expect(vMin, 'kein Rückwärtsschleudern').toBeGreaterThan(-3);
    expect(maxCarV).toBeLessThan(14 + 17 + 2);
  });
  it('deterministisch', () => {
    const run = () => {
      const R = straight(), tr = new Traffic(R, 4.25, { density: 25, oncoming: 0.4 }, 'rhein', 3);
      let h = 0;
      for (let k = 0; k < 3000; k++) { tr.step(DT, 0, -6 - k * 0.15); for (const c of tr.cars) if (c.on) h = (h * 31 + Math.round(c.x * 1e4) + Math.round(c.z * 1e4)) | 0; }
      return h;
    };
    expect(run()).toBe(run());
  });
});

describe('Verkehr (V): Schranke', () => {
  const crossing = () => new Movers(straight(), 4.25, [{ kind: 'crossing', s: 300, period: 60, phase: 0, len: 150 }]);   // Schranke zu etwa t = 2…13 s
  it('hält vor geschlossener Schranke (beide Richtungen), fährt nach dem Öffnen weiter, bleibt sichtbar', () => {
    const R = straight(), m = crossing(), tr = mkTraffic(R, 0, 0); tr.gates = gatesFrom(m);
    const a = tr.place(1, 200, 10)!, b = tr.place(-1, 410, 12)!;
    let vMax = 0, offA = false, offB = false, aStop = 1e9, bStop = 0, aGo = 0, bGo = 0;
    for (let k = 0; k < 26 / DT; k++) {
      const t = k * DT; m.step(DT); tr.step(DT, 20, -200);       // Spieler steht abseits bei s = 200
      offA ||= !a.on; offB ||= !b.on;
      if (t > 11.5 && t < 12.5) { aStop = Math.min(aStop, a.sT); bStop = Math.max(bStop, b.sT); vMax = Math.max(vMax, a.speed + b.speed); }
      if (t > 24) { aGo = a.sT; bGo = b.sT; }
    }
    expect(offA || offB, 'Autos bleiben da').toBe(false);
    expect(a.sT, 'Gleis überquert').toBeGreaterThan(310); expect(b.sT, 'Gleis überquert').toBeLessThan(290);
    expect(vMax, 'beide standen').toBeLessThan(0.5);
    expect(aStop, 'hielt vor dem Arm (Arm bei s = 293)').toBeLessThan(289);
    expect(bStop, 'Gegenverkehr hielt hinter dem Gleis').toBeGreaterThan(306);
    expect(aGo).toBeGreaterThan(310); expect(bGo).toBeLessThan(290);
  });
  it('spawnt nie zwischen Halt und Gleis', () => {
    const R = straight(), m = new Movers(R, 4.25, [{ kind: 'crossing', s: 450, period: 20, phase: 0 }]);
    const tr = new Traffic(R, 4.25, { density: 40, oncoming: 0.5 }, 'city', 9, [[405, 495]]); tr.gates = gatesFrom(m);
    const was = new Set<TCar>(); let bad = 0, seen = 0;
    for (let k = 0; k < 60 / DT; k++) {
      m.step(DT); tr.step(DT, 0, -50 - 15 * k * DT);      // Spieler fährt der Route entlang
      for (const c of tr.cars) { if (c.on && !was.has(c) && c.sT > 380 && c.sT < 520) bad++; if (c.on) { was.add(c); seen++; } else was.delete(c); }
    }
    expect(seen).toBeGreaterThan(50); expect(bad).toBe(0);
  });
});

describe('Verkehr (V): nicht verschwinden', () => {
  /** Auto 40 m neben die Spur gesetzt (weiter als GONE_DIST); Spieler schaut hin (fz = -1, Route läuft nach -z) oder weg */
  const run = (look: 1 | -1, hold = false) => {
    const R = straight(), tr = mkTraffic(R), c = tr.place(1, 250, 10)!;
    c.x += 40; let min = 1e9, off = false;
    for (let k = 0; k < 4 / DT; k++) {
      if (hold) c.x = 40 + (R.offset(c.sT, c.lat)[0]);        // festgehalten: hängt
      tr.step(DT, 0, -200, 0, -look); off ||= !c.on; if (c.on) min = Math.min(min, c.err);
    }
    return { off, min, on: c.on, sT: c.sT };
  };
  it('weit abgedrängt und im Blick: bleibt und findet zurück', () => { const r = run(1); expect(r.off).toBe(false); expect(r.min).toBeLessThan(30); });
  it('weit abgedrängt, aber außer Sicht (hinter dem Spieler): wird abgebaut', () => { expect(run(-1).on).toBe(false); });
  it('hängt > 5 s im Blick: bleibt; außer Sicht: weg', () => {
    const R = straight(), mk = (look: 1 | -1) => { const tr = mkTraffic(R), c = tr.place(1, 250, 10)!; let off = false;
      for (let k = 0; k < 8 / DT; k++) { c.x = R.offset(c.sT, c.lat)[0] + 5; c.z = R.offset(c.sT, c.lat)[1]; c.vx = c.vz = 0; tr.step(DT, 0, -200, 0, -look); off ||= !c.on; } return off; };
    expect(mk(1), 'im Blick').toBe(false); expect(mk(-1), 'außer Sicht').toBe(true);
  });
});

describe('Verkehr (V): Partikel statt Verschwinden', () => {
  it('sichtbares Abbauen am Streckenende und sichtbares Erscheinen melden sich (aus Sicht: still)', () => {
    const R = straight(), ev: string[] = [];
    const tr = new Traffic(R, 4.25, { density: 40 }, 'city', 3, [], 300, 6); tr.onFx = (_, m) => ev.push(m ? 'in' : 'out');
    const c = tr.place(1, R.length - 31, 15)!;
    tr.step(DT, 0, -(R.length - 120), 0, -1);        // Spieler schaut das Streckenende an: Auto ist im Bild -> löst sich auf
    for (let k = 0; k < 20; k++) tr.step(DT, 0, -(R.length - 120), 0, -1);
    expect(c.on).toBe(false); expect(ev).toContain('out');
    const d = tr.place(-1, 20.02, 10)!, n0 = ev.length;
    tr.step(DT, 0, 300, 0, 1);                        // Spieler weit weg und schaut weg -> Abbau ohne Effekt
    expect(d.on).toBe(false); expect(ev.length).toBe(n0);
  });
  it('Erscheinen im Bild: Auto baut sich ~0,5 s aus Partikeln auf (unsichtbar), dann fährt es', () => {
    const R = straight(), tr = new Traffic(R, 4.25, { density: 40, oncoming: 0.9 }, 'city', 3, [], 300, 6); let ins = 0, hid = 0;
    tr.onFx = (_, m) => { if (m) ins++; };
    for (let k = 0; k < 40 / DT; k++) { tr.step(DT, 0, -20 - 12 * k * DT, 0, -1); for (const c of tr.cars) if (c.on && c.build > 0) hid++; }
    expect(ins, 'Aufbau gemeldet').toBeGreaterThan(0); expect(hid).toBeGreaterThan(0);
    expect(tr.cars.filter((c) => c.on && c.build <= 0).length).toBeGreaterThan(2);
  });
});

describe('Verkehr (V): Schneepflug + Ausweichbucht (Gipfelpass)', () => {
  it('Gegenverkehr wartet in der Bucht, der Pflug fährt vorbei, keine Durchdringung, danach geht es weiter', () => {
    const course = WORLDS.flatMap((w) => w.levels).find((l) => l.id === 'etappe_schnee')!.make();
    const m = new Movers(course.route, course.roadWidth / 2, course.moverDefs, 0);
    const tr = makeTraffic({ ...course, traffic: { density: 40, oncoming: 0.9, speeds: [11, 17] } }, m)!;
    const plow = m.convoys[0]; let waited = 0, overlaps = 0, vanished = 0, sawBay = new Set<TCar>(), resumed = 0; const wasWaiting = new Set<TCar>();
    tr.onFx = (_, mode) => { if (mode === 0) vanished++; };
    for (let k = 0; k < 80 / DT; k++) {
      m.step(DT);
      const ps = plow.def.s0 + Math.min(m.t, (plow.def.s1 - plow.def.s0) / plow.def.speed) * plow.def.speed;
      const s = Math.max(6, ps - 90), p = course.route.at(s); tr.step(DT, p.x, p.z, p.dx, p.dz);      // Spieler fährt 90 m hinter dem Pflug her: der Gegenverkehr kommt ihm entgegen
      for (const c of tr.cars) {
        if (!c.on || c.dir > 0) continue;
        if (c.bay) { sawBay.add(c); if (c.speed < 0.3) { waited++; wasWaiting.add(c); } }
        else if (wasWaiting.has(c) && c.speed > 3) { resumed++; wasWaiting.delete(c); }
        if (plow.moving && Math.abs(c.sT - ps) < c.hz + 3.9 && Math.abs(c.lat - plow.def.lat) < c.hx + 1.75) overlaps++;
      }
    }
    expect(sawBay.size, 'Autos fuhren in Buchten').toBeGreaterThan(1);
    expect(waited, 'und warteten').toBeGreaterThan(50);
    expect(resumed, 'und fuhren danach weiter').toBeGreaterThan(0);
    expect(overlaps, 'Durchdringung des Pflugs').toBe(0);
    expect(vanished, 'nichts löste sich im Bild auf').toBe(0);
  }, 60000);
});

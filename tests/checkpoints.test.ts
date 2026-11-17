import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { driveBot } from '../tools/bot';
import { Run, CP_RADIUS, CP_SPACING, ARROW_DELAY } from '../src/run';
import { DT, Vehicle } from '../src/physics/vehicle';
import { pick } from './slow';

const LEVELS = WORLDS.filter((w) => w.id !== 'offroad').flatMap((w) => w.levels);   // Offroad: freie Wegwahl ohne Checkpoints (tests/offroad.test.ts)
const P = CARS[Object.keys(CARS)[0]];

/** Run durch Abfahren von Punkten (Weltkoordinaten); letzter Schritt = (x,z) */
const feed = (run: Run, pts: [number, number][], v = 20) => { for (const [x, z] of pts) run.update(DT, x, z, true, v, 0); };
const along = (run: Run, s0: number, s1: number, step = 4): [number, number][] => { const o: [number, number][] = []; for (let s = s0; s <= s1; s += step) { const a = run.course.route.at(s); o.push([a.x, a.z]); } const e = run.course.route.at(s1); o.push([e.x, e.z]); return o; };

describe('Checkpoints (Zeitrennen)', () => {
  it('Bot (Kompakter, mit Verkehr) verpasst auf keinem Level einen Checkpoint', () => {
    for (const lv of pick(LEVELS, ['loreley', 'etappe_stadt'])) {
      const c = lv.make(); if (!c.goal) continue;
      const r = driveBot(c, P, { traffic: true });
      expect(r.cpLeft, `${lv.id} @${Math.round(r.s)}`).toBe(0);
      expect(r.finished, lv.id).toBe(true);
    }
  }, 600000);

  it('Abstand ~125 m, nur im Zeitfahren vorhanden', () => {
    const c = LEVELS.find((l) => l.id === 'loreley')!.make();
    const t = new Run(c, 'time'), k = new Run(c, 'stars');
    expect(k.cps).toBeNull();
    const l = t.cps!.list;
    expect(l.length).toBeGreaterThan(5);
    for (let i = 1; i < l.length; i++) expect(l[i].s - l[i - 1].s).toBeGreaterThan(CP_SPACING * 0.75), expect(l[i].s - l[i - 1].s).toBeLessThan(CP_SPACING * 1.3);
  });

  it('Ganze Strecke abfahren = Sieg; Kehre abschneiden = kein Sieg, Hinweis, Pfeil zeigt zum verpassten Punkt; Sammeln (ohne Uhr) zählt weiter', () => {
    let tested = 0;
    for (const id of LEVELS.map((l) => l.id)) {
      const c = LEVELS.find((l) => l.id === id)!.make(), R = CP_RADIUS * c.roadWidth, route = c.route;
      const probe = new Run(c, 'time'), cps = probe.cps!.list;
      // Sprung a -> b: ein Punkt, dessen Umgebung (R+5) nur zwischen a und b befahren wird
      let best: { a: number; b: number; cp: number } | null = null;
      for (let k = 0; k < cps.length && !best; k++) {
        let nmin = Infinity, nmax = -Infinity;
        for (let q = 0; q <= c.length; q += 2) { const o = route.at(q); if (Math.hypot(o.x - cps[k].x, o.z - cps[k].z) < R + 5) { nmin = Math.min(nmin, q); nmax = Math.max(nmax, q); } }
        const a = nmin - 4, b = nmax + 4, pa = route.at(a), pb = route.at(b);
        if (a > 10 && b < c.length - 12 && b - a < 700 && b - a > 60 && Math.hypot(pa.x - pb.x, pa.z - pb.z) < 150) best = { a, b, cp: k };
      }
      if (!best) continue;
      tested++;
      const { a, b, cp } = best;
      const run = new Run(c, 'time');
      feed(run, along(run, 0, a)); feed(run, along(run, b, c.length - 8));
      expect(run.cps!.got[cp], `${id}`).toBe(0);
      expect(run.missed, id).toBe(cp);
      expect(run.missCount, id).toBeGreaterThan(0);
      expect(run.state, id + ' kein Sieg').toBe('run');
      expect(run.arrowOn, id).toBe(true);
      expect(run.aim.x).toBeCloseTo(cps[cp].x, 3);
      // zurück zum Punkt und wieder vor: dann zählt das Ziel
      feed(run, [...along(run, cps[cp].s - 20, cps[cp].s + 5), ...along(run, b, c.length - 8)]);
      expect(run.cps!.got[cp], id).toBe(1);
      expect(run.state, id + ' danach Sieg').toBe('won');
      const rl = new Run(c, 'stars'); feed(rl, [...along(rl, 0, a), ...along(rl, b, c.length - 8)]);
      expect(rl.state, id + ' Sammeln').toBe('won');
    }
    expect(tested).toBeGreaterThan(3);
  });
});

describe('Reihenfolge', () => {
  it('ein späterer Punkt zählt nicht, solange ein früherer offen ist; danach der Reihe nach', () => {
    const c = LEVELS.find((l) => l.id === 'waldweg')!.make(), run = new Run(c, 'time');
    const cps = run.cps!.list;
    feed(run, along(run, 0, cps[0].s - 40));
    feed(run, along(run, cps[1].s - 8, cps[1].s + 8, 2));   // Punkt 0 übersprungen, Punkt 1 angefahren
    expect(run.cps!.got[1]).toBe(0);
    expect(run.cps!.got[0]).toBe(0);
    feed(run, along(run, cps[0].s - 8, cps[0].s + 8, 2));    // zurück: 0 zählt
    expect(run.cps!.got[0]).toBe(1);
    expect(run.cps!.got[1]).toBe(0);
    feed(run, along(run, cps[1].s - 8, cps[1].s + 8, 2));
    expect(run.cps!.got[1]).toBe(1);
  });
});

describe('Kran-Reset und Checkpoints', () => {
  it('ohne Verpasstes 30 m vor den weitesten Punkt; mit verpasstem Punkt davor; nichts geschenkt, nichts verloren', () => {
    const c = LEVELS.find((l) => l.id === 'waldweg')!.make(), run = new Run(c, 'time');
    feed(run, along(run, 0, 130));
    expect(run.resetS()).toBeCloseTo(run.tracker.maxS - 30, 0);
    const got0 = [...run.cps!.got], cps = run.cps!.list;
    const k = cps.findIndex((q) => q.s > 200);   // Sprung über k hinweg (Punkt weit weg von der Linie 130 -> 330)
    const a = Math.max(130, cps[k].s - 60), b = cps[k].s + 60;
    run.update(DT, ...(Object.values(c.route.at(b)).slice(0, 2) as [number, number]), true, 20, 0);
    expect(run.missed).toBeGreaterThanOrEqual(0);
    const q = cps[run.missed];
    expect(run.resetS()).toBeLessThanOrEqual(q.s - 15 + 1e-6);
    // nach dem Reset an diese Stelle zählt der Punkt erst beim Durchfahren
    const rs = run.resetS(), r = c.route.at(rs);
    run.update(DT, r.x, r.z, true, r.dx * 20, r.dz * 20);
    expect(run.cps!.got[run.missed < 0 ? 0 : run.missed]).toBe(run.missed < 0 ? 1 : 0);
    for (let i = 0; i < got0.length; i++) if (got0[i]) expect(run.cps!.got[i]).toBe(1);
    void a;
    feed(run, along(run, rs, c.goal!.s));
    expect(run.cps!.all).toBe(true);
  });
});

describe('Kran am Berg', () => {
  it('Etappe Rheinbogen: vom Berg gefallen, Kran setzt oben (weitester Punkt − 30 m) ab, nicht unten', () => {
    const c = LEVELS.find((l) => l.id === 'etappe_rhein')!.make(), run = new Run(c, 'stars');
    const sHi = 1800; feed(run, along(run, 0, sHi, 6));
    // Absturzstelle: 45 m neben der Straße, 15–20 m tiefer; das Auto liegt dort wirklich auf dem Gelände (Physik, 3 s)
    const [x, z] = c.route.offset(sHi, -45), car = new Vehicle(P, c.terrain);
    car.reset(x, z, 0); for (let i = 0; i < 3 / DT; i++) car.step({ steer: 0, throttle: 0, brake: 0, handbrake: false }, DT);
    expect(c.terrain.height(c.route.at(sHi).x, c.route.at(sHi).z) - car.pos[1], 'liegt unten').toBeGreaterThan(8);
    run.update(DT, car.pos[0], car.pos[2], true, 0, 0);
    const s = run.resetS(), r = c.recover(s)!;
    expect(s).toBeCloseTo(run.tracker.maxS - 30, 0);
    expect(s).toBeGreaterThan(sHi - 40);
    expect(c.terrain.height(r.x, r.z), 'oben').toBeGreaterThan(car.pos[1] + 8);
  });
  it('Kehren (Weinberg): Auto unter der oberen Kehre, nächster Straßenpunkt ist die untere – Kran setzt trotzdem oben', () => {
    const c = LEVELS.find((l) => l.id === 'weinberg')!.make(), run = new Run(c, 'stars');
    let pair: [number, number] | null = null;
    for (let s = 300; s < c.length - 100 && !pair; s += 5) { const a = c.route.at(s); for (let q = s - 120; q > 100; q -= 5) { const b = c.route.at(q); if (Math.hypot(a.x - b.x, a.z - b.z) < 60) { pair = [q, s]; break; } } }
    expect(pair, 'Kehrenpaar').not.toBeNull();
    const [lo, hi] = pair!; feed(run, along(run, 0, hi, 6));
    const b = c.route.at(lo); run.update(DT, b.x, b.z, true, 0, 0);   // Auto liegt über der unteren Kehre
    expect(run.resetS()).toBeGreaterThan(hi - 40);
  });
});

describe('Richtungspfeil', () => {
  it('erscheint erst nach ~2 s falsch herum, verschwindet wieder, Sammeln nie', () => {
    const c = LEVELS.find((l) => l.id === 'waldweg')!.make();
    const mk = (m: 'time' | 'stars') => { const r = new Run(c, m); return r; };
    const pos = (s: number) => { const a = c.route.at(s); return [a.x, a.z, a.dx, a.dz] as const; };
    for (const m of ['time', 'stars'] as const) {
      const r = mk(m), [x, z, dx, dz] = pos(200); feed(r, along(r, 0, 200));
      for (let t = 0; t < ARROW_DELAY - 0.3; t += DT) r.update(DT, x, z, true, -dx * 15, -dz * 15);
      expect(r.arrowOn).toBe(false);
      for (let t = 0; t < 0.6; t += DT) r.update(DT, x, z, true, -dx * 15, -dz * 15);
      expect(r.arrowOn, m).toBe(m === 'time');
      if (m === 'time') {   // Ziel des Pfeils liegt voraus auf der Strecke
        expect(Math.hypot(r.aim.x - x, r.aim.z - z)).toBeGreaterThan(20);
        for (let t = 0; t < 1.2; t += DT) r.update(DT, x, z, true, dx * 15, dz * 15);
        expect(r.arrowOn).toBe(false);
      }
    }
  });
  it('weit neben der Strecke: Pfeil nach Verzögerung', () => {
    const c = LEVELS.find((l) => l.id === 'waldweg')!.make(), r = new Run(c, 'time'), a = c.route.at(200); feed(r, along(r, 0, 200));
    const lat = c.roadWidth * 2;
    for (let t = 0; t < ARROW_DELAY + 0.3; t += DT) r.update(DT, a.x + a.dz * lat, a.z - a.dx * lat, true, a.dx * 15, a.dz * 15);
    expect(r.arrowOn).toBe(true);
  });
});

// Welt Offroad: Registry, freie Wegwahl, der Jeep schafft jedes Level im Zeitkonto. Ob die anderen Autos durchkommen, ist egal und wird nicht geprüft.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { Route, type Course } from '../src/level';
import { Vehicle, DT } from '../src/physics/vehicle';
import { Obstacles } from '../src/physics/obstacles';
import { viaBranches } from '../src/levels/offroad';
import { Run, FREE_GOAL_R } from '../src/run';
import { driveBot } from '../tools/bot';
import { shortestPath } from '../tools/detour';
import { t, worldName, levelName, setLang } from '../src/i18n';

const W = WORLDS.find((w) => w.id === 'offroad')!;
const LONG = (id: string) => (id === 'steilhang' || id === 'moorwald' ? 220 : 150);   // der lange Steilhang braucht länger
/** Stern liegt auf einem Umweg (Matschgrube: dort holen ihn die Autos, die die Gruben meiden) */
const onBranch = (c: Course, x: number, z: number) => (c.branches ?? []).some((b) => b.route.nearestWithin(x, z, 3) !== null);

describe('Offroad: Auswahl', () => {
  it('Welt Offroad mit 5 Leveln, Übungsplatz/Platz weg, Namen DE/EN, Jeep wählbar', () => {
    expect(W.levels.map((l) => l.id)).toEqual(['matschgrube', 'huegel', 'furtwald', 'steilhang', 'moorwald']);
    expect(WORLDS.some((w) => w.id === 'practice') || WORLDS.flatMap((w) => w.levels).some((l) => l.id === 'uebungsplatz')).toBe(false);
    setLang('de'); expect(worldName('offroad')).toBe('Offroad'); expect(W.levels.map((l) => levelName(l.id))).toEqual(['Matschgrube', 'Hügel', 'Furtwald', 'Steilhang', 'Moorwald']);
    setLang('en'); expect(worldName('offroad')).toBe('Offroad'); expect(W.levels.map((l) => levelName(l.id))).toEqual(['Mud Pit', 'Hills', 'Ford Wood', 'Steep Slope', 'Bog Forest']);
    setLang('de');
    expect(Object.keys(CARS)).toContain('jeep');
    expect(t('go')).toBeTruthy();
  });
});

describe('Offroad: freie Wegwahl', () => {
  for (const lv of W.levels) it(`${lv.id}: nur Start und Ziel – keine Checkpoints, Pfeil zum Ziel, Ziel zählt auch abseits der Route, kein Verkehr`, () => {
    const c = lv.make(), run = new Run(c, 'time');
    expect(c.free).toBe(true); expect(c.traffic).toBeNull(); expect(run.cps).toBeNull();
    const g = c.goal!;
    run.update(0.1, c.start.x, c.start.z, true);
    expect(run.state).toBe('run'); expect(run.arrowOn).toBe(true); expect(run.aim).toEqual({ x: g.x, z: g.z });
    // weit abseits des guten Wegs, aber im Umkreis des Ziels -> gewonnen
    const off = c.route.nearest(g.x + FREE_GOAL_R - 1, g.z);
    run.update(0.1, g.x + FREE_GOAL_R - 1, g.z, true);
    expect(run.state).toBe('won'); expect(off.d).toBeLessThan(FREE_GOAL_R);
    expect(Math.hypot(g.x - c.stars[0][0], g.z - c.stars[0][1])).toBeGreaterThan(10);   // Sterne liegen auf dem Weg, nicht am Ziel
  });
  it('Zielentfernung treibt den Fortschrittsbalken; die Uhr beendet nichts', () => {
    const c = W.levels[0].make(), run = new Run(c, 'time'), g = c.goal!;
    run.update(0.1, c.start.x, c.start.z, true);
    run.update(0.1, (c.start.x + g.x) / 2, (c.start.z + g.z) / 2, true);
    expect(run.fraction).toBeGreaterThan(0.4); expect(run.fraction).toBeLessThan(0.6);
    run.update(c.timeBudget + 1, c.start.x, c.start.z, true);
    expect(run.state).toBe('run');   // Zeitfahren kennt kein Zeit-um
  });
});

// die Sterne sind Belohnungen AUF der schweren Linie – jeder liegt an einer schweren Stelle (Matsch/Furt, steil, Kuppe oder Senke),
// und wer die Linie mit dem Jeep fährt, holt sie
/** schwer = Matsch/Furt, Steigung ≥ 0,18 im Umkreis von 2 m, oder ≥ 0,7 m über/unter dem Mittel eines 8-m-Rings (Kuppe, Rinne, Becken) */
const hardSpot = (c: Course, x: number, z: number) => {
  const T = c.terrain, sf = T.surface(x, z).name, y = T.height(x, z);
  if (sf === 'Matsch' || sf === 'Furt') return true;
  let ring = 0, slope = 0;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, dx = Math.cos(a), dz = Math.sin(a); ring += T.height(x + 8 * dx, z + 8 * dz) / 8; slope = Math.max(slope, Math.abs(T.height(x + 2 * dx, z + 2 * dz) - y) / 2); }
  return slope >= 0.18 || Math.abs(y - ring) >= 0.7;
};
describe('Offroad: Sterne auf der schweren Linie', () => {
  const lineCourse = (c0: Course): Course => { const r = new Route(c0.jeepLine!); return { ...c0, route: r, length: r.length, goal: { ...c0.goal!, s: r.length }, recover: (s: number) => { const a = r.at(Math.max(0, s)); return { x: a.x, z: a.z, yaw: r.yawAt(Math.max(0, s)) }; } }; };
  for (const lv of W.levels) it(`${lv.id}: jeder Stern an einer schweren Stelle, der Jeep auf der Linie holt ≥ N−2`, () => {
    const c0 = lv.make(), N = c0.stars.length;
    expect(N).toBeGreaterThanOrEqual(9);
    for (const [x, z] of c0.stars) expect(hardSpot(c0, x, z) || onBranch(c0, x, z), `${lv.id} Stern (${x | 0},${z | 0}) liegt nicht an einer schweren Stelle`).toBe(true);
    const M = c0.stars.filter(([x, z]) => !onBranch(c0, x, z)).length;   // Umweg-Sterne holt die Jeep-Linie nicht
    const r = driveBot(lineCourse(c0), CARS.jeep, { maxSecs: LONG(lv.id), aLat: 2, vCap: 9 });
    expect(r.stars, `${lv.id} Jeep auf der schweren Linie`).toBeGreaterThanOrEqual(M - 2);
  });
});

describe('Offroad: Bot im Zeitkonto', () => {
  for (const lv of W.levels) it(`${lv.id}: der Jeep erreicht das Ziel auf dem guten Weg im Zeitkonto`, () => {
    const c = lv.make();
    for (const [id, P] of [['jeep', CARS.jeep]] as const) {
      const r = driveBot(c, P, { maxSecs: LONG(lv.id) });
      const budget = c.timeBudgets?.[id] ?? c.timeBudget;
      expect(r.finished, `${lv.id} ${id}`).toBe(true);
      expect(r.time, `${lv.id} ${id}`).toBeLessThan(budget);
      expect(r.drowned + r.flips, `${lv.id} ${id}`).toBe(0);
    }
  });
  it('Hügel: die Direktlinie über die Kuppen und Rinnen ist für den Jeep nie schneller als der gute Weg', () => {
    const c0 = W.levels[1].make(), a = c0.route.at(0), b = c0.route.at(c0.route.length);
    const direct = new Route([[a.x, a.z], [b.x, b.z]]);
    const c = { ...c0, route: direct, length: direct.length, goal: { ...c0.goal!, s: direct.length } };
    const g = driveBot(c0, CARS.jeep, { maxSecs: 90 }), d = driveBot(c, CARS.jeep, { maxSecs: 90 });
    expect(g.finished).toBe(true);
    expect(!d.finished || d.time > g.time * 1.3, `direkt ${d.time} Weg ${g.time}`).toBe(true);
  });
});

// Die Umwege sind zu. Die kürzesten Wege (vor den Sperren, vom Raster-Suchlauf gemessen) fahren Bots weiter – sie kommen nicht
// schneller ans Ziel als auf dem guten Weg (oder gar nicht). Dazu: der kürzeste befahrbare Weg ist nicht nennenswert kürzer als der gute.
const OLD: Record<string, [number, number][][]> = {
  matschgrube: [],   // Gruben mit Umwegen: tests/matschgrube.test.ts
  huegel: [],   // Wege lang, Korridor ±12 m zwischen Fels- und Baumreihen
  furtwald: [],   // Gabel: Furt | flache Furt; Wände halten den Rest zu
  steilhang: [],   // Äste und Abkürzungen: tests/steilhang.test.ts
  moorwald: [],   // tests/moorwald.test.ts
};
describe('Offroad: Umwege geschlossen', () => {
  for (const lv of W.levels) it(`${lv.id}: kürzester befahrbarer Weg ≥ 90 % des guten Wegs, alte Umwege bringen dem Jeep keinen Vorteil`, () => {
    const c0 = lv.make();
    expect(shortestPath(c0).len, 'kürzester Weg ohne Matsch').toBeGreaterThan(c0.length * 0.9);
    const way = driveBot(c0, CARS.jeep, { maxSecs: LONG(lv.id) }).time;
    for (const pts of OLD[lv.id]) {
      const r = new Route(pts), c = { ...c0, route: r, length: r.length, goal: { ...c0.goal!, s: r.length } };
      const d = driveBot(c, CARS.jeep, { maxSecs: LONG(lv.id) });
      expect(!d.finished || d.time > way * 0.97, `${lv.id}: alter Umweg ${d.time.toFixed(1)} s, Weg ${way.toFixed(1)} s`).toBe(true);
    }
  });
});

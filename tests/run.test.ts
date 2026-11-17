import { describe, it, expect } from 'vitest';
import { makeMeadowCourse } from './meadow';
import { Run, goalWidth, type Mode } from '../src/run';
import { Vehicle, DT } from '../src/physics/vehicle';
import { HATCHBACK_80S } from '../src/physics/params';

/** Vollgas geradeaus, bis die Fahrt endet (oder maxSecs) */
const drive = (mode: Mode, maxSecs = 40) => {
  const course = makeMeadowCourse();
  const car = new Vehicle(HATCHBACK_80S, course.terrain), run = new Run(course, mode);
  car.reset(course.start.x, course.start.z, course.start.yaw);
  let t = 0;
  while (!run.over && t < maxSecs) { car.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT); run.update(DT, car.pos[0], car.pos[2], true); t += DT; }
  return { run, t };
};

describe('Spielziel', () => {
  it('Zeitfahren: Ziel erreicht, Fahrzeit steht und bleibt nach dem Ziel stehen; keine Sterne', () => {
    const { run } = drive('time'), el = run.elapsed;
    expect(run.state).toBe('won'); expect(el).toBeGreaterThan(1);
    expect(run.stars).toBe(0);
    run.update(5, 0, 0, true);
    expect(run.elapsed).toBe(el);
  });
  it('Zeitfahren: kein Zeit-um, egal wie lange die Fahrt dauert', () => {
    const course = makeMeadowCourse(), run = new Run(course, 'time');
    run.update(0.01, course.start.x, course.start.z, true);
    for (let i = 0; i < 100; i++) run.update(10, course.start.x, course.start.z, true);   // 1000 s auf der Stelle
    expect(run.state).toBe('run'); expect(run.elapsed).toBeGreaterThan(900);
  });
  it('Zeitfahren: ein Stern in Reichweite zählt nicht', () => {
    const course = makeMeadowCourse(), run = new Run(course, 'time'), s = course.stars[0];
    run.update(0.01, course.start.x, course.start.z, true);
    expect(run.update(0.01, s[0], s[1], true)).toEqual([]); expect(run.stars).toBe(0);
  });
  it('Sammeln: Sterne zählen, das Ziel beendet die Fahrt', () => {
    const { run } = drive('stars');
    expect(run.state).toBe('won'); expect(run.stars).toBeGreaterThan(0);
  });
  it('Kran-Strafe: im Zeitfahren +3 s Fahrzeit nach dem Start, vorher und beim Sammeln keine', () => {
    const t = new Run(makeMeadowCourse(), 'time'), r = new Run(makeMeadowCourse(), 'stars');
    expect(t.penalize()).toBe(0);
    t.update(1, 0, 0, true); r.update(1, 0, 0, true);
    const e = t.elapsed; expect(t.penalize()).toBe(3); expect(t.elapsed - e).toBe(3);
    const re = r.elapsed; expect(r.penalize()).toBe(0); expect(r.elapsed).toBe(re);
  });
  it('Ziel zählt auch 1,5 Straßenbreiten neben der Mitte, nicht 3', () => {
    for (const [k, won] of [[1.5, true], [3, false]] as const) {
      const c = makeMeadowCourse(), run = new Run(c, 'stars'), g = c.route.at(c.goal!.s);
      run.update(DT, c.start.x, c.start.z, true);
      run.update(DT, g.x + g.dz * c.roadWidth * k, g.z - g.dx * c.roadWidth * k, true);
      expect(run.state === 'won', `k=${k}`).toBe(won);
    }
    expect(goalWidth({ roadWidth: 9 })).toBe(18);
  });
  it('Uhr startet erst beim Losfahren', () => {
    const course = makeMeadowCourse(), run = new Run(course, 'time');
    for (let i = 0; i < 600; i++) run.update(DT, 0, 8, false);
    expect(run.state).toBe('ready'); expect(run.elapsed).toBe(0);
  });
});

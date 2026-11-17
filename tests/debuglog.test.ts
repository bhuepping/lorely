// Debug-Log: Ringpuffer, Textformat, Lage, Auffälligkeiten – über die öffentliche Schnittstelle, ohne Browser.
import { describe, it, expect } from 'vitest';
import { Ring, DebugLog, formatLog, attitude, TRACE_DT, type Frame } from '../src/debuglog';

const frame = (o: Partial<Frame> = {}): Frame => ({ dt: 1 / 60, pos: [0, 1, 0], vel: [10, 0, 0], q: [0, 0, 0, 1], omega: [0, 0, 0, 0], ground: 0, kmh: 36, gas: 1, steer: 0, surf: 'Asphalt', ...o });
function log(): { d: DebugLog; clock: { t: number } } {
  const d = new DebugLog(), clock = { t: 1000 };
  d.now = () => clock.t; d.on = true;
  d.begin({ Level: 'test (city)', Auto: 'hatch' });
  return { d, clock };
}
/** n Bilder à dt, Auto fährt gleichmäßig in +x */
function drive(d: DebugLog, clock: { t: number }, secs: number, f: (i: number) => Partial<Frame> = () => ({})) {
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) { clock.t += 1000 / 60; d.frame(frame({ pos: [i * 10 / 60, 1, 0], ...f(i) })); }
}

describe('Ring', () => {
  it('behält die neuesten, zählt Verworfene, Reihenfolge stimmt', () => {
    const r = new Ring<number>(3);
    for (let i = 1; i <= 5; i++) r.push(i);
    expect(r.toArray()).toEqual([3, 4, 5]); expect(r.dropped).toBe(2);
  });
});

describe('attitude', () => {
  it('Gier/Nick/Wank aus dem Quaternion', () => {
    const half = (deg: number) => (deg * Math.PI) / 360;
    expect(attitude([0, 0, 0, 1])).toMatchObject({ yaw: 0 });
    expect(attitude([0, Math.sin(half(90)), 0, Math.cos(half(90))]).yaw).toBeCloseTo(90, 3);   // wie Vehicle.reset(yaw)
    expect(attitude([Math.sin(half(20)), 0, 0, Math.cos(half(20))]).pitch).toBeCloseTo(20, 3);  // Nase hoch um X
    expect(attitude([0, 0, Math.sin(half(30)), Math.cos(half(30))]).roll).toBeCloseTo(-30, 3);
  });
});

describe('Aufzeichnung', () => {
  it('ausgeschaltet: nichts im Puffer, auch kein Kopf', () => {
    const d = new DebugLog(); d.on = false;
    d.begin({ Level: 'x' }); d.ev('pause'); d.frame(frame());
    const t = d.text();
    expect(t).toContain('Ereignisse: 0'); expect(t).not.toContain('pause'); expect(t).toContain('(0 Zeilen)');
  });

  it('Fahrt mit Kran: Ereignisse in Reihenfolge, Zeit ab Rennstart, Spur alle 0,2 s', () => {
    const { d, clock } = log();
    clock.t += 2000; d.ev('gruen');
    drive(d, clock, 1);
    d.ev('kran', '+3 s'); d.teleported();
    drive(d, clock, 0.5, (i) => ({ pos: [500 + i / 6, 1, 0] }));   // Sprung durch den Kran ist gewollt
    d.ev('pause'); d.ev('weiter'); d.ev('ende', 'won');
    const t = d.text();
    const kinds = [...t.matchAll(/^\s*[+-]\d+\.\d+\s+(\S+)/gm)].map((m) => m[1]);
    expect(kinds).toEqual(['start', 'gruen', 'kran', 'pause', 'weiter', 'ende']);
    expect(t).toMatch(/\+2\.00\s+gruen/); expect(t).toMatch(/\+3\.00\s+kran/);
    expect(t).toContain('Level: test (city)'); expect(t).toContain('Version: ');
    expect(t).not.toContain('physik:');
    const csv = t.split('t,x,y,z,kmh,yaw,pitch,roll,gas,steer,surf\n')[1].trim().split('\n');
    expect(csv.length).toBe(Math.floor(1.5 / TRACE_DT) + 1);
    expect(csv[1]).toMatch(/^2\.2\d,2\.\d,1\.0,0\.0,36,0,0,0,1\.00,0\.00,Asphalt$/);
  });

  it('Spur hält nur die letzten 2 min', () => {
    const { d, clock } = log();
    drive(d, clock, 130);
    const rows = d.text().split('surf\n')[1].trim().split('\n');
    expect(rows.length).toBe(600);
    expect(Number(rows[599].split(',')[0]) - Number(rows[0].split(',')[0])).toBeGreaterThan(120);   // frameweises Raster (60 fps: 0,217 s) -> mindestens 2 min
  });

  it('Physik-Auffälligkeiten: NaN, Sprung, unter Gelände, Energiegewinn; je Art nicht öfter als 1/s', () => {
    const { d, clock } = log();
    drive(d, clock, 0.5);
    clock.t += 17; d.frame(frame({ pos: [999, 1, 0] }));                         // Sprung
    clock.t += 17; d.frame(frame({ pos: [999, -3, 0], ground: 0 }));             // unter Gelände
    clock.t += 17; d.frame(frame({ pos: [999, -3, 0], ground: 0 }));             // gleiche Art direkt wieder: unterdrückt
    clock.t += 17; d.frame(frame({ pos: [999.2, 1, 0], vel: [60, 0, 0] }));      // Energie schlagartig hoch
    clock.t += 17; d.frame(frame({ pos: [NaN, 1, 0] }));                         // NaN
    const t = d.text();
    for (const k of ['sprung', 'unter-gelaende', 'energie', 'nan']) expect(t, k).toContain('physik:' + k);
    expect(t.match(/physik:unter-gelaende/g)).toHaveLength(1);
  });

  it('JS-Fehler zählen auch außerhalb der Fahrt; sonst nur während der Fahrt', () => {
    const { d } = log();
    d.end(); d.ev('pause'); d.ev('fehler', 'boom @x.js:1');
    const t = d.text();
    expect(t).toContain('fehler  boom'); expect(t).not.toContain('pause');
  });

  it('Ringpuffer der Ereignisse: Überlauf wird im Kopf gemeldet', () => {
    const t = formatLog({ Level: 'x' }, [{ t: 1, kind: 'a', text: '' }], [], 7);
    expect(t).toContain('(+7 ältere verworfen)');
  });
});

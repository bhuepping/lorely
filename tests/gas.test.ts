// Träges Gas über die echte Eingabeschicht: Taste rein (keydown/keyup), read() raus, gesteuerte Uhr.
import { describe, it, expect, beforeEach } from 'vitest';
import { Controls } from '../src/input';

type Listener = (e: any) => void;
function target() {
  const m = new Map<string, Listener[]>();
  return {
    addEventListener: (t: string, f: Listener) => { m.set(t, [...(m.get(t) ?? []), f]); },
    fire: (t: string, e: any) => { for (const f of m.get(t) ?? []) f(e); },
  };
}

let win: ReturnType<typeof target>;
let now = 0;
let ctl: Controls;
const down = (code: string) => win.fire('keydown', { code, repeat: false, preventDefault() {} });
const up = (code: string) => win.fire('keyup', { code, preventDefault() {} });
/** liest read() in 10-ms-Schritten, `d` Sekunden lang, und gibt die Gaswerte zurück */
function run(d: number): number[] {
  const out: number[] = [];
  const end = now + d;
  while (now < end - 1e-9) { now += 0.01; out.push(ctl.read().throttle); }
  return out;
}

beforeEach(() => {
  win = target();
  (globalThis as any).window = { addEventListener: win.addEventListener, innerWidth: 800, innerHeight: 600 };
  (globalThis as any).document = { addEventListener: () => {} };
  now = 0;
  ctl = new Controls();
  ctl.clock = () => now;
  ctl.read();
});

describe('träges Gas (Tastatur)', () => {
  it('halten 0,5 s = Vollgas', () => {
    down('ArrowUp');
    run(0.25);
    expect(ctl.read().throttle).toBeCloseTo(0.5, 1);
    run(0.25);
    expect(ctl.read().throttle).toBeCloseTo(1, 5);
  });

  it('Loslassen nach Vollgas: nach 0,2 s bei 0', () => {
    down('KeyW');
    run(0.6);
    up('KeyW');
    run(0.1);
    expect(ctl.read().throttle).toBeCloseTo(0.5, 1);
    run(0.2);
    expect(ctl.read().throttle).toBe(0);
  });

  it('Tippen 0,15 s an / 0,15 s aus über 2 s: Mittel (Erwartung 0,3–0,5)', () => {
    const vals: number[] = [];
    for (let i = 0; i < 7; i++) {
      down('ArrowUp'); vals.push(...run(0.15)); up('ArrowUp'); vals.push(...run(0.15));
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    // Raten 2/s hoch, 5/s runter: pro Tipp bis 0,3, Mittel ≈ 0,1
    expect(Math.max(...vals)).toBeCloseTo(0.3, 1);
    expect(mean).toBeGreaterThan(0.05);
    expect(mean).toBeLessThan(0.2);
  });

  it('Pause/Reset: kein Restgas beim Weitermachen', () => {
    down('ArrowUp');
    run(0.6);
    ctl.releaseAll();
    up('ArrowUp');
    expect(ctl.read().throttle).toBe(0);
    down('ArrowUp');
    run(0.02);
    expect(ctl.read().throttle).toBeLessThan(0.1);
  });
});

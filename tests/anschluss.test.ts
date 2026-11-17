// Vorstadt-Brücken schließen bündig an – Höhe der Fahrbahn rund um jedes Deck ohne Sprung (Mitte und beide Seiten), Auto fährt drüber ohne Abheben und ohne Radlast-Ruck.
import { describe, it, expect } from 'vitest';
import { buildCourse, type LevelDef } from '../src/level';
import { CARS } from '../src/physics/params';
import { Vehicle, DT } from '../src/physics/vehicle';
import V from '../src/levels/etappe_vorstadt.json';

const c = buildCourse(V as unknown as LevelDef);

describe('Vorstadt: Brückenanschlüsse', () => {
  c.bridges.forEach((b, i) => {
    it(`Brücke ${i}: Fahrbahnhöhe vor/auf/nach dem Deck springt nicht (Mitte, ±0,8 Halbbreite)`, () => {
      for (const lat of [0, b.half * 0.8, -b.half * 0.8]) {
        let prev = NaN, worst = 0;
        for (let s = b.s0 - 15; s <= b.s1 + 15; s += 0.5) { const [x, z] = b.route.offset(s, lat), h = c.terrain.height(x, z); if (!Number.isNaN(prev)) worst = Math.max(worst, Math.abs(h - prev)); prev = h; }
        expect(worst, `Brücke ${i} lat ${lat.toFixed(1)}`).toBeLessThan(0.08);
      }
    });
    it(`Brücke ${i}: Auto fährt mit 16 m/s drüber (Mitte und seitlich) – bleibt am Boden, Radlast ohne Ruck`, () => {
      for (const car of ['hatch', 'rally'] as const) for (const lat of [0, 3.5, -3.5]) {
        const v = new Vehicle(CARS[car], c.terrain); v.allowSleep = false;
        const s0 = b.s0 - 40, a = b.route.offset(s0, lat); v.reset(a[0], a[1], b.route.yawAt(s0)); v.launch(16);
        let air = 0, worstAir = 0, dComp = 0, prev: number[] | null = null;
        for (let k = 0; k < 6 * 120; k++) {
          const h = b.route.nearest(v.pos[0], v.pos[2]), f = v.forwardAxis(), want = b.route.yawAt(Math.min(b.route.length, h.s + 6)), d = Math.atan2(-f[0], -f[2]) - want;
          const tgt = b.route.offset(Math.min(b.route.length, h.s + 6), lat), e = Math.atan2(f[0] * (tgt[1] - v.pos[2]) - f[2] * (tgt[0] - v.pos[0]), f[0] * (tgt[0] - v.pos[0]) + f[2] * (tgt[1] - v.pos[2]));
          void d; v.step({ steer: Math.max(-1, Math.min(1, 1.5 * e)), throttle: v.forwardSpeed < 16 ? 0.6 : 0, brake: 0, handbrake: false }, DT);
          if (h.s > b.s0 - 20 && h.s < b.s1 + 20) {
            air = v.contact.some(Boolean) ? 0 : air + DT; worstAir = Math.max(worstAir, air);
            if (prev) dComp = Math.max(dComp, ...v.compression.map((q, j) => Math.abs(q - prev![j]))); prev = [...v.compression];
          }
        }
        expect(worstAir, `${car} lat ${lat}`).toBeLessThan(0.05);
        expect(dComp, `${car} lat ${lat}: Federweg-Sprung je Schritt`).toBeLessThan(0.03);
      }
    });
  });
});

describe('Vorstadt: Holzstege an der Au', () => {
  const stege = c.suburb!.houses.filter((h) => h.kind === 'steg');
  it('zwei Stege; die Enden liegen bündig am Boden (≤ 8 cm), die Mitte wölbt sich flach', async () => {
    const { stegProfile } = await import('../src/suburb');
    expect(stege.length).toBe(2);
    for (const h of stege) {
      const p = stegProfile(c.terrain, h);
      for (const e of [-1, 1]) expect(Math.abs(p.yAt(e * p.L) - p.gy(e * p.L)), `Steg bei ${h.x.toFixed(0)},${h.z.toFixed(0)} Ende ${e}`).toBeLessThan(0.08);
      expect(p.yAt(0) - (p.gy(-p.L) + p.gy(p.L)) / 2).toBeGreaterThan(h.h * 0.9);
    }
  });
});

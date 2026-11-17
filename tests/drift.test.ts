// Gekonnter Drift zahlt sich auf losem Untergrund in der Kehre leicht aus; Übertreiben (Dauer-Handbremse, riesiger Winkel) nicht.
// Fahrer: tools/bot.ts driveSegment (Grip-Linie = Pure Pursuit mit Tempoplan; Drift = späteres Bremsen, Lenkimpuls + Handbremse-Tipp, Gegenlenken, Gas).
// Die Parameter stammen aus der Suche in tools/drift.test.ts (DRIFT=1 ...), Halbkreis R = 14 m, Start mit 22 m/s, Schnee.
import { describe, it, expect } from 'vitest';
import { CARS } from '../src/physics/params';
import { SNOW } from '../src/physics/terrain';
import { driveSegment, hairpinRoute, FlatTerrain, type DriftCtl, type GripCtl } from '../tools/bot';

const FIT: Record<string, { grip: GripCtl; drift: DriftCtl }> = {
  rally: { grip: { aLat: 10.068, brake: 4, look: 8 }, drift: { dEntry: 5.284, vEntry: 6.274, beta: 0.15, thr0: 0.4, kb: 0, tHB: 0.314, kp: 2, kd: 0.15, kv: 0.7, kt: 1 } },   // neu gesucht nach (Anfahrkupplung)
  buggy: { grip: { aLat: 7.327, brake: 4, look: 8.409 }, drift: { dEntry: 6.72, vEntry: 7.619, beta: 0.15, thr0: 0.4, kb: 0, tHB: 0.25, kp: 2, kd: 0.15, kv: 0.7, kt: 1.4 } },   // neu gesucht nach (Anfahrkupplung)
};
const run = (id: string, drift?: DriftCtl) => {
  const { route, sApex, sEnd } = hairpinRoute(14);
  return driveSegment(route, new FlatTerrain(SNOW), CARS[id], { v0: 22, sApex, sEnd, grip: FIT[id].grip, drift, maxOff: 8, maxSecs: 40 });
};

describe('Drift in der Kehre (Schnee, R 14 m)', () => {
  for (const id of ['rally', 'buggy']) {
    it(`${id}: kontrollierte Drift-Linie schneller als Grip-Linie, Übertreiben langsamer`, () => {
      const grip = run(id), drift = run(id, FIT[id].drift);
      const over = run(id, { ...FIT[id].drift, beta: 0.9, tHB: 1.6, vEntry: FIT[id].drift.vEntry * 1.3 });
      console.log(`${id}: Grip ${grip.time.toFixed(2)} s, Drift ${drift.time.toFixed(2)} s (max ${(drift.maxSlip * 57.3).toFixed(0)}°), übertrieben ${over.ok ? over.time.toFixed(2) : 'DNF'} s (max ${(over.maxSlip * 57.3).toFixed(0)}°)`);
      expect(grip.ok && drift.ok).toBe(true);
      expect(drift.maxSlip).toBeGreaterThan(0.17);      // wirklich ein Drift (> 10°)
      expect(drift.maxSlip).toBeLessThan(0.5);          // und kein Übertreiben (< 29°)
      expect(drift.time).toBeLessThan(grip.time * 0.985);   // mind. 1,5 % schneller
      if (over.ok) expect(over.maxSlip).toBeGreaterThan(drift.maxSlip * 1.3);   // deutlich mehr Winkel; mit der Anfahrkupplung kommt das Übertreiben meist gar nicht mehr durch (Bot verlässt die Strecke > 8 m)
      expect(over.ok ? over.time : 99).toBeGreaterThan(drift.time * 1.05);   // Übertreiben zahlt sich nicht aus (schwache TC, Buggy ≈ gleich schnell wie Grip-Linie, nicht langsamer)
    });
  }
});

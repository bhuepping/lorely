// Drift-Vergleich: DRIFT=1 npx vitest run tools/drift.test.ts --reporter=verbose --disableConsoleIntercept
import { it } from 'vitest';
import { CARS } from '../src/physics/params';
import { ASPHALT, GRAVEL, SNOW, WET_ASPHALT, WET_SAND, ICE, SOFT_SAND, GRASS, type Surface } from '../src/physics/terrain';
import { driveSegment, hairpinRoute, FlatTerrain, type DriftCtl, type GripCtl } from './bot';

let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const U = (a: number, b: number) => a + (b - a) * rnd();
const SURF: Record<string, Surface> = { softsand: SOFT_SAND, grass: GRASS, snow: SNOW, gravel: GRAVEL, asphalt: ASPHALT, wetsand: WET_SAND, wetasphalt: WET_ASPHALT, ice: ICE };

export function searchGrip(sf: Surface, car: string, R: number) {
  const { route, sApex, sEnd } = hairpinRoute(R), tf = new FlatTerrain(sf), P = CARS[car];
  let best = { t: 99, g: null as GripCtl | null };
  const v0 = Number(process.env.V0 ?? 20);
  for (let aLat = 3; aLat <= 12; aLat += 0.75) for (const brake of [4, 6, 8]) for (const look of [3, 5, 8]) {
    const g: GripCtl = { aLat, brake, look };
    const r = driveSegment(route, tf, P, { v0, sApex, sEnd, grip: g, maxOff: 8 });
    if (r.ok && r.time < best.t) best = { t: r.time, g };
  }
  // Feinabstieg (gleiche Mühe wie beim Drift-Fahrer)
  for (let pass = 0; pass < 6 && best.g; pass++) for (const [k, lo, hi] of [['aLat', 2, 14], ['brake', 3, 10], ['look', 2, 12]] as [keyof GripCtl, number, number][]) for (const sgn of [-1, 1]) {
    const g = { ...best.g, [k]: Math.max(lo, Math.min(hi, best.g[k] + sgn * (hi - lo) * 0.06 * Math.pow(0.6, pass))) } as GripCtl;
    const r = driveSegment(route, tf, P, { v0, sApex, sEnd, grip: g, maxOff: 8 });
    if (r.ok && r.time < best.t) best = { t: r.time, g };
  }
  return best;
}
const KEYS: (keyof DriftCtl)[] = ['dEntry', 'vEntry', 'beta', 'thr0', 'tHB', 'kp', 'kd', 'kv', 'kt'];
const LIM: Record<string, [number, number]> = { dEntry: [4, 45], vEntry: [4, 30], beta: [0.05, 0.9], thr0: [0, 1], tHB: [0, 0.8], kp: [0.3, 5], kd: [0, 0.6], kv: [0, 2], kt: [0, 5] };
export type Accept = (r: { maxSlip: number; meanSlip: number }) => boolean;
export function searchDrift(sf: Surface, car: string, R: number, fixBeta?: number, grip?: GripCtl, accept: Accept = () => true) {
  const { route, sApex, sEnd } = hairpinRoute(R), tf = new FlatTerrain(sf), P = CARS[car];
  const v0 = Number(process.env.V0 ?? 20), vg = Math.sqrt(1.3 * 9.81 * sf.mu * R);
  let best = { t: 99, d: null as DriftCtl | null, r: null as any };
  const ev = (d: DriftCtl) => {
    const r = driveSegment(route, tf, P, { v0, sApex, sEnd, grip, drift: d, maxOff: 8, maxSecs: 26 });
    const ok = r.ok && accept(r);
    if (ok && r.time < best.t) best = { t: r.time, d, r }; return ok ? r.time : 99;
  };
  const tops: { t: number; d: DriftCtl }[] = [];
  for (const dEntry of [10, 16, 22, 30]) for (const fv of [0.7, 0.85, 1.0, 1.15]) for (const beta of fixBeta !== undefined ? [fixBeta] : [0.15, 0.25, 0.35]) for (const thr0 of [0.4, 0.8]) for (const tHB of [0, 0.25]) {
    const d: DriftCtl = { dEntry, vEntry: fv * vg, beta, thr0, kb: 0, tHB, kp: 2, kd: 0.15, kv: 0.7, kt: 1 };
    const t = ev(d); if (t < 99) { tops.push({ t, d }); }
  }
  tops.sort((a, b) => a.t - b.t);
  // Koordinaten-Abstieg ab den 3 besten
  for (const start of tops.slice(0, 3)) {
    let cur = { ...start.d }, ct = start.t;
    for (let pass = 0; pass < 6; pass++) for (const k of KEYS) {
      if (k === 'beta' && fixBeta !== undefined) continue;
      const [lo, hi] = LIM[k], step = (hi - lo) * 0.08 * Math.pow(0.6, pass);
      for (const sgn of [-1, 1]) { const d = { ...cur, [k]: Math.max(lo, Math.min(hi, (cur[k] as number) + sgn * step)) } as DriftCtl; const t = ev(d); if (t < ct) { ct = t; cur = d; } }
    }
  }
  return best;
}

it.skipIf(!process.env.DRIFT)('Drift vs Grip', () => {
  if (process.env.STAB !== undefined) for (const k of Object.keys(CARS)) CARS[k] = { ...CARS[k], stability: Number(process.env.STAB) };
  if (process.env.SC) { SNOW.C = Number(process.env.SC); GRAVEL.C = Number(process.env.SC); }
  if (process.env.BD) { for (const sf of (process.env.BDS ?? 'snow,gravel,wetsand').split(',').map((n) => SURF[n])) sf.bd = Number(process.env.BD); }
  const R = Number(process.env.R ?? 14), surfs = (process.env.SURF ?? 'snow').split(','), cars = (process.env.CARS ?? 'hatch,buggy,rally').split(',');
  for (const sn of surfs) for (const c of cars) {
    const g0 = searchGrip(SURF[sn], c, R), gg = g0.g ?? undefined;
    const gr = searchDrift(SURF[sn], c, R, 0.03, gg, (r) => r.maxSlip <= 0.1);   // Grip-Referenz mit demselben Fahrer (ohne Winkel)
    const T = Math.min(g0.t, gr.t), pc = (t: number) => t >= 99 ? 'DNF' : ((1 - t / T) * 100).toFixed(1);
    const mid = searchDrift(SURF[sn], c, R, undefined, gg, (r) => r.maxSlip >= 0.17 && r.maxSlip <= 0.46);
    const big = searchDrift(SURF[sn], c, R, 0.8, gg, (r) => r.maxSlip >= 0.6);
    const fm = (x: any) => `${x.t.toFixed(2)}s ${pc(x.t)}% (${(x.r?.maxSlip * 57.3 || 0).toFixed(0)}°)`;
    if (process.env.PARAMS) console.log("PARAMS", sn, c, JSON.stringify(gg), JSON.stringify(mid.d));
    console.log(`ROW R${R} ${sn} ${c}: grip ${T.toFixed(2)}s | mittel 10-25° ${fm(mid)} | gross >35° ${fm(big)}`);
  }
}, 1200000);

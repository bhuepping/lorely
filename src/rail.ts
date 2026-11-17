// Gleisplan je Bahnübergang (ohne three): wie weit das Gleis frei liegt, glattes Höhenprofil, Zug-Höhe.
// Gleis = Gerade quer zur Straße bei Streckenmeter s; endet an einem Tunnelportal vor Hindernis (Haus, Fluss), Steilhang oder Rasterrand.
export interface RailPlan { x: number; z: number; kx: number; kz: number; uMin: number; uMax: number; u0: number; step: number; h: number[] }
export const RAIL_STEP = 2, RAIL_PORTAL = 6, RAIL_CLEAR = 3.2, RAIL_MAX = 120, RAIL_CITY = 50;
interface RBox { x: number; z: number; hx: number; hz: number; yaw: number }
export interface RailEnv { height(x: number, z: number): number; boxes: RBox[]; circles: { x: number; z: number; r: number }[]; water?(x: number, z: number): boolean; limit: number }

/** Höhe der Gleisoberkante-Basis bei u (linear zwischen den Stützstellen) */
export function railY(p: RailPlan, u: number): number {
  const f = Math.min(p.h.length - 1, Math.max(0, (u - p.u0) / p.step)), i = Math.min(p.h.length - 2, Math.floor(f));
  return p.h[i] + (p.h[i + 1] - p.h[i]) * (f - i);
}
export function flatRail(x: number, z: number, kx: number, kz: number, ext = 90): RailPlan { return { x, z, kx, kz, uMin: -ext, uMax: ext, u0: -ext, step: 2 * ext, h: [0, 0] }; }
const inBox = (b: RBox, x: number, z: number, m: number): boolean => { const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z; return Math.abs(cs * dx - sn * dz) < b.hx + m && Math.abs(sn * dx + cs * dz) < b.hz + m; };
export const railBlockedByBox = (boxes: RBox[], x: number, z: number): boolean => boxes.some((b) => inBox(b, x, z, RAIL_CLEAR));

export function planRail(x: number, z: number, kx: number, kz: number, half: number, env: RailEnv): RailPlan {
  const P = (u: number): [number, number] => [x + kx * u, z + kz * u], H = (u: number) => { const [px, pz] = P(u); return env.height(px, pz); };
  const yc = env.height(x, z), nS = Math.round(2 * RAIL_MAX / RAIL_STEP) + 1, u0 = -RAIL_MAX;
  const raw = Array.from({ length: nS }, (_, i) => { const u = u0 + i * RAIL_STEP; return Math.abs(u) <= half + 1.5 ? yc : H(u); });
  let sm = raw.slice();
  const pass = (a: number[]) => a.map((v, i) => 0.25 * a[Math.max(0, i - 1)] + 0.5 * v + 0.25 * a[Math.min(a.length - 1, i + 1)]);
  for (let k = 0; k < 9; k++) sm = pass(sm);
  sm = sm.map((v, i) => Math.max(v, raw[i] - 0.25)); sm = pass(pass(sm));
  const h = sm.map((v, i) => { const w = Math.min(1, Math.max(0, (Math.abs(u0 + i * RAIL_STEP) - (half + 2)) / 6)); return yc + (v - yc) * w * w * (3 - 2 * w); });
  const blocked = (u: number, i: number): boolean => {
    const [px, pz] = P(u);
    if (Math.abs(px) > env.limit || Math.abs(pz) > env.limit) return true;
    if (railBlockedByBox(env.boxes, px, pz) || env.circles.some((c) => Math.hypot(px - c.x, pz - c.z) < c.r + RAIL_CLEAR) || env.water?.(px, pz)) return true;
    const j = Math.min(i, nS - 1); return Math.abs(h[j] - raw[j]) > 1.3 || Math.abs(raw[Math.min(nS - 1, j + 1)] - raw[j]) > 0.9 || Math.abs(h[Math.min(nS - 1, j + 1)] - h[j]) > 0.12 * RAIL_STEP;
  };
  const end = (dir: 1 | -1): number => {
    let u = half + 3;
    for (; u < RAIL_MAX - RAIL_PORTAL; u += 1) { let bad = false; for (let q = 0; q <= RAIL_PORTAL; q += 2) { const uu = dir * (u + q); if (blocked(uu, Math.round((uu - u0) / RAIL_STEP))) { bad = true; break; } } if (bad) break; }
    return Math.max(half + 3, u - 1);
  };
  const eMax = end(1), eMin = end(-1);
  const i0 = Math.max(0, Math.floor((-eMin - RAIL_PORTAL - u0) / RAIL_STEP)), i1 = Math.min(nS - 1, Math.ceil((eMax + RAIL_PORTAL - u0) / RAIL_STEP));
  return { x, z, kx, kz, uMin: -eMin, uMax: eMax, u0: u0 + i0 * RAIL_STEP, step: RAIL_STEP, h: h.slice(i0, i1 + 1) };
}

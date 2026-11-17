// Ideallinie: Minimal-Krümmungs-Linie innerhalb der Fahrbahn (ohne three). Die Sterne liegen darauf.
// Seitlicher Versatz l(s) (lat > 0 = links, wie Route.offset); Ziel = Summe der quadrierten zweiten Differenzen der Punkte
// (≈ Krümmung²), Nebenbedingung lo ≤ l ≤ hi. Gelöst mit aktiver Menge + Bandlöser (fünfdiagonal, SPD).
import type { Route } from './level';

export const LINE_STEP = 3;      // m zwischen den Stützstellen
export const LINE_MARGIN = 1.6;  // m Abstand der Automitte vom Fahrbahnrand
export const LANE_MIN = 0.7;     // m: eigene Spur beginnt links davon (Gegenverkehr links der Mitte)

export interface LineSpec {
  /** Grenzen des seitlichen Versatzes bei s */
  lo: (s: number) => number; hi: (s: number) => number;
  /** feste Punkte [s, lat] (z. B. handgesetzte Sterne); die Linie läuft hindurch */
  fixed?: [number, number][];
}

/** Löst A x = b für SPD-Bandmatrix (Halbbandbreite 2), in place; A als Zeilen [i][0..4] = A[i][i-2..i+2] */
function bandSolve(A: Float64Array, b: Float64Array, n: number): void {
  const a = (i: number, j: number) => A[i * 5 + (j - i + 2)];
  const set = (i: number, j: number, v: number) => { A[i * 5 + (j - i + 2)] = v; };
  for (let k = 0; k < n; k++) {
    const p = a(k, k);
    for (let i = k + 1; i <= Math.min(n - 1, k + 2); i++) {
      const f = a(i, k) / p;
      if (f === 0) continue;
      for (let j = k; j <= Math.min(n - 1, k + 2); j++) set(i, j, a(i, j) - f * a(k, j));
      b[i] -= f * b[k];
    }
  }
  for (let k = n - 1; k >= 0; k--) {
    let v = b[k];
    for (let j = k + 1; j <= Math.min(n - 1, k + 2); j++) v -= a(k, j) * b[j];
    b[k] = v / a(k, k);
  }
}

export function idealLine(route: Route, spec: LineSpec): (s: number) => number {
  const L = route.length, n = Math.max(5, Math.ceil(L / LINE_STEP) + 1);
  const cx = new Float64Array(n), cz = new Float64Array(n), nx = new Float64Array(n), nz = new Float64Array(n), lo = new Float64Array(n), hi = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.min(L, i * LINE_STEP), a = route.at(s);
    cx[i] = a.x; cz[i] = a.z; nx[i] = a.dz; nz[i] = -a.dx;
    lo[i] = spec.lo(s); hi[i] = Math.max(lo[i], spec.hi(s));
  }
  for (const [s, lat] of spec.fixed ?? []) { const i = Math.min(n - 1, Math.round(s / LINE_STEP)); lo[i] = hi[i] = lat; }
  const clamp0 = (i: number) => Math.min(hi[i], Math.max(lo[i], 0));
  lo[0] = hi[0] = clamp0(0); lo[n - 1] = hi[n - 1] = clamp0(n - 1);
  const l = new Float64Array(n); for (let i = 0; i < n; i++) l[i] = clamp0(i);
  const fix = new Int8Array(n);      // 0 frei, -1 an lo, +1 an hi (auch: fest vorgegeben)
  const pinned = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (hi[i] - lo[i] < 1e-9) { fix[i] = 1; pinned[i] = 1; l[i] = lo[i]; }
  // Gradient g_i = 2 n_i · (d_{i-1} - 2 d_i + d_{i+1}), d_j = p_{j-1} - 2 p_j + p_{j+1}
  const dd = new Float64Array(2 * n);
  const gradient = (): Float64Array => {
    for (let j = 1; j < n - 1; j++) {
      dd[2 * j] = cx[j - 1] + nx[j - 1] * l[j - 1] - 2 * (cx[j] + nx[j] * l[j]) + cx[j + 1] + nx[j + 1] * l[j + 1];
      dd[2 * j + 1] = cz[j - 1] + nz[j - 1] * l[j - 1] - 2 * (cz[j] + nz[j] * l[j]) + cz[j + 1] + nz[j + 1] * l[j + 1];
    }
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let gx = 0, gz = 0;
      for (let j = Math.max(1, i - 1); j <= Math.min(n - 2, i + 1); j++) { const c = j === i ? -2 : 1; gx += c * dd[2 * j]; gz += c * dd[2 * j + 1]; }
      g[i] = 2 * (nx[i] * gx + nz[i] * gz);
    }
    return g;
  };
  // Hesse-Matrix (Band): H_ik = 2 (n_i·n_k) Σ_j a_ji a_jk
  const coefC = (i: number, k: number) => {
    let c = 0;
    for (let j = Math.max(1, Math.max(i, k) - 1); j <= Math.min(n - 2, Math.min(i, k) + 1); j++) c += (j === i ? -2 : 1) * (j === k ? -2 : 1);
    return c;
  };
  for (let it = 0; it < 80; it++) {
    const g = gradient(), A = new Float64Array(n * 5), b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (fix[i]) { A[i * 5 + 2] = 1; continue; }
      b[i] = -g[i];
      for (let o = -2; o <= 2; o++) { const k = i + o; if (k < 0 || k >= n || fix[k]) continue; A[i * 5 + o + 2] = 2 * (nx[i] * nx[k] + nz[i] * nz[k]) * coefC(i, k); }
    }
    bandSolve(A, b, n);
    for (let i = 0; i < n; i++) if (!fix[i]) l[i] += b[i];
    let changed = false;
    for (let i = 0; i < n; i++) if (!fix[i]) { if (l[i] < lo[i]) { l[i] = lo[i]; fix[i] = -1; changed = true; } else if (l[i] > hi[i]) { l[i] = hi[i]; fix[i] = 1; changed = true; } }
    if (changed) continue;
    const g2 = gradient(); let rel = false;
    for (let i = 0; i < n; i++) if (fix[i] && !pinned[i] && ((fix[i] === 1 && g2[i] > 1e-7) || (fix[i] === -1 && g2[i] < -1e-7))) { fix[i] = 0; rel = true; }
    if (!rel) break;
  }
  return (s: number) => { const u = Math.min(n - 1, Math.max(0, s / LINE_STEP)), i = Math.min(n - 2, Math.floor(u)); return l[i] + (l[i + 1] - l[i]) * (u - i); };
}

import type { Course } from './level';
/** Ideallinie einer Strecke: ganze Breite (ohne Gegenverkehr) bzw. eigene Spur (Gegenverkehr, Netz); Offroad: der gute Weg selbst (lat 0).
 *  `fixed` = [s, lat] handgesetzter Punkte (Au), durch die die Linie läuft. */
export function courseLine(c: Course, fixed: [number, number][] = []): (s: number) => number {
  if (c.free) return () => 0;
  const oncoming = c.net !== null || (c.traffic?.oncoming ?? 0) > 0;
  const half = (s: number) => { if (!c.net) return c.roadWidth / 2; const p = c.route.at(s), h = c.net.nearest(p.x, p.z); return (h ? h.edge.def.w : c.roadWidth) / 2; };
  return idealLine(c.route, {
    lo: (s) => -(half(s) - LINE_MARGIN),
    hi: (s) => (oncoming ? -LANE_MIN : half(s) - LINE_MARGIN),
    fixed,
  });
}

/** Handgesetzte Sterne, die bleiben (Vorstadt Au): Strecke s ∈ [von, bis] */
export const HAND: Record<string, [number, number]> = { etappe_vorstadt: [1405, 1455] };

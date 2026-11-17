// Streckenelemente ohne three: Schanzen/Kuppen, Furt, Tunnel. Die Höhen kommen als Zusatz zum Raster (`GridTerrain.bump`),
// damit sie unabhängig von der Rasterweite scharfkantig sein können; Physik und Mesh lesen dieselbe Funktion.
import type { Route } from './level';
import type { Bump } from './physics/terrain';
import type { Box } from './physics/obstacles';

/** Schanze: Rampe ab Streckenmeter `s` (Länge `up`, Höhe `h`), danach Abfahrt (Länge `down`). `hill` = runde Kuppe über up+down. */
export interface JumpDef { s: number; up: number; down: number; h: number; shape?: 'ramp' | 'hill' }
/** Furt: flaches Wasser quer über der Straße von s0 bis s1 */
export interface FordDef { s0: number; s1: number; depth?: number }
/** Tunnel durch den Fels von s0 bis s1 (gerade Strecke!) */
export interface TunnelDef { s0: number; s1: number; height?: number; lamp?: number }

export const FORD_DEPTH = 0.55;       // Mulde unter der Straße (m)
export const FORD_WATER = 0.18;       // Wasserspiegel unter dem Straßenniveau (m)
export const FORD_DRAG = 0.55;        // Zähigkeit im flachen Wasser (1/s)
export const TUNNEL_CEIL = 6.4;
export const TUNNEL_SHOULDER = 1.3;  // Tunnel ist um so viel breiter als die Fahrbahn (je Seite)       // lichte Höhe (m)

const sm = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Höhe der Schanze bei Abstand u (m) ab Rampenbeginn */
export function jumpShape(j: JumpDef, u: number): number {
  const L = j.up + j.down;
  if (u <= 0 || u >= L) return 0;
  if (j.shape === 'hill') return j.h * 0.5 * (1 - Math.cos(2 * Math.PI * u / L));
  if (u < j.up) return j.h * Math.pow(u / j.up, 1.5);
  return j.h * 0.5 * (1 + Math.cos(Math.PI * (u - j.up) / j.down));
}

interface Item { cx: number; cz: number; rad: number; j?: JumpDef; f?: FordDef; reach: number }

export class Bumps implements Bump {
  private items: Item[] = [];
  private R: number;
  constructor(private route: Route, private half: number, jumps: JumpDef[] = [], fords: FordDef[] = []) {
    this.R = half + 21;
    for (const j of jumps) { const m = route.at(j.s + (j.up + j.down) / 2); this.items.push({ cx: m.x, cz: m.z, rad: (j.up + j.down) / 2 + half + 9, j, reach: half + 8 }); }
    for (const f of fords) { const m = route.at((f.s0 + f.s1) / 2); this.items.push({ cx: m.x, cz: m.z, rad: (f.s1 - f.s0) / 2 + half + 24, f, reach: half + 21 }); }
  }
  near(x: number, z: number): boolean {
    for (const it of this.items) if ((x - it.cx) ** 2 + (z - it.cz) ** 2 < it.rad * it.rad) return true;
    return false;
  }
  h(x: number, z: number): number {
    let y = 0;
    for (const it of this.items) {
      if ((x - it.cx) ** 2 + (z - it.cz) ** 2 >= it.rad * it.rad) continue;
      const hit = this.route.nearestWithin(x, z, it.reach); if (!hit) continue;
      const d = Math.abs(hit.d);
      if (it.j) y += jumpShape(it.j, hit.s - it.j.s) * (1 - sm(this.half + 0.5, this.half + 7, d));
      else if (it.f) y -= (it.f.depth ?? FORD_DEPTH) * sm(it.f.s0 - 4, it.f.s0 + 2, hit.s) * (1 - sm(it.f.s1 - 2, it.f.s1 + 4, hit.s)) * (1 - sm(this.half + 8, this.half + 20, d));
    }
    return y;
  }
}

/** Wasserzähigkeit an Streckenposition s (Furt), sonst 0 */
export function shallowAt(fords: FordDef[], s: number, d: number, half: number): number {
  for (const f of fords) if (s > f.s0 + 1 && s < f.s1 - 1 && d < half + 6) return FORD_DRAG;
  return 0;
}

/** Tunnelwände (feste Rechtecke je ~4 m) */
export function tunnelBoxes(route: Route, half: number, t: TunnelDef): Box[] {
  const out: Box[] = [], n = Math.ceil((t.s1 - t.s0) / 4), seg = (t.s1 - t.s0) / n;
  for (let i = 0; i < n; i++) {
    const s = t.s0 + (i + 0.5) * seg, yaw = route.yawAt(s);
    for (const side of [1, -1]) { const [x, z] = route.offset(s, side * (half + TUNNEL_SHOULDER + 0.45)); out.push({ x, z, hx: 0.45, hz: seg / 2 + 0.05, yaw }); }
  }
  return out;
}
export const inTunnel = (tunnels: TunnelDef[], s: number, pad = 0): boolean => tunnels.some((t) => s >= t.s0 - pad && s <= t.s1 + pad);

/** Fahrhilfe (Flughilfe + Wank-Dämpfung nach der Landung) nach Ort: Gelände 0, Straße schwach, an echten Schanzen stärker */
export const AID_ROAD = 0.3, AID_JUMP = 0.8;
export function aidField(c: { free?: boolean; jumps: JumpDef[]; route: Route }): (x: number, z: number) => number {
  if (c.free) return () => 0;
  const zones = c.jumps.map((j) => { const m = c.route.at(j.s + (j.up + j.down) / 2); return { x: m.x, z: m.z, r2: ((j.up + j.down) / 2 + 30) ** 2 }; });
  return (x, z) => { for (const q of zones) if ((x - q.x) ** 2 + (z - q.z) ** 2 < q.r2) return AID_JUMP; return AID_ROAD; };
}

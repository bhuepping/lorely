// Rand der Welt (ohne three): offener Rand, kein Zurücklenken. Verlässt das Auto das Rechteck,
// blinkt nach EDGE_WARN s der Kran-Knopf, dann holt der Kran das Auto zurück (wie der Knopf, +3 s). Pro Level: `LevelDef.edge: 'respawn'`.
import type { Vehicle } from './physics/vehicle';

/** Rand-Rechteck in Weltkoordinaten; `cuts` = Sperrflächen innerhalb des Rechtecks (schneiden Ecken ab, z. B. wo die Route weniger weit reicht) */
export interface EdgeRect { x0: number; z0: number; x1: number; z1: number; cuts?: [number, number, number, number][] }
export interface EdgeHit { from: { x: number; z: number; yaw: number }; to: { x: number; z: number; yaw: number } }

export const EDGE_INSET = 12;   // m: Standard-Grenze = Geländerand minus dies

/** Nach innen zeigende Normale der überschrittenen Seite(n); null = innerhalb. Ecke = beide Seiten. */
export function edgeNormal(r: EdgeRect, x: number, z: number): [number, number] | null {
  const nx = x < r.x0 ? 1 : x > r.x1 ? -1 : 0, nz = z < r.z0 ? 1 : z > r.z1 ? -1 : 0;
  if (nx || nz) { const l = Math.hypot(nx, nz); return [nx / l, nz / l]; }
  const c = cutAt(r, x, z); return c ? c.n : null;
}

/** Sperrfläche, in der (x,z) liegt: nächste Seite, über die das Auto hinaus nach innen kommt (nur Seiten mit erlaubtem Gegenüber) */
function cutAt(r: EdgeRect, x: number, z: number): { n: [number, number]; bx: number; bz: number } | null {
  for (const [a, b, c, d] of r.cuts ?? []) {
    if (x < a || x > c || z < b || z > d) continue;
    const opts: { dist: number; n: [number, number]; bx: number; bz: number }[] = [
      { dist: x - a, n: [-1, 0], bx: a, bz: z }, { dist: c - x, n: [1, 0], bx: c, bz: z }, { dist: z - b, n: [0, -1], bx: x, bz: b }, { dist: d - z, n: [0, 1], bx: x, bz: d },
    ];
    opts.sort((p, q) => p.dist - q.dist);
    for (const o of opts) if (o.dist < 5e3 && edgeOk(r, o.bx + o.n[0] * 1, o.bz + o.n[1] * 1)) return o;
  }
  return null;
}
const edgeOk = (r: EdgeRect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && !(r.cuts ?? []).some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d);

export const EDGE_WARN = 1.0;   // s außerhalb, bis der Kran kommt (Knopf blinkt in der Zeit)

/** Wächter fürs Spiel UND die Tests: ein Aufruf je Frame/Schritt. Außerhalb des Rechtecks läuft die Vorwarnung; danach `fire` (= Kran-Aktion). */
export class EdgeGuard {
  outT = 0;
  constructor(readonly rect: EdgeRect) {}
  get warn(): boolean { return this.outT > 0; }
  step(car: Vehicle, dt: number): { warn: boolean; fire: boolean } {
    if (!edgeNormal(this.rect, car.pos[0], car.pos[2])) { this.outT = 0; return { warn: false, fire: false }; }
    this.outT += dt;
    if (this.outT < EDGE_WARN) return { warn: true, fire: false };
    this.outT = 0; return { warn: false, fire: true };
  }
}

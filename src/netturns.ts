// Abzweige der Runde im Straßennetz: Kreuzungen und Ecken, an denen die Runde nicht geradeaus weiterfährt (ohne three, nur Planung).
import type { Course } from './level';

export interface Turn {
  /** Strecke (m), an der die Runde die Kreuzungsfläche betritt / verlässt */
  s: number; sEnd: number;
  /** -1 = links, 1 = rechts (aus Sicht des Fahrers) */
  side: -1 | 1;
}

const MIN_TURN = 0.5;   // rad: kleinere Richtungsänderungen gelten als geradeaus (~29°)
const cache = new WeakMap<Course, Turn[]>();

/** Alle Abzweige der Runde in Fahrtreihenfolge; leer ohne Straßennetz */
export function turnsOf(course: Course): Turn[] {
  const hit = cache.get(course); if (hit) return hit;
  const out: Turn[] = [], net = course.net, r = course.route;
  if (net) for (const n of net.nodes.values()) {   // auch Ecken ohne Kreuzungsfläche (zwei Kanten)
    const h = r.nearest(n.x, n.z); if (h.d > 14) continue;   // die Runde schneidet Ecken ab
    let a = h.s, b = h.s;
    if (n.rj > 0) { while (a > 0 && n.polyDist(r.at(a).x, r.at(a).z) < 1.5) a--; while (b < r.length && n.polyDist(r.at(b).x, r.at(b).z) < 1.5) b++; }
    else { a -= 8; b += 8; }
    const p = r.at(a - 6), q = r.at(b + 6), turn = Math.atan2(p.dx * q.dz - p.dz * q.dx, p.dx * q.dx + p.dz * q.dz);
    // x rechts, z zurück: positives Kreuzprodukt dx*qz - dz*qx = Drehung nach rechts (Draufsicht)
    if (Math.abs(turn) >= MIN_TURN) out.push({ s: a, sEnd: b, side: turn > 0 ? 1 : -1 });
  }
  out.sort((x, y) => x.s - y.s); cache.set(course, out); return out;
}

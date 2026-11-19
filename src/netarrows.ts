// Weiße Abbiegepfeile auf der rechten Spur vor jedem Abzweig der Runde: ein Mesh aus flachen Pixelzellen, ohne Kollision.
import * as THREE from 'three';
import type { Course } from './level';
import { turnsOf } from './netturns';

export const ARROW_DIST = [40, 25, 10];   // m vor dem Abzweig
const CELL = 0.25, LIFT = 0.1, WEAR = 0.1;

/** Pfeil nach links (u > 0 = links, v = vorwärts): Schaft, schräger Arm, Spitze – Zellmitte (u, v) drin? */
function inArrow(u: number, v: number): boolean {
  if (Math.abs(u) <= 0.3 && v >= 0 && v <= 2) return true;                         // Schaft
  const dx = 1.5, dv = 1.5, L = Math.hypot(dx, dv);                                // Arm von (0, 2) nach (1.5, 3.5)
  const t = (u * dx + (v - 2) * dv) / (L * L), p = Math.min(1, Math.max(0, t));
  if (Math.hypot(u - p * dx, v - 2 - p * dv) <= 0.3 && t >= 0) return true;
  // Spitze: Dreieck um (1.5, 3.5) in Richtung (1, 1)
  const a = (u - 1.5 + (v - 3.5)) / Math.SQRT2, b = (-(u - 1.5) + (v - 3.5)) / Math.SQRT2;   // a = längs, b = quer
  return a >= -0.2 && a <= 0.9 && Math.abs(b) <= 0.8 * (0.9 - a) + 0.04;
}

/** Ein Mesh mit allen Pfeilen der Runde; null, wenn es keine Abzweige gibt */
export function buildTurnArrows(course: Course): THREE.Mesh | null {
  const net = course.net, turns = turnsOf(course); if (!net || !turns.length) return null;
  const T = course.terrain, r = course.route, pos: number[] = [], idx: number[] = [];
  let hash = 12345;
  const rnd = () => { hash = (hash * 1664525 + 1013904223) >>> 0; return hash / 4294967296; };
  for (const tu of turns) for (const d of ARROW_DIST) {
    const s = tu.s - d; if (s < 2) continue;
    const a = r.at(s), hit = net.nearest(a.x, a.z); if (!hit || hit.edge.onDeck(hit.s) || hit.edge.surfAt(hit.s) === 'Matsch' || net.junctionAt(a.x, a.z, 4)) continue;
    const sc = Math.min(1, hit.edge.half / 4.5), c = CELL * sc;   // schmale Wege: kleinerer Pfeil
    const lane = -hit.edge.half / 2, shift = lane + (tu.side < 0 ? -0.35 : 0.35) * sc;   // Pfeil liegt auf der rechten Spur (lat < 0), Arm nach außen
    const dir = -tu.side, p0 = pos.length, i0 = idx.length; let bad = false;   // Querrichtung des Abzweigs: lat > 0 = links
    for (let j = 0; j * c < 4.4 * sc; j++) for (let i = -2; i <= 9; i++) {
      if (!inArrow((i + 0.5) * CELL, (j + 0.5) * CELL) || rnd() < WEAR) continue;
      const base = pos.length / 3;
      for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const p = r.at(s + (j + dv) * c), lat = shift + (i + du) * c * dir;
        const x = p.x + p.dz * lat, z = p.z - p.dx * lat;
        pos.push(x, T.height(x, z) + LIFT, z); if (!net.onRoad(x, z)) bad = true;
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (bad) { pos.length = p0; idx.length = i0; }   // Pfeil ragt über den Fahrbahnrand: weglassen
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe6e3d6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.frustumCulled = false; m.name = 'turnArrows'; return m;
}

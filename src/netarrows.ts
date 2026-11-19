// Weiße Abbiegepfeile auf der rechten Spur vor jedem Abzweig der Runde: ein Mesh aus flachen Pixelzellen, ohne Kollision.
import * as THREE from 'three';
import type { Course } from './level';
import { turnsOf } from './netturns';

export const ARROW_DIST = [40, 25, 10];   // m vor dem Abzweig
const CELL = 0.15, LIFT = 0.1, LEN = 5.6;

/** Rechts-Abbiegepfeil (q > 0 = Richtung des Abzweigs, v = vorwärts): Schaft geradeaus, Bogen um 35°, Spitze; ca. 5,4 m lang, 1,5 m breit */
const BEND = 35 * Math.PI / 180, R = 3.5, V0 = 2.4, HALF = 0.2, HEAD = 0.5, TIP = 1.2;
const END = [R * (1 - Math.cos(BEND)), V0 + R * Math.sin(BEND)];   // Ende des Bogens
function inArrow(q: number, v: number): boolean {
  if (Math.abs(q) <= HALF && v >= 0 && v <= V0) return true;                      // Schaft
  const a = Math.atan2(v - V0, R - q);                                             // Bogen: Winkel um den Mittelpunkt (R, V0)
  if (a >= 0 && a <= BEND && Math.abs(Math.hypot(q - R, v - V0) - R) <= HALF) return true;
  const ux = Math.sin(BEND), uv = Math.cos(BEND), dq = q - END[0], dv = v - END[1];   // Spitze: Dreieck ab Bogenende
  const along = dq * ux + dv * uv, across = dq * uv - dv * ux;
  return along >= -0.05 && along <= TIP && Math.abs(across) <= HEAD * (1 - along / TIP);
}

/** Ein Mesh mit allen Pfeilen der Runde; null, wenn es keine Abzweige gibt */
export function buildTurnArrows(course: Course): THREE.Mesh | null {
  const net = course.net, turns = turnsOf(course); if (!net || !turns.length) return null;
  const T = course.terrain, r = course.route, pos: number[] = [], col: number[] = [], idx: number[] = [];
  let hash = 12345;
  const rnd = () => { hash = (hash * 1664525 + 1013904223) >>> 0; return hash / 4294967296; };
  for (const tu of turns) for (const d of ARROW_DIST) {
    const s = tu.s - d; if (s < 2) continue;
    const a = r.at(s), hit = net.nearest(a.x, a.z); if (!hit || hit.edge.onDeck(hit.s) || hit.edge.surfAt(hit.s) === 'Matsch' || net.junctionAt(a.x, a.z, 4)) continue;
    const sc = Math.min(1, hit.edge.half / 3.5), c = CELL * sc;   // schmale Wege: kleinerer Pfeil
    const lane = -hit.edge.half / 2, shift = lane + (tu.side < 0 ? -0.65 : 0.65) * sc;   // Pfeil liegt auf der rechten Spur (lat < 0), Arm nach außen
    const dir = -tu.side, p0 = pos.length, i0 = idx.length; let bad = false;   // Querrichtung des Abzweigs: lat > 0 = links
    for (let j = 0; j * c < LEN * sc; j++) for (let i = -2; i <= 11; i++) {
      if (!inArrow((i + 0.5) * CELL, (j + 0.5) * CELL)) continue;
      const base = pos.length / 3, sh = 0.86 + 0.14 * rnd();   // Abnutzung nur als Helligkeit
      for (let k = 0; k < 4; k++) col.push(sh, sh * 0.99, sh * 0.94);
      for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const p = r.at(s + (j + dv) * c), lat = shift + (i + du) * c * dir;
        const x = p.x + p.dz * lat, z = p.z - p.dx * lat;
        pos.push(x, T.height(x, z) + LIFT, z); if (!net.onRoad(x, z)) bad = true;
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (bad) { pos.length = p0; col.length = p0; idx.length = i0; }   // Pfeil ragt über den Fahrbahnrand: weglassen
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.frustumCulled = false; m.name = 'turnArrows'; return m;
}

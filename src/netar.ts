// Schwebender Abbiegepfeil (Hologramm-Look): drei Chevrons stehen quer zur Anfahrt in der Luft über der Kurve und zeigen in die
// Abbiegerichtung. Nur der nächste Abzweig leuchtet (ab ca. 80 m davor, aus nach dem Abbiegen). 1 Mesh, halbtransparent, ohne Kollision.
import * as THREE from 'three';
import type { Course } from './level';
import { turnsOf, type Turn } from './netturns';

export const AR_SHOW = 80;      // m vor dem Abzweig, ab der er sichtbar wird
const HEIGHT = 3.2, CYAN = [0.3, 1, 1];
const N = 3, HEAD = 0.95, ARM = 0.95, THICK = 0.55, PITCH = 1.15;   // Chevron: Spitze, Armlänge in der Ebene, Strichstärke, Abstand

/** Abzweig, dessen Pfeil jetzt zu sehen sein soll (Strecke s des Autos), sonst undefined */
export function arTurn(turns: Turn[], s: number): Turn | undefined {
  const q = turns.find((t) => s <= t.sEnd);
  return q && s >= q.s - AR_SHOW ? q : undefined;
}

export class TurnAR {
  readonly mesh: THREE.Mesh;
  private readonly col: THREE.BufferAttribute;
  readonly turns: Turn[];
  active: Turn | undefined;
  constructor(private course: Course) {
    this.turns = turnsOf(course);
    const pos: number[] = [], idx: number[] = [];
    // Chevron k: V-Form in der u/v-Ebene (u = Abbiegerichtung, v = oben), Spitze bei u = k * PITCH; jeder Arm ein Quad (4 Ecken).
    // Erst ein dunkler, etwas breiterer Rand (Lesbarkeit vor hellem Himmel), dann die leuchtende Füllung.
    for (const grow of [0.28, 0]) for (let k = 0; k < N; k++) {
      const tip = (k - 1) * PITCH + HEAD / 2;
      for (const sg of [1, -1]) {
        const b = pos.length / 3, ax = tip - ARM * 0.9, ay = sg * (ARM + grow * 0.6), d = THICK / 2 + grow;
        pos.push(tip + grow, sg * -grow * 0.3, 0, tip - d * 1.6, sg * -grow * 0.3, 0, ax - d * 1.6, ay, 0, ax + grow * 0.5, ay, 0);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.col = new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 4), 4); this.col.setUsage(THREE.DynamicDrawUsage); g.setAttribute('color', this.col);
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 5; this.mesh.name = 'turnAR';
  }
  /** s: Strecke des Autos, t: Zeit in s (Pulsieren), on: Pfeil erlaubt (z. B. nur im Zeitrennen) */
  update(s: number, t: number, on = true): void {
    const q = on ? arTurn(this.turns, s) : undefined;
    this.active = q; this.mesh.visible = !!q; if (!q) return;
    const c = this.course, r = c.route, a = r.at(q.s - 4), m = r.at(q.s + (q.sEnd - q.s) * 0.4);
    const ux = q.side > 0 ? -a.dz : a.dz, uz = q.side > 0 ? a.dx : -a.dx;   // Abbiegerichtung (rechts = -links, links = (dz, -dx))
    const dist = Math.max(0, q.s - s), k = Math.min(7.5, Math.max(3.2, dist * 0.09));   // fern größer, damit er lesbar bleibt
    const x = m.x + ux * 0.8, z = m.z + uz * 0.8, y = c.terrain.height(m.x, m.z) + HEIGHT + k * 0.8 + Math.sin(t * 2.2) * 0.18;
    this.mesh.position.set(x, y, z);
    this.mesh.matrix.identity();
    // lokale Achsen: x = Abbiegerichtung, y = oben, z = x × y
    const ex = new THREE.Vector3(ux, 0, uz), ey = new THREE.Vector3(0, 1, 0), ez = new THREE.Vector3().crossVectors(ex, ey);
    this.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
    this.mesh.scale.setScalar(k);
    const fade = Math.min(1, Math.max(0, (AR_SHOW + 8 - dist) / 14)) * (s <= q.sEnd - 6 ? 1 : Math.max(0, (q.sEnd - s) / 6));   // weich ein/aus
    for (let i = 0; i < N; i++) {
      const w = 0.45 + 0.55 * Math.max(0, Math.sin(t * 3.4 - i * 1.0)), v = w * fade;   // Lauflicht in Pfeilrichtung (sanft)
      for (let e = 0; e < 8; e++) {
        this.col.setXYZW(i * 8 + e, 0.02, 0.1, 0.18, 0.5 * v);                       // Rand
        this.col.setXYZW(N * 8 + i * 8 + e, CYAN[0], CYAN[1], CYAN[2], 0.95 * v);   // Füllung
      }
    }
    this.col.needsUpdate = true;
  }
}

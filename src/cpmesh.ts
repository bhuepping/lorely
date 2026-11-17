// Sichtbare Checkpoints (Zeitrennen): je Punkt zwei Pfosten mit kleinem Fähnchen am Straßenrand, 1 InstancedMesh (1 dc).
// Farbe: cyan = offen, grün = durchfahren, rot = verpasst.
import * as THREE from 'three';
import type { Course } from './level';
import type { Checkpoints } from './run';

const COL = [new THREE.Color(0x39e6ff), new THREE.Color(0x4cff6a), new THREE.Color(0xff4a5a)];

export class CheckMesh {
  readonly mesh: THREE.InstancedMesh;
  private sig = '';
  constructor(course: Course, private cps: Checkpoints) {
    const pole = new THREE.BoxGeometry(0.22, 3.2, 0.22).translate(0, 1.6, 0), flag = new THREE.BoxGeometry(1.5, 0.9, 0.08).translate(-0.86, 2.7, 0);
    const parts = [pole, flag], pos: number[] = [], idx: number[] = []; let off = 0;
    for (const g of parts) { pos.push(...Array.from(g.attributes.position.array as ArrayLike<number>)); idx.push(...Array.from(g.index!.array as ArrayLike<number>, (i) => i + off)); off += g.attributes.position.count; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), cps.list.length * 2);
    this.mesh.frustumCulled = false;
    const m = new THREE.Matrix4(), half = course.roadWidth / 2 + 1.6;
    cps.list.forEach((c, i) => {
      const a = course.route.at(c.s), th = Math.atan2(a.dx, a.dz);
      for (let k = 0; k < 2; k++) {
        const side = k ? -1 : 1, x = c.x + a.dz * half * side, z = c.z - a.dx * half * side;
        m.makeRotationY(th + (k ? Math.PI : 0)); m.setPosition(x, course.terrain.height(x, z), z);
        this.mesh.setMatrixAt(i * 2 + k, m);
      }
    });
    this.update(-1);
  }
  /** Farben nur bei Änderung neu setzen */
  update(missed: number): void {
    const sig = missed + ':' + this.cps.got.join('');
    if (sig === this.sig) return; this.sig = sig;
    this.cps.list.forEach((_, i) => { const c = COL[this.cps.got[i] ? 1 : i === missed ? 2 : 0]; this.mesh.setColorAt(i * 2, c); this.mesh.setColorAt(i * 2 + 1, c); });
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

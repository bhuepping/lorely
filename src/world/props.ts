// Wald, Felsen, Randpfähle, Sterne, Zieltor, Pylonen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Terrain } from '../physics/terrain';
import type { Course } from '../level';
import type { Props } from '../physics/props';
import type { Obstacles } from '../physics/obstacles';
import { _M, _p, _one, _s, _up, _c, _q, _t, _ax, PALETTE, withColor } from './common';

/** Bäume (Tannen aus 3 Kegeln mit hellem Hut, Palmen, Laubbäume; „mixed“ = Tanne/Laub im Wechsel), instanziert: 1 Draw Call je Art. Getroffene Bäume wackeln kurz (nur Optik). */
export class ForestMesh {
  readonly mesh = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = []; private which: number[]; private slot: number[];
  constructor(private trees: Course['trees'], private terrain: Terrain, col: { tree: number; treeTop: number }, kind: 'fir' | 'palm' | 'mixed' | 'autumn' = 'fir') {
    const kinds: ('fir' | 'palm' | 'round' | 'gold' | 'amber')[] = kind === 'mixed' ? ['fir', 'round'] : kind === 'autumn' ? ['gold', 'amber'] : [kind];
    const counts = kinds.map(() => 0);
    this.which = trees.map((_, i) => (kind === 'mixed' || kind === 'autumn' ? i % 2 : 0)); this.slot = this.which.map((w) => counts[w]++);
    kinds.forEach((k, w) => { const m = buildForest(Math.max(1, counts[w]), col, k); m.count = counts[w]; this.meshes.push(m); this.mesh.add(m); });
    trees.forEach((_, i) => this.place(i, 0));
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
  private place(i: number, w: number, dir = 0): void {
    const t = this.trees[i];
    _p.set(t.x, this.terrain.height(t.x, t.z) - 0.2, t.z); _q.setFromAxisAngle(_up, (i * 2.399) % 6.28);
    if (w > 0) { _ax.set(Math.cos(dir), 0, -Math.sin(dir)); _t.setFromAxisAngle(_ax, 0.16 * w * Math.sin(w * 15)); _q.premultiply(_t); }
    _s.set(t.s, t.s * (0.9 + 0.3 * ((i * 37) % 10) / 10), t.s); _M.compose(_p, _q, _s); this.meshes[this.which[i]].setMatrixAt(this.slot[i], _M);
  }
  update(ob: Obstacles): void {
    if (!ob.active && this.dirty.size === 0) return;
    for (let i = 0; i < this.trees.length; i++) {
      const w = ob.wob[i];
      if (w <= 0 && !this.dirty.has(i)) continue;
      if (w > 0) this.dirty.add(i); else this.dirty.delete(i);
      this.place(i, w, ob.wobDir[i]);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
  private dirty = new Set<number>();
}

/** Palme: gebogener Stamm aus 5 Stücken, 7 Wedel (je 2 Quader, fallend), 3 Kokosnüsse – ein Mesh, Vertexfarben. Höhe ~7 m. */
function palmGeometry(col: { tree: number; treeTop: number }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkC = [0x7a5a3c, 0x6a4c32];
  const pts: [number, number, number][] = [0, 1, 2, 3, 4, 5].map((i) => [0.14 * i * i * 0.2 + 0, i * 1.1, 0]);
  for (let i = 0; i < 5; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const g = new THREE.CylinderGeometry(0.2 - i * 0.02, 0.26 - i * 0.02, len, 6).toNonIndexed();
    g.rotateZ(-Math.atan2(b[0] - a[0], b[1] - a[1])); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    parts.push(withColor(g, trunkC[i % 2]));
  }
  const top = pts[5], dark = new THREE.Color(col.tree).getHex(), light = new THREE.Color(col.treeTop).getHex();
  for (let k = 0; k < 7; k++) {
    const yaw = k / 7 * Math.PI * 2 + 0.3;
    const seg = (len: number, w: number, pitch: number, ox: number, oy: number, hex: number) => {
      const g = new THREE.BoxGeometry(len, 0.06, w).toNonIndexed(); g.translate(len / 2, 0, 0); g.rotateZ(pitch); g.translate(ox, oy, 0); g.rotateY(yaw); g.translate(top[0], top[1], 0);
      parts.push(withColor(g, hex));
    };
    seg(1.9, 0.75, 0.25, 0, 0, k % 2 ? dark : light);
    seg(1.7, 0.5, -0.6, 1.9 * Math.cos(0.25), 1.9 * Math.sin(0.25), k % 2 ? light : dark);
  }
  for (const [x, z] of [[0.25, 0], [-0.15, 0.22], [-0.1, -0.22]]) { const g = new THREE.BoxGeometry(0.28, 0.28, 0.28).toNonIndexed(); g.translate(top[0] + x, top[1] - 0.25, z); parts.push(withColor(g, 0x4a3320)); }
  return mergeGeometries(parts)!;
}

/** Laubbaum: Stamm + drei versetzte Kronen-Klötze (Ikosaeder), Höhe ~6 m */
function roundGeometry(col: { tree: number; treeTop: number }, autumn?: [number, number]): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 5).toNonIndexed(); trunk.translate(0, 1.1, 0);
  const blob = (r: number, x: number, y: number, z: number, hex: number) => { const g = new THREE.IcosahedronGeometry(r, 0).toNonIndexed(); g.translate(x, y, z); return withColor(g, hex); };
  const g1 = autumn ? autumn[0] : new THREE.Color(col.tree).lerp(new THREE.Color(0x58b040), 0.6).getHex(), g2 = autumn ? autumn[1] : new THREE.Color(col.tree).lerp(new THREE.Color(0x7fd05a), 0.6).getHex();
  return mergeGeometries([withColor(trunk, 0x5a4230), blob(2.1, 0, 3.6, 0, g1), blob(1.6, 1.0, 4.6, 0.5, g2), blob(1.4, -0.9, 4.3, -0.6, g1)])!;
}

function buildForest(cap: number, col: { tree: number; treeTop: number }, kind: 'fir' | 'palm' | 'round' | 'gold' | 'amber'): THREE.InstancedMesh {
  const cone = (r: number, h: number, y: number, hex: number) => { const g = new THREE.ConeGeometry(r, h, 7).toNonIndexed(); g.translate(0, y + h / 2, 0); return withColor(g, hex); };
  const trunk = new THREE.CylinderGeometry(0.25, 0.3, 1.2, 5).toNonIndexed(); trunk.translate(0, 0.6, 0);
  const geo = kind === 'palm' ? palmGeometry(col) : kind === 'round' ? roundGeometry(col) : kind === 'gold' ? roundGeometry(col, [col.tree, col.treeTop]) : kind === 'amber' ? roundGeometry(col, [new THREE.Color(col.tree).lerp(new THREE.Color(0xc4501a), 0.55).getHex(), new THREE.Color(col.treeTop).lerp(new THREE.Color(0xd6781e), 0.5).getHex()]) : mergeGeometries([withColor(trunk, 0x3a2c22), cone(2.3, 3.4, 0.9, col.tree), cone(1.75, 3.0, 2.8, col.tree), cone(1.15, 2.6, 4.6, col.tree), cone(0.55, 1.1, 6.6, col.treeTop)])!;
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), cap);
  m.frustumCulled = false;
  return m;
}

export function buildRocks(rocks: Course['rocks'], terrain: Terrain, color: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color, flatShading: true }), Math.max(1, rocks.length));
  m.count = rocks.length;
  rocks.forEach((r, i) => { _p.set(r.x, terrain.height(r.x, r.z) + r.s * 0.3, r.z); _q.setFromAxisAngle(_up, r.yaw); _s.set(r.s * 1.3, r.s * 0.8, r.s); _M.compose(_p, _q, _s); m.setMatrixAt(i, _M); });
  m.frustumCulled = false;
  return m;
}

/** Randmarkierung Strand: Holzpfähle mit farbiger Kappe, links rot / rechts hell, instanziert (2 Draw Calls), ohne Kollision, leicht schief und verschieden hoch */
export function buildMarks(marks: NonNullable<Course['marks']>, terrain: Terrain): THREE.Group {
  const grp = new THREE.Group();
  const place = (m: THREE.InstancedMesh, list: typeof marks, poller: boolean) => list.forEach((k, i) => {
    _p.set(k.x, terrain.height(k.x, k.z) - (poller ? 0.05 : 0.15), k.z);
    _t.setFromEuler(new THREE.Euler(poller ? 0 : (k.k - 0.5) * 0.18, k.k * 6.28, poller ? 0 : (0.5 - ((k.k * 7) % 1)) * 0.18)); _q.copy(_t);
    const h = poller ? 1 : 0.85 + ((k.k * 13) % 1) * 0.4; _s.set(1, h, 1); _M.compose(_p, _q, _s); m.setMatrixAt(i, _M);
    if (!poller) m.setColorAt(i, _c.set(k.side > 0 ? 0xe6402a : 0xf4ead4));   // Strand: links rot, rechts hell gestrichen (Instanzfarbe × Vertexhelligkeit)
  });
  const beach = marks.filter((k) => !k.poller), poller = marks.filter((k) => k.poller);
  if (beach.length) {   // Pfahl: unten verwittert (dunkel), oben gestrichen – ein Draw Call für beide Seiten
    const lo = withColor(new THREE.BoxGeometry(0.3, 0.7, 0.3).translate(0, 0.35, 0), 0x5a4a40), hi = withColor(new THREE.BoxGeometry(0.3, 1.0, 0.3).translate(0, 1.2, 0), 0xffffff), cap = withColor(new THREE.BoxGeometry(0.4, 0.3, 0.4).translate(0, 1.7, 0), 0xffffff);
    const m = new THREE.InstancedMesh(mergeGeometries([lo, hi, cap].map((g) => g.toNonIndexed()))!, new THREE.MeshLambertMaterial({ vertexColors: true }), beach.length);
    m.frustumCulled = false; place(m, beach, false); grp.add(m);
  }
  if (poller.length) {   // Poller (Stadt): kurz, grau, gelbe Kappe
    const body = withColor(new THREE.BoxGeometry(0.42, 0.9, 0.42).translate(0, 0.45, 0), 0x5a5a62), cap = withColor(new THREE.BoxGeometry(0.46, 0.22, 0.46).translate(0, 0.8, 0), 0xffd23a);
    const m = new THREE.InstancedMesh(mergeGeometries([body.toNonIndexed(), cap.toNonIndexed()])!, new THREE.MeshLambertMaterial({ vertexColors: true }), poller.length);
    m.frustumCulled = false; place(m, poller, true); grp.add(m);
  }
  return grp;
}

/** Sterne: leuchtende (unbeleuchtete) Oktaeder, instanziert, drehen sich; eingesammelte verschwinden. */
export class StarMesh {
  readonly mesh: THREE.InstancedMesh;
  private base: number[];
  constructor(private stars: [number, number][], private terrain: Terrain, color: number) {
    const g = new THREE.OctahedronGeometry(0.7, 0); g.scale(1, 1.5, 1);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color }), Math.max(1, stars.length));
    this.mesh.count = stars.length; this.mesh.frustumCulled = false;
    this.base = stars.map(([x, z]) => terrain.height(x, z) + 1.5);
  }
  update(timeS: number, got: Uint8Array): void {
    this.stars.forEach(([x, z], i) => {
      _p.set(x, this.base[i] + Math.sin(timeS * 2 + i) * 0.18, z);
      _q.setFromAxisAngle(_up, timeS * 1.8 + i);
      const k = got[i] ? 0.0001 : 1;
      _s.set(k, k, k); _M.compose(_p, _q, _s); this.mesh.setMatrixAt(i, _M);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Zieltor: zwei Pfeiler + Balken (ein Mesh, Vertexfarben). */
export function buildGate(width: number, color: number): THREE.Mesh {
  const hw = width / 2 + 1.4;
  const post = (x: number) => { const g = new THREE.BoxGeometry(0.7, 6, 0.7).toNonIndexed(); g.translate(x, 3, 0); return withColor(g, color); };
  const beam = new THREE.BoxGeometry(2 * hw + 0.7, 1.0, 0.8).toNonIndexed(); beam.translate(0, 6.2, 0);
  const geo = mergeGeometries([post(-hw), post(hw), withColor(beam, 0xf2f6fa)])!;
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** Instanzierte Pylonen (1 Draw Call); Matrizen kommen aus der Props-Physik. */
export class PylonMesh {
  readonly mesh: THREE.InstancedMesh;
  /** `barrier` = Anzahl Schranken-Klötze am Ende der Props: rot-weiß statt Pfostenfarbe (Instanzfarbe) */
  constructor(private props: Props, color: number = PALETTE.pylon, barrier = 0) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, props.n));
    this.mesh.count = props.n;
    const c = new THREE.Color();
    for (let i = 0; i < props.n; i++) this.mesh.setColorAt(i, c.set(i >= props.n - barrier ? (i % 2 ? 0xf2f2f2 : 0xd8261a) : color));
    this.mesh.frustumCulled = false;   // Instanzen fliegen weit weg; die Hüllkugel der Basisgeometrie würde sie sonst verschwinden lassen
    this.update(true);
  }
  update(force = false): void {
    const p = this.props;
    if (!force && !p.dirty) return;
    p.dirty = false;
    for (let i = 0; i < p.n; i++) {
      _p.set(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
      _q.set(p.q[i * 4], p.q[i * 4 + 1], p.q[i * 4 + 2], p.q[i * 4 + 3]);
      _M.compose(_p, _q, _one);
      this.mesh.setMatrixAt(i, _M);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

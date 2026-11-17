// Meshes zum Verkehr (traffic.ts): je Welt zwei Fahrzeugarten, je Art EIN InstancedMesh (= 2 Draw Calls für allen Verkehr).
// Vertexfarben + Attribut `tint` (1 = Lack, bekommt die Instanzfarbe) + `glow` (Scheinwerfer/Rücklichter leuchten nachts). Räder sind fest.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Course } from './level';
import type { TrafficLike } from './traffic';

const GLASS = 0x1c2733, DARK = 0x17181c, HEAD = 0xfff0c0, TAIL = 0xff2418, BUMP = 0x2a2c32, WHITE = 0xf2efe6, GREY = 0x30343a;
/** Lackfarben je Welt (80er: kräftig, ein paar Pastelltöne) */
const PAINT: Record<string, number[]> = {
  city: [0xffd82a, 0xff4a3a, 0xffffff, 0x5a8cff, 0xd0d8e2, 0x35e0d6],      // Nachtstadt: hell und kontrastreich
  rhein: [0x3f8a4c, 0xd9d2b4, 0xc83a30, 0x3a5fa8, 0xeeeeee, 0xc89a3a],
  snow: [0xc8281e, 0xe87a1c, 0xf0f2f6, 0x24593a, 0x2a3a58, 0x6a7a8a],
  beach: [0xf2e6c0, 0x2ab0b0, 0xf0705a, 0x7ad6b0, 0xf2cf48, 0xe9e9ee],
  vorstadt: [0xc8c8cc, 0x2e4a8a, 0xb02a24, 0x1c1e22, 0xe8e6e0, 0x4a6a3a],   // Vorstadt: gedeckte Alltagsfarben
  practice: [0xd8362e, 0x2e56c0, 0xe9e9ee, 0xe8c020, 0x1f9a96, 0x9aa3ad],
};

type Part = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, hex: number, tint?: number, glow?: number, rx?: number) => void;
function build(fn: (p: Part) => void): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], c = new THREE.Color();
  fn((cx, cy, cz, sx, sy, sz, hex, tint = 0, glow = 0, rx = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(); g.deleteAttribute('uv');
    if (rx) g.rotateX(rx);
    g.translate(cx, cy, cz); c.setHex(hex);
    const n = g.getAttribute('position').count, col = new Float32Array(n * 3), t = new Float32Array(n).fill(tint), gl = new Float32Array(n).fill(glow);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('tint', new THREE.BufferAttribute(t, 1)); g.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
    parts.push(g);
  });
  return mergeGeometries(parts)!;
}
const LAK = 0xffffff;
/** Räder: Quader (fest), Lichter vorn/hinten */
const wheels = (p: Part, x: number, zs: number[], r: number, w: number) => { for (const z of zs) for (const s of [-1, 1]) p(s * x, r, z, w, r * 2, r * 2, DARK); };
const lights = (p: Part, x: number, y: number, zf: number, zr: number, w = 0.34) => { for (const s of [-1, 1]) { p(s * x, y, zf, w * 1.3, 0.2, 0.08, HEAD, 0, 1); p(s * x, y, zr, w * 1.5, 0.2, 0.08, TAIL, 0, 1); } p(0, y + 0.02, zr, x * 1.2, 0.05, 0.06, TAIL, 0, 1); };     // Rücklichter breiter + Lichtleiste

const SHAPES: Record<string, () => THREE.BufferGeometry> = {
  sedan: () => build((p) => {          // Limousine (Taxi = gelber Lack)
    wheels(p, 0.82, [-1.35, 1.3], 0.34, 0.24);
    p(0, 0.62, 0, 1.8, 0.5, 4.3, LAK, 1);                      // Wanne
    p(0, 0.98, 0.35, 1.5, 0.42, 2.1, GLASS); p(0, 1.22, 0.35, 1.46, 0.07, 1.8, LAK, 1);   // Kabine + Dach
    p(0, 0.98, -0.78, 1.5, 0.3, 0.12, GLASS, 0, 0, 0.7);        // Frontscheibe (schräg)
    p(0, 0.42, -2.15, 1.8, 0.2, 0.1, BUMP); p(0, 0.42, 2.15, 1.8, 0.2, 0.1, BUMP);
    lights(p, 0.62, 0.68, -2.17, 2.17);
  }),
  van: () => build((p) => {            // Lieferwagen
    wheels(p, 0.9, [-1.7, 1.6], 0.38, 0.26);
    p(0, 1.32, 0.55, 2.0, 1.9, 3.5, LAK, 1);                    // Kasten
    p(0, 0.92, -1.75, 2.0, 1.1, 1.3, LAK, 1);                   // Fahrerhaus
    p(0, 1.3, -2.38, 1.8, 0.5, 0.1, GLASS, 0, 0, 0.35);         // Frontscheibe
    p(0, 0.5, -2.5, 2.0, 0.22, 0.1, BUMP); p(0, 0.5, 2.5, 2.0, 0.22, 0.1, BUMP);
    p(0, 2.3, 0.5, 1.2, 0.08, 3.0, WHITE);                      // Dachblech
    lights(p, 0.72, 0.8, -2.52, 2.32, 0.36);
  }),
  wagon: () => build((p) => {          // Kombi / Kleinwagen
    wheels(p, 0.82, [-1.4, 1.35], 0.34, 0.24);
    p(0, 0.62, 0, 1.8, 0.5, 4.5, LAK, 1);
    p(0, 1.0, 0.5, 1.5, 0.45, 2.9, GLASS); p(0, 1.25, 0.5, 1.46, 0.07, 2.6, LAK, 1);
    p(0, 1.0, -0.95, 1.5, 0.3, 0.12, GLASS, 0, 0, 0.7);
    p(0, 0.42, -2.25, 1.8, 0.2, 0.1, BUMP); p(0, 0.42, 2.25, 1.8, 0.2, 0.1, BUMP);
    lights(p, 0.62, 0.68, -2.27, 2.27);
  }),
  tractor: () => build((p) => {        // Traktor
    for (const s of [-1, 1]) { p(s * 0.98, 0.75, 0.85, 0.5, 1.5, 1.5, DARK); p(s * 0.8, 0.4, -1.3, 0.28, 0.8, 0.8, DARK); }
    p(0, 0.95, -0.85, 0.95, 0.85, 1.7, LAK, 1);                 // Motorhaube
    p(0, 0.95, 0.9, 1.6, 0.5, 1.7, GREY);                       // Getriebe/Achse
    p(0, 1.95, 0.85, 1.25, 1.35, 1.3, LAK, 1); p(0, 2.68, 0.85, 1.45, 0.08, 1.55, LAK, 1);       // Kabine (Lack) mit Glasflächen
    p(0, 2.05, 0.18, 1.0, 0.85, 0.05, GLASS); p(0, 2.05, 1.53, 1.0, 0.85, 0.05, GLASS);
    for (const s of [-1, 1]) { p(s * 0.64, 2.05, 0.85, 0.05, 0.85, 0.95, GLASS); p(s * 0.98, 1.55, 0.85, 0.6, 0.1, 1.5, LAK, 1); }   // Seitenfenster, Kotflügel
    p(0.35, 1.9, -1.45, 0.1, 0.95, 0.1, 0x7a7e86);              // Auspuff
    for (const s of [-1, 1]) { p(s * 0.42, 1.2, -1.82, 0.3, 0.16, 0.07, HEAD, 0, 1); p(s * 0.55, 1.1, 1.72, 0.3, 0.12, 0.07, TAIL, 0, 1); }
  }),
  jeep: () => build((p) => {           // Geländewagen
    wheels(p, 0.9, [-1.35, 1.3], 0.42, 0.3);
    p(0, 0.92, 0, 1.9, 0.75, 4.2, LAK, 1);
    p(0, 1.55, 0.4, 1.7, 0.65, 2.5, GLASS); p(0, 1.9, 0.4, 1.7, 0.08, 2.4, LAK, 1);
    p(0, 1.55, -0.85, 1.7, 0.4, 0.1, GLASS, 0, 0, 0.5);
    p(0, 1.05, 2.2, 0.8, 0.8, 0.22, DARK);                       // Reserverad
    p(0, 0.5, -2.12, 1.9, 0.22, 0.1, BUMP);
    lights(p, 0.68, 0.98, -2.12, 2.12, 0.3);
  }),
  roofbox: () => build((p) => {        // Kombi mit Dachbox
    wheels(p, 0.84, [-1.45, 1.4], 0.35, 0.25);
    p(0, 0.66, 0, 1.84, 0.52, 4.6, LAK, 1);
    p(0, 1.04, 0.5, 1.54, 0.45, 3.0, GLASS); p(0, 1.29, 0.5, 1.5, 0.07, 2.7, LAK, 1);
    p(0, 1.04, -1.0, 1.54, 0.3, 0.12, GLASS, 0, 0, 0.7);
    p(0, 1.56, 0.5, 1.0, 0.36, 2.1, GREY); p(0, 1.36, 0.5, 1.3, 0.04, 2.3, DARK);   // Dachbox + Träger
    p(0, 0.44, -2.3, 1.84, 0.2, 0.1, BUMP); p(0, 0.44, 2.3, 1.84, 0.2, 0.1, BUMP);
    lights(p, 0.64, 0.7, -2.32, 2.32);
  }),
  camper: () => build((p) => {         // Camper-Bus
    wheels(p, 0.95, [-1.8, 1.7], 0.38, 0.26);
    p(0, 0.95, 0, 2.04, 1.3, 5.2, LAK, 1);                      // Unterbau (Lack)
    p(0, 1.95, 0.3, 2.0, 0.85, 4.6, WHITE);                      // weißes Oberteil
    p(0, 1.9, -0.2, 2.06, 0.38, 3.0, GLASS);                    // Fensterband
    p(0, 1.65, -2.6, 1.8, 0.5, 0.1, GLASS, 0, 0, 0.3);          // Frontscheibe
    p(0, 2.5, 0.5, 1.5, 0.22, 2.6, WHITE);                       // Aufstelldach
    p(0, 0.5, -2.62, 2.04, 0.22, 0.1, BUMP); p(0, 0.5, 2.62, 2.04, 0.22, 0.1, BUMP);
    lights(p, 0.74, 0.95, -2.62, 2.62, 0.36);
  }),
  buggy: () => build((p) => {          // Strandbuggy
    for (const s of [-1, 1]) { p(s * 0.82, 0.37, 0.95, 0.45, 0.74, 0.74, DARK); p(s * 0.7, 0.3, -1.0, 0.3, 0.6, 0.6, DARK); }
    p(0, 0.5, 0.1, 1.1, 0.3, 2.9, LAK, 1);                      // Wanne
    for (const s of [-1, 1]) { p(s * 0.6, 0.62, -0.1, 0.22, 0.34, 1.6, LAK, 1); p(s * 0.45, 1.1, 0.2, 0.05, 1.0, 0.05, GREY); p(s * 0.45, 1.1, -0.5, 0.05, 1.0, 0.05, GREY); }
    p(0, 1.62, -0.15, 1.0, 0.05, 0.9, GREY); p(0, 0.85, 0.35, 0.7, 0.5, 0.5, DARK);   // Überrollbügel, Sitze
    p(0, 0.75, 1.3, 0.7, 0.5, 0.6, GREY);                       // Motor
    for (const s of [-1, 1]) { p(s * 0.4, 0.62, -1.55, 0.24, 0.16, 0.07, HEAD, 0, 1); p(s * 0.4, 0.7, 1.58, 0.24, 0.12, 0.07, TAIL, 0, 1); }
  }),
};

export class TrafficMesh {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private uNight = { value: 0 };
  private paint: THREE.Color[];
  private _m = new THREE.Matrix4(); private _q = new THREE.Quaternion(); private _e = new THREE.Euler(0, 0, 0, 'YXZ'); private _p = new THREE.Vector3(); private _s = new THREE.Vector3(); private _c = new THREE.Color();
  constructor(private course: Course, private tr: TrafficLike) {
    this.paint = (PAINT[course.world] ?? PAINT.practice).map((h) => new THREE.Color(h));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = this.uNight;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float tint; attribute float glow; varying float vGlow; varying float vTint;')
        .replace('#include <color_vertex>', 'vColor = vec4(color.rgb * mix(vec3(1.0), instanceColor.rgb, tint), 1.0); vGlow = glow; vTint = tint;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying float vGlow; varying float vTint;')
        .replace('#include <opaque_fragment>', 'outgoingLight += vColor.rgb * vGlow * (0.4 + 2.2 * uNight) + vColor.rgb * vTint * 0.3 * uNight;\n#include <opaque_fragment>');
    };
    for (const k of tr.kinds) {
      const g = SHAPES[k](); g.computeBoundingSphere();
      const m = new THREE.InstancedMesh(g, mat, tr.cars.length); m.frustumCulled = false; m.count = 0; m.visible = false;
      m.setColorAt(0, this.paint[0]); this.meshes.push(m); this.group.add(m);
    }
  }
  paintOf(c: { tint: number }): [number, number, number] { const p = this.paint[c.tint % this.paint.length]; return [p.r, p.g, p.b]; }
  setNight(n: boolean): void { this.uNight.value = n ? 1 : 0; }
  update(): void {
    const T = this.course.terrain, n = this.meshes.map(() => 0);
    for (const c of this.tr.cars) {
      if (!c.on || c.build > 0) continue;
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);       // Nase zeigt nach (-sin, -cos)
      const fx = c.x - sy * c.hz, fz = c.z - cy * c.hz, rx = c.x + sy * c.hz, rz = c.z + cy * c.hz;
      const yF = T.height(fx, fz), yR = T.height(rx, rz), y = (yF + yR) / 2;
      this._e.set(Math.atan2(yF - yR, c.hz * 2), c.yaw, 0); this._q.setFromEuler(this._e);
      const sc = c.scale;
      this._m.compose(this._p.set(c.x, y, c.z), this._q, this._s.set(sc, sc, sc));
      const m = this.meshes[c.kind], i = n[c.kind]++;
      m.setMatrixAt(i, this._m); m.setColorAt(i, this._c.copy(this.paint[c.tint % this.paint.length]));
    }
    this.meshes.forEach((m, i) => { m.count = n[i]; m.visible = n[i] > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  }
}

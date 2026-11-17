// Meshes zu Schanzen, Furt, Tunnel (features.ts) und bewegten Dingen (movers.ts). Alles unbeleuchtet oder einfach beleuchtet, je Element 1–2 Draw Calls.
import * as THREE from 'three';
import type { Course } from './level';
import { FORD_WATER, TUNNEL_CEIL, TUNNEL_SHOULDER } from './features';
import type { Movers } from './movers';
import { railY } from './rail';

class Soup {
  pos: number[] = []; col: number[] = [];
  tri(a: number[], b: number[], c: number[], col: number[]): void { for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.col.push(col[0], col[1], col[2]); } }
  quad(a: number[], b: number[], c: number[], d: number[], col: number[]): void { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  /** Quader (Achsen x,z um (cx,cz) mit yaw), Unterkante ya, Oberkante yb */
  box(cx: number, cz: number, hx: number, hz: number, yaw: number, ya: number, yb: number, col: number[]): void {
    const cs = Math.cos(yaw), sn = Math.sin(yaw), P = (lx: number, lz: number, y: number) => [cx + cs * lx + sn * lz, y, cz - sn * lx + cs * lz];
    const k = [1, 0.8, 0.9, 0.7];
    const cor: [number, number][] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    for (let i = 0; i < 4; i++) { const [ax, az] = cor[i], [bx, bz] = cor[(i + 1) % 4], f = k[i]; this.quad(P(ax, az, ya), P(bx, bz, ya), P(bx, bz, yb), P(ax, az, yb), col.map((v) => v * f)); }
    this.quad(P(-hx, hz, yb), P(hx, hz, yb), P(hx, -hz, yb), P(-hx, -hz, yb), col.map((v) => v * 1.1));
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere(); return g;
  }
}
const rgb = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const sm = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const basic = () => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

/** Schanzen als Streifen über dem Raster (Höhen = Physik-Höhen), Stoßkante weiß markiert. */
export function buildJumps(course: Course): THREE.Mesh | null {
  if (!course.jumps.length) return null;
  const T = course.terrain, R = course.route, half = course.roadWidth / 2, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const mid = R.at(course.jumps[0].s), roadId = T.surface(mid.x, mid.z).id, [vx, vz] = R.offset(course.jumps[0].s, half + 12), vergeId = T.surface(vx, vz).id;
  const road = rgb(course.surfaceColors[roadId] ?? 0x4b4e57), verge = rgb(course.surfaceColors[vergeId] ?? 0xcccccc);
  const lats = [-(half + 7), -(half + 3.5), -(half + 0.5), -half * 0.5, 0, half * 0.5, half + 0.5, half + 3.5, half + 7];
  for (const j of course.jumps) {
    const base = pos.length / 3, L = j.up + j.down, rows: number[] = [];
    for (let u = -1.5; u < L + 1.5; u += 1.5) rows.push(j.s + u);
    rows.push(j.s + L + 1.5);
    rows.forEach((s) => {
      for (const lat of lats) {
        const [x, z] = R.offset(s, lat), edge = sm(half + 0.5, half + 7, Math.abs(lat)), u = s - j.s;
        pos.push(x, T.height(x, z) + 0.05, z);
        const mark = j.shape !== 'hill' && u > j.up - 1.6 && u < j.up + 0.2 && Math.abs(lat) <= half + 0.5 ? 1 : 0;
        for (let k = 0; k < 3; k++) col.push(mark ? 0.95 : road[k] + (verge[k] - road[k]) * edge);
      }
    });
    const W = lats.length;
    for (let r = 0; r + 1 < rows.length; r++) for (let c = 0; c + 1 < W; c++) { const a = base + r * W + c; idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.frustumCulled = false; return m;
}

/** Furt: Wasserfläche + Spritzer (Pool aus kleinen Quadern, 1 Draw Call) */
export class FordMesh {
  readonly group = new THREE.Group();
  private drops: THREE.InstancedMesh; private life: Float32Array; private vel: Float32Array; private p: Float32Array; private k = 0;
  private N = 56; private _m = new THREE.Matrix4(); private _s = new THREE.Vector3(); private _q = new THREE.Quaternion(); private _v = new THREE.Vector3();
  constructor(private course: Course) {
    const T = course.terrain, R = course.route, half = course.roadWidth / 2, pos: number[] = [], idx: number[] = [];
    for (const f of course.fords) {
      const a = R.at(f.s0 - 8), b = R.at(f.s1 + 8), ya = T.height(a.x, a.z), yb = T.height(b.x, b.z), base = pos.length / 3, n = 12;
      for (let i = 0; i <= n; i++) {
        const s = f.s0 - 2 + (f.s1 - f.s0 + 4) * i / n, y = (ya + (yb - ya) * (s - f.s0 + 8) / (f.s1 - f.s0 + 16)) - FORD_WATER;
        for (const lat of [-(half + 17), half + 17]) { const [x, z] = R.offset(s, lat); pos.push(x, y, z); }
      }
      for (let i = 0; i < n; i++) { const o = base + i * 2; idx.push(o, o + 1, o + 3, o, o + 3, o + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const w = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x4f8fd0, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }));
    w.frustumCulled = false; w.renderOrder = 1; this.group.add(w);
    this.drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xe8f4ff }), this.N);
    this.drops.frustumCulled = false; this.drops.count = this.N;
    this.life = new Float32Array(this.N); this.vel = new Float32Array(this.N * 3); this.p = new Float32Array(this.N * 3);
    for (let i = 0; i < this.N; i++) this.drops.setMatrixAt(i, this._m.makeScale(0, 0, 0));
    this.group.add(this.drops);
  }
  /** Spritzer: je Frame; (x,z,y) Auto, v = Tempo, wet = im Wasser */
  update(dt: number, x: number, y: number, z: number, v: number, wet: boolean): void {
    if (wet && v > 3) {
      const n = Math.min(4, Math.ceil(v / 7));
      for (let c = 0; c < n; c++) { const i = this.k++ % this.N; this.life[i] = 0.45 + Math.random() * 0.3; this.p.set([x + (Math.random() - 0.5) * 2.4, y, z + (Math.random() - 0.5) * 2.4], i * 3); this.vel.set([(Math.random() - 0.5) * 3, 2.5 + Math.random() * 2.5 + v * 0.06, (Math.random() - 0.5) * 3], i * 3); }
    }
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { continue; }
      this.life[i] -= dt; const o = i * 3;
      this.vel[o + 1] -= 9 * dt; this.p[o] += this.vel[o] * dt; this.p[o + 1] += this.vel[o + 1] * dt; this.p[o + 2] += this.vel[o + 2] * dt;
      const sc = this.life[i] > 0 ? Math.min(1, this.life[i] * 3) : 0;
      this._m.compose(this._v.set(this.p[o], this.p[o + 1], this.p[o + 2]), this._q.identity(), this._s.set(sc, sc, sc)); this.drops.setMatrixAt(i, this._m);
    }
    this.drops.instanceMatrix.needsUpdate = true;
  }
}

/** Tunnel: Felsmasse als Röhre (innen Betonbogen + Lampen, außen Fels mit leichter Unruhe), Portale an den Enden. Unbeleuchtet, 1 Mesh. */
export function buildTunnels(course: Course, dark: boolean): THREE.Mesh | null {
  if (!course.tunnels.length) return null;
  const R = course.route, T = course.terrain, half = course.roadWidth / 2, sp = new Soup(), k = dark ? 0.55 : 1;
  const hw = half + TUNNEL_SHOULDER, Wo = half + 12;
  for (const t of course.tunnels) {
    const H = t.height ?? 15, step = 3, n = Math.ceil((t.s1 - t.s0) / step);
    const inner = (lat: number, y: number, y0: number) => [lat, y0 + y];
    const IN = [[-hw, -0.25], [-hw, 3.3], [-hw * 0.82, 4.9], [-hw * 0.42, 5.85], [0, TUNNEL_CEIL], [hw * 0.42, 5.85], [hw * 0.82, 4.9], [hw, 3.3], [hw, -0.25]];
    const OUT = [[-Wo, -4], [-Wo, 2.5], [-Wo * 0.86, 8], [-Wo * 0.5, H * 0.9], [0, H], [Wo * 0.5, H * 0.9], [Wo * 0.86, 8], [Wo, 2.5], [Wo, -4]];
    void inner;
    const ring = (i: number, prof: number[][], jit: number) => {
      const s = Math.min(t.s1, t.s0 + i * step), a = R.at(s), y0 = T.height(a.x, a.z);
      return prof.map(([lat, y], j) => { const [x, z] = R.offset(s, lat); const jj = jit ? (Math.sin(s * 0.7 + j * 2.3) * 0.5 + Math.sin(s * 0.23 + j) * 0.4) * jit * (j === 0 || j === prof.length - 1 ? 0 : 1) : 0; return [x, y0 + y + jj, z]; });
    };
    for (let i = 0; i < n; i++) {
      const ai = ring(i, IN, 0), bi = ring(i + 1, IN, 0), ao = ring(i, OUT, 1.2), bo = ring(i + 1, OUT, 1.2), lamp = Math.floor(((t.s0 + i * step) - t.s0) / (t.lamp ?? 9)) !== Math.floor(((t.s0 + (i + 1) * step) - t.s0) / (t.lamp ?? 9));
      for (let j = 0; j + 1 < IN.length; j++) {
        const wall = j === 0 || j === IN.length - 2, ceil = j === 3 || j === 4;
        const col = (lamp && ceil ? [1, 0.93, 0.62] : wall ? [0.4, 0.4, 0.43] : [0.3, 0.3, 0.34]).map((v) => v * (lamp && ceil ? 1 : k));
        sp.quad(ai[j], bi[j], bi[j + 1], ai[j + 1], col);
        const shade = 0.55 + 0.15 * ((i + j) % 3) + 0.25 * Math.max(0, OUT[j][1] > 5 ? 1 : 0.4);
        const rock = [0.43 * shade, 0.4 * shade, 0.37 * shade].map((v) => v * (course.world === 'snow' ? 1.25 : 1) * k);
        if (course.world === 'snow' && OUT[j][1] > 8) { rock[0] = 0.85 * k; rock[1] = 0.88 * k; rock[2] = 0.92 * k; }
        sp.quad(ao[j], ao[j + 1], bo[j + 1], bo[j], rock);
      }
    }
    // Portale: Stirnfläche zwischen Bogen und Außenkontur, Betonrahmen
    for (const [s, sgn] of [[t.s0, 1], [t.s1, -1]] as const) {
      const a = R.at(s), y0 = T.height(a.x, a.z), P = (prof: number[][], off = 0) => prof.map(([lat, y]) => { const [x, z] = R.offset(s + sgn * off, lat); return [x, y0 + y, z]; });
      const I = P(IN), O = P(OUT), O2 = P(IN.map(([l, y]) => [l * 1.1, y === -0.25 ? y : y * 1.07 + 0.2]), -0.4 * sgn);
      for (let j = 0; j + 1 < IN.length; j++) {
        sp.quad(O[j], O[j + 1], I[j + 1], I[j], [0.5 * k, 0.48 * k, 0.45 * k]);
        sp.quad(I[j], I[j + 1], O2[j + 1], O2[j], [0.62 * k, 0.6 * k, 0.58 * k]);
      }
    }
  }
  const m = new THREE.Mesh(sp.geometry(), basic()); m.frustumCulled = false; return m;
}

/** Bewegte Dinge: Bahnübergang (Gleise, Schranke, Blinker, Zug), Lawinenbrocken, Fahrzeuge (Pflug/Buggy), Möwen, Fähre. */
export class MoverMesh {
  readonly group = new THREE.Group();
  private trains: THREE.Mesh[] = []; private trainBase: Float32Array[] = []; private arms: THREE.Mesh[] = []; private lamps: THREE.Mesh[] = [];
  private balls: THREE.InstancedMesh | null = null; private convoys: THREE.Mesh[] = []; private gulls: THREE.InstancedMesh | null = null; private ferries: THREE.Mesh[] = [];
  private _m = new THREE.Matrix4(); private _q = new THREE.Quaternion(); private _e = new THREE.Euler(); private _p = new THREE.Vector3(); private _s = new THREE.Vector3(1, 1, 1);
  constructor(private course: Course, private mv: Movers) {
    const T = course.terrain, half = course.roadWidth / 2, R = course.route;
    // Gleisbett + Schwellen + Schienen je Bahnübergang (1 Mesh), Warnbaken
    const st = new Soup();
    for (const c of mv.crossings) {
      const pl = c.rail, us: number[] = []; for (let u = pl.uMin - 6; u <= pl.uMax + 6.001; u += 2) us.push(u);
      const P = (u: number, lat: number): [number, number, number] => [c.x + c.kx * u - c.kz * lat, 0, c.z + c.kz * u + c.kx * lat];
      const ribbon = (lat0: number, lat1: number, top: number, bot: number, col: number[]): void => {   // durchgehendes Band, folgt dem Profil (keine Stufen)
        for (let i = 0; i + 1 < us.length; i++) {
          const v = (u: number, lat: number, dy: number) => { const p = P(u, lat); p[1] = railY(pl, Math.min(pl.uMax + 6, Math.max(pl.uMin - 6, u))) + dy; return p; };
          const [u0, u1] = [us[i], us[i + 1]];
          st.quad(v(u0, lat0, top), v(u1, lat0, top), v(u1, lat1, top), v(u0, lat1, top), col);
          st.quad(v(u0, lat0, bot), v(u1, lat0, bot), v(u1, lat0, top), v(u0, lat0, top), col.map((x) => x * 0.8));
          st.quad(v(u1, lat1, bot), v(u0, lat1, bot), v(u0, lat1, top), v(u1, lat1, top), col.map((x) => x * 0.7));
        }
      };
      ribbon(-1.9, 1.9, 0.12, -1.6, [0.45, 0.4, 0.34]);                 // Schotterbett, Unterkante tief genug für den Damm
      for (const lat of [-0.72, 0.72]) ribbon(lat - 0.05, lat + 0.05, 0.3, 0.12, [0.62, 0.62, 0.66]);   // Schienen
      for (let u = pl.uMin; u <= pl.uMax; u += 2) { const [x, , z] = P(u, 0), y = railY(pl, u); st.box(x, z, 1.2, 0.12, c.yaw, y + 0.1, y + 0.2, [0.3, 0.22, 0.15]); }   // Schwellen
      // Tunnelportale an beiden Enden (Gleisende = Zugende: der Zug fährt hinein)
      for (const sg of [-1, 1]) {
        const ue = sg > 0 ? pl.uMax : pl.uMin, [x, , z] = P(ue + sg * 3, 0), y = railY(pl, ue + sg * 3), [fx, , fz] = P(ue, 0);
        st.box(x, z, 4.6, 3, c.yaw, y - 1.6, y + 6.2, [0.5, 0.5, 0.52]);
        st.box(fx, fz, 1.9, 0.1, c.yaw, y, y + 4.6, [0.05, 0.05, 0.07]);
      }
      // Schrankenposten + Andreaskreuz-Baken
      for (const [s, side] of [[-7, 1], [-7, -1], [7, 1], [7, -1]] as const) {
        const [x, z] = R.offset(R.nearest(c.x, c.z).s + s, side * (half + 1.3)), y = T.height(x, z);
        st.box(x, z, 0.12, 0.12, 0, y, y + 3.2, [0.9, 0.9, 0.92]); st.box(x, z, 0.5, 0.05, R.yawAt(R.nearest(c.x, c.z).s), y + 2.2, y + 2.9, [0.85, 0.12, 0.1]);
      }
    }
    if (mv.crossings.length) {
      const stm = new THREE.Mesh(st.geometry(), basic()); stm.frustumCulled = false; this.group.add(stm);
      for (const c of mv.crossings) {
        const sRoad = R.nearest(c.x, c.z).s, yaw = R.yawAt(sRoad);
        // Schranke: Arm über die ganze Fahrbahn, dreht um den Fußpunkt am rechten Rand
        const as = new Soup(), len = half * 2 + 1;
        for (let i = 0; i < 8; i++) as.box(0, -(i + 0.5) * len / 8, 0.16, len / 16, 0, 0, 0.34, i % 2 ? [0.95, 0.95, 0.95] : [0.85, 0.1, 0.08]);
        const arm = new THREE.Mesh(as.geometry(), basic()); arm.frustumCulled = false;
        const [gx, gz] = R.offset(sRoad - 7, -(half + 0.3)), pivot = new THREE.Group();
        pivot.position.set(gx, T.height(gx, gz) + 1.0, gz); pivot.rotation.y = yaw; arm.rotation.x = 0; arm.position.set(0, 0, 0);
        // Arm liegt in lokal -z? wir wollen quer zur Straße: lokal x ist quer; drehen
        arm.rotation.y = Math.PI / 2; pivot.add(arm); this.group.add(pivot); this.arms.push(arm as any); (arm as any).userData.pivot = pivot; (arm as any).userData.len = len;
        // Blinker: zwei rote Lampen je Seite (an/aus über visible)
        const ls = new Soup();
        for (const side of [1, -1]) { const [x, z] = R.offset(sRoad - 7, side * (half + 1.3)), y = T.height(x, z) + 3.3; ls.box(x, z, 0.28, 0.28, 0, y, y + 0.5, [1, 0.15, 0.1]); }
        const lm = new THREE.Mesh(ls.geometry(), basic()); lm.frustumCulled = false; this.group.add(lm); this.lamps.push(lm);
        // Zug: Lok + 3 Wagen (Länge c.len), lokal +x = Gleisrichtung
        const ts = new Soup(), L = c.len, wl = 12, gap = 1;
        const car = (x0: number, l: number, h: number, col: number[], roof: number[]) => { ts.box(x0, 0, l / 2, 1.4, 0, 0.5, 0.5 + h, col); ts.box(x0, 0, l / 2 - 0.3, 1.5, 0, 0.5 + h * 0.85, 0.5 + h, roof); };
        car(L / 2 - 6, 12, 3.2, [0.78, 0.1, 0.1], [0.3, 0.3, 0.32]);
        for (let w = 0; w < 3; w++) car(L / 2 - 12 - gap - wl / 2 - w * (wl + gap) - 0.5, wl, 3.0, [0.85, 0.85, 0.88], [0.5, 0.5, 0.55]);
        const tm = new THREE.Mesh(ts.geometry(), basic()); tm.frustumCulled = false; tm.visible = false; this.group.add(tm); this.trains.push(tm); this.trainBase.push(Float32Array.from(ts.pos));
      }
    }
    if (mv.balls.length) {
      this.balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xf0f6ff }), mv.balls.length);
      this.balls.frustumCulled = false; this.group.add(this.balls);
    }
    for (const c of mv.convoys) {
      const s = new Soup();
      if (c.def.look === 'plow') {
        s.box(0, 0.6, 1.45, 2.4, 0, 0.5, 2.0, [0.95, 0.55, 0.05]); s.box(0, -1.9, 1.3, 1.2, 0, 0.5, 1.5, [0.95, 0.55, 0.05]);
        s.box(0, -1.5, 1.4, 0.35, 0, 1.45, 2.2, [0.15, 0.2, 0.28]); s.box(0, -3.9, 1.75, 0.35, 0, 0.35, 1.55, [0.95, 0.85, 0.1]); s.box(0, 1.2, 0.5, 0.5, 0, 2.0, 2.3, [1, 0.8, 0.1]);
        for (const sx of [-1.35, 1.35]) for (const z of [-1.9, 1.7]) s.box(sx, z, 0.25, 0.55, 0, 0, 0.9, [0.1, 0.1, 0.12]);
      } else {
        s.box(0, 0, 0.8, 1.6, 0, 0.3, 0.75, [0.1, 0.65, 0.85]); s.box(0, 0.2, 0.7, 0.7, 0, 0.75, 1.15, [0.9, 0.9, 0.95]); s.box(0, 1.5, 0.9, 0.12, 0, 0.9, 1.35, [0.95, 0.2, 0.3]);
        for (const sx of [-0.85, 0.85]) for (const z of [-1.1, 1.1]) s.box(sx, z, 0.2, 0.42, 0, 0, 0.7, [0.1, 0.1, 0.12]);
      }
      const m = new THREE.Mesh(s.geometry(), basic()); m.frustumCulled = false; this.group.add(m); this.convoys.push(m);
    }
    if (mv.gulls.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 0, 0, -0.25, 0, 0, 0.25, 0, 0, -0.25, 1, 0, 0, 0, 0, 0.25], 3));
      this.gulls = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), mv.gulls.reduce((a, b) => a + b.n, 0));
      this.gulls.frustumCulled = false; this.group.add(this.gulls);
    }
    for (const f of mv.ferries) {
      const s = new Soup();
      s.box(0, 0, 3.4, 12, 0, -0.6, 1.2, [0.2, 0.25, 0.4]); s.box(0, -1, 3.0, 10.5, 0, 1.2, 1.6, [0.85, 0.85, 0.88]); s.box(0, 3, 2.2, 3.5, 0, 1.6, 4.2, [0.95, 0.95, 0.95]); s.box(0, 3, 2.3, 3.6, 0, 3.0, 3.4, [0.15, 0.2, 0.3]); s.box(0, 6, 0.5, 0.5, 0, 4.2, 6, [0.8, 0.12, 0.1]);
      const m = new THREE.Mesh(s.geometry(), basic()); m.frustumCulled = false; this.group.add(m); this.ferries.push(m);
    }
  }
  update(now: number): void {
    const mv = this.mv, T = this.course.terrain;
    mv.crossings.forEach((c, i) => {
      const tm = this.trains[i]; tm.visible = c.train;
      if (c.train) {   // Zug folgt Gleis (Verlauf + Höhe): Eckpunkte einzeln auf das Profil setzen; hinter dem Portal eingeklemmt (unsichtbar im Block)
        const pa = tm.geometry.getAttribute('position') as THREE.BufferAttribute, base = this.trainBase[i], pl = c.rail;
        for (let k = 0; k < pa.count; k++) {
          const u = Math.min(pl.uMax + 2.5, Math.max(pl.uMin - 2.5, c.trainPos + base[k * 3]));
          pa.setXYZ(k, c.x + c.kx * u - c.kz * base[k * 3 + 2], railY(pl, u) + base[k * 3 + 1] - 0.2, c.z + c.kz * u + c.kx * base[k * 3 + 2]);
        }
        pa.needsUpdate = true;
      }
      const arm = this.arms[i]; arm.parent!.rotation.z = 0; arm.rotation.z = 0;
      (arm.parent as THREE.Group).rotation.order = 'YXZ'; (arm.parent as THREE.Group).rotation.x = 0;
      arm.position.set(0, 0, 0); arm.rotation.set(0, Math.PI / 2, 0);
      // Arm hebt sich: um die lokale Querachse (x der Pivot-Gruppe = quer zur Straße? nein: Fahrtrichtung ist -z lokal, quer = x) -> Neigung um z
      (arm.parent as THREE.Group).rotation.z = -(1 - c.gate) * 1.45; arm.visible = !c.broken;   // offen = hochgeklappt (Arm zeigt nach oben), zu = quer über der Fahrbahn
      this.lamps[i].visible = c.warn && Math.floor(now * 2.5) % 2 === 0;
    });
    if (this.balls) mv.balls.forEach((b, i) => {
      const y = b.on ? T.height(b.x, b.z) + b.r * 0.9 : -500;
      this._e.set(b.roll, 0.6 * i, b.roll * 0.4); this._q.setFromEuler(this._e); this._s.setScalar(b.r);
      this._m.compose(this._p.set(b.x, y, b.z), this._q, this._s); this.balls!.setMatrixAt(i, this._m);
    }), this.balls.instanceMatrix.needsUpdate = true;
    mv.convoys.forEach((c, i) => { const m = this.convoys[i]; m.position.set(c.x, T.height(c.x, c.z), c.z); m.rotation.y = c.yaw; });
    mv.ferries.forEach((f, i) => { const m = this.ferries[i]; m.position.set(f.x, (this.course.river?.level ?? 0) + 0.2, f.z); m.rotation.y = f.yaw; });
    if (this.gulls) {
      let k = 0;
      for (const g of mv.gulls) for (let i = 0; i < g.n; i++, k++) {
        const a = now * (0.25 + 0.04 * (i % 3)) + i * 6.28 / g.n, r = g.r * (0.6 + 0.4 * ((i * 7) % 5) / 4), flap = Math.sin(now * 9 + i) * 0.5;
        this._e.set(0, -a + Math.PI / 2, flap * 0.3); this._q.setFromEuler(this._e); this._s.set(1.1, 1, 1.1);
        this._m.compose(this._p.set(g.x + Math.cos(a) * r, g.h + Math.sin(now * 0.7 + i) * 2 + (i % 4), g.z + Math.sin(a) * r), this._q, this._s); this.gulls.setMatrixAt(k, this._m);
      }
      this.gulls.instanceMatrix.needsUpdate = true;
    }
  }
}

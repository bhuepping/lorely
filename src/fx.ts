// Partikeleffekte: EIN Points-Mesh (feste Pixel-Quadrate, 1 Draw Call) + Auslöser aus dem Fahrzustand. Nur Optik.
import * as THREE from 'three';
import { ParticlePool } from './particles';
import type { Course } from './level';
import type { Vehicle, Input } from './physics/vehicle';

const N = 448;
type Rgb = [number, number, number];
const rgb = (hex: number, mix = 0, to = 0xffffff): Rgb => { const c = new THREE.Color(hex).lerp(new THREE.Color(to), mix); return [c.r, c.g, c.b]; };
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// Untergrund-Klassen nach Id (terrain.ts)
const ASPH = new Set([0, 5, 8, 10]);   // Asphalt, nass, Holz, Kopfstein: Qualm statt Staub
const LOOSE = new Set([1, 2, 3, 4, 7, 9, 6]);   // Schotter, Eis, Schnee, Tiefschnee, Sand, Gras, nasser Sand
const SNOWY = new Set([2, 3, 4]);
const MUD_ID = 12;   // Matsch: dunkle, schwere Klumpen

const VERT = `
uniform float uScale; uniform float uLight; uniform vec3 uFog; uniform vec2 uFogR;
attribute float aSize; attribute float aLit; attribute vec3 aColor;
varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  float px = floor(aSize * uScale / max(d, 0.5) * smoothstep(1.5, 4.5, d));
  gl_Position = projectionMatrix * mv;
  if (aSize <= 0.0 || px < 1.0 || d < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = clamp(px, 1.0, mix(14.0, 9.0, step(0.5, aLit)));   // Konfetti/Funken (lit 0) dürfen größer
  vec3 c = aColor * mix(1.0, uLight, aLit);
  vC = mix(c, uFog, smoothstep(uFogR.x, uFogR.y, d) * aLit);
}`;
const FRAG = `
varying vec3 vC;
void main(){ gl_FragColor = vec4(vC, 1.0);
#include <colorspace_fragment>
}`;

export class Fx {
  readonly pool = new ParticlePool(N);
  readonly points: THREE.Points;
  private posA = new Float32Array(N * 3); private colA = new Float32Array(N * 3); private sizeA = new Float32Array(N); private litA = new Float32Array(N);
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private acc = new Float32Array(16);
  private t = 0;
  /** Rest-Sekunden, in denen kein Staub/Qualm Platz im Pool belegt (sonst überschreibt er das Konfetti) */
  private confT = 0;
  private world: string; private night: boolean;
  private cols: Record<string, Rgb>;
  private _db = new THREE.Vector2(); private _dir = new THREE.Vector3();
  /** Zähler für Tests/Messung: seit Start ausgelöste Teilchen je Art */
  readonly emitted: Record<string, number> = {};

  constructor(private course: Course, night: boolean) {
    this.world = course.world; this.night = night;
    const mk = (a: Float32Array, n: number, name: string) => { const at = new THREE.BufferAttribute(a, n); at.setUsage(THREE.DynamicDrawUsage); this.geo.setAttribute(name, at); };
    mk(this.posA, 3, 'position'); mk(this.colA, 3, 'aColor'); mk(this.sizeA, 1, 'aSize'); mk(this.litA, 1, 'aLit');
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, fog: false, uniforms: { uScale: { value: 300 }, uLight: { value: 1 }, uFog: { value: new THREE.Color(course.fog.color) }, uFogR: { value: new THREE.Vector2(course.fog.near, course.fog.far) } } });
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false;
    this.cols = {
      smoke: rgb(0xe4e4ea), exhaust: rgb(0xb8b8c0), spray: rgb(0xdcecff), snow: rgb(0xf4f8ff), ford: rgb(0xcfe6f5),
      mud: rgb(0x5b4330), sand: rgb(0xe8d49a), grass: rgb(0xb3a47a), dust: rgb(0xcbbfa6),
    };
  }

  private surfCol(id: number): Rgb {
    if (SNOWY.has(id)) return this.cols.snow;
    const h = this.course.surfaceColors[id];
    if (h !== undefined) return rgb(h, 0.38);
    return id === 7 || id === 6 ? this.cols.sand : id === 9 ? this.cols.grass : this.cols.dust;
  }

  private n(k: number, rate: number, dt: number): number { this.acc[k] += rate * dt; const c = Math.floor(this.acc[k]); this.acc[k] -= c; return c; }
  private count(kind: string, c = 1): void { this.emitted[kind] = (this.emitted[kind] ?? 0) + c; }

  /** Radposition am Boden (Weltkoordinaten) */
  private wheel(car: Vehicle, i: number, out: number[]): void {
    const { r, u, bz } = car.axes(), m = car.mount[i];
    out[0] = car.pos[0] + r[0] * m[0] + u[0] * m[1] + bz[0] * m[2]; out[2] = car.pos[2] + r[2] * m[0] + u[2] * m[1] + bz[2] * m[2];
    out[1] = this.course.terrain.height(out[0], out[2]) + 0.12;
  }
  private w = [0, 0, 0];

  /** Verkehrsauto (Maße, Lage) aus Pixel-Partikeln: mode 0 = löst sich auf, 1 = setzt sich zusammen (~0,5 s, gemeinsamer Pool, kein Draw Call). paint = Lackfarbe 0…1 */
  carBurst(c: { x: number; z: number; yaw: number; hx: number; hz: number }, paint: [number, number, number], mode: 0 | 1): void {
    const P = this.pool, y0 = this.course.terrain.height(c.x, c.z), cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), life = 0.5;
    this.count(mode ? 'carIn' : 'carOut', 36);
    for (let i = 0; i < 36; i++) {
      const lx = (P.rnd() * 2 - 1) * c.hx, lz = (P.rnd() * 2 - 1) * c.hz, ly = 0.25 + P.rnd() * 1.1;
      const x = c.x + cs * lx + sn * lz, z = c.z - sn * lx + cs * lz, k = P.rnd(), col = k < 0.6 ? paint : k < 0.85 ? [0.1, 0.11, 0.13] : [1, 0.92, 0.7];
      const ox = (x - c.x) * 2 + (P.rnd() - 0.5), oz = (z - c.z) * 2 + (P.rnd() - 0.5), oy = 1 + P.rnd() * 2;      // Weg nach außen/oben
      if (mode === 0) P.emit({ x, y: y0 + ly, z, vx: ox, vy: oy, vz: oz, life, size: 0.2 + P.rnd() * 0.12, grav: 3, drag: 1, r: col[0], g: col[1], b: col[2] });
      else P.emit({ x: x + ox, y: y0 + ly + oy * life, z: z + oz, vx: -ox, vy: -oy, vz: -oz, life, size: 0.2 + P.rnd() * 0.12, r: col[0], g: col[1], b: col[2] });
    }
  }

  /** Konfetti im Ziel (Zeitrennen): arme den Schauer – 2 s lang rieseln ~150 bunte Pixel-Quadrate je Sekunde VOR DER KAMERA (`shower`, folgt der Kamera, weil Auto und
   *  Kamera nach dem Ziel noch ein Stück weiterfahren; ein Burst am Ziel lag nach 0,5 s hinter der Kamera). */
  confetti(): void { this.confE = 2; this.confT = 3.8; }
  private confE = 0; private confAcc = 0;

  /** Schauer-Schritt: Teilchen 8–26 m voraus der Kamera (cx, cy, cz; dx, dz = Blickrichtung in der Ebene), im Sichtfeld, flatternd von oben fallend */
  shower(cx: number, cy: number, cz: number, dx: number, dz: number, dt: number): void {
    const l = Math.hypot(dx, dz) || 1, fx = dx / l, fz = dz / l, P = this.pool, cols: Rgb[] = [[1, 0.02, 0.05], [1, 0.62, 0], [0, 0.55, 1], [0.03, 1, 0.12], [1, 0.03, 0.75], [1, 0.9, 0.05]];   // linear gedacht (Ausgabe wird nach sRGB gehoben): satt statt pastell
    this.confAcc += 150 * dt; const n = Math.floor(this.confAcc); this.confAcc -= n; this.count('konfetti', n);
    for (let i = 0; i < n; i++) {
      const c = cols[Math.floor(P.rnd() * cols.length)], ahead = 8 + P.rnd() * 18, side = (P.rnd() * 2 - 1) * ahead * 0.5, up = (P.rnd() * 1.4 - 0.5) * ahead * 0.3;
      P.emit({ x: cx + fx * ahead - fz * side, y: cy + up + 2, z: cz + fz * ahead + fx * side, vx: (P.rnd() - 0.5) * 3, vy: P.rnd() * 3, vz: (P.rnd() - 0.5) * 3, life: 2 + P.rnd() * 1, size: 0.4 + P.rnd() * 0.3, grav: 2.2, drag: 1.1, sway: 4, r: c[0], g: c[1], b: c[2], lit: 0 });
    }
  }

  /** Funken bei hartem Anstoß (strength = Aufprallgeschwindigkeit m/s) */
  impact(car: Vehicle, strength: number): void {
    if (strength < 5) return;
    const P = this.pool, c = Math.min(22, Math.round(strength * 1.4)), sp = Math.hypot(car.vel[0], car.vel[2]) || 1;
    const dx = car.vel[0] / sp, dz = car.vel[2] / sp;
    for (let i = 0; i < c; i++) {
      const a = P.rnd() * 6.283, v = 2 + P.rnd() * 5, hot = P.rnd();
      P.emit({ x: car.pos[0] + dx * 1.5, y: car.pos[1] - 0.1, z: car.pos[2] + dz * 1.5, vx: Math.cos(a) * v - dx * 2, vy: 1.5 + P.rnd() * 4, vz: Math.sin(a) * v - dz * 2, life: 0.22 + P.rnd() * 0.3, size: 0.07 + P.rnd() * 0.05, grav: 14, drag: 1, lit: 0, r: 1, g: 0.6 + hot * 0.4, b: hot > 0.8 ? 0.7 : 0.15 });
    }
    this.count('funken', c);
  }

  /** Landung (car.landing = Aufprall m/s): Staubring an den Rädern */
  land(car: Vehicle, strength: number): void {
    const P = this.pool, c = Math.min(8, Math.round(2 + strength * 0.6));
    for (let w = 0; w < 4; w++) {
      this.wheel(car, w, this.w);
      const id = this.course.terrain.surface(this.w[0], this.w[2]).id, col = ASPH.has(id) ? this.cols.dust : this.surfCol(id);
      for (let i = 0; i < c; i++) {
        const a = P.rnd() * 6.283, v = 1.5 + P.rnd() * 2.5;
        P.emit({ x: this.w[0], y: this.w[1], z: this.w[2], vx: Math.cos(a) * v, vy: 0.4 + P.rnd() * 1.2, vz: Math.sin(a) * v, life: 0.7 + P.rnd() * 0.5, size: 0.22 + P.rnd() * 0.14, grow: 1.8, drag: 2.2, grav: -0.3, r: col[0], g: col[1], b: col[2] });
      }
    }
    this.count('landestaub', c * 4);
  }

  /** je Frame: Auslöser + Teilchen bewegen + Puffer schreiben */
  update(dt: number, car: Vehicle, inp: Input, o: { camera: THREE.PerspectiveCamera; tunnelF: number; live: boolean; renderer: THREE.WebGLRenderer }): void {
    const P = this.pool; this.t += dt;
    this.confT = Math.max(0, this.confT - dt);
    if (this.confE > 0) { this.confE -= dt; const d = o.camera.getWorldDirection(this._dir); this.shower(o.camera.position.x, o.camera.position.y, o.camera.position.z, d.x, d.z, dt); }
    if (o.live && dt > 0 && this.confT <= 0) this.emitAll(dt, car, inp, o.tunnelF);
    P.step(dt);
    const { renderer, camera } = o;
    renderer.getDrawingBufferSize(this._db);
    this.mat.uniforms.uScale.value = this._db.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    this.mat.uniforms.uLight.value = (this.night ? 0.55 : this.course.sea ? 0.8 : 1) * (1 - 0.5 * o.tunnelF);
    for (let i = 0; i < N; i++) {
      this.posA[i * 3] = P.x[i]; this.posA[i * 3 + 1] = P.y[i]; this.posA[i * 3 + 2] = P.z[i];
      this.colA[i * 3] = P.r[i]; this.colA[i * 3 + 1] = P.g[i]; this.colA[i * 3 + 2] = P.b[i];
      this.sizeA[i] = P.sizeOf(i) * 0.65; this.litA[i] = P.lit[i];
    }
    for (const k of ['position', 'aColor', 'aSize', 'aLit']) this.geo.getAttribute(k).needsUpdate = true;
  }

  private emitAll(dt: number, car: Vehicle, inp: Input, tunnelF: number): void {
    const P = this.pool, terr = this.course.terrain, spd = car.speed, fwd = car.forwardSpeed, R = car.p.wheelRadius;
    const { f } = car.axes(), sa = Math.abs(car.slipAngle), hb = inp.handbrake && spd > 5;
    // Rad-Effekte: Staub/Schnee (loser Grund), Qualm (Asphalt), Spritzwasser (nass/Furt)
    // auch im Stand: ein durchdrehendes Rad (Hinterrad oder angetriebenes Vorderrad) wirft Dreck, sonst sieht man im Matsch keinen Grund fürs Hängen
    const spinning = (w: number) => car.contact[w] && Math.abs(car.omega[w] * R - fwd) > 4;
    if ((spd > 1.5 || [0, 1, 2, 3].some(spinning)) && !car.drowned) {
      for (let w = 0; w < 4; w++) {
        if (!car.contact[w] || (w < 2 && !spinning(w)) || (spd <= 1.5 && !spinning(w))) continue;
        this.wheel(car, w, this.w);
        const id = terr.surface(this.w[0], this.w[2]).id, slipL = Math.abs(car.omega[w] * R - fwd), slip = slipL + sa * spd;
        if (car.shallow > 0 && spd > 4 && id !== MUD_ID) {   // Furt: Wasser nach hinten/zur Seite
          const c = this.n(w, 55 * clamp(spd / 22), dt), col = this.cols.ford;
          for (let i = 0; i < c; i++) P.emit({ x: this.w[0], y: this.w[1] + 0.1, z: this.w[2], vx: (P.rnd() - 0.5) * 3 - f[0] * spd * 0.25, vy: 2 + P.rnd() * 2.5 + spd * 0.06, vz: (P.rnd() - 0.5) * 3 - f[2] * spd * 0.25, life: 0.5 + P.rnd() * 0.3, size: 0.13 + P.rnd() * 0.09, grav: 12, drag: 0.4, r: col[0], g: col[1], b: col[2] });
          this.count('furt', c);
        } else if (id === MUD_ID) {   // Matsch: schwere Klumpen, hoch und schräg nach hinten; viel schon bei Schritttempo und Durchdrehen
          const c = this.n(w + 12, 70 * clamp(0.25 + spd / 20 * 0.5 + slip / 10 * 0.5), dt), col = this.cols.mud;
          for (let i = 0; i < c; i++) P.emit({ x: this.w[0] + (P.rnd() - 0.5) * 0.4, y: this.w[1] + 0.05, z: this.w[2] + (P.rnd() - 0.5) * 0.4, vx: (P.rnd() - 0.5) * 2.6 - f[0] * (2 + spd * 0.2), vy: 2.2 + P.rnd() * 2.6 + spd * 0.05, vz: (P.rnd() - 0.5) * 2.6 - f[2] * (2 + spd * 0.2), life: 0.55 + P.rnd() * 0.45, size: 0.14 + P.rnd() * 0.12, grav: 12, drag: 0.4, r: col[0] * (0.8 + P.rnd() * 0.4), g: col[1] * (0.8 + P.rnd() * 0.4), b: col[2] * (0.8 + P.rnd() * 0.4) });
          this.count('matsch', c);
        } else if (id === 5 && spd > 6) {   // nasser Asphalt: feiner Sprühnebel hinter den Rädern
          const c = this.n(w + 4, 40 * clamp(spd / 30), dt), col = this.cols.spray;
          for (let i = 0; i < c; i++) P.emit({ x: this.w[0], y: this.w[1], z: this.w[2], vx: (P.rnd() - 0.5) * 1.6 - f[0] * spd * 0.12, vy: 1 + P.rnd() * 1.5, vz: (P.rnd() - 0.5) * 1.6 - f[2] * spd * 0.12, life: 0.45 + P.rnd() * 0.3, size: 0.1 + P.rnd() * 0.07, grow: 1.0, grav: 4, drag: 1.2, r: col[0], g: col[1], b: col[2] });
          this.count('spritz', c);
        } else if (ASPH.has(id)) {   // Qualm beim Driften/Handbremse
          const inten = (hb && car.hb > 0.3 ? 0.7 : 0) + (sa > 0.28 && spd > 7 ? clamp((sa - 0.2) / 0.5) : 0) + (slipL > 7 && spd < 18 ? 0.5 : 0);
          if (inten > 0.15) {
            const c = this.n(w + 8, 50 * clamp(inten), dt), col = this.cols.smoke;
            for (let i = 0; i < c; i++) P.emit({ x: this.w[0], y: this.w[1], z: this.w[2], vx: (P.rnd() - 0.5) * 1.2, vy: 0.5 + P.rnd() * 0.8, vz: (P.rnd() - 0.5) * 1.2, life: 0.8 + P.rnd() * 0.6, size: 0.2 + P.rnd() * 0.12, grow: 2.2, drag: 1.4, grav: -0.2, r: col[0], g: col[1], b: col[2] });
            this.count('qualm', c);
          }
        } else if (LOOSE.has(id)) {   // Staub/Schnee: stärker bei Tempo und Schlupf
          const inten = clamp(0.12 + spd / 38 * 0.45 + slip / 14 * 0.55), snow = SNOWY.has(id);
          const c = this.n(w + 2, (snow ? 60 : 55) * inten, dt), col = this.surfCol(id);
          for (let i = 0; i < c; i++) P.emit({ x: this.w[0] + (P.rnd() - 0.5) * 0.3, y: this.w[1], z: this.w[2] + (P.rnd() - 0.5) * 0.3, vx: (P.rnd() - 0.5) * 1.4 - f[0] * spd * 0.1, vy: (snow ? 1.4 : 0.8) + P.rnd() * (snow ? 1.8 : 1.2), vz: (P.rnd() - 0.5) * 1.4 - f[2] * spd * 0.1, life: 0.55 + P.rnd() * 0.5, size: (snow ? 0.17 : 0.15) + P.rnd() * 0.1, grow: snow ? 1.5 : 1.8, drag: 1.6, grav: snow ? 1.5 : 0, r: col[0], g: col[1], b: col[2] });
          this.count(snow ? 'schnee' : 'staub', c);
        }
      }
    }
    // Unterboden schleift
    if (car.scrape > 1500 && car.scrapeV > 3 && spd > 4) {
      const c = this.n(8, 40 * clamp(car.scrapeV / 12), dt);
      for (let i = 0; i < c; i++) { const hot = P.rnd(); P.emit({ x: car.pos[0] - f[0] * 0.5, y: car.pos[1] - 0.6, z: car.pos[2] - f[2] * 0.5, vx: (P.rnd() - 0.5) * 4 - f[0] * 3, vy: 1 + P.rnd() * 2.5, vz: (P.rnd() - 0.5) * 4 - f[2] * 3, life: 0.15 + P.rnd() * 0.25, size: 0.06 + P.rnd() * 0.04, grav: 12, drag: 0.8, lit: 0, r: 1, g: 0.65 + hot * 0.35, b: hot > 0.8 ? 0.6 : 0.15 }); }
      this.count('funken', c);
    }
    // Auspuff: Wölkchen beim Gasgeben (aus der Ruhe/niedrige Gänge), hinten links
    if (inp.throttle > 0.4 && spd < 24 && !car.reverse && car.contact[2]) {
      const { r, bz } = car.axes(), c = this.n(9, (spd < 6 ? 9 : 5) * inp.throttle, dt), cold = this.world === 'snow' ? 1.3 : 1, col = this.cols.exhaust;
      for (let i = 0; i < c * cold; i++) P.emit({ x: car.pos[0] + bz[0] * (car.p.size.l / 2) - r[0] * 0.5, y: car.pos[1] - 0.45, z: car.pos[2] + bz[2] * (car.p.size.l / 2) - r[2] * 0.5, vx: bz[0] * 1.2 + car.vel[0] * 0.5 + (P.rnd() - 0.5) * 0.4, vy: 0.4 + P.rnd() * 0.4, vz: bz[2] * 1.2 + car.vel[2] * 0.5 + (P.rnd() - 0.5) * 0.4, life: 0.5 + P.rnd() * 0.3, size: 0.09 + P.rnd() * 0.05, grow: 1.6, drag: 1.5, grav: -0.1, r: col[0], g: col[1], b: col[2] });
      this.count('auspuff', c);
    }
    // Blätter am Rhein: dezent, wehend, rund um das Auto (nicht im Tunnel)
    if (this.world === 'rhein' && tunnelF < 0.3) {
      const c = this.n(10, 2.6, dt);
      for (let i = 0; i < c; i++) {
        const a = P.rnd() * 6.283, d = 4 + P.rnd() * 14, x = car.pos[0] + Math.cos(a) * d + f[0] * 8, z = car.pos[2] + Math.sin(a) * d + f[2] * 8, k = P.rnd();
        const col = k < 0.4 ? LEAF[0] : k < 0.7 ? LEAF[1] : k < 0.9 ? LEAF[2] : LEAF[3];
        P.emit({ x, y: terr.height(x, z) + 1.5 + P.rnd() * 4, z, vx: 1.6 + Math.sin(this.t * 0.3) * 0.6, vy: -0.5 - P.rnd() * 0.4, vz: 0.5, life: 5 + P.rnd() * 3, size: 0.1 + P.rnd() * 0.04, sway: 2.2, drag: 0.5, grav: 0.3, r: col[0], g: col[1], b: col[2] });
      }
      this.count('blaetter', c);
    }
  }

  dispose(): void { this.geo.dispose(); this.mat.dispose(); }
}
const LEAF: Rgb[] = [rgb(0xc9772a), rgb(0xd9b232), rgb(0x8a4a24), rgb(0x6f9a3a)];

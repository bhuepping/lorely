// Regen: EIN LineSegments-Mesh (1 Draw Call, nur sichtbar bei Regen), Tropfen als 1-px-Striche im Kasten um die Kamera.
// Position + Wrap laufen komplett im Vertex-Shader (keine CPU-Arbeit je Frame außer ein paar Uniforms). Rein Optik.
import * as THREE from 'three';

const N = 1300;                 // Striche
const BOX: [number, number, number] = [30, 16, 34];
const FALL: [number, number, number] = [1.2, -17, 0.6];   // Weltgeschwindigkeit der Tropfen (m/s)

const VERT = `
uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uFall; uniform vec3 uRel; uniform float uTime, uRain, uLen;
attribute vec4 aSeed; attribute float aEnd;
varying float vA;
void main(){
  vec3 q = mod(aSeed.xyz * uBox + uFall * uTime - uCam, uBox);
  vec3 w = uCam + q - uBox * 0.5;
  w -= normalize(uRel) * uLen * aEnd;                  // Schweif entgegen der Relativbewegung (Auto fährt -> Striche zeigen zur Kamera)
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float d = -mv.z;
  float edge = smoothstep(0.0, 3.0, q.y) * smoothstep(0.0, 3.0, uBox.y - q.y) * smoothstep(0.0, 4.0, min(q.x, uBox.x - q.x)) * smoothstep(0.0, 4.0, min(q.z, uBox.z - q.z));
  vA = (1.0 - 0.6 * aEnd) * edge * smoothstep(0.8, 3.0, d);
  gl_Position = projectionMatrix * mv;
  if (aSeed.w > uRain) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAG = `
uniform vec3 uCol; uniform float uAlpha;
varying float vA;
void main(){ gl_FragColor = vec4(uCol, vA * uAlpha);
#include <colorspace_fragment>
}`;

export class RainMesh {
  readonly mesh: THREE.LineSegments;
  private mat: THREE.ShaderMaterial;
  private geo = new THREE.BufferGeometry();
  private t = 0;
  /** aktuelle Stärke 0…1 (weich nachgeführt) */
  f = 0;
  private _rel = new THREE.Vector3(); private _fw = new THREE.Vector3();

  constructor(night: boolean, fogColor: number) {
    const pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2 * 4), end = new Float32Array(N * 2);
    let a = 0x9e3779b9; const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < N; i++) {
      const x = rnd(), y = rnd(), z = rnd(), r = (i + rnd()) / N;
      for (let e = 0; e < 2; e++) { const k = i * 2 + e; seed.set([x, y, z, r], k * 4); end[k] = e; }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const col = new THREE.Color(night ? 0xb4c6f0 : 0xdde6f4).lerp(new THREE.Color(fogColor), 0.1);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false,
      uniforms: { uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...BOX) }, uFall: { value: new THREE.Vector3(...FALL) }, uRel: { value: new THREE.Vector3(...FALL) }, uTime: { value: 0 }, uRain: { value: 0 }, uLen: { value: 1 }, uCol: { value: col }, uAlpha: { value: night ? 0.8 : 0.6 } },
    });
    this.mesh = new THREE.LineSegments(this.geo, this.mat); this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 5;
  }

  /** target 0…1; Nachführung ~1,5 s */
  update(dt: number, target: number, camera: THREE.Camera, vel: ArrayLike<number>): void {
    const k = 1 - Math.exp(-dt / 0.5); this.f += (target - this.f) * k;
    if (Math.abs(target - this.f) < 0.004) this.f = target;
    this.mesh.visible = this.f > 0.01;
    if (!this.mesh.visible) return;
    this.t = (this.t + dt) % 500;
    const u = this.mat.uniforms;
    u.uTime.value = this.t; u.uRain.value = this.f; camera.getWorldDirection(this._fw); u.uCam.value.copy(camera.position).addScaledVector(this._fw, 9);
    this._rel.set(FALL[0] - vel[0], FALL[1] - vel[1], FALL[2] - vel[2]);
    u.uRel.value.copy(this._rel);
    u.uLen.value = Math.min(3.2, 0.5 + 0.045 * this._rel.length());
  }
  dispose(): void { this.geo.dispose(); this.mat.dispose(); }
}

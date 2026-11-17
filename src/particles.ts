// Partikel-Pool (ohne three): feste Größe, Ringpuffer – der älteste Platz wird überschrieben, nichts wird je angelegt oder freigegeben.
// Rein optisch: keine Rückwirkung auf Physik/Determinismus. Der Zufall hat einen eigenen Zähler.
export interface Spawn {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; size: number; grow?: number; grav?: number; drag?: number; sway?: number;
  r: number; g: number; b: number; lit?: number;   // lit 1 = vom Licht (Nacht/Tunnel) und Nebel abhängig, 0 = leuchtet (Funken)
}

export class ParticlePool {
  readonly n: number;
  readonly x: Float32Array; readonly y: Float32Array; readonly z: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  readonly age: Float32Array; readonly life: Float32Array;
  private size0: Float32Array; private grow: Float32Array; private grav: Float32Array; private drag: Float32Array; private sway: Float32Array; private ph: Float32Array;
  readonly r: Float32Array; readonly g: Float32Array; readonly b: Float32Array; readonly lit: Float32Array;
  private head = 0;
  /** Anzahl lebender Teilchen (nach step) */
  alive = 0;
  private seed = 0x9e3779b9;

  constructor(n: number) {
    this.n = n;
    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.z = f(); this.vx = f(); this.vy = f(); this.vz = f(); this.age = f(); this.life = f();
    this.size0 = f(); this.grow = f(); this.grav = f(); this.drag = f(); this.sway = f(); this.ph = f();
    this.r = f(); this.g = f(); this.b = f(); this.lit = f();
  }

  /** Zufall 0..1 (xorshift, nur für die Optik) */
  rnd(): number { let s = this.seed; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.seed = s >>> 0; return (this.seed >>> 8) / 16777216; }

  emit(o: Spawn): void {
    const i = this.head; this.head = (this.head + 1) % this.n;
    this.x[i] = o.x; this.y[i] = o.y; this.z[i] = o.z; this.vx[i] = o.vx; this.vy[i] = o.vy; this.vz[i] = o.vz;
    this.age[i] = 0; this.life[i] = o.life; this.size0[i] = o.size; this.grow[i] = o.grow ?? 0; this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 0; this.sway[i] = o.sway ?? 0;
    this.ph[i] = this.rnd() * 6.283; this.r[i] = o.r; this.g[i] = o.g; this.b[i] = o.b; this.lit[i] = o.lit ?? 1;
  }

  /** Alles um dt weiterbewegen; abgelaufene Teilchen werden auf life = 0 gesetzt (Platz frei). */
  step(dt: number): void {
    let a = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const age = this.age[i] + dt;
      if (age >= this.life[i]) { this.life[i] = 0; continue; }
      this.age[i] = age; a++;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k; this.vz[i] *= k; this.vy[i] = this.vy[i] * k - this.grav[i] * dt;
      const sw = this.sway[i];
      if (sw) { const p = this.ph[i] + age * 3.1; this.vx[i] += Math.cos(p) * sw * dt; this.vz[i] += Math.sin(p * 0.8) * sw * dt; }
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
    }
    this.alive = a;
  }

  /** Kantenlänge (m): wächst, schrumpft am Lebensende (harte Pixel statt Transparenz) */
  sizeOf(i: number): number {
    const L = this.life[i]; if (L <= 0) return 0;
    const t = this.age[i] / L, fade = Math.min(1, (1 - t) / 0.3);
    return this.size0[i] * (1 + this.grow[i] * t) * fade;
  }
}

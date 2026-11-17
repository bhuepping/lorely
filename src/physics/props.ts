// Leichte Hindernisse (Pylonen): eigene kleine Starrkörperphysik ohne three.
// Pylon = Quader 0,5 x 1,5 x 0,5 m, 8 kg. Gegen das Auto: 3 Kugeln entlang der Achse gegen die Auto-OBB.
// Boden: Federkontakt an den 8 Ecken + Reibung. Ruhende Pylonen schlafen (kosten dann nichts).
import type { Terrain } from './terrain';
import type { Vehicle } from './vehicle';

export const PYLON_SPOTS: [number, number][] = (() => {
  const s: [number, number][] = [];
  for (let k = 0; k < 14; k++) s.push([-9, -40 - k * 8], [9, -40 - k * 8]);                                      // Straße
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; s.push([Math.cos(a) * 18, Math.sin(a) * 14]); }   // Ring auf dem Platz
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; s.push([105 + Math.cos(a) * 30, 15 + Math.sin(a) * 30]); } // um das Eis
  return s;
})();

const HX = 0.25, HY = 0.75, HZ = 0.25;        // Halbmaße
const MASS = 8, G = 9.81, RAD = 0.25;
const I_BODY = [MASS / 12 * (4 * HY * HY + 4 * HZ * HZ), MASS / 12 * (4 * HX * HX + 4 * HZ * HZ), MASS / 12 * (4 * HX * HX + 4 * HY * HY)];
const K_GROUND = 12000, C_GROUND = 150, MU_GROUND = 0.55;
const E_CAR = 0.35, MU_CAR = 0.3;
const CAR_REACTION = 2.5;     // Pfosten sind leicht; der Gegenimpuls wird absichtlich spürbar überhöht
const SUB = 2;                // Teilschritte je Physikschritt

export class Props {
  readonly n: number;
  readonly pos: Float64Array; readonly q: Float64Array; readonly v: Float64Array; readonly w: Float64Array;
  readonly asleep: Uint8Array; private calm: Float64Array;
  /** wahr, wenn sich seit dem letzten Lesen etwas bewegt hat (Renderer setzt es zurück) */
  dirty = true;
  /** Aufprall-Callback (Stärke ~ Aufprallgeschwindigkeit m/s) */
  onImpact: (strength: number) => void = () => {};
  private R = new Float64Array(9);

  constructor(private terrain: Terrain, private spots: [number, number][] = PYLON_SPOTS) {
    this.n = spots.length;
    this.pos = new Float64Array(this.n * 3); this.q = new Float64Array(this.n * 4);
    this.v = new Float64Array(this.n * 3); this.w = new Float64Array(this.n * 3);
    this.asleep = new Uint8Array(this.n); this.calm = new Float64Array(this.n);
    this.reset();
  }

  reset(): void {
    for (let i = 0; i < this.n; i++) {
      const [x, z] = this.spots[i];
      this.pos.set([x, this.terrain.height(x, z) + HY, z], i * 3);
      this.q.set([0, 0, 0, 1], i * 4); this.v.fill(0, i * 3, i * 3 + 3); this.w.fill(0, i * 3, i * 3 + 3);
      this.asleep[i] = 1; this.calm[i] = 0;
    }
    this.dirty = true;
  }

  private rot(i: number): Float64Array {
    const x = this.q[i * 4], y = this.q[i * 4 + 1], z = this.q[i * 4 + 2], w = this.q[i * 4 + 3], R = this.R;
    R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w); R[2] = 2 * (x * z + y * w);
    R[3] = 2 * (x * y + z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w);
    R[6] = 2 * (x * z - y * w); R[7] = 2 * (y * z + x * w); R[8] = 1 - 2 * (x * x + y * y);
    return R;      // Zeile-major, Spalten = Körperachsen in Weltkoordinaten
  }

  step(car: Vehicle, dt: number): void {
    this.collideCar(car);
    const h = dt / SUB;
    for (let i = 0; i < this.n; i++) {
      if (this.asleep[i]) continue;
      this.dirty = true;
      for (let s = 0; s < SUB; s++) this.integrate(i, h);
      const sp = Math.hypot(this.v[i * 3], this.v[i * 3 + 1], this.v[i * 3 + 2]);
      const sw = Math.hypot(this.w[i * 3], this.w[i * 3 + 1], this.w[i * 3 + 2]);
      this.calm[i] = sp < 0.1 && sw < 0.2 ? this.calm[i] + dt : 0;
      if (this.calm[i] > 0.5) { this.asleep[i] = 1; this.v.fill(0, i * 3, i * 3 + 3); this.w.fill(0, i * 3, i * 3 + 3); }
    }
  }

  private integrate(i: number, h: number): void {
    const p = this.pos, v = this.v, w = this.w, q = this.q, o3 = i * 3, o4 = i * 4;
    const R = this.rot(i);
    let Fx = 0, Fy = -MASS * G, Fz = 0, Tx = 0, Ty = 0, Tz = 0;
    for (let c = 0; c < 8; c++) {
      const lx = (c & 1 ? HX : -HX), ly = (c & 2 ? HY : -HY), lz = (c & 4 ? HZ : -HZ);
      const rx = R[0] * lx + R[1] * ly + R[2] * lz, ry = R[3] * lx + R[4] * ly + R[5] * lz, rz = R[6] * lx + R[7] * ly + R[8] * lz;
      const cx = p[o3] + rx, cy = p[o3 + 1] + ry, cz = p[o3 + 2] + rz;
      const d = this.terrain.height(cx, cz) - cy;
      if (d <= 0) continue;
      const vx = v[o3] + w[o3 + 1] * rz - w[o3 + 2] * ry, vy = v[o3 + 1] + w[o3 + 2] * rx - w[o3] * rz, vz = v[o3 + 2] + w[o3] * ry - w[o3 + 1] * rx;
      const fn = Math.max(0, K_GROUND * Math.min(d, 0.3) - C_GROUND * vy);
      const vt = Math.hypot(vx, vz), fk = MU_GROUND * fn / Math.max(vt, 0.15);
      const fx = -fk * vx, fz = -fk * vz;
      Fx += fx; Fy += fn; Fz += fz;
      Tx += ry * fz - rz * fn; Ty += rz * fx - rx * fz; Tz += rx * fn - ry * fx;
    }
    v[o3] += Fx / MASS * h; v[o3 + 1] += Fy / MASS * h; v[o3 + 2] += Fz / MASS * h;
    // Drehmoment ins Körpersystem (R^T), durch I, zurück (R)
    const tl0 = R[0] * Tx + R[3] * Ty + R[6] * Tz, tl1 = R[1] * Tx + R[4] * Ty + R[7] * Tz, tl2 = R[2] * Tx + R[5] * Ty + R[8] * Tz;
    const a0 = tl0 / I_BODY[0] * h, a1 = tl1 / I_BODY[1] * h, a2 = tl2 / I_BODY[2] * h;
    w[o3] += R[0] * a0 + R[1] * a1 + R[2] * a2; w[o3 + 1] += R[3] * a0 + R[4] * a1 + R[5] * a2; w[o3 + 2] += R[6] * a0 + R[7] * a1 + R[8] * a2;
    const wd = Math.exp(-0.3 * h); w[o3] *= wd; w[o3 + 1] *= wd; w[o3 + 2] *= wd;
    p[o3] += v[o3] * h; p[o3 + 1] += v[o3 + 1] * h; p[o3 + 2] += v[o3 + 2] * h;
    const hx = w[o3] * h * 0.5, hy = w[o3 + 1] * h * 0.5, hz = w[o3 + 2] * h * 0.5;
    const nx = q[o4] + hx * q[o4 + 3] + hy * q[o4 + 2] - hz * q[o4 + 1];
    const ny = q[o4 + 1] - hx * q[o4 + 2] + hy * q[o4 + 3] + hz * q[o4];
    const nz = q[o4 + 2] + hx * q[o4 + 1] - hy * q[o4] + hz * q[o4 + 3];
    const nw = q[o4 + 3] - hx * q[o4] - hy * q[o4 + 1] - hz * q[o4 + 2];
    const l = Math.hypot(nx, ny, nz, nw);
    q[o4] = nx / l; q[o4 + 1] = ny / l; q[o4 + 2] = nz / l; q[o4 + 3] = nw / l;
  }

  /** Körper i (z. B. Schranken-Stück) an (x,z) auf den Boden setzen und mit (vx,vy,vz) losschicken; wacht auf. */
  launch(i: number, x: number, z: number, vx: number, vy: number, vz: number): void {
    const o3 = i * 3;
    this.pos.set([x, this.terrain.height(x, z) + HY + 0.05, z], o3);
    this.q.set([0, 0, 0, 1], i * 4); this.v.set([vx, vy, vz], o3); this.w.fill(0, o3, o3 + 3);
    this.asleep[i] = 0; this.calm[i] = 0; this.dirty = true;
  }

  /** Pylonen gegen die Auto-OBB: Impuls auf den Pfosten, Gegenimpuls aufs Auto. */
  private collideCar(car: Vehicle): void {
    const P = car.p, { r: AR, u: AU, bz: AB } = car.axes();
    const hw = P.size.w / 2, hl = P.size.l / 2, y0 = -(P.cgHeight - 0.18), y1 = P.size.h - P.cgHeight;
    const cy = (y0 + y1) / 2, hh = (y1 - y0) / 2;
    const reach = Math.hypot(hw, hl) + 1.2;
    const cp = car.pos;
    for (let i = 0; i < this.n; i++) {
      const o3 = i * 3;
      if (Math.abs(this.pos[o3] - cp[0]) > reach + 1 || Math.abs(this.pos[o3 + 2] - cp[2]) > reach + 1) continue;
      const R = this.rot(i);
      for (let s = -1; s <= 1; s++) {
        const ly = s * (HY - RAD);
        const sx = this.pos[o3] + R[1] * ly, sy = this.pos[o3 + 1] + R[4] * ly, sz = this.pos[o3 + 2] + R[7] * ly;
        const dx = sx - cp[0], dy = sy - cp[1], dz = sz - cp[2];
        const lx = dx * AR[0] + dy * AR[1] + dz * AR[2], lyy = dx * AU[0] + dy * AU[1] + dz * AU[2] - cy, lz = dx * AB[0] + dy * AB[1] + dz * AB[2];
        let qx = Math.max(-hw, Math.min(hw, lx)), qy = Math.max(-hh, Math.min(hh, lyy)), qz = Math.max(-hl, Math.min(hl, lz));
        let nlx = lx - qx, nly = lyy - qy, nlz = lz - qz, dist = Math.hypot(nlx, nly, nlz), pen: number;
        if (dist >= RAD) continue;
        if (dist < 1e-6) {            // Mittelpunkt in der Box: über die nächste Fläche hinausschieben
          const ex = hw - Math.abs(lx), ey = hh - Math.abs(lyy), ez = hl - Math.abs(lz);
          nlx = nly = nlz = 0;
          if (ex <= ey && ex <= ez) { nlx = Math.sign(lx) || 1; qx = nlx * hw; }
          else if (ez <= ey) { nlz = Math.sign(lz) || 1; qz = nlz * hl; }
          else { nly = Math.sign(lyy) || 1; qy = nly * hh; }
          dist = 0;
        } else { nlx /= dist; nly /= dist; nlz /= dist; }
        pen = RAD - dist;
        // Normale (Auto -> Pfosten) und Kontaktpunkt in Weltkoordinaten
        const nx = AR[0] * nlx + AU[0] * nly + AB[0] * nlz, ny = AR[1] * nlx + AU[1] * nly + AB[1] * nlz, nz = AR[2] * nlx + AU[2] * nly + AB[2] * nlz;
        const lq = [qx, qy + cy, qz];
        const cxw = cp[0] + AR[0] * lq[0] + AU[0] * lq[1] + AB[0] * lq[2], cyw = cp[1] + AR[1] * lq[0] + AU[1] * lq[1] + AB[1] * lq[2], czw = cp[2] + AR[2] * lq[0] + AU[2] * lq[1] + AB[2] * lq[2];
        // Pfosten herausschieben (Auto ist schwer)
        this.pos[o3] += nx * pen; this.pos[o3 + 1] += ny * pen; this.pos[o3 + 2] += nz * pen;
        // Relativgeschwindigkeit am Kontaktpunkt
        const rpx = cxw - this.pos[o3], rpy = cyw - this.pos[o3 + 1], rpz = czw - this.pos[o3 + 2];
        const wpx = this.w[o3], wpy = this.w[o3 + 1], wpz = this.w[o3 + 2];
        const vpx = this.v[o3] + wpy * rpz - wpz * rpy, vpy = this.v[o3 + 1] + wpz * rpx - wpx * rpz, vpz = this.v[o3 + 2] + wpx * rpy - wpy * rpx;
        const rcx = cxw - cp[0], rcy = cyw - cp[1], rcz = czw - cp[2];
        const cw = car.angVel, cv = car.vel;
        const vcx = cv[0] + cw[1] * rcz - cw[2] * rcy, vcy = cv[1] + cw[2] * rcx - cw[0] * rcz, vcz = cv[2] + cw[0] * rcy - cw[1] * rcx;
        const rvx = vpx - vcx, rvy = vpy - vcy, rvz = vpz - vcz;
        const vn = rvx * nx + rvy * ny + rvz * nz;
        this.asleep[i] = 0; this.calm[i] = 0; this.dirty = true;
        if (vn >= 0) continue;
        const Iavg = (I_BODY[0] + I_BODY[1] + I_BODY[2]) / 3;
        const cxn = rpy * nz - rpz * ny, cyn = rpz * nx - rpx * nz, czn = rpx * ny - rpy * nx;
        const kN = 1 / MASS + (cxn * cxn + cyn * cyn + czn * czn) / Iavg;
        const jn = -(1 + E_CAR) * vn / kN;
        // Reibimpuls tangential
        let tx = rvx - vn * nx, ty = rvy - vn * ny, tz = rvz - vn * nz;
        const tl = Math.hypot(tx, ty, tz);
        let jtx = 0, jty = 0, jtz = 0;
        if (tl > 1e-6) { tx /= tl; ty /= tl; tz /= tl; const jt = Math.min(MU_CAR * jn, tl / (1 / MASS)); jtx = -tx * jt; jty = -ty * jt; jtz = -tz * jt; }
        const Jx = nx * jn + jtx, Jy = ny * jn + jty, Jz = nz * jn + jtz;
        this.v[o3] += Jx / MASS; this.v[o3 + 1] += Jy / MASS; this.v[o3 + 2] += Jz / MASS;
        // Drehimpuls (isotrop genähert)
        this.w[o3] += (rpy * Jz - rpz * Jy) / Iavg; this.w[o3 + 1] += (rpz * Jx - rpx * Jz) / Iavg; this.w[o3 + 2] += (rpx * Jy - rpy * Jx) / Iavg;
        car.applyImpulse(cxw, cyw, czw, -Jx * CAR_REACTION, -Jy * CAR_REACTION, -Jz * CAR_REACTION);
        this.onImpact(-vn);
      }
    }
  }
}

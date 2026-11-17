// Feste Hindernisse (Bäume, Felsen, Laternen, Gebäude): ohne three, nur Grundriss (x/z) – sie sind immer höher als das Auto.
// Das Auto-Rechteck wird gegen Kreise (Bäume …) und gedrehte Rechtecke (Gebäude) getestet:
// Positionskorrektur + Stoßimpuls (Rückprall e, Reibung) über Vehicle.applyImpulse. Nichts daran ändert die Reifen-/Antriebsphysik.
import type { Vehicle } from './vehicle';

export interface Circle { x: number; z: number; r: number; e?: number; wobble?: boolean }
export interface Box { x: number; z: number; hx: number; hz: number; yaw: number }
/** Weiches bewegtes Hindernis (Verkehrsauto): gibt mit nach (share der Eindringtiefe), nimmt Impuls auf (Masse m, Gierträgheit I) und meldet beides zurück. */
export interface Soft { m: number; I: number; share: number; push(dx: number, dz: number): void; hit(px: number, pz: number, jx: number, jz: number): void }

// Hart: kaum Rückprall (frontal ≈ Stillstand), Reibung entlang der Fläche (MU_HIT am Stoß + SCRAPE je Schritt = Schrammen kostet Tempo)
const E_CIRCLE = 0, E_WALL = 0.0, MU_HIT = 0.9, SCRAPE = 0.08;
const MAX_SPIN = 3;
const CELL = 24;

export class Obstacles {
  /** Wackeln je Kreis (0..1, klingt ab) – nur für die Optik; Index wie in `circles` */
  readonly wob: Float32Array;
  readonly wobDir: Float32Array;
  /** wahr, solange mindestens ein Baum wackelt */
  active = false;
  onImpact: (strength: number) => void = () => {};
  private grid = new Map<number, { c?: number; b?: number }[]>();
  private cos: number[]; private sin: number[];

  constructor(readonly circles: Circle[], readonly boxes: Box[] = []) {
    this.wob = new Float32Array(circles.length); this.wobDir = new Float32Array(circles.length);
    this.cos = boxes.map((b) => Math.cos(b.yaw)); this.sin = boxes.map((b) => Math.sin(b.yaw));
    const add = (x0: number, z0: number, x1: number, z1: number, v: { c?: number; b?: number }) => {
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        const k = cx * 100003 + cz; const a = this.grid.get(k); if (a) a.push(v); else this.grid.set(k, [v]);
      }
    };
    circles.forEach((c, i) => add(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, { c: i }));
    boxes.forEach((b, i) => { const R = Math.hypot(b.hx, b.hz); add(b.x - R, b.z - R, b.x + R, b.z + R, { b: i }); });
  }

  /** Wackeln abklingen lassen (dt Sekunden) */
  decay(dt: number): void {
    if (!this.active) return;
    let any = false;
    for (let i = 0; i < this.wob.length; i++) if (this.wob[i] > 0) { this.wob[i] = Math.max(0, this.wob[i] - dt / 0.9); if (this.wob[i] > 0) any = true; }
    this.active = any;
  }

  /** bewegte Hindernisse (Zug, Schranke, Lawinenbrocken, Pflug …): vom Spiel je Schritt fortgeschrieben; v = Eigengeschwindigkeit (Stöße rechnen relativ dazu, ohne Reibmitnahme) */
  dynBoxes: (Box & { vx: number; vz: number; on: boolean; soft?: Soft })[] = [];
  dynCircles: (Circle & { vx: number; vz: number; on: boolean })[] = [];

  step(car: Vehicle): void {
    const { r: AR, u: AU, bz: AB } = car.axes();
    // Auto-Grundriss: am Kurs ausgerichtetes Rechteck um die Silhouette der Karosserie (Box w x h x l) auf dem Boden. Aufrecht = genau die Box; auf der Seite oder dem Dach
    // (Rechte-Achse bzw. Dach waagerecht) wächst der Grundriss um die Höhe – statt die Achsen aus fast senkrechten Vektoren zu normieren (das schob das Auto meterweit weg).
    const hs = car.p.size, hh = hs.h / 2;
    let bx = -AB[0], bz = -AB[2], l = Math.hypot(bx, bz);
    if (l < 0.5) { bx = AR[2]; bz = -AR[0]; l = Math.hypot(bx, bz) || 1; }      // Nase fast senkrecht: Kurs aus der Querachse
    bx /= l; bz /= l;
    const rx = -bz, rz = bx;
    const ext = (ax: number, az: number) => Math.abs(ax * AR[0] + az * AR[2]) * hs.w / 2 + Math.abs(ax * AU[0] + az * AU[2]) * hh + Math.abs(ax * AB[0] + az * AB[2]) * hs.l / 2;
    const hw = ext(rx, rz), hl = ext(bx, bz);
    const off = hh - car.p.cgHeight;      // Boxmitte liegt über/unter dem Schwerpunkt: waagerechte Verschiebung bei Schräglage
    const cx = car.pos[0] + AU[0] * off, cz = car.pos[2] + AU[2] * off;
    const reach = Math.hypot(hw, hl) + 0.2;
    const seen = new Set<number>();
    const circle = (c: Circle, idx: number, ovx = 0, ovz = 0): void => {
      const dx = c.x - cx, dz = c.z - cz;
      if (dx * dx + dz * dz > (reach + c.r) ** 2) return;
      // Kreismittelpunkt im Auto-Koordinatensystem
      const lx = dx * rx + dz * rz, lz = dx * bx + dz * bz;
      const qx = Math.max(-hw, Math.min(hw, lx)), qz = Math.max(-hl, Math.min(hl, lz));
      let nlx = qx - lx, nlz = qz - lz, d = Math.hypot(nlx, nlz), pen: number, px: number, pz: number;
      if (d > 1e-6) { if (d >= c.r) return; pen = c.r - d; nlx /= d; nlz /= d; px = qx; pz = qz; }
      else {            // Mittelpunkt im Auto: nächste Seite
        const ex = hw - Math.abs(lx), ez = hl - Math.abs(lz);
        if (ex < ez) { nlx = -Math.sign(lx) || 1; nlz = 0; pen = ex + c.r; px = Math.sign(lx) * hw; pz = lz; }
        else { nlz = -Math.sign(lz) || 1; nlx = 0; pen = ez + c.r; pz = Math.sign(lz) * hl; px = lx; }
      }
      // Normale: Hindernis -> Auto (Weltkoordinaten)
      const n0 = nlx * rx + nlz * bx, n1 = nlx * rz + nlz * bz;
      const hit = this.resolve(car, n0, n1, pen, cx + px * rx + pz * bx, cz + px * rz + pz * bz, c.e ?? E_CIRCLE, ovx, ovz);
      if (hit > 0.3 && c.wobble && idx >= 0) { this.wob[idx] = Math.min(1, 0.35 + hit / 18); this.wobDir[idx] = Math.atan2(-n0, -n1); this.active = true; }
    };
    const box = (b: Box, cs: number, sn: number, ovx = 0, ovz = 0, soft?: Soft): void => {
      if (Math.hypot(b.x - cx, b.z - cz) > Math.hypot(b.hx, b.hz) + reach) return;
      // SAT: Achsen des Hindernisses (u, v) und des Autos (r, b)
      const ux = cs, uz = -sn, vx = sn, vz = cs;      // Box-Achsen (yaw dreht um y: x' = cos x + sin z)
      const axes: [number, number][] = [[ux, uz], [vx, vz], [rx, rz], [bx, bz]];
      const dx = cx - b.x, dz = cz - b.z;
      let best = Infinity, nx = 0, nz = 0;
      for (const [ax, az] of axes) {
        const ra = Math.abs(ux * ax + uz * az) * b.hx + Math.abs(vx * ax + vz * az) * b.hz;
        const rb = Math.abs(rx * ax + rz * az) * hw + Math.abs(bx * ax + bz * az) * hl;
        const dist = dx * ax + dz * az, ov = ra + rb - Math.abs(dist);
        if (ov <= 0) return;
        if (ov < best) { best = ov; const sg = dist >= 0 ? 1 : -1; nx = ax * sg; nz = az * sg; }
      }
      // Kontaktpunkt: Mittel der tiefsten Ecken des Autos entgegen der Normalen (Flächenkontakt = Mitte, kein Kippmoment)
      let bd = Infinity;
      const cor: number[][] = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const wx = cx + rx * hw * sx + bx * hl * sz, wz = cz + rz * hw * sx + bz * hl * sz;
        cor.push([wx, wz, wx * nx + wz * nz]); bd = Math.min(bd, wx * nx + wz * nz);
      }
      let bxp = 0, bzp = 0, cnt = 0;
      for (const [wx, wz, dd] of cor) if (dd < bd + 0.15) { bxp += wx; bzp += wz; cnt++; }
      bxp /= cnt; bzp /= cnt;
      this.resolve(car, nx, nz, best, bxp, bzp, E_WALL, ovx, ovz, soft, b.x, b.z);
    };
    const cxi = Math.floor(cx / CELL), czi = Math.floor(cz / CELL);
    for (let gz = czi - 1; gz <= czi + 1; gz++) for (let gx = cxi - 1; gx <= cxi + 1; gx++) {
      const list = this.grid.get(gx * 100003 + gz); if (!list) continue;
      for (const v of list) {
        if (v.c !== undefined) {
          if (seen.has(v.c)) continue; seen.add(v.c);
          circle(this.circles[v.c], v.c);
        } else {
          const bi = v.b!;
          if (seen.has(-1 - bi)) continue; seen.add(-1 - bi);
          box(this.boxes[bi], this.cos[bi], this.sin[bi]);
        }
      }
    }
    for (const c of this.dynCircles) if (c.on) circle(c, -1, c.vx, c.vz);
    for (const b of this.dynBoxes) if (b.on) box(b, Math.cos(b.yaw), Math.sin(b.yaw), b.vx, b.vz, b.soft);
  }

  /** Auto um pen entlang (nx,nz) schieben und Stoßimpuls am Kontaktpunkt anwenden; liefert die Aufprallgeschwindigkeit. */
  private resolve(car: Vehicle, nx: number, nz: number, pen: number, px: number, pz: number, e: number, ovx = 0, ovz = 0, soft?: Soft, ox = 0, oz = 0): number {
    const m = car.p.mass, Iy = car.yawInertia, sh = soft ? soft.share : 0;
    car.pos[0] += nx * pen * (1 - sh); car.pos[2] += nz * pen * (1 - sh);
    if (soft) soft.push(-nx * pen * sh, -nz * pen * sh);
    const rx = px - car.pos[0], rz = pz - car.pos[2];
    const wy = car.angVel[1];
    const vx = car.vel[0] + wy * rz - ovx, vz = car.vel[2] - wy * rx - ovz;      // w x r (nur um y), relativ zum bewegten Hindernis
    const vn = vx * nx + vz * nz;
    const rn = rx * nz - rz * nx;
    let inv = 1 / m + rn * rn / Iy;
    if (soft) { const sr = (px - ox) * nz - (pz - oz) * nx; inv += 1 / soft.m + sr * sr / soft.I; }      // beide Seiten nehmen den Stoß auf
    const jn = vn < 0 ? -(1 + e) * vn / inv : 0;
    let tx = vx - vn * nx, tz = vz - vn * nz;
    const tl = Math.hypot(tx, tz);
    let jx = nx * jn, jz = nz * jn;
    if (tl > 1e-6 && !(ovx || ovz)) {
      tx /= tl; tz /= tl;
      const rt = rx * tz - rz * tx;
      const eff = 1 / m + rt * rt / Iy;
      const jt = Math.min(MU_HIT * jn + SCRAPE * tl / eff, tl / eff);
      jx -= tx * jt; jz -= tz * jt;
    }
    car.applyImpulse(px, car.pos[1], pz, jx, 0, jz);
    if (soft && (jx || jz)) soft.hit(px, pz, -jx, -jz);
    car.angVel[1] = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, car.angVel[1]));      // Streifstoß darf das Auto nicht herumschleudern
    if (vn >= 0) return 0;
    this.onImpact(-vn);
    return -vn;
  }
}

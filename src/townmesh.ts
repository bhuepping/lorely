// Altstadt-Mesh: alle Häuser (Giebel, Fenster, Dächer, Kirchen, Kranhäuser) als Dreiecke in EINEM Mesh – wird in das Dom-Mesh gelegt (0 zusätzliche Draw Calls). Unbeleuchtet, Flächen vorgetönt.
import * as THREE from 'three';
import type { Course } from './level';
import { FLOOR_H, type TownHouse } from './town';

type V = number[];
interface Sink { quad(a: V, b: V, c: V, d: V, col: V): void; tri(a: V, b: V, c: V, col: V): void }

const lin = (hex: number): V => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const FACADE = [0xd9a441, 0xc9603d, 0xe8c9a0, 0xa9cf9c, 0x86acd3, 0xd98a9a, 0xe6d36a, 0xc4504a, 0x9fbfc6, 0xeee2cf].map(lin);
const ROOFS = [0x8a3f2c, 0x4d505e, 0x74382c, 0x5b4a44].map(lin);
const WIN: V = lin(0x222c46), DOOR: V = lin(0x4a2e22), STONE: V = lin(0xa89c8a), GLASS: V = lin(0x4a6a8c), GLASS2: V = lin(0x2e4260), STEEL: V = lin(0x6c7078);
const SUN = (() => { const l = Math.hypot(0.55, 0.45, 0.7); return [0.55 / l, 0.7 / l, 0.45 / l]; })();   // fester Lichteinfall (x, y, z)
const shade = (nx: number, ny: number, nz: number) => 0.58 + 0.42 * Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
const mul = (c: V, k: number): V => [c[0] * k, c[1] * k, c[2] * k];

export function addTown(sp: Sink, course: Course): void {
  const T = course.terrain;
  for (const h of course.town) {
    const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
    const W = (lx: number, lz: number, y: number): V => [h.x + cs * lx + sn * lz, y, h.z - sn * lx + cs * lz];
    let y0 = Infinity; for (const [lx, lz] of [[-h.hx, -h.hz], [h.hx, -h.hz], [h.hx, h.hz], [-h.hx, h.hz], [0, 0]]) { const p = W(lx, lz, 0); y0 = Math.min(y0, T.height(p[0], p[2])); }
    y0 -= 0.6;
    const base = FACADE[h.c % FACADE.length], roofC = ROOFS[(h.c * 7 + 3) % ROOFS.length];
    // Wand von (ax,az) nach (bx,bz) in lokalen Koordinaten (Normale = rechts von a->b)
    const wall = (ax: number, az: number, bx: number, bz: number, ya: number, yb: number, col: V): number => {
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nxl = dz / l, nzl = -dx / l;   // lokale Normale
      const wx = cs * nxl + sn * nzl, wz = -sn * nxl + cs * nzl, k = shade(wx, 0, wz);
      sp.quad(W(ax, az, ya), W(bx, bz, ya), W(bx, bz, yb), W(ax, az, yb), mul(col, k));
      return k;
    };
    const box = (cx: number, cz: number, hx: number, hz: number, ya: number, yb: number, col: V) => {
      wall(cx - hx, cz - hz, cx + hx, cz - hz, ya, yb, col); wall(cx + hx, cz - hz, cx + hx, cz + hz, ya, yb, col);
      wall(cx + hx, cz + hz, cx - hx, cz + hz, ya, yb, col); wall(cx - hx, cz + hz, cx - hx, cz - hz, ya, yb, col);
      sp.quad(W(cx - hx, cz + hz, yb), W(cx + hx, cz + hz, yb), W(cx + hx, cz - hz, yb), W(cx - hx, cz - hz, yb), mul(col, shade(0, 1, 0)));
    };
    const pyr = (cx: number, cz: number, r: number, ya: number, yb: number, col: V) => {
      const tip = W(cx, cz, yb), cor: [number, number][] = [[-r, -r], [r, -r], [r, r], [-r, r]];
      for (let i = 0; i < 4; i++) { const [ax, az] = cor[i], [bx, bz] = cor[(i + 1) % 4], nl = [bz - az, 0, -(bx - ax)], k = shade(cs * nl[0] / (2 * r) + sn * nl[2] / (2 * r), 0.5, -sn * nl[0] / (2 * r) + cs * nl[2] / (2 * r)); sp.tri(W(cx + ax, cz + az, ya), W(cx + bx, cz + bz, ya), tip, mul(col, k)); }
    };
    // Fenster: Raster auf einer Wand (Fassadenebene bei fest lx oder lz)
    const windows = (axis: 'x' | 'z', at: number, half: number, ya0: number, yb: number, sgn: number, door: boolean) => {
      const n = Math.max(1, Math.floor(half * 2 / 2.7)), step = half * 2 / n, e = 0.04 * sgn, floors = Math.round((yb - ya0) / FLOOR_H), ya = ya0;   // genau eine Fensterreihe je Geschoss, Raster mittig (keine halben Fenster an Ecken)
      for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
        const c = -half + step * (i + 0.5), y = ya + 1.5 + f * FLOOR_H; if (f === 0 && door && i === Math.floor(n / 2)) continue;
        const a = axis === 'x' ? [W(at + e, c - 0.5, y), W(at + e, c + 0.5, y), W(at + e, c + 0.5, y + 1.6), W(at + e, c - 0.5, y + 1.6)] : [W(c - 0.5, at + e, y), W(c + 0.5, at + e, y), W(c + 0.5, at + e, y + 1.6), W(c - 0.5, at + e, y + 1.6)];
        sp.quad(a[0], a[1], a[2], a[3], WIN);
      }
      if (door) { const c = -half + step * (Math.floor(n / 2) + 0.5), ya = ya0 + 0.55; const a = axis === 'x' ? [W(at + e, c - 0.6, ya), W(at + e, c + 0.6, ya), W(at + e, c + 0.6, ya + 2.3), W(at + e, c - 0.6, ya + 2.3)] : [W(c - 0.6, at + e, ya), W(c + 0.6, at + e, ya), W(c + 0.6, at + e, ya + 2.3), W(c - 0.6, at + e, ya + 2.3)]; sp.quad(a[0], a[1], a[2], a[3], DOOR); }
    };
    const GR = 0.6;   // Sockel unter dem Gelände (y0 -= GR): Geschosse zählen ab Gelände
    const ya = y0, yw = y0 + GR + h.h;
    if (h.kind === 'giebel' || h.kind === 'traufe') {
      box(0, 0, h.hx, h.hz, ya, yw, base);
      const rh = h.kind === 'giebel' ? Math.min(h.hz, 6.5) * 0.75 + 1 : h.hx * 0.65 + 1;
      if (h.kind === 'giebel') {   // First entlang lx: Giebeldreiecke zeigen zu ±lx (Straße / Rückseite)
        for (const sd of [1, -1]) {
          const a = W(sd * h.hx, -h.hz, yw), b = W(sd * h.hx, h.hz, yw), c = W(sd * h.hx, 0, yw + rh); sp.tri(a, b, c, mul(base, shade(cs * sd, 0, -sn * sd)));
          sp.quad(W(-h.hx - 0.4, sd * h.hz, yw), W(h.hx + 0.4, sd * h.hz, yw), W(h.hx + 0.4, 0, yw + rh), W(-h.hx - 0.4, 0, yw + rh), mul(roofC, shade(sn * sd * 0.6, 0.8, cs * sd * 0.6)));
        }
      } else {
        for (const sd of [1, -1]) {
          const a = W(-h.hz * 0 + sd * 0, -h.hz, yw); void a;
          sp.tri(W(-h.hx, sd * h.hz, yw), W(h.hx, sd * h.hz, yw), W(0, sd * h.hz, yw + rh), mul(base, shade(sn * sd * -1, 0, cs * sd)));
          sp.quad(W(sd * (h.hx + 0.4), -h.hz - 0.3, yw), W(sd * (h.hx + 0.4), h.hz + 0.3, yw), W(0, h.hz + 0.3, yw + rh), W(0, -h.hz - 0.3, yw + rh), mul(roofC, shade(cs * sd * 0.6, 0.8, -sn * sd * 0.6)));
        }
      }
      windows('x', h.hx, h.hz - 0.7, ya, yw, 1, true); windows('x', -h.hx, h.hz - 0.7, ya, yw, -1, false);
      windows('z', h.hz, h.hx - 0.9, ya, yw, 1, false); windows('z', -h.hz, h.hx - 0.9, ya, yw, -1, false);
      if (h.c % 3 === 0) box(h.hx * 0.3, h.hz * 0.3, 0.55, 0.55, yw + rh * 0.3, yw + rh + 1.6, mul(base, 0.6));   // Schornstein
    } else if (h.kind === 'kirche') {
      // Schiff (First entlang lz) + Turm am -lz-Ende (Rheinischer Typ: quadratischer Turm, Pyramidenhelm)
      box(0, 0, h.hx, h.hz, ya, yw, STONE);
      for (const sd of [1, -1]) sp.quad(W(sd * (h.hx + 0.5), -h.hz, yw), W(sd * (h.hx + 0.5), h.hz, yw), W(0, h.hz, yw + 9), W(0, -h.hz, yw + 9), mul(ROOFS[1], shade(cs * sd * 0.6, 0.8, -sn * sd * 0.6)));
      for (const sd of [1, -1]) sp.tri(W(-h.hx, sd * h.hz, yw), W(h.hx, sd * h.hz, yw), W(0, sd * h.hz, yw + 9), mul(STONE, shade(sn * sd * -1, 0, cs * sd)));
      for (let z = -h.hz + 9; z < h.hz - 2; z += 4.2) for (const sd of [1, -1]) sp.quad(W(sd * (h.hx + 0.05), z, ya + 5), W(sd * (h.hx + 0.05), z + 1.5, ya + 5), W(sd * (h.hx + 0.05), z + 1.5, ya + 11), W(sd * (h.hx + 0.05), z, ya + 11), WIN);
      const tz = -h.hz + 4.2; box(0, tz, 4.2, 4.2, ya, ya + 36, STONE); box(0, tz, 3.6, 3.6, ya + 36, ya + 40, mul(STONE, 0.8)); pyr(0, tz, 4.0, ya + 40, ya + 54, ROOFS[1]);
      for (const yy of [26, 33]) for (const sd of [1, -1]) { sp.quad(W(sd * 4.25, tz - 0.8, ya + yy), W(sd * 4.25, tz + 0.8, ya + yy), W(sd * 4.25, tz + 0.8, ya + yy + 4), W(sd * 4.25, tz - 0.8, ya + yy + 4), WIN); sp.quad(W(tz * 0 - 0.8, tz + sd * 4.25, ya + yy), W(0.8, tz + sd * 4.25, ya + yy), W(0.8, tz + sd * 4.25, ya + yy + 4), W(-0.8, tz + sd * 4.25, ya + yy + 4), WIN); }
    } else {
      // Kranhaus (Silhouette: Sockel + auskragender, schräg abgeschnittener Oberbau; kein reales Logo): lx > 0 = Seite zum Wasser? egal, symmetrisch gedacht
      const t = h.h;
      box(0, 0, h.hx, h.hz, ya, yw, mul(STONE, 0.85));
      for (let f = 0; f < 5; f++) for (let i = 0; i < 5; i++) { const z = -h.hz + 2 + i * (h.hz * 2 - 4) / 4 - 1; sp.quad(W(h.hx + 0.05, z, ya + 3 + f * 4.4), W(h.hx + 0.05, z + 2, ya + 3 + f * 4.4), W(h.hx + 0.05, z + 2, ya + 6.4 + f * 4.4), W(h.hx + 0.05, z, ya + 6.4 + f * 4.4), GLASS2); }
      // Oberbau: Quader, nach lx vorgeschoben, Dach fällt zur Landseite ab
      const hx2 = h.hx * 0.8, cx2 = h.hx * 0.35, hz2 = h.hz * 0.9, top1 = yw + 16 + h.roof * 0.0, top0 = yw + 7;
      for (const sd of [1, -1]) wall(cx2 + sd * hx2, -hz2, cx2 + sd * hx2, hz2, yw, sd > 0 ? top1 : top0, GLASS);
      sp.quad(W(cx2 + hx2, hz2, yw), W(cx2 + hx2, -hz2, yw), W(cx2 + hx2, -hz2, top1), W(cx2 + hx2, hz2, top1), GLASS);
      for (const sd of [1, -1]) { sp.tri(W(cx2 - hx2, sd * hz2, yw), W(cx2 + hx2, sd * hz2, yw), W(cx2 + hx2, sd * hz2, top1), mul(GLASS, 0.8)); sp.tri(W(cx2 - hx2, sd * hz2, yw), W(cx2 + hx2, sd * hz2, top1), W(cx2 - hx2, sd * hz2, top0), mul(GLASS, 0.8)); }
      sp.quad(W(cx2 + hx2, -hz2, top1), W(cx2 - hx2, -hz2, top0), W(cx2 - hx2, hz2, top0), W(cx2 + hx2, hz2, top1), mul(STEEL, 1.2));
      for (let f = 0; f < 3; f++) for (let i = 0; i < 4; i++) { const z = -hz2 + 1.5 + i * (hz2 * 2 - 3) / 4; sp.quad(W(cx2 + hx2 + 0.05, z, yw + 1.2 + f * 4.2), W(cx2 + hx2 + 0.05, z + 2.2, yw + 1.2 + f * 4.2), W(cx2 + hx2 + 0.05, z + 2.2, yw + 4 + f * 4.2), W(cx2 + hx2 + 0.05, z, yw + 4 + f * 4.2), GLASS2); }
      void t;
    }
  }
}

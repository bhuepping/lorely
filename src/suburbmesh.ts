// Vorstadt-Mesh: Häuser, Wahrzeichen, Hecken, Laternen, Ampeln, Bushaltestellen = EIN Mesh (Vertexfarben, unbeleuchtet, vorgetönt);
// Fahrbahnmarkierungen, Gehwege, Querstraßen, Laub = ein flaches Decal-Mesh; Straßenschilder = ein Mesh mit Pixelschrift-Atlas; Startampel = eigenes kleines Mesh (Farbe je Phase). 3 + 1 Draw Calls.
import * as THREE from 'three';
import type { Course } from './level';
import { sigPhase, stegProfile, type SubHouse } from './suburb';
import { Soup } from './world';
import { netMarks } from './netmesh';
import { F } from './pixel';

type V = number[];
const lin = (hex: number): V => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mul = (c: V, k: number): V => [c[0] * k, c[1] * k, c[2] * k];
const SUN = (() => { const l = Math.hypot(-0.7, 0.5, 0.45); return [-0.7 / l, 0.5 / l, 0.45 / l]; })();   // tiefe Sonne von links hinten
const shade = (nx: number, ny: number, nz: number) => 0.6 + 0.4 * Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);

const BRICK = [0xa6422e, 0x9a3b2a, 0xb04c34, 0x8e4a38, 0xb8643f, 0xa8573a].map(lin);
const ROOF = [0x4a3a36, 0x7a3a2a, 0x3c3c42, 0x5a4034, 0x6a3228].map(lin);
const PLASTER = [0xe8e2d2, 0xd9cfae, 0xc9c5b8, 0xcfd2cc].map(lin);
const HEDGE = [0x6a7d28, 0x8a8a2c, 0xb07a24, 0x7a6a24].map(lin);
const LEAF = [0xd89a1c, 0xc4601a, 0xa63a1c, 0xe8c43a, 0x8a5a22].map(lin);
const CARS = [0xb8bcc2, 0x2f4a72, 0x8c2a24, 0x2e2e32, 0xd8d4c8, 0x3a6a4a].map(lin);
const GLASS = lin(0x35506a), GLASS2 = lin(0x4d6e8c), DOOR = lin(0x4a2e22), STONE = lin(0xa89c8a), POLE = lin(0x4a4e58), DARK = lin(0x24262c);

export function buildSuburb(course: Course): { group: THREE.Group; light: StartLight } {
  const sub = course.suburb!, T = course.terrain, route = course.route, half = course.roadWidth / 2, group = new THREE.Group();
  const sp = new Soup(), dc = new Soup();
  const texts = [...new Set(sub.signs.map((s) => s.text))], atlas = signAtlas(texts);

  // ── Häuser ──
  const house = (h: SubHouse) => {
    if (h.kind === 'steg') return;   // Fußgängersteg: eigener Block weiter unten
    const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
    const W = (lx: number, lz: number, y: number): V => [h.x + cs * lx + sn * lz, y, h.z - sn * lx + cs * lz];
    let y0 = Infinity; for (const [lx, lz] of [[-h.hx, -h.hz], [h.hx, -h.hz], [h.hx, h.hz], [-h.hx, h.hz], [0, 0]]) { const p = W(lx, lz, 0); y0 = Math.min(y0, T.height(p[0], p[2])); }
    y0 -= 0.5;
    const yw = y0 + h.h;
    const wall = (ax: number, az: number, bx: number, bz: number, ya: number, yb: number, col: V) => {
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nxl = dz / l, nzl = -dx / l;
      sp.quad(W(ax, az, ya), W(bx, bz, ya), W(bx, bz, yb), W(ax, az, yb), mul(col, shade(cs * nxl + sn * nzl, 0, -sn * nxl + cs * nzl)));
    };
    const box = (cx: number, cz: number, hx: number, hz: number, ya: number, yb: number, col: V, top: V | null = mul(col, 0.8)) => {
      wall(cx - hx, cz - hz, cx + hx, cz - hz, ya, yb, col); wall(cx + hx, cz - hz, cx + hx, cz + hz, ya, yb, col);
      wall(cx + hx, cz + hz, cx - hx, cz + hz, ya, yb, col); wall(cx - hx, cz + hz, cx - hx, cz - hz, ya, yb, col);
      if (top) sp.quad(W(cx - hx, cz + hz, yb), W(cx + hx, cz + hz, yb), W(cx + hx, cz - hz, yb), W(cx - hx, cz - hz, yb), mul(top, shade(0, 1, 0)));
    };
    // Fenster: Raster auf der Wand lx = at (axis 'x') oder lz = at ('z')
    const windows = (axis: 'x' | 'z', at: number, ext: number, ya: number, yb: number, sgn: number, col: V, wdt = 1.0, hgt = 1.5, pitch = 3.2, door = false) => {
      const n = Math.max(1, Math.floor(ext * 2 / pitch)), step = ext * 2 / n, e = 0.05 * sgn, rows = Math.max(1, Math.floor((yb - ya - 0.4) / 3.1));
      for (let f = 0; f < rows; f++) for (let i = 0; i < n; i++) {
        const c = -ext + step * (i + 0.5), y = ya + 1.1 + f * 3.1;
        if (f === 0 && door && i === Math.floor(n / 2)) { const q = axis === 'x' ? [W(at + e, c - 0.55, ya), W(at + e, c + 0.55, ya), W(at + e, c + 0.55, ya + 2.2), W(at + e, c - 0.55, ya + 2.2)] : [W(c - 0.55, at + e, ya), W(c + 0.55, at + e, ya), W(c + 0.55, at + e, ya + 2.2), W(c - 0.55, at + e, ya + 2.2)]; sp.quad(q[0], q[1], q[2], q[3], DOOR); continue; }
        const q = axis === 'x' ? [W(at + e, c - wdt / 2, y), W(at + e, c + wdt / 2, y), W(at + e, c + wdt / 2, y + hgt), W(at + e, c - wdt / 2, y + hgt)] : [W(c - wdt / 2, at + e, y), W(c + wdt / 2, at + e, y), W(c + wdt / 2, at + e, y + hgt), W(c - wdt / 2, at + e, y + hgt)];
        sp.quad(q[0], q[1], q[2], q[3], col);
      }
    };
    // Satteldach, First entlang lokal z (Giebel zeigen zu ±x)
    const gable = (hx: number, hz: number, rh: number, roofC: V, wallC: V) => {
      for (const sd of [1, -1]) {
        sp.tri(W(sd * hx, -hz, yw), W(sd * hx, hz, yw), W(sd * hx, 0, yw + rh), mul(wallC, shade(cs * sd, 0, -sn * sd)));
        sp.quad(W(-hx - 0.4, sd * hz, yw), W(hx + 0.4, sd * hz, yw), W(hx + 0.4, 0, yw + rh), W(-hx - 0.4, 0, yw + rh), mul(roofC, shade(sn * sd * 0.5, 0.8, cs * sd * 0.5)));
      }
    };
    // Satteldach, First entlang lokal z (Traufen zu ±x, Giebel an den Schmalseiten ±z)
    const ridgeZ = (hx: number, hz: number, rh: number, roofC: V, wallC: V) => {
      const o = 0.4, nl = Math.hypot(rh, hx);
      for (const sd of [1, -1]) {
        sp.tri(W(-hx, sd * hz, yw), W(hx, sd * hz, yw), W(0, sd * hz, yw + rh), mul(wallC, shade(sn * sd, 0, cs * sd)));
        const nx = sd * rh / nl, ny = hx / nl;
        sp.quad(W(sd * (hx + o), -hz - o, yw), W(sd * (hx + o), hz + o, yw), W(0, hz + o, yw + rh), W(0, -hz - o, yw + rh), mul(roofC, shade(cs * nx, ny, -sn * nx)));
      }
    };
    const k = h.c, wallC = h.wc !== undefined ? lin(h.wc) : h.kind === 'villa' ? lin(0xe8d9a0) : h.kind === 'kita' ? lin(0xf2efe6) : h.kind === 'gewerbe' ? PLASTER[k % PLASTER.length] : h.kind === 'buero' ? lin(0xb8bcc2) : h.kind === 'zentrum' ? lin(0xb9684a) : BRICK[k % BRICK.length];
    const roofC = h.rc !== undefined ? mul(lin(h.rc), 0.85) : ROOF[(k * 3 + 1) % ROOF.length];
    if (h.kind === 'auto') {   // parkendes Auto: Karosserie, Kabine, Räder (eigenes Blockmodell)
      const b0 = y0 + 0.5, col = CARS[k % CARS.length];
      box(0, 0, h.hx, h.hz, b0 + 0.3, b0 + 0.95, col, mul(col, 1.05)); box(0, -h.hz * 0.12, h.hx * 0.88, h.hz * 0.5, b0 + 0.95, b0 + 1.45, GLASS, mul(col, 0.95));
      for (const sx of [-1, 1]) for (const sz of [-0.62, 0.62]) box(sx * (h.hx - 0.05), sz * h.hz, 0.12, 0.34, b0, b0 + 0.6, DARK, null);
    } else if (h.kind === 'doppel') {   // Doppelhaus: Firstrichtung längs, Eingang je Hälfte, Schornstein in der Mitte
      box(0, 0, h.hx, h.hz, y0, yw, wallC, null); ridgeZ(h.hx, h.hz, h.roof, roofC, wallC);
      windows('x', h.hx, h.hz - 0.8, y0, yw, 1, GLASS, 1.0, 1.5, 3.2, false); windows('x', -h.hx, h.hz - 0.8, y0, yw, -1, GLASS, 1.0, 1.5, 3.4);
      for (const dz of [-0.5, 0.5]) sp.quad(W(h.hx + 0.07, h.hz * dz - 0.55, y0 + 0.5), W(h.hx + 0.07, h.hz * dz + 0.55, y0 + 0.5), W(h.hx + 0.07, h.hz * dz + 0.55, y0 + 2.7), W(h.hx + 0.07, h.hz * dz - 0.55, y0 + 2.7), DOOR);
      wall(h.hx + 0.03, -0.12, h.hx + 0.03, 0.12, y0 + 0.5, yw, mul(wallC, 0.6));
      box(0, 0, 0.6, 0.6, yw + h.roof * 0.4, yw + h.roof + 1.3, lin(0x6a3a30));
    } else if (h.kind === 'garage') {   // Garage: flach, breites Tor zur Straße
      box(0, 0, h.hx, h.hz, y0, yw, wallC, lin(0x5a5a5e)); box(0, 0, h.hx + 0.3, h.hz + 0.2, yw, yw + 0.15, lin(0x4a4a50), lin(0x5a5a60));
      sp.quad(W(h.hx + 0.06, -h.hz + 0.2, y0 + 0.5), W(h.hx + 0.06, h.hz - 0.2, y0 + 0.5), W(h.hx + 0.06, h.hz - 0.2, y0 + 2.3), W(h.hx + 0.06, -h.hz + 0.2, y0 + 2.3), lin(0x7b8088));
      for (let q = 0; q < 4; q++) sp.quad(W(h.hx + 0.08, -h.hz + 0.2, y0 + 0.9 + q * 0.4), W(h.hx + 0.08, h.hz - 0.2, y0 + 0.9 + q * 0.4), W(h.hx + 0.08, h.hz - 0.2, y0 + 0.97 + q * 0.4), W(h.hx + 0.08, -h.hz + 0.2, y0 + 0.97 + q * 0.4), lin(0x5e636b));
    } else if (h.kind === 'restaurant') {   // Backsteinhaus, Erdgeschoss mit breiter Fensterfront, dunkelrote Markise, Tische davor
      box(0, 0, h.hx, h.hz, y0, yw, wallC, null); gable(h.hx, h.hz, h.roof, ROOF[1], wallC);
      windows('x', h.hx, h.hz - 0.8, y0 + 3.1, yw, 1, GLASS, 1.0, 1.5, 3.4, false); windows('x', -h.hx, h.hz - 0.8, y0, yw, -1, GLASS, 1.0, 1.5, 3.4);
      windows('z', h.hz, h.hx - 0.9, y0, yw, 1, GLASS, 1.0, 1.4, 3.2); windows('z', -h.hz, h.hx - 0.9, y0, yw, -1, GLASS, 1.0, 1.4, 3.2);
      sp.quad(W(h.hx + 0.06, -h.hz + 1.0, y0 + 0.5), W(h.hx + 0.06, h.hz - 1.0, y0 + 0.5), W(h.hx + 0.06, h.hz - 1.0, y0 + 2.7), W(h.hx + 0.06, -h.hz + 1.0, y0 + 2.7), GLASS2);
      for (let q = 0; q < 6; q++) { const z = -h.hz + 1.0 + q * (2 * h.hz - 2) / 5; sp.quad(W(h.hx + 0.09, z - 0.08, y0 + 0.5), W(h.hx + 0.09, z + 0.08, y0 + 0.5), W(h.hx + 0.09, z + 0.08, y0 + 2.7), W(h.hx + 0.09, z - 0.08, y0 + 2.7), mul(wallC, 0.7)); }
      for (let q = 0; q < 8; q++) { const z0 = -h.hz + 0.4 + q * (2 * h.hz - 0.8) / 8, z1 = z0 + (2 * h.hz - 0.8) / 8, c = q % 2 ? lin(0x7a1f1a) : lin(0xe6dccb); sp.quad(W(h.hx + 0.05, z0, y0 + 3.0), W(h.hx + 0.05, z1, y0 + 3.0), W(h.hx + 1.7, z1, y0 + 2.45), W(h.hx + 1.7, z0, y0 + 2.45), c); }
      for (const dz of [-0.62, -0.2, 0.22, 0.64]) { box(h.hx + 2.9, h.hz * dz, 0.5, 0.5, y0 + 0.5, y0 + 1.25, lin(0x8a5a30), lin(0xb07a44)); box(h.hx + 2.9, h.hz * dz, 0.08, 0.08, y0 + 0.5, y0 + 2.4, POLE); box(h.hx + 2.9, h.hz * dz, 0.9, 0.9, y0 + 2.4, y0 + 2.5, lin(0xd8d0bc), lin(0xe6dcc6)); }
      box(h.hx * 0.3, h.hz * 0.4, 0.55, 0.55, yw + h.roof * 0.3, yw + h.roof + 1.5, lin(0x6a3a30));
    } else if (h.kind === 'apotheke') {   // zwei Stockwerke, Schaufensterfront unten, grüne Markise, grünes Kreuz (Bauform, keine Schrift)
      box(0, 0, h.hx, h.hz, y0, yw, wallC, null); gable(h.hx, h.hz, h.roof, ROOF[2], wallC);
      windows('x', h.hx, h.hz - 0.8, y0 + 3.1, yw, 1, GLASS, 1.0, 1.5, 3.4, false); windows('x', -h.hx, h.hz - 0.8, y0, yw, -1, GLASS, 1.0, 1.5, 3.4);
      windows('z', h.hz, h.hx - 0.9, y0, yw, 1, GLASS, 1.0, 1.4, 3.2); windows('z', -h.hz, h.hx - 0.9, y0, yw, -1, GLASS, 1.0, 1.4, 3.2);
      sp.quad(W(h.hx + 0.06, -h.hz + 1.2, y0 + 0.4), W(h.hx + 0.06, h.hz - 1.2, y0 + 0.4), W(h.hx + 0.06, h.hz - 1.2, y0 + 2.8), W(h.hx + 0.06, -h.hz + 1.2, y0 + 2.8), GLASS2);
      for (let q = 0; q < 8; q++) { const z0 = -h.hz + 0.8 + q * (2 * h.hz - 1.6) / 8, z1 = z0 + (2 * h.hz - 1.6) / 8, c = q % 2 ? lin(0xf0eee6) : lin(0x2e8a3a); sp.quad(W(h.hx + 0.05, z0, y0 + 3.2), W(h.hx + 0.05, z1, y0 + 3.2), W(h.hx + 1.6, z1, y0 + 2.7), W(h.hx + 1.6, z0, y0 + 2.7), c); }
      box(h.hx + 0.6, h.hz * 0.62, 0.55, 0.06, y0 + 4.4, y0 + 4.6, POLE);
      box(h.hx + 1.2, h.hz * 0.62, 0.08, 0.38, y0 + 3.5, y0 + 5.5, lin(0x1fbf4a), lin(0x1fbf4a)); box(h.hx + 1.2, h.hz * 0.62, 0.08, 1.1, y0 + 4.15, y0 + 4.85, lin(0x1fbf4a), lin(0x1fbf4a));
    } else if (h.kind === 'bungalow') {   // einstöckig, weiß, flaches graues Dach, heruntergekommen: Flecken, vernagelte Fenster, durchhängendes Vordach, Wildwuchs
      box(0, 0, h.hx, h.hz, y0, yw, wallC, null); gable(h.hx, h.hz, h.roof, lin(0x6c6c72), wallC);
      windows('x', h.hx, h.hz - 0.8, y0, yw, 1, mul(GLASS, 0.45), 1.1, 1.3, 3.6, true); windows('x', -h.hx, h.hz - 0.8, y0, yw, -1, mul(GLASS, 0.45), 1.1, 1.3, 3.6);
      windows('z', h.hz, h.hx - 0.9, y0, yw, 1, mul(GLASS, 0.45), 1.1, 1.3, 3.6); windows('z', -h.hz, h.hx - 0.9, y0, yw, -1, mul(GLASS, 0.45), 1.1, 1.3, 3.6);
      for (const [z, w] of [[-0.55, 1.2], [0.1, 0.9], [0.62, 1.4]]) sp.quad(W(h.hx + 0.1, h.hz * z - w / 2, y0 + 1.0), W(h.hx + 0.1, h.hz * z + w / 2, y0 + 0.9), W(h.hx + 0.1, h.hz * z + w / 2, y0 + 1.5), W(h.hx + 0.1, h.hz * z - w / 2, y0 + 1.6), lin(0x4a3a2c));
      for (const [z, w] of [[-0.8, 1.6], [-0.15, 2.4], [0.45, 1.2], [0.85, 1.8]]) sp.quad(W(h.hx + 0.08, h.hz * z - w / 2, y0 + 0.2), W(h.hx + 0.08, h.hz * z + w / 2, y0 + 0.2), W(h.hx + 0.08, h.hz * z + w / 2, y0 + 2.8), W(h.hx + 0.08, h.hz * z - w / 2, y0 + 2.6), lin(0xb6b09e));
      sp.quad(W(h.hx + 0.1, h.hz * 0.2, y0 + 0.4), W(h.hx + 2.0, h.hz * 0.2, y0 + 1.9), W(h.hx + 2.0, h.hz * 0.2 + 2.6, y0 + 1.7), W(h.hx + 0.1, h.hz * 0.2 + 2.6, y0 + 2.2), lin(0x5a5a60));   // schief hängendes Vordach
      box(h.hx + 1.4, -h.hz * 0.5, 1.2, 1.8, y0 + 0.5, y0 + 1.6, lin(0x6a7d28), lin(0x8a8a2c)); box(h.hx + 1.0, h.hz * 0.75, 0.9, 1.2, y0 + 0.5, y0 + 1.1, lin(0x7a6a24), lin(0x9a8a34));
    } else if (h.kind === 'holz') {   // Holzhaus: Bohlenwände, Satteldach, kleine Veranda
      box(0, 0, h.hx, h.hz, y0, yw, wallC, null); ridgeZ(h.hx, h.hz, h.roof, lin(0x4a3a2c), wallC);
      for (let y = y0 + 0.45; y < yw - 0.2; y += 0.6) box(0, 0, h.hx + 0.04, h.hz + 0.04, y, y + 0.07, mul(wallC, 0.62), null);
      windows('x', h.hx, h.hz - 1.0, y0, yw, 1, GLASS, 0.9, 1.2, 3.4, false); windows('z', h.hz, h.hx - 1.0, y0, yw, 1, GLASS, 0.9, 1.2, 3.4, false); windows('z', -h.hz, h.hx - 1.0, y0, yw, -1, GLASS, 0.9, 1.2, 3.4, false);
      sp.quad(W(h.hx + 0.07, -0.5, y0 + 0.5), W(h.hx + 0.07, 0.5, y0 + 0.5), W(h.hx + 0.07, 0.5, y0 + 2.5), W(h.hx + 0.07, -0.5, y0 + 2.5), DOOR);
      box(h.hx + 1.0, 0, 1.0, 1.5, y0 + 0.5, y0 + 0.75, lin(0x7a5a38), lin(0x9a7a50)); box(h.hx + 1.0, 0, 1.1, 1.6, y0 + 2.7, y0 + 2.85, lin(0x4a3a2c), lin(0x5a4a3c));
    } else if (h.kind === 'kasten') {   // großer weißer Kasten: Flachdach mit Aufbauten, Glasband unten, Vordach am Eingang, Fensterband oben
      box(0, 0, h.hx, h.hz, y0, yw, wallC, null); box(0, 0, h.hx + 0.1, h.hz + 0.1, yw - 0.1, yw + 0.7, mul(wallC, 0.88), lin(0x9a9a9e));
      for (const [lx, lz, a, b] of [[-0.3, -0.5, 3, 2.2], [0.1, 0.1, 2.5, 3], [-0.2, 0.6, 3.5, 2.4]]) box(h.hx * lx, h.hz * lz, a, b, yw + 0.7, yw + 2.0, lin(0xb4b6ba), lin(0xc4c6ca));
      for (const sg of [1, -1]) {
        const x = sg * h.hx;
        sp.quad(W(x + sg * 0.06, -h.hz * 0.9, y0 + 0.5), W(x + sg * 0.06, h.hz * 0.9, y0 + 0.5), W(x + sg * 0.06, h.hz * 0.9, y0 + 3.7), W(x + sg * 0.06, -h.hz * 0.9, y0 + 3.7), GLASS2);
        for (let q = 0; q <= 8; q++) { const z = -h.hz * 0.9 + q * h.hz * 1.8 / 8; box(x + sg * 0.12, z, 0.14, 0.14, y0, y0 + 3.9, mul(wallC, 0.95), null); }
        for (let q = 0; q < 4; q++) { const z0 = -h.hz * 0.85 + q * h.hz * 1.7 / 4; sp.quad(W(x + sg * 0.06, z0 + 0.4, y0 + 5.2), W(x + sg * 0.06, z0 + h.hz * 1.7 / 4 - 0.4, y0 + 5.2), W(x + sg * 0.06, z0 + h.hz * 1.7 / 4 - 0.4, y0 + 7.6), W(x + sg * 0.06, z0 + 0.4, y0 + 7.6), GLASS); }
      }
      box(h.hx + 1.6, 0, 1.6, 4.5, y0 + 3.9, y0 + 4.15, lin(0x8a8e94), lin(0x9a9ea4));
      for (const dz of [-4.2, 4.2]) box(h.hx + 2.9, dz, 0.15, 0.15, y0, y0 + 3.9, lin(0xc4c6ca), null);
      windows('z', h.hz, h.hx - 1, y0 + 3.4, yw, 1, GLASS, 1.8, 1.7, 5.6, false); windows('z', -h.hz, h.hx - 1, y0 + 3.4, yw, -1, GLASS, 1.8, 1.7, 5.6, false);
    } else if (h.kind === 'busch') {   // dichter Gebüschblock (Hang am Damm): hohe Blätterwand, undurchsichtig
      const col = HEDGE[k % HEDGE.length];
      box(0, 0, h.hx, h.hz, y0, yw, col, mul(col, 1.1)); box(0, 0, h.hx * 0.72, h.hz * 0.88, yw, yw + 0.9, mul(LEAF[(k + 1) % LEAF.length], 0.62), mul(LEAF[(k + 2) % LEAF.length], 0.8));
      box(h.hx * 0.3, h.hz * 0.35, h.hx * 0.4, h.hz * 0.22, yw + 0.9, yw + 1.5, mul(col, 0.8), mul(col, 0.95));
    } else if (h.kind === 'reihe' || h.kind === 'haus') {
      const rh = h.roof > 0 ? h.roof : 0;
      box(0, 0, h.hx, h.hz, y0, yw, wallC, rh > 0 ? null : roofC);
      if (rh > 0) gable(h.hx, h.hz, rh, roofC, wallC);
      windows('x', h.hx, h.hz - 0.8, y0, yw, 1, GLASS, 1.0, 1.5, h.kind === 'reihe' ? 3.6 : 3.0, true); windows('x', -h.hx, h.hz - 0.8, y0, yw, -1, GLASS, 1.0, 1.5, 3.4);
      windows('z', h.hz, h.hx - 0.9, y0, yw, 1, GLASS, 1.0, 1.4, 3.2); windows('z', -h.hz, h.hx - 0.9, y0, yw, -1, GLASS, 1.0, 1.4, 3.2);
      if (h.kind === 'reihe') for (let z = -h.hz + 4.5; z < h.hz - 3; z += 4.5) wall(h.hx + 0.02, z, h.hx + 0.02, z + 0.4, y0, yw, mul(wallC, 0.65));   // Trennfugen der Hauszeile
      if (k % 3 === 0 && rh > 0) box(h.hx * 0.3, h.hz * 0.35, 0.5, 0.5, yw + rh * 0.3, yw + rh + 1.4, lin(0x6a3a30));
    } else if (h.kind === 'villa') {
      box(0, 0, h.hx, h.hz, y0, yw, wallC, null);
      // Walmdach + kleiner Turm
      const rh = 5.2, tip = W(0, 0, yw + rh);
      for (const [a, b] of [[[-h.hx - 0.5, -h.hz - 0.5], [h.hx + 0.5, -h.hz - 0.5]], [[h.hx + 0.5, -h.hz - 0.5], [h.hx + 0.5, h.hz + 0.5]], [[h.hx + 0.5, h.hz + 0.5], [-h.hx - 0.5, h.hz + 0.5]], [[-h.hx - 0.5, h.hz + 0.5], [-h.hx - 0.5, -h.hz - 0.5]]]) {
        const nx = b[1] - a[1], nz = -(b[0] - a[0]), nl = Math.hypot(nx, nz) || 1;
        sp.tri(W(a[0], a[1], yw), W(b[0], b[1], yw), tip, mul(h.rc !== undefined ? lin(h.rc) : lin(0x9a3b2a), shade((cs * nx + sn * nz) / nl * 0.6, 0.8, (-sn * nx + cs * nz) / nl * 0.6)));
      }
      box(h.hx * 0.55, h.hz * 0.5, 1.6, 1.6, yw, yw + rh + 1.6, wallC, lin(0x9a3b2a));
      windows('x', h.hx, h.hz - 0.8, y0, yw, 1, GLASS, 1.2, 1.9, 3.4, true); windows('x', -h.hx, h.hz - 0.8, y0, yw, -1, GLASS, 1.2, 1.9, 3.4);
      windows('z', h.hz, h.hx - 0.8, y0, yw, 1, GLASS, 1.2, 1.9, 3.4); windows('z', -h.hz, h.hx - 0.8, y0, yw, -1, GLASS, 1.2, 1.9, 3.4);
    } else if (h.kind === 'kita') {   // großes weißes kastiges Haus, flaches Dach, bunter Streifen
      box(0, 0, h.hx, h.hz, y0, yw, wallC, lin(0xc9c5b8));
      for (const [ax, az, bx, bz] of [[-h.hx, -h.hz, h.hx, -h.hz], [h.hx, -h.hz, h.hx, h.hz], [h.hx, h.hz, -h.hx, h.hz], [-h.hx, h.hz, -h.hx, -h.hz]]) {
        const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), e = 0.06;
        for (let q = 0; q < l; q += 3) { const u0 = q / l, u1 = Math.min(l, q + 3) / l, c = [lin(0x3d9a5a), lin(0xe8a23a), lin(0x3a7fc8), lin(0xd44a3a)][Math.floor(q / 3) % 4]; const nx = dz / l * e, nz = -dx / l * e; sp.quad(W(ax + dx * u0 + nx, az + dz * u0 + nz, y0 + h.h * 0.55), W(ax + dx * u1 + nx, az + dz * u1 + nz, y0 + h.h * 0.55), W(ax + dx * u1 + nx, az + dz * u1 + nz, y0 + h.h * 0.55 + 1.1), W(ax + dx * u0 + nx, az + dz * u0 + nz, y0 + h.h * 0.55 + 1.1), c); }
      }
      for (let q = 0; q < 5; q++) { const c = [lin(0x3d9a5a), lin(0xe8a23a), lin(0x3a7fc8), lin(0xd44a3a), lin(0xe8d23a)][q]; box(h.hx + 3.4 + (q % 2) * 1.6, -h.hz * 0.7 + q * h.hz * 0.34, 0.45, 0.45, y0 + 0.5, y0 + 1.0 + (q % 3) * 0.35, c, mul(c, 1.1)); }
      windows('x', h.hx, h.hz - 1, y0, yw, 1, GLASS2, 1.8, 1.7, 4.2, true); windows('x', -h.hx, h.hz - 1, y0, yw, -1, GLASS2, 1.8, 1.7, 4.2);
      windows('z', h.hz, h.hx - 1, y0, yw, 1, GLASS2, 1.8, 1.7, 4.2); windows('z', -h.hz, h.hx - 1, y0, yw, -1, GLASS2, 1.8, 1.7, 4.2);
    } else if (h.kind === 'schule') {   // roter Klinker, lang und niedrig, Fensterbänder, Turnhalle als Anbau
      box(0, 0, h.hx, h.hz, y0, yw, wallC, lin(0x6a6a6e));
      box(h.hx * 0.2, h.hz + 7, h.hx * 0.7, 7, y0, y0 + h.h * 0.8, mul(wallC, 0.85), lin(0x7a7a7e));
      windows('x', h.hx, h.hz - 1, y0, yw, 1, GLASS2, 2.2, 1.6, 3.8, true); windows('x', -h.hx, h.hz - 1, y0, yw, -1, GLASS2, 2.2, 1.6, 3.8);
      windows('z', h.hz, h.hx - 1, y0, yw, 1, GLASS2, 2.2, 1.6, 3.8); windows('z', -h.hz, h.hx - 1, y0, yw, -1, GLASS2, 2.2, 1.6, 3.8);
    } else if (h.kind === 'buero') {   // grau-weiße Büro-/Geschäftshäuser mit Fensterbändern
      box(0, 0, h.hx, h.hz, y0, yw, wallC, lin(0x7a7e84));
      for (const [axis, at, ext, sg] of [['x', h.hx, h.hz, 1], ['x', -h.hx, h.hz, -1], ['z', h.hz, h.hx, 1], ['z', -h.hz, h.hx, -1]] as ['x' | 'z', number, number, number][]) windows(axis, at, ext - 1, y0, yw, sg, GLASS2, 3.2, 1.7, 4.4, axis === 'x' && sg > 0);
    } else if (h.kind === 'zentrum') {   // Einkaufszentrum: langer Flachbau, Klinker-/Glas-Band, Schriftband
      box(0, 0, h.hx, h.hz, y0, yw, wallC, lin(0x8a8a8e));
      box(h.hx * 0.2, 0, h.hx * 0.5, h.hz * 0.9, yw, yw + 3.2, lin(0xc9c5b8), lin(0x8a8a8e));
      for (const sd of [1, -1]) { const e = 0.06 * sd; sp.quad(W(sd * h.hx + e, -h.hz * 0.9, y0 + 2), W(sd * h.hx + e, h.hz * 0.9, y0 + 2), W(sd * h.hx + e, h.hz * 0.9, y0 + 7.5), W(sd * h.hx + e, -h.hz * 0.9, y0 + 7.5), GLASS2); sp.quad(W(sd * h.hx + e, -h.hz * 0.9, yw - 3), W(sd * h.hx + e, h.hz * 0.9, yw - 3), W(sd * h.hx + e, h.hz * 0.9, yw - 1), W(sd * h.hx + e, -h.hz * 0.9, yw - 1), lin(0xe8c43a)); }
    } else {   // Gewerbe: flaches Dach, Schiebefenster-Band
      box(0, 0, h.hx, h.hz, y0, yw, wallC, lin(0x8a8a8e));
      windows('x', h.hx, h.hz - 1, y0, yw, 1, GLASS2, 2.6, 1.6, 5.0, true); windows('z', h.hz, h.hx - 1, y0, yw, 1, GLASS2, 2.6, 1.6, 5.0); windows('z', -h.hz, h.hx - 1, y0, yw, -1, GLASS2, 2.6, 1.6, 5.0);
    }
  };
  for (const h of sub.houses) house(h);

  // ── Hecken ──
  for (const g of sub.hedges) {
    const cs = Math.cos(g.yaw), sn = Math.sin(g.yaw), col = HEDGE[g.c % HEDGE.length];
    const W = (lx: number, lz: number, y: number): V => [g.x + cs * lx + sn * lz, y, g.z - sn * lx + cs * lz];
    const hl = g.len / 2, hw = 0.45, y0 = T.height(g.x, g.z) - 0.1, y1 = y0 + 1.15;
    sp.quad(W(-hl, -hw, y1), W(hl, -hw, y1), W(hl, hw, y1), W(-hl, hw, y1), mul(col, 1.0));
    sp.quad(W(-hl, hw, y0), W(hl, hw, y0), W(hl, hw, y1), W(-hl, hw, y1), mul(col, shade(sn, 0, cs)));
    sp.quad(W(hl, -hw, y0), W(-hl, -hw, y0), W(-hl, -hw, y1), W(hl, -hw, y1), mul(col, 0.75));
    sp.quad(W(hl, hw, y0), W(hl, -hw, y0), W(hl, -hw, y1), W(hl, hw, y1), mul(col, 0.85));
  }

  // ── kleine Stangen: Laternen, Schilder, Ampeln, Bushaltestellen ──
  const bar = (x: number, y0: number, y1: number, z: number, w: number, col: V) => {
    const q = w / 2, P = (dx: number, y: number, dz: number): V => [x + dx, y, z + dz];
    sp.quad(P(-q, y0, q), P(q, y0, q), P(q, y1, q), P(-q, y1, q), mul(col, 0.9)); sp.quad(P(q, y0, -q), P(-q, y0, -q), P(-q, y1, -q), P(q, y1, -q), mul(col, 0.7));
    sp.quad(P(q, y0, q), P(q, y0, -q), P(q, y1, -q), P(q, y1, q), mul(col, 0.8)); sp.quad(P(-q, y0, -q), P(-q, y0, q), P(-q, y1, q), P(-q, y1, -q), mul(col, 0.8));
    sp.quad(P(-q, y1, q), P(q, y1, q), P(q, y1, -q), P(-q, y1, -q), col);
  };
  for (const l of sub.lamps) {
    const y = T.height(l.x, l.z), dx = Math.cos(l.yaw) * -l.side * 0.9, dz = -Math.sin(l.yaw) * -l.side * 0.9;
    bar(l.x, y - 0.2, y + 7.2, l.z, 0.2, POLE); bar(l.x + dx * 0.5, y + 7.0, y + 7.2, l.z + dz * 0.5, 0.18, POLE); bar(l.x + dx, y + 6.95, y + 7.15, l.z + dz, 0.8, lin(0xf2e6b8));
  }
  // Ampeln an der Strecke: Mast rechts hinter der Haltelinie + Querarm (Köpfe schauen gegen die Fahrtrichtung)
  const light = new StartLight(course, sp);
  const head = (x: number, z: number, y: number, yaw: number, k: number) => {   // Signalkopf: schwarzer Kasten + 3 Lampen (lit 0 = rot, 1 = gelb, 2 = grün)
    const cs = Math.cos(yaw), sn = Math.sin(yaw), W = (lx: number, lz: number, yy: number): V => [x + cs * lx + sn * lz, yy, z - sn * lx + cs * lz];
    // lokal +z = gegen die Fahrtrichtung (zum anfahrenden Fahrer), dort sitzen die Lampen
    sp.quad(W(-0.22, -0.2, y), W(0.22, -0.2, y), W(0.22, -0.2, y + 1.2), W(-0.22, -0.2, y + 1.2), DARK); sp.quad(W(-0.22, 0.2, y), W(0.22, 0.2, y), W(0.22, 0.2, y + 1.2), W(-0.22, 0.2, y + 1.2), DARK);
    sp.quad(W(-0.22, -0.2, y), W(-0.22, 0.2, y), W(-0.22, 0.2, y + 1.2), W(-0.22, -0.2, y + 1.2), DARK); sp.quad(W(0.22, -0.2, y), W(0.22, 0.2, y), W(0.22, 0.2, y + 1.2), W(0.22, -0.2, y + 1.2), DARK);
    sp.quad(W(-0.22, 0.2, y + 1.2), W(0.22, 0.2, y + 1.2), W(0.22, -0.2, y + 1.2), W(-0.22, -0.2, y + 1.2), DARK);
    [0, 1, 2].forEach((n) => { const yy = y + 0.85 - n * 0.36; light.addSig(k, sp.col.length / 3); sp.quad(W(-0.13, 0.22, yy), W(0.13, 0.22, yy), W(0.13, 0.22, yy + 0.26), W(-0.13, 0.22, yy + 0.26), [0.1, 0.1, 0.1]); });
  };
  sub.signals.forEach((g, k) => {
    const a = route.at(g.s + 3), yaw = g.yaw;
    if (g.s < 30) return;   // an der Startkreuzung steht die Startampel (StartLight)
    for (const side of [-1, 1]) {
      const [x, z] = route.offset(g.s + 3, side * (half + 1.6)), y = T.height(x, z);
      bar(x, y - 0.2, y + 4.3, z, 0.22, POLE);
      head(x, z, y + 3.1, yaw, k);
      if (side === -1) { const [x2, z2] = route.offset(g.s + 3, -half * 0.1); bar((x + x2) / 2, y + 4.1, y + 4.3, (z + z2) / 2, 0.14, POLE); head(x2, z2, y + 3.4, yaw, k); }
    }
    void a;
  });
  // Netzampeln: je Zufahrt Mast rechts, Kopf gegen die Fahrtrichtung, auf breiten Straßen ein zweiter Kopf am Ausleger über der Spur
  const beam = (x0: number, z0: number, x1: number, z1: number, y: number, col: V) => {
    const l = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / l * 0.07, nz = (x1 - x0) / l * 0.07;
    sp.quad([x0 - nx, y, z0 - nz], [x1 - nx, y, z1 - nz], [x1 + nx, y, z1 + nz], [x0 + nx, y, z0 + nz], col);
    sp.quad([x0 - nx, y + 0.18, z0 - nz], [x1 - nx, y + 0.18, z1 - nz], [x1 + nx, y + 0.18, z1 + nz], [x0 + nx, y + 0.18, z0 + nz], col);
    sp.quad([x0 - nx, y, z0 - nz], [x1 - nx, y, z1 - nz], [x1 - nx, y + 0.18, z1 - nz], [x0 - nx, y + 0.18, z0 - nz], mul(col, 0.8));
    sp.quad([x0 + nx, y, z0 + nz], [x1 + nx, y, z1 + nz], [x1 + nx, y + 0.18, z1 + nz], [x0 + nx, y + 0.18, z0 + nz], mul(col, 0.8));
  };
  for (const h of course.signals?.heads ?? []) {
    const y = T.height(h.x, h.z);
    bar(h.x, y - 0.2, y + 4.4, h.z, 0.22, POLE);
    head(h.x, h.z, y + 3.0, h.yaw, h.k);
    if (h.half >= 5.4) {   // zweiter Kopf über der rechten Spur
      const q = h.half * 0.5, x2 = h.x - h.rx * (h.half + 1.5 - q), z2 = h.z - h.rz * (h.half + 1.5 - q);
      beam(h.x, h.z, x2, z2, y + 4.2, POLE); head(x2, z2, y + 4.4, h.yaw, h.k);
    }
  }
  for (const b of sub.bus) {   // Wartehäuschen: Dach, Rückwand aus Glas, Bank, Haltestellenmast
    const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw), W = (lx: number, lz: number, y: number): V => [b.x + cs * (-lx * b.side) + sn * lz, y, b.z - sn * (-lx * b.side) + cs * lz];
    const y = T.height(b.x, b.z), hl = 2.6, hw = 0.9;
    sp.quad(W(-hw, -hl, y + 2.5), W(hw, -hl, y + 2.5), W(hw, hl, y + 2.5), W(-hw, hl, y + 2.5), lin(0x6a6e78));
    sp.quad(W(-hw, -hl, y + 0.2), W(-hw, hl, y + 0.2), W(-hw, hl, y + 2.5), W(-hw, -hl, y + 2.5), GLASS2);
    sp.quad(W(-hw, -hl, y), W(hw, -hl, y), W(hw, -hl, y + 2.5), W(-hw, -hl, y + 2.5), POLE); sp.quad(W(-hw, hl, y), W(hw, hl, y), W(hw, hl, y + 2.5), W(-hw, hl, y + 2.5), POLE);
    sp.quad(W(-hw + 0.1, -hl + 0.4, y + 0.55), W(-hw + 0.5, -hl + 0.4, y + 0.55), W(-hw + 0.5, hl - 0.4, y + 0.55), W(-hw + 0.1, hl - 0.4, y + 0.55), lin(0x8a5a30));
    bar(b.x + cs * (-b.side) * 0.3 + sn * 4.2, y - 0.2, y + 3.0, b.z - sn * (-b.side) * 0.3 + cs * 4.2, 0.12, POLE); bar(b.x + cs * (-b.side) * 0.3 + sn * 4.2, y + 2.6, y + 3.2, b.z - sn * (-b.side) * 0.3 + cs * 4.2, 0.5, lin(0x2e8a3a));
  }
  for (const g of sub.signs) { const y = T.height(g.x, g.z); bar(g.x, y - 0.2, y + 3.0, g.z, 0.1, POLE); }

  // ── Fußgängerstege über die Au: Holzdeck mit Buckel, Geländer, Pfosten, Widerlager; Kollision = die Box des Hauses ──
  const WOOD = [lin(0x8a6a44), lin(0x7a5c3a)], WOODD = lin(0x5a4430), WOODL = lin(0x9a7a50);
  for (const h of sub.houses) if (h.kind === 'steg') {
    const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw), W = (lx: number, lz: number, y: number): V => [h.x + cs * lx + sn * lz, y, h.z - sn * lx + cs * lz];
    const { L, gy, yAt } = stegProfile(T, h), N = Math.round(L), dw = 1.35;
    for (let i = 0; i < 2 * N; i++) {
      const u0 = -L + L * i / N, u1 = u0 + L / N, y0 = yAt(u0), y1 = yAt(u1);
      sp.quad(W(-dw, u0, y0), W(dw, u0, y0), W(dw, u1, y1), W(-dw, u1, y1), mul(WOOD[i % 2], 1.0));
      for (const sd of [-1, 1]) {
        sp.quad(W(sd * dw, u0, y0), W(sd * dw, u1, y1), W(sd * dw, u1, y1 - 0.35), W(sd * dw, u0, y0 - 0.35), mul(WOODD, shade(cs * sd, 0, -sn * sd)));
        // Geländer: Handlauf (Streifen) + Mittelholm
        const hr = 1.05, r = 0.08;
        sp.quad(W(sd * dw - r, u0, y0 + hr), W(sd * dw + r, u0, y0 + hr), W(sd * dw + r, u1, y1 + hr), W(sd * dw - r, u1, y1 + hr), WOODL);
        sp.quad(W(sd * dw, u0, y0 + hr), W(sd * dw, u1, y1 + hr), W(sd * dw, u1, y1 + hr - 0.1), W(sd * dw, u0, y0 + hr - 0.1), WOODD);
        sp.quad(W(sd * dw, u0, y0 + 0.5), W(sd * dw, u1, y1 + 0.5), W(sd * dw, u1, y1 + 0.42), W(sd * dw, u0, y0 + 0.42), WOODD);
        if (i % 2 === 0) { const p = W(sd * dw, u0, 0); bar(p[0], y0 - 0.2, y0 + hr + 0.1, p[2], 0.16, WOODD); }
      }
    }
    for (const sd of [-1, 1]) { const p = W(sd * dw, L, 0); bar(p[0], yAt(L) - 0.2, yAt(L) + 1.15, p[2], 0.16, WOODD); }
    for (const e of [-1, 1]) for (const sd of [-1, 1]) {   // Widerlager (Holzböcke) und Pfähle im Kanal
      const p = W(sd * (dw - 0.1), e * (L - 0.3), 0); bar(p[0], gy(e * (L - 0.3)) - 0.8, yAt(e * (L - 0.3)) - 0.3, p[2], 0.34, WOODD);
      const q = W(sd * (dw - 0.1), e * 4.6, 0); bar(q[0], yAt(e * 4.6) - 3.6, yAt(e * 4.6) - 0.3, q[2], 0.3, WOODD);
    }
  }

  // Straßenschilder (Pixelschrift-Atlas) und Startampel in dasselbe Mesh: Textur = Atlas, alles andere zeigt auf ein weißes Texel
  for (const g of sub.signs) addSign(sp, course, atlas, texts, g);
  const tex = new THREE.CanvasTexture(atlas.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const WU = 0.5 / atlas.canvas.width, WV = 0.5 / atlas.canvas.height;   // weißes Texel (unterste Zeile)
  for (let i = 0; i < sp.uv.length; i += 2) if (sp.uv[i] === 0 && sp.uv[i + 1] === 0) { sp.uv[i] = WU; sp.uv[i + 1] = WV; }
  const bg = sp.geometry(true);
  const bm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide }));
  bm.frustumCulled = false; group.add(bm); light.bind(bg);

  // ── Decals: Gehwege, Markierungen, Querstraßen, Laub ──
  const Y = 0.075, roadCol = lin(course.surfaceColors[0] ?? 0x4a4a4e);
  const onBridge = (s: number) => !!course.bridge && s > course.bridge.s0 - 1 && s < course.bridge.s1 + 1;
  const inFord = (s: number) => course.fords.some((f) => s > f.s0 - 2 && s < f.s1 + 2);
  const lat = (s: number, l: number, y = Y): V => { const [x, z] = route.offset(s, l); return [x, T.height(x, z) + y, z]; };
  const strip = (s0: number, s1: number, l0: number, l1: number, col: V, y = Y) => dc.quad(lat(s0, l1, y), lat(s0, l0, y), lat(s1, l0, y), lat(s1, l1, y), col);
  const asphalt = (s: number) => course.roadSurfAt!(s).id === 0;
  const PARKC = lin(0x5a5a60), WHITE = lin(0xe8e6dc), YEL = lin(0xe0c060), PAVE = lin(0x9c978c), CURB = lin(0x7a766e);
  const near = (s: number) => sub.signals.some((g) => Math.abs(g.s - s) < 9);
  if (course.net) {
  netMarks(course, (a, b, c, d, col) => dc.quad(a, b, c, d, col));
  for (const w of sub.walks) {   // Gehwege (mit Bordstein) und Parkstreifen entlang der Netzkanten, nicht auf Brücken/Kreuzungen
    const ed = course.net!.edges[w.edge], R = ed.route, P = (s: number, l: number, y: number): V => { const [x, z] = R.offset(s, w.side * l); return [x, T.height(x, z) + y, z]; };
    for (let s = w.s0; s < w.s1 - 0.5; s += 3) {
      const s1 = Math.min(w.s1, s + 3), mx = R.offset((s + s1) / 2, w.side * (w.l0 + 0.5));
      if (ed.onDeck(s) || ed.onDeck(s1) || course.net!.junctionAt(mx[0], mx[1], 1)) continue;
      if (w.park) dc.quad(P(s, w.l0, 0.06), P(s1, w.l0, 0.06), P(s1, w.l1, 0.06), P(s, w.l1, 0.06), PARKC);
      else { dc.quad(P(s, w.l0, 0.12), P(s1, w.l0, 0.12), P(s1, w.l1, 0.12), P(s, w.l1, 0.12), PAVE); dc.quad(P(s, w.l0, 0.14), P(s1, w.l0, 0.14), P(s1, w.l0 + 0.3, 0.14), P(s, w.l0 + 0.3, 0.14), CURB); }
    }
  }
  for (const h of course.signals?.heads ?? []) {   // Haltelinie auf der rechten Fahrbahnhälfte; Bedarfsampel: Zebra über die ganze Straße
    const P = (l: number, a: number): V => { const x = h.lx + h.rx * l + h.tx * a, z = h.lz + h.rz * l + h.tz * a; return [x, T.height(x, z) + 0.09, z]; };
    dc.quad(P(0.15, -0.3), P(h.half - 0.1, -0.3), P(h.half - 0.1, 0.3), P(0.15, 0.3), WHITE);
    if (h.ped && h.dir > 0) for (let l = -h.half + 0.5; l < h.half - 0.3; l += 1.1) dc.quad(P(l, 2.6 - 1.4), P(l + 0.55, 2.6 - 1.4), P(l + 0.55, 2.6 + 1.4), P(l, 2.6 + 1.4), WHITE);
  }
  } else for (let s = 2; s < route.length - 2; s += 3) {
    if (onBridge(s) || inFord(s) || !asphalt(s)) continue;
    // Gehwege nur, wo Bebauung/Laternen stehen: Straßenabschnitte mit Hausreihen
    const side = (sd: number) => sub.houses.some((h) => Math.hypot(h.x - route.at(s).x, h.z - route.at(s).z) < 60 && ((h.x - route.at(s).x) * route.at(s).dz - (h.z - route.at(s).z) * route.at(s).dx) * sd > 0);
    for (const sd of [1, -1]) if (side(sd)) { strip(s, s + 3, sd * half, sd * (half + 2.3), PAVE, 0.12); strip(s, s + 3, sd * (half + 0.05), sd * (half + 0.3), CURB, 0.14); }
    // Mittellinie (gestrichelt) bzw. Doppellinie auf breiten Abschnitten, Randlinien
    const wide = course.roadWidth >= 10;
    if (!near(s)) { if (Math.floor(s / 3) % 2 === 0) strip(s, s + 3, -0.1, 0.1, wide && Math.floor(s / 6) % 3 !== 2 ? YEL : WHITE); }
    strip(s, s + 3, half - 0.55, half - 0.35, WHITE); strip(s, s + 3, -half + 0.35, -half + 0.55, WHITE);
    if (wide && !near(s) && Math.floor(s / 3) % 3 === 0) { strip(s, s + 3, half / 2 - 0.1, half / 2 + 0.1, WHITE); strip(s, s + 3, -half / 2 - 0.1, -half / 2 + 0.1, WHITE); }
  }
  if (!course.net) for (const g of sub.signals) {   // Zebrastreifen + Haltelinien beider Richtungen
    for (let l = -half + 0.6; l < half - 0.4; l += 1.1) strip(g.s - 1.6, g.s + 1.6, l, l + 0.55, WHITE, 0.09);
    strip(g.s - 3.2, g.s - 2.6, -half, 0, WHITE, 0.09); strip(g.s + 2.6, g.s + 3.2, 0, half, WHITE, 0.09);
  }
  for (const a of sub.arms) {   // Querstraße: Asphaltband + Mittellinie + Randlinien
    const P = (along: number, la: number, y = 0.06): V => { const x = a.x + a.tx * (la) + a.tz * along, z = a.z + a.tz * (la) - a.tx * along; return [x, T.height(x, z) + y, z]; };
    const hw = a.w / 2, L = a.len / 2 + 2;
    dc.quad(P(-hw, -L), P(hw, -L), P(hw, L), P(-hw, L), roadCol);
    for (let u = -L + 3; u < L - 3; u += 6) dc.quad(P(-0.1, u, 0.08), P(0.1, u, 0.08), P(0.1, u + 3, 0.08), P(-0.1, u + 3, 0.08), WHITE);
    for (const sd of [-1, 1]) dc.quad(P(sd * (hw - 0.55), -L, 0.08), P(sd * (hw - 0.35), -L, 0.08), P(sd * (hw - 0.35), L, 0.08), P(sd * (hw - 0.55), L, 0.08), WHITE);
  }
  // Laub am Fahrbahnrand (deterministisch, flach)
  let hs = 12345; const rn = () => { hs = (Math.imul(hs, 1103515245) + 12345) >>> 0; return hs / 4294967296; };
  if (!course.net) for (let s = 6; s < route.length - 6; s += 2.2) {
    if (onBridge(s) || inFord(s)) continue;
    const dens = asphalt(s) ? 1 : 0.35;
    for (let i = 0; i < 3; i++) {
      if (rn() > dens) continue;
      const sd = rn() < 0.5 ? 1 : -1, l = sd * (half - 0.8 + rn() * 2.4), ss = s + rn() * 2.2, w = 0.22 + rn() * 0.3, a = rn() * 6.28, c = LEAF[Math.floor(rn() * LEAF.length)];
      const [x, z] = route.offset(ss, l), y = T.height(x, z) + 0.1, ca = Math.cos(a) * w, sa = Math.sin(a) * w;
      dc.quad([x - ca, y, z - sa], [x + sa * 0.6, y, z - ca * 0.6], [x + ca, y, z + sa], [x - sa * 0.6, y, z + ca * 0.6], c);
    }
  }
  // Wahrzeichen-Bodenflächen: Pflaster vor dem Start, Vorplatz, Gasse, Pfad zum Steg – folgen dem Gelände in ≤ 3 m Zellen
  const PCOL: Record<string, [V, V, number]> = { plaza: [lin(0xb9b0a0), lin(0xa89f8c), 0.2], court: [lin(0x8e8c88), lin(0x83817d), 0.17], lane: [lin(0xa89878), lin(0x9a8c6c), 0.1], stub: [lin(0xa89878), lin(0x9a8c6c), 0.1] };
  for (const p of sub.patches) {
    const cs = Math.cos(p.yaw), sn = Math.sin(p.yaw), [c1, c2, yo] = PCOL[p.c], tile = p.c === 'plaza' ? 1.6 : 3, nx = Math.max(1, Math.round(2 * p.hx / tile)), nz = Math.max(1, Math.round(2 * p.hz / tile));
    const P = (lx: number, lz: number): V => { const x = p.x + cs * lx + sn * lz, z = p.z - sn * lx + cs * lz; return [x, T.height(x, z) + yo, z]; };
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const a = -p.hx + 2 * p.hx * i / nx, b = -p.hx + 2 * p.hx * (i + 1) / nx, c = -p.hz + 2 * p.hz * j / nz, d = -p.hz + 2 * p.hz * (j + 1) / nz;
      dc.quad(P(a, c), P(b, c), P(b, d), P(a, d), (i + j) % 2 ? c1 : c2);
    }
  }
  const fm = new THREE.Mesh(dc.geometry(false), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  fm.frustumCulled = false; group.add(fm);

  return { group, light };
}

/** Schild-Atlas: jede Zeile ein Text (weiße Tafel, dunkelblaue Pixelschrift, 5x7-Schrift). Textlänge ≤ 24 Zeichen. */
export function signAtlas(texts: string[]): { canvas: HTMLCanvasElement; w: number[]; rowH: number } {
  const rowH = 11, cw = 6 * Math.max(...texts.map((t) => t.length), 4) + 6;
  const c = document.createElement('canvas'); c.width = cw; c.height = rowH * texts.length + 2;   // unten 2 Pixel weiß (für alle Flächen ohne Schrift)
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, rowH * texts.length, cw, 2);
  texts.forEach((txt, r) => {
    const w = 6 * txt.length + 4;
    g.fillStyle = '#f2f0e6'; g.fillRect(0, r * rowH, w, rowH - 1); g.fillStyle = '#1a3a7a'; g.fillRect(0, r * rowH, w, 1); g.fillRect(0, r * rowH + rowH - 2, w, 1);
    g.fillStyle = '#10286a';
    [...txt].forEach((ch, i) => { const rows = ch === ' ' ? [0, 0, 0, 0, 0, 0, 0] : F[ch] ?? [31, 17, 17, 17, 17, 17, 31]; rows.forEach((bits, y) => { for (let x = 0; x < 5; x++) if (bits & (16 >> x)) g.fillRect(2 + i * 6 + x, r * rowH + 2 + y, 1, 1); }); });
  });
  return { canvas: c, w: texts.map((t) => 6 * t.length + 4), rowH };
}

function addSign(sp: Soup, course: Course, at: ReturnType<typeof signAtlas>, texts: string[], s: { x: number; z: number; yaw: number; text: string }): void {
  const T = course.terrain, H = at.canvas.height, Wd = at.canvas.width;
  const r = texts.indexOf(s.text), pw = at.w[r], len = Math.max(1.6, s.text.length * 0.2 + 0.4), hh = len * (at.rowH - 1) / pw;
  // quer zur Fahrtrichtung (yaw = atan2(−dx, −dz): Fahrtrichtung (−sin, −cos), quer (cos, −sin)): die Tafel zeigt zum anfahrenden Fahrer
  const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw), y = T.height(s.x, s.z) + 2.5, ax = cs * len / 2, az = -sn * len / 2;
  const u1 = pw / Wd, v1 = 1 - (r * at.rowH) / H, v0 = 1 - (r * at.rowH + at.rowH - 1) / H;
  sp.quad([s.x - ax, y, s.z - az], [s.x + ax, y, s.z + az], [s.x + ax, y + hh, s.z + az], [s.x - ax, y + hh, s.z - az], [1, 1, 1], [[1e-4, v0], [u1, v0], [u1, v1], [1e-4, v1]]);
}

/** Startampel an der Startkreuzung: zwei Signalköpfe voraus (rot, rot+gelb, grün), Phase wie die Anzeige oben (0 aus, 1 rot, 2 rot+gelb, 3 grün). 1 Draw Call. */
export class StartLight {
  private col: THREE.BufferAttribute | null = null; private lamp: number[][] = []; private ph = -1;
  private sig: number[][] = []; private sigPh: number[] = [];
  addSig(k: number, v: number): void { (this.sig[k] ??= []).push(v); }
  /** baut die Köpfe in das gemeinsame Mesh `sp` (Lampen = je 6 Vertices, Farbe wird je Phase gesetzt) */
  constructor(course: Course, sp: Soup) {
    const route = course.route, T = course.terrain, half = course.roadWidth / 2, s0 = 24;
    const yaw = route.yawAt(s0), cs = Math.cos(yaw), sn = Math.sin(yaw);
    const lampStart: number[] = [];
    for (const side of [-1, 1]) {
      const [x, z] = route.offset(s0, side * (half + 1.4)), y = T.height(x, z);
      const W = (lx: number, lz: number, yy: number): V => [x + cs * lx + sn * lz, yy, z - sn * lx + cs * lz];
      const pole = (hw: number, y0: number, y1: number, col: V) => { for (const [a, b] of [[[-hw, -hw], [hw, -hw]], [[hw, -hw], [hw, hw]], [[hw, hw], [-hw, hw]], [[-hw, hw], [-hw, -hw]]]) sp.quad(W(a[0], a[1], y0), W(b[0], b[1], y0), W(b[0], b[1], y1), W(a[0], a[1], y1), col); };
      pole(0.12, y - 0.2, y + 5.6, POLE);
      const hy = y + 3.6;   // Kopf: 3 Lampen; lokal +z = gegen die Fahrtrichtung, dort sitzen die Lampen
      for (const [a, b] of [[[-0.3, -0.2], [0.3, -0.2]], [[0.3, -0.2], [0.3, 0.2]], [[0.3, 0.2], [-0.3, 0.2]], [[-0.3, 0.2], [-0.3, -0.2]]]) sp.quad(W(a[0], a[1], hy), W(b[0], b[1], hy), W(b[0], b[1], hy + 1.9), W(a[0], a[1], hy + 1.9), DARK);
      sp.quad(W(-0.3, 0.2, hy + 1.9), W(0.3, 0.2, hy + 1.9), W(0.3, -0.2, hy + 1.9), W(-0.3, -0.2, hy + 1.9), DARK);
      for (let n = 0; n < 3; n++) { const yy = hy + 1.35 - n * 0.6; lampStart.push(sp.col.length / 3); sp.quad(W(-0.2, 0.23, yy), W(0.2, 0.23, yy), W(0.2, 0.23, yy + 0.42), W(-0.2, 0.23, yy + 0.42), [0.1, 0.1, 0.1]); }
    }
    this.lamp = lampStart.map((v) => [v, v + 6]);
  }
  bind(g: THREE.BufferGeometry): void { this.col = g.getAttribute('color') as THREE.BufferAttribute; this.ph = -1; this.sigPh = []; this.set(0); this.signals((k) => sigPhase(0, k)); }
  /** Streckenampeln: Phase aus der Verkehrszeit t (nur bei Wechsel werden Farben geschrieben) */
  signals(phaseOf: (k: number) => number): void {
    if (!this.col) return;
    const ON = [lin(0x2aff4a), lin(0xffb41a), lin(0xff2a1a)];   // grün, gelb, rot
    this.sig.forEach((vs, k) => {
      const ph = phaseOf(k); if (this.sigPh[k] === ph) return; this.sigPh[k] = ph;
      vs.forEach((v, i) => { const lampOf = i % 3, on = lampOf === (ph === 0 ? 2 : ph === 1 ? 1 : 0), c = on ? ON[ph === 0 ? 0 : ph === 1 ? 1 : 2] : mul(ON[lampOf === 0 ? 2 : lampOf === 1 ? 1 : 0], 0.16); for (let q = v; q < v + 6; q++) this.col!.setXYZ(q, c[0], c[1], c[2]); });
    });
    this.col.needsUpdate = true;
  }
  /** Phase der Anzeige: 0 aus, 1 rot, 2 rot+gelb, 3 grün */
  set(ph: number): void {
    if (!this.col || ph === this.ph) return; this.ph = ph;
    const ON = [lin(0xff2a1a), lin(0xffb41a), lin(0x2aff4a)];
    this.lamp.forEach(([a, b], i) => {
      const n = i % 3, on = ph === 1 ? n === 0 : ph === 2 ? n < 2 : ph === 3 ? n === 2 : false, c = on ? ON[n] : mul(ON[n], 0.16);
      for (let v = a; v < b; v++) this.col!.setXYZ(v, c[0], c[1], c[2]);
    });
    this.col.needsUpdate = true;
  }
}

// Himmel + Horizont: EIN Mesh (1 Draw Call, Vertexfarben, ohne Nebel/Tiefenschreiben), folgt der Kamera.
// Inhalt: Himmelskuppel mit Farbverlauf (Zenit -> Horizont = Nebelfarbe), Horizont-Silhouette als Wand (Berge / Skyline mit Fenstern / Dünen / Hügel),
// Sterne (Nacht), Sonnenscheibe (Dämmerung). Alles klein und billig – keine Texturen, keine Shader.
import * as THREE from 'three';

export type RingKind = 'mountains' | 'skyline' | 'dunes' | 'hills';
export interface SkyDef {
  zenith: number; mid?: number; horizon: number;   // Verlauf von oben nach unten (horizon = Nebelfarbe, damit die Naht verschwindet)
  ring: RingKind; ringTop: number; ringH: number;  // Silhouette: Farbe oben, Höhe (m) auf der Entfernung `ringR`
  stars?: boolean; windows?: boolean;
  sun?: { dx: number; dz: number; elev: number; col: number; glow: number };   // Richtung, Höhe in Grad
  seed: number;
}

/** Welt-Voreinstellungen (Farben passend zu den Nebelfarben in src/levels/*.json) */
export const SKIES: Record<string, Omit<SkyDef, 'horizon' | 'seed' | 'sun'>> = {
  snow: { zenith: 0x6f9ed6, mid: 0xb4cde8, ring: 'mountains', ringTop: 0xa9bdd6, ringH: 70 },
  city: { zenith: 0x03041a, mid: 0x0b0a2c, ring: 'skyline', ringTop: 0x0a0720, ringH: 70, stars: true, windows: true },
  beach: { zenith: 0x27316e, mid: 0xc4587e, ring: 'dunes', ringTop: 0x9a4e5e, ringH: 22 },
  rhein: { zenith: 0x5c9fe0, mid: 0xa4cdf0, ring: 'hills', ringTop: 0x86aec8, ringH: 55 },
  vorstadt: { zenith: 0x3d7fd4, mid: 0xa9cbe8, ring: 'hills', ringTop: 0xa29a78, ringH: 38 },
  practice: { zenith: 0x6592c0, mid: 0x98b7d0, ring: 'hills', ringTop: 0x86a5bd, ringH: 40 },
  offroad: { zenith: 0x4f8fd0, mid: 0xa4c8e6, ring: 'hills', ringTop: 0x7f9fb0, ringH: 46 },
};

const rnd = (seed: number) => { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

export function buildSky(d: SkyDef, domeR: number, ringR: number): THREE.Mesh {
  const pos: number[] = [], col: number[] = [];
  const C = (hex: number) => new THREE.Color(hex);
  const push = (p: number[], c: THREE.Color) => { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); };
  const tri = (a: number[], b: number[], c: number[], ca: THREE.Color, cb = ca, cc = ca) => { push(a, ca); push(b, cb); push(c, cc); };
  const hor = C(d.horizon), zen = C(d.zenith), mid = C(d.mid ?? d.zenith);
  const rand = rnd(d.seed);

  // ── Himmelskuppel: Ringe von unterhalb des Horizonts bis zum Zenit, Verlauf über die Höhe ──
  const NS = 32, ELEV = [-0.35, 0, 0.06, 0.16, 0.32, 0.55, 0.85, 1.2, Math.PI / 2];
  const dome = (e: number, k: number): number[] => { const a = k / NS * Math.PI * 2; return [Math.cos(e) * Math.cos(a) * domeR, Math.sin(e) * domeR, Math.cos(e) * Math.sin(a) * domeR]; };
  const sky = (e: number): THREE.Color => {
    if (e <= 0.0) return hor.clone();
    const t = Math.min(1, e / (Math.PI / 2)), c = new THREE.Color();
    return t < 0.35 ? c.copy(hor).lerp(mid, Math.pow(t / 0.35, 0.8)) : c.copy(mid).lerp(zen, (t - 0.35) / 0.65);
  };
  for (let r = 0; r < ELEV.length - 1; r++) for (let k = 0; k < NS; k++) {
    const e0 = ELEV[r], e1 = ELEV[r + 1], a = dome(e0, k), b = dome(e0, k + 1), c = dome(e1, k + 1), dd = dome(e1, k);
    const ca = sky(e0), cb = sky(e1);
    tri(a, c, b, ca, cb, ca); tri(a, dd, c, ca, cb, cb);
  }

  // ── Sterne (Nacht): kleine helle Vierecke im oberen Himmel ──
  if (d.stars) for (let i = 0; i < 70; i++) {
    const e = 0.25 + rand() * 1.2, a = rand() * Math.PI * 2, s = domeR * (0.0016 + rand() * 0.0018), br = 0.55 + rand() * 0.45;
    const cx = Math.cos(e) * Math.cos(a) * domeR * 0.98, cy = Math.sin(e) * domeR * 0.98, cz = Math.cos(e) * Math.sin(a) * domeR * 0.98;
    const tx = -Math.sin(a), tz = Math.cos(a), c = new THREE.Color(br, br, Math.min(1, br + 0.15));
    const p = [[cx - tx * s, cy - s, cz - tz * s], [cx + tx * s, cy - s, cz + tz * s], [cx + tx * s, cy + s, cz + tz * s], [cx - tx * s, cy + s, cz - tz * s]];
    tri(p[0], p[1], p[2], c); tri(p[0], p[2], p[3], c);
  }

  // ── Sonne (Dämmerung): konzentrische Scheiben, gestuft wie ein Retro-Sonnenuntergang ──
  if (d.sun) {
    const l = Math.hypot(d.sun.dx, d.sun.dz) || 1, az = Math.atan2(d.sun.dz / l, d.sun.dx / l), e = d.sun.elev * Math.PI / 180, R = domeR * 0.97;
    const cx = Math.cos(e) * Math.cos(az) * R, cy = Math.sin(e) * R, cz = Math.cos(e) * Math.sin(az) * R;
    const nx = -Math.sin(az), nz = Math.cos(az), up = [0, 1, 0];
    const disc = (rad: number, c: THREE.Color, ofs: number) => {
      const N = 20, mx = cx * (1 - ofs), my = cy * (1 - ofs), mz = cz * (1 - ofs);
      for (let k = 0; k < N; k++) {
        const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2;
        const P = (a: number) => [mx + (nx * Math.cos(a)) * rad, my + Math.sin(a) * rad * up[1], mz + (nz * Math.cos(a)) * rad];
        tri([mx, my, mz], P(a0), P(a1), c);
      }
    };
    const sc = C(d.sun.col), glow = hor.clone().lerp(C(d.sun.glow), 0.55);
    disc(R * 0.20, hor.clone().lerp(C(d.sun.glow), 0.22), 0.0006); disc(R * 0.11, glow, 0.0012); disc(R * 0.058, sc.clone().lerp(new THREE.Color(1, 1, 1), 0.2), 0.0018);
  }

  // ── Silhouette: Wand bei ringR, oben ringTop, unten im Nebel (verschwindet im Dunst) ──
  const NR = 120, deep = -60, ringTop = C(d.ringTop);
  const H = new Float32Array(NR + 1);
  if (d.ring === 'mountains') {
    // Gipfelketten: Summe von Dreieckswellen, scharfe Spitzen
    const f = [rand() * 6, rand() * 6, rand() * 6];
    for (let k = 0; k < NR; k++) { const a = k / NR * Math.PI * 2; const tr = (x: number) => Math.abs(((x / Math.PI) % 2 + 2) % 2 - 1); H[k] = d.ringH * (0.25 + 0.75 * Math.pow(0.55 * tr(a * 7 + f[0]) + 0.3 * tr(a * 13 + f[1]) + 0.15 * tr(a * 29 + f[2]), 1.4)); }
  } else if (d.ring === 'hills') {
    const f = [rand() * 6, rand() * 6, rand() * 6];
    for (let k = 0; k < NR; k++) { const a = k / NR * Math.PI * 2; H[k] = d.ringH * (0.45 + 0.28 * Math.sin(a * 3 + f[0]) + 0.2 * Math.sin(a * 7 + f[1]) + 0.07 * Math.sin(a * 17 + f[2])); }
  } else if (d.ring === 'dunes') {
    const f = [rand() * 6, rand() * 6];
    for (let k = 0; k < NR; k++) { const a = k / NR * Math.PI * 2; H[k] = d.ringH * (0.45 + 0.35 * Math.sin(a * 4 + f[0]) + 0.2 * Math.sin(a * 9 + f[1])); }
  }
  H[NR] = H[0];
  const wall = (a0: number, a1: number, h0: number, h1: number, top: THREE.Color, R = ringR) => {
    const P = (a: number, y: number) => [Math.cos(a) * R, y, Math.sin(a) * R];
    const b0 = P(a0, deep), b1 = P(a1, deep), z0 = P(a0, 0), z1 = P(a1, 0), t0 = P(a0, h0), t1 = P(a1, h1);
    tri(b0, z0, z1, hor); tri(b0, z1, b1, hor);                       // unter dem Horizont: Nebelfarbe
    tri(z0, t0, t1, hor, top, top); tri(z0, t1, z1, hor, top, hor);   // darüber: Verlauf Nebel -> Silhouette
  };
  if (d.ring === 'skyline') {
    // Häuserblöcke: flache Rechtecke, Fenster als kleine helle Vierecke davor; Höhe wechselt, einzelne Türme
    const wins = [0xffd978, 0xffe9b0, 0x78e0ff, 0xff7ad0, 0xffb04a];
    let a = 0;
    while (a < Math.PI * 2 - 0.02) {
      const span = (14 + rand() * 30) / ringR, a1 = Math.min(Math.PI * 2, a + span);
      const h = d.ringH * (0.18 + rand() * 0.55) * (rand() < 0.12 ? 1.7 : 1);
      const shade = 0.75 + rand() * 0.5, top = ringTop.clone().multiplyScalar(shade);
      const P = (aa: number, y: number) => [Math.cos(aa) * ringR, y, Math.sin(aa) * ringR];
      tri(P(a, deep), P(a, 0), P(a1, 0), hor); tri(P(a, deep), P(a1, 0), P(a1, deep), hor);
      tri(P(a, 0), P(a, h), P(a1, h), hor.clone().lerp(top, 0.5), top, top); tri(P(a, 0), P(a1, h), P(a1, 0), hor.clone().lerp(top, 0.5), top, hor.clone().lerp(top, 0.5));
      if (d.windows) {
        const n = Math.round(span * ringR / 7 * (1 + rand() * 2));
        for (let i = 0; i < n; i++) {
          const aa = a + (0.12 + rand() * 0.76) * (a1 - a), y = 2 + rand() * (h - 5), s = 1.0 + rand() * 0.8, da = s / ringR, c = C(wins[Math.floor(rand() * wins.length)]);
          const q = [P(aa, y), P(aa + da, y), P(aa + da, y + s * 1.3), P(aa, y + s * 1.3)].map((p) => [p[0] * 0.995, p[1], p[2] * 0.995]);
          tri(q[0], q[1], q[2], c); tri(q[0], q[2], q[3], c);
        }
      }
      a = a1;
    }
  } else for (let k = 0; k < NR; k++) wall(k / NR * Math.PI * 2, (k + 1) / NR * Math.PI * 2, H[k], H[k + 1], ringTop);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = -10; m.name = 'sky';
  return m;
}

// Streckengeometrie über ALLE Level (headless, ms): Fahrbahn vs. Physik, Straßenband-Mesh, Selbstberührung, Checkpoints.
// Bekannte Fehler stehen in KNOWN und laufen als `it.fails` (erwartet rot) – seitleer.
// Wird ein bekannter Fall grün, schlägt der Test an: dann den Eintrag streichen.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import type { Course } from '../src/level';
import { Run } from '../src/run';
import { inTunnel } from '../src/features';
import { buildRoadMesh } from '../src/world';
import { buildNetRoad } from '../src/netmesh';

const LEVELS = WORLDS.flatMap((w) => w.levels).filter((l) => !['matschgrube', 'huegel', 'furtwald', 'steilhang', 'moorwald'].includes(l.id))   // Offroad: freie Geländelevel ohne Straße (tests/offroad.test.ts);
const cache = new Map<string, Course>();
const course = (id: string): Course => { let c = cache.get(id); if (!c) { c = LEVELS.find((l) => l.id === id)!.make(); cache.set(id, c); } return c; };

type Check = 'belag' | 'hoehe' | 'band' | 'beruehrung' | 'cpTunnel' | 'cpAbstand';
const KNOWN: Record<Check, Set<string>> = {
  belag: new Set([]),
  hoehe: new Set([]),
  band: new Set([]),
  beruehrung: new Set([]),
  cpTunnel: new Set([]),
  cpAbstand: new Set([]),
};
const t = (check: Check, id: string, fn: () => void) => (KNOWN[check].has(id) ? it.fails : it)(id, fn);

const inBridge = (c: Course, s: number, pad = 4) => c.bridgeSpans.some(([a, b]) => s > a - pad && s < b + pad);
/** echte Fahrbahnbreite bei s (Netz: Breite der Kante, sonst Straßenbreite) */
const wAt = (c: Course, s: number) => { if (!c.net) return c.roadWidth; const p = c.route.at(s), h = c.net.nearest(p.x, p.z); return h ? h.edge.def.w : c.roadWidth; };
/** nahe einer Schanze/Furt (beabsichtigte Höhenänderung) */
const nearBump = (c: Course, s: number) => [...c.jumps, ...c.fords].some((j) => { const a = 's' in j ? j.s : j.s0, b = 's1' in j ? j.s1 : a; return s > a - 45 && s < b + 45; });
const ranges = (xs: number[]) => { const o: string[] = []; let a = NaN, b = NaN; for (const x of xs) { if (isNaN(a) || x - b > 6) { if (!isNaN(a)) o.push(`${a}–${b}`); a = x; } b = x; } if (!isNaN(a)) o.push(`${a}–${b}`); return o.slice(0, 5).join(', '); };

describe('Fahrbahn und Physik', () => {
  // Zellen sind gröber als die Straße (3–8 m): seitlich ist der Belag zellweise; auf der Mittellinie (und mind. einer Seite bei ±0,15 Breiten) muss die Physik Straße sein (Zonenwechsel ±8 m erlaubt)
  for (const lv of LEVELS) t('belag', lv.id, () => {
    const c = course(lv.id), w = c.roadWidth, bad: number[] = [];
    let run = 0;
    for (let s = 2; s < c.length - 2; s += 2) {
      if (inBridge(c, s)) { run = 0; continue; }
      const ok = new Set([-8, -4, 0, 4, 8].map((d) => c.roadSurfAt!(Math.min(Math.max(s + d, 0), c.length)).id));
      // Mittellinie muss Straße sein; bei ±0,15 Breiten darf eine Seite wegen der Zellrasterung (Zellmitte > halbe Breite entfernt) am Rand liegen, beide nicht
      const bad1 = (q: number) => { const [x, z] = c.route.offset(s, q * w); return !ok.has(c.terrain.surface(x, z).id) && !(c.id === 'see' && Math.hypot(x, z) < 96); };
      const off = bad1(0) || (bad1(-0.15) && bad1(0.15));
      run = off ? run + 1 : 0;
      if (run >= 5) bad.push(s);     // ≥ 10 m am Stück
    }
    expect(bad.length, `${lv.id}: Straße liegt physisch auf Randfläche bei s ${ranges(bad)}`).toBe(0);
  });

  // Höhe: quer über ±0,3 Breiten höchstens 15 cm Unterschied (Kuppen/Schanzen/Furten ausgenommen), längs keine Kante (2. Differenz über 1 m ≤ 12 cm)
  for (const lv of LEVELS) t('hoehe', lv.id, () => {
    const c = course(lv.id), w = c.roadWidth, R = c.route, T = c.terrain, bad: number[] = [];
    const h = (s: number, l: number) => { const [x, z] = R.offset(s, l); return T.height(x, z); };
    for (let s = 3; s < c.length - 3; s += 1) {
      if (inBridge(c, s) || nearBump(c, s)) continue;
      const q = [-0.3, 0, 0.3].map((l) => h(s, l * wAt(c, s)));
      if (Math.max(...q) - Math.min(...q) > 0.15 || Math.abs(h(s + 1, 0) - 2 * h(s, 0) + h(s - 1, 0)) > 0.12) bad.push(s);
    }
    expect(bad.length, `${lv.id}: Höhenstufe bei s ${ranges(bad)}`).toBe(0);
  });

  // das echte Straßenband (buildRoadMesh): kein gefaltetes Dreieck, Gelände ragt nirgends > 8 cm darüber (grüne Striche)
  for (const lv of LEVELS) t('band', lv.id, () => {
    const c = course(lv.id), m = (c.net ? buildNetRoad(c) : buildRoadMesh(c))!, P = m.geometry.getAttribute('position'), I = m.geometry.getIndex()!;
    let pos = 0, neg = 0, poke = 0;
    for (let k = 0; k < I.count; k += 3) {
      const a = I.getX(k), b = I.getX(k + 1), d = I.getX(k + 2);
      const cr = (P.getX(b) - P.getX(a)) * (P.getZ(d) - P.getZ(a)) - (P.getZ(b) - P.getZ(a)) * (P.getX(d) - P.getX(a));
      if (cr > 0) pos++; else neg++;
      const cx = (P.getX(a) + P.getX(b) + P.getX(d)) / 3, cz = (P.getZ(a) + P.getZ(b) + P.getZ(d)) / 3;
      poke = Math.max(poke, c.terrain.height(cx, cz) - (P.getY(a) + P.getY(b) + P.getY(d)) / 3);
    }
    expect(Math.min(pos, neg), `${lv.id}: gefaltete Band-Dreiecke`).toBe(0);
    expect(poke, `${lv.id}: Gelände ragt ${(poke * 100).toFixed(0)} cm über das Band`).toBeLessThan(0.08);
  });
});

describe('Strecke liegt im Gelände', () => {
  // außerhalb des Höhenrasters klemmt die Physik auf die Randzelle (Gras mitten auf der Straße)
  for (const lv of LEVELS) it(lv.id, () => {
    const c = course(lv.id); let m = 0;
    for (let s = 0; s <= c.length; s += 2) { const a = c.route.at(s); m = Math.max(m, Math.abs(a.x), Math.abs(a.z)); }
    expect(m, `${lv.id}: Strecke reicht bis ${m.toFixed(0)} m, Raster nur ±${c.terrain.half}`).toBeLessThan(c.terrain.half - 10);
  });
});

describe('Strecke berührt sich nicht selbst', () => {
  // gleichlaufende Nachbarschaft (Winkel < ~45°, auch gegenläufig) näher als 1,5 Breiten bei ≥ 40 m Streckenabstand; Brücken und rechtwinklige Kreuzungen sind erlaubt
  for (const lv of LEVELS) t('beruehrung', lv.id, () => {
    const c = course(lv.id), w = c.roadWidth, bad: number[] = [];
    for (let s = 0; s < c.length; s += 3) {
      if (inBridge(c, s, 3)) continue;
      const a = c.route.at(s);
      for (let q = s + 40; q < c.length; q += 3) {
        if (inBridge(c, q, 3) || (s < 20 && q > c.length - 20)) continue;   // Rundkurs: Start und Ziel liegen zusammen
        const b = c.route.at(q);
        if (Math.hypot(a.x - b.x, a.z - b.z) < 1.5 * w && Math.abs(a.dx * b.dx + a.dz * b.dz) > 0.7) { bad.push(Math.round(s)); break; }
      }
    }
    expect(bad.length, `${lv.id}: berührt sich bei s ${ranges(bad)}`).toBe(0);
  });
});

describe('Checkpoints', () => {
  const cps = (id: string) => new Run(course(id), 'time').cps!.list;
  for (const lv of LEVELS) t('cpTunnel', lv.id, () => {
    const c = course(lv.id), bad = cps(lv.id).filter((p) => inTunnel(c.tunnels, p.s) || inBridge(c, p.s, 0)).map((p) => Math.round(p.s));
    expect(bad, `${lv.id}: Checkpoint im Tunnel/auf der Brücke bei s ${bad}`).toEqual([]);
  });
  for (const lv of LEVELS) t('cpAbstand', lv.id, () => {
    const l = cps(lv.id);
    let near = 1e9, at = 0;
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) { const d = Math.hypot(l[i].x - l[j].x, l[i].z - l[j].z); if (d < near) { near = d; at = Math.round(l[i].s); } }
    expect(near, `${lv.id}: zwei Checkpoints nur ${near.toFixed(0)} m Luftlinie (bei s ${at})`).toBeGreaterThanOrEqual(50);
  });
  // Verschieben statt Löschen: Lücke zwischen Nachbarn bleibt sinnvoll (Brücke 190 m + Ränder = größte Lücke)
  for (const lv of LEVELS) it('Lücken ' + lv.id, () => {
    const l = cps(lv.id).map((p) => p.s), gaps = l.slice(1).map((q, i) => q - l[i]);
    expect(Math.min(...gaps), lv.id).toBeGreaterThanOrEqual(55);
    expect(Math.max(...gaps), lv.id).toBeLessThanOrEqual(270);
  });
});

// Gleise/Züge: Korridor frei von Häusern/Felsen/Bäumen/Laternen, Profil ohne Stufen und am Gelände, Mindestlänge, Zug-Höhe = Profil
import { railY, RAIL_CLEAR, RAIL_PORTAL } from '../src/rail';
describe('Gleise und Züge', () => {
  for (const lv of LEVELS.filter((l) => course(l.id).rails.length)) it(lv.id, () => {
    const c = course(lv.id), O = c.obstacles;
    for (const p of c.rails) {
      expect(-p.uMin, `${lv.id}: Gleis links zu kurz`).toBeGreaterThan(40); expect(p.uMax, `${lv.id}: Gleis rechts zu kurz`).toBeGreaterThan(40);
      const hit: string[] = [];
      for (let u = p.uMin; u <= p.uMax + RAIL_PORTAL; u += 1) {
        const x = p.x + p.kx * u, z = p.z + p.kz * u;
        for (const b of O.boxes) { const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z; if (Math.abs(cs * dx - sn * dz) < b.hx + 1.4 && Math.abs(sn * dx + cs * dz) < b.hz + 1.4) hit.push(`Box u${u}`); }
        for (const k of O.circles) if (Math.hypot(x - k.x, z - k.z) < k.r + 1.4) hit.push(`Hindernis u${u}`);
        for (const k of [...c.trees, ...c.rocks]) if (Math.hypot(x - k.x, z - k.z) < RAIL_CLEAR) hit.push(`Baum/Fels u${u}`);
        if (c.waterAt(x, z) > -1e8) hit.push(`Wasser u${u}`);
        if (u <= p.uMax) { const y = railY(p, u), g = c.terrain.height(x, z); if (Math.abs(y - g) > 1.4) hit.push(`Höhe u${u} Gleis ${y.toFixed(1)} Gelände ${g.toFixed(1)}`); }
      }
      expect(hit.slice(0, 4), `${lv.id}: Gleis schneidet`).toEqual([]);
      for (let i = 1; i + 1 < p.h.length; i++) {
        expect(Math.abs(p.h[i + 1] - p.h[i]), `${lv.id}: Gleis-Stufe/Steigung bei ${p.u0 + i * p.step}`).toBeLessThanOrEqual(0.12 * p.step + 1e-6);
        expect(Math.abs(p.h[i + 1] - 2 * p.h[i] + p.h[i - 1]), `${lv.id}: Gleis-Knick bei ${p.u0 + i * p.step}`).toBeLessThan(0.3);
      }
    }
  });
});

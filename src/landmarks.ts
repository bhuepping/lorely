// Wahrzeichen der Vorstadt (ohne three): Startecke, Doppelhaus-Ecke, Damm-Ecke, Einkaufszentrum, rote Villa, Alleen und zwei Fußgängerstege über die Au.
// Aus eigenen Blockmodellen (Mesh in suburbmesh.ts), neutrale Bezeichner, keine Schilder/Schriften.
// Alles wird relativ zu Netzkanten platziert (Kante, Ende, Seite als Himmelsrichtung) und rückt von der Kreuzung weg, bis es frei steht:
// nicht auf Fahrbahn, Kreuzung, Au-Ufer, Signalmasten – und nicht auf einem anderen Wahrzeichen. planNetSuburb setzt die übrige Bebauung danach drumherum.
import type { Net, NetEdge } from './net';
import type { River } from './river';
import type { SubHouse, SubHedge, SubPatch, SubKind } from './suburb';
import { boxesOverlap, WALK_W } from './netsub';

type Box = { x: number; z: number; yaw: number; hx: number; hz: number };
export interface LandmarkOut {
  houses: SubHouse[]; trees: { x: number; z: number; s: number }[]; hedges: SubHedge[]; patches: SubPatch[];
  /** unsichtbare Sperrflächen für die übrige Bebauung (Gassen, Plätze) */
  voids: Box[];
  /** Kanten + Seite (1/−1) mit eigener Allee: die übrige Planung setzt dort keine Bäume */
  allee: Set<string>;
  /** Streifen vor den Fassaden (Fahrbahnrand bis Hausfront): hier stehen keine Alleebäume, damit man die Wahrzeichen sieht */
  clear: Box[];
}

type Compass = 'N' | 'S' | 'E' | 'W';
const COMP: Record<Compass, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
/** Seite (+1 = links von a→b), die in Himmelsrichtung `c` liegt */
export function sideToward(e: NetEdge, c: Compass): 1 | -1 {
  const s = e.length / 2, [x, z] = e.route.offset(s, 1), q = e.at(s), v = COMP[c];
  return (x - q.x) * v[0] + (z - q.z) * v[1] > 0 ? 1 : -1;
}

interface Part { kind: SubKind; ds: number; hx: number; hz: number; h: number; roof?: number; wc?: number; rc?: number; opt?: boolean; extra?: number }
interface Grp { e: NetEdge; side: 1 | -1; s: number; dir: 1 | -1; front: number; d: number; span: number }
const BRICKRED = 0xa8432f, CREAM = 0xeee6d2, WHITE = 0xf3f1ea;

/** (x,z) liegt in einem freizuhaltenden Fassadenstreifen */
export const inClearZone = (o: { clear: Box[] }, x: number, z: number) => o.clear.some((b) => Math.abs(Math.cos(b.yaw) * (x - b.x) - Math.sin(b.yaw) * (z - b.z)) < b.hx && Math.abs(Math.sin(b.yaw) * (x - b.x) + Math.cos(b.yaw) * (z - b.z)) < b.hz);

export function planLandmarks(net: Net, river: River | null, lim: number, keepOut: [number, number, number][]): LandmarkOut {
  const out: LandmarkOut = { houses: [], trees: [], hedges: [], patches: [], voids: [], allee: new Set(), clear: [] };
  const wr = river ? river.width / 2 : 0;
  const taken: Box[] = [];
  const ctr = (b: Box, grow: number): [number, number][] => {
    const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw), o: [number, number][] = [];
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0], [-0.5, -1], [0.5, -1], [-0.5, 1], [0.5, 1]]) { const x = lx * (b.hx + grow), z = lz * (b.hz + grow); o.push([b.x + cs * x + sn * z, b.z - sn * x + cs * z]); }
    return o;
  };
  const free = (b: Box, road = 3.4): boolean => {
    if (Math.abs(b.x) > lim - 14 || Math.abs(b.z) > lim - 14) return false;
    for (const [px, pz] of ctr(b, 0)) {
      if (net.onRoad(px, pz, road) || net.junctionAt(px, pz, road + 1)) return false;
      if (river && river.dist(px, pz) < wr + 14) return false;
    }
    for (const [x, z, r] of keepOut) if (Math.hypot(b.x - x, b.z - z) < r + Math.hypot(b.hx, b.hz) * 0.5 && ctr(b, 0.5).some(([px, pz]) => Math.hypot(px - x, pz - z) < r)) return false;
    for (const o of taken) if (boxesOverlap(b, o, 1.2)) return false;
    return true;
  };
  const pt = (x: number, z: number, road: number, rr = 0): boolean => {
    if (Math.abs(x) > lim - 6 || Math.abs(z) > lim - 6) return false;
    if (net.onRoad(x, z, road) || net.junctionAt(x, z, road + 1.5)) return false;
    if (river && river.dist(x, z) < wr + 9) return false;
    for (const [kx, kz, r] of keepOut) if (Math.hypot(x - kx, z - kz) < r + 1) return false;
    for (const h of taken) if (Math.abs(Math.cos(h.yaw) * (x - h.x) - Math.sin(h.yaw) * (z - h.z)) < h.hx + rr + 0.6 && Math.abs(Math.sin(h.yaw) * (x - h.x) + Math.cos(h.yaw) * (z - h.z)) < h.hz + rr + 0.6) return false;
    return true;
  };
  const yawOf = (g: { e: NetEdge; side: 1 | -1 }, s: number) => g.e.route.yawAt(s) + (g.side < 0 ? Math.PI : 0);
  /** Punkt der Gruppe: ds m in Fahrtrichtung vom Anker, lat m quer ab Fahrbahnrand */
  const at = (g: Grp, ds: number, lat: number): [number, number, number] => {
    const s = g.s + g.dir * ds, [x, z] = g.e.route.offset(s, g.side * (g.e.half + lat));
    return [x, z, yawOf(g, s)];
  };
  const mk = (g: Grp, p: Part): SubHouse => {
    const [x, z, yaw] = at(g, p.ds, WALK_W + g.front + (p.extra ?? 0) + p.hx);
    return { x, z, yaw, hx: p.hx, hz: p.hz, h: p.h, kind: p.kind, c: Math.abs(Math.floor(x * 7 + z * 13)) % 6, roof: p.roof ?? 0, wc: p.wc, rc: p.rc };
  };
  /** Gruppe von Teilen an Kante `eid` platzieren: ab Abstand d0 vom Kreuzungsrand (Ende `from`) so weit weg, bis alles frei steht */
  const place = (eid: string, from: 'a' | 'b', comp: Compass, front: number, d0: number, parts: Part[]): Grp | null => {
    const e = net.edge(eid), side = sideToward(e, comp), c0 = e.a.cutOf(e), c1 = e.length - e.b.cutOf(e);
    const span = Math.max(...parts.map((p) => Math.abs(p.ds) + p.hz)), dir = from === 'a' ? 1 : -1;
    for (let d = d0; d < d0 + 90; d += 1) {
      const s = from === 'a' ? c0 + d + span : c1 - d - span;
      if (s - span < c0 + 1 || s + span > c1 - 1) break;
      const g: Grp = { e, side, s, dir, front, d, span };
      const hs: SubHouse[] = []; let ok = true;
      for (const p of parts) {
        const h = mk(g, p);
        if (free(h, 3.4) && hs.every((o) => !boxesOverlap(h, o, 0.2))) hs.push(h); else if (!p.opt) { ok = false; break; }
      }
      if (!ok) continue;
      for (const h of hs) {
        out.houses.push(h); taken.push(h);
        if (h.kind === 'holz') continue;
        const D = WALK_W + front + (parts.find((p) => p.kind === h.kind)?.extra ?? 0), cx = h.x + Math.cos(h.yaw) * (h.hx + D / 2), cz = h.z - Math.sin(h.yaw) * (h.hx + D / 2);
        out.clear.push({ x: cx, z: cz, yaw: h.yaw, hx: D / 2 + 0.8, hz: h.hz + 1.2 });
      }
      return g;
    }
    return null;
  };
  const patch = (g: Grp, ds: number, lat: number, hx: number, hz: number, c: SubPatch['c']) => {
    const [x, z, yaw] = at(g, ds, lat + hx); out.patches.push({ x, z, yaw, hx, hz, c });
  };
  const hedge = (g: Grp, ds: number, lat: number, len: number, c: number) => {
    const s = g.s + g.dir * ds, [x, z] = g.e.route.offset(s, g.side * (g.e.half + lat));
    if (pt(x, z, 0.3)) out.hedges.push({ x, z, yaw: g.e.route.yawAt(s) + Math.PI / 2, len, c });
  };
  const tree = (g: Grp, ds: number, lat: number, size: number) => {
    const [x, z] = at(g, ds, lat); if (pt(x, z, 1.6, 1.4)) out.trees.push({ x, z, s: size });
  };
  const inClear = (x: number, z: number) => out.clear.some((b) => Math.abs(Math.cos(b.yaw) * (x - b.x) - Math.sin(b.yaw) * (z - b.z)) < b.hx && Math.abs(Math.sin(b.yaw) * (x - b.x) + Math.cos(b.yaw) * (z - b.z)) < b.hz);
  const dEnd = (g: Grp | null, gap = 1.5) => g ? g.d + g.span * 2 + gap : 4;

  // ── Startecke (x_hu): Restaurant hinter der Ampel rechts, Apotheke-Haus links, Pflaster + große Häuser rechts neben dem Start ──
  place('untere.2', 'b', 'N', 4, 3, [{ kind: 'restaurant', ds: 0, hx: 7.5, hz: 9.5, h: 9.6, roof: 3.6, wc: BRICKRED }]);
  place('untere.3', 'a', 'S', 3.5, 6, [{ kind: 'apotheke', ds: 0, hx: 7, hz: 9.5, h: 8.8, roof: 3.0, wc: 0xe6dcc6 }]);
  const pl = place('untere.3', 'a', 'N', 13, 6, [
    { kind: 'reihe', ds: -10.8, hx: 6, hz: 10, h: 9.0, roof: 3.4, wc: 0xe0d6bc }, { kind: 'reihe', ds: 10.8, hx: 6, hz: 10, h: 8.8, roof: 3.4, wc: 0xcfd2cc }]);
  if (pl) { const half = pl.e.half; const [x, z, yaw] = at(pl, 0, 0.4 + (WALK_W + pl.front - 0.4) / 2); out.patches.push({ x, z, yaw, hx: (WALK_W + pl.front - 0.4) / 2, hz: pl.span, c: 'plaza' }); void half; }

  // ── Doppelhaus-Ecke kurz hinter der Kreuzung (links): Doppelhaus mit Garage links und rechts, weißes Haus mit rotem Dach, Weg dahinter zum Holzhaus ──
  const dp = place('untere.2', 'b', 'S', 4.5, 4, [
    { kind: 'doppel', ds: 0, hx: 6.2, hz: 7.2, h: 8.0, roof: 3.2, wc: CREAM },
    { kind: 'garage', ds: -9.2, hx: 3.4, hz: 1.7, h: 2.7, wc: 0xcfcabc, extra: 0 }, { kind: 'garage', ds: 9.2, hx: 3.4, hz: 1.7, h: 2.7, wc: 0xcfcabc }]);
  const wh = place('untere.2', 'b', 'S', 4.5, dEnd(dp), [
    { kind: 'haus', ds: -3.4, hx: 5.8, hz: 5.6, h: 7.6, roof: 3.4, wc: WHITE, rc: 0xc0392b },
    { kind: 'holz', ds: 4.8, hx: 4.6, hz: 4.8, h: 3.9, roof: 2.4, wc: 0x8a6a44, extra: 25, opt: true }]);
  if (wh && out.houses.some((h) => h.kind === 'holz')) {   // Weg dahinter: von der Straße bis zum Holzhaus (Sperrfläche, Bodenfläche)
    patch(wh, 4.8, 0.5, 14.5, 1.5, 'lane');
    const [x, z, yaw] = at(wh, 4.8, WALK_W + wh.front + 14); taken.push({ x, z, yaw, hx: 14, hz: 1.7 }); out.voids.push({ x, z, yaw, hx: 14, hz: 1.7 });
  }

  // ── Damm-Ecke (x_du): große weiße Kita vor der Ampel links, verfallener Bungalow dahinter ──
  const kt = place('untere.1', 'a', 'S', 6, 4, [{ kind: 'kita', ds: 0, hx: 8.5, hz: 12.5, h: 8.4 }]);
  if (kt) for (let k = 0; k < 4; k++) { const ds = -8 + k * 5.2; hedge(kt, ds, 2.2, 3.6, k); }
  place('untere.0', 'b', 'S', 6, 4, [{ kind: 'bungalow', ds: 0, hx: 6, hz: 7.5, h: 3.0, roof: 1.3, wc: 0xd8d4c6 }]);

  // ── Einkaufszentrum am Damm (links, vor der oberen Kreuzung): groß, weiß, kastig, davor ein paar Bäume ──
  const ek = place('damm.2', 'a', 'W', 11, 16, [{ kind: 'kasten', ds: 0, hx: 12.5, hz: 20.5, h: 9.8, wc: 0xf1efe8 }]);
  if (ek) { patch(ek, 0, 0.4, (WALK_W + ek.front - 0.4) / 2, ek.span, 'court'); for (let k = 0; k < 7; k++) tree(ek, -17 + k * 5.7, WALK_W + 3, 1.5 + (k % 3) * 0.2); }

  // ── rote Villa im Zwickel zwischen Damm und der Querstraße an x_dh, kleine Grünfläche davor ──
  const vi = place('quer.0', 'a', 'N', 12, 12, [{ kind: 'villa', ds: 0, hx: 7.5, hz: 7.5, h: 7.6, wc: 0xa23a2e, rc: 0x5a2a22 }]);
  if (vi) { for (const ds of [-6, 6]) hedge(vi, ds, WALK_W + 2.2, 5, 1); tree(vi, -11, WALK_W + 5, 1.7); tree(vi, 11, WALK_W + 6, 1.5); }

  // ── Alleen: dichte, große Bäume beidseitig (Pulverhofsweg, Damm-Kreuzung, Rahlstedter Weg-Art) ──
  let st = 0x51ed27; const rnd = () => { st = (st + 0x6d2b79f5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (const [eid, every, off] of [['untere.3', 8, 0.7], ['untere.4', 8, 0.7], ['untere.0', 8, 0.7], ['damm.4', 9, 0.7], ['obere.1', 9, 3.4], ['obere.2', 10, 3.4]] as [string, number, number][]) {
    const e = net.edge(eid), c0 = e.a.cutOf(e), c1 = e.length - e.b.cutOf(e);
    const onDeck = (s: number) => e.deck.some(([a, b]) => s > a - 14 && s < b + 14);
    for (const side of [1, -1] as const) {
      out.allee.add(eid + ':' + side);
      for (let s = c0 + 5 + rnd() * every * 0.4; s < c1 - 5; s += every * (0.88 + rnd() * 0.24)) {
        if (onDeck(s)) continue;
        const [x, z] = e.route.offset(s, side * (e.half + WALK_W + off + (off > 1 ? rnd() * 0.8 : rnd() * 0.4)));
        if (pt(x, z, 1.6, 1.4) && !inClear(x, z)) out.trees.push({ x, z, s: 1.5 + rnd() * 0.7 });
      }
    }
  }

  // ── zwei Holz-Fußgängerstege über die Au, am freigehaltenen Ufer neben dem Au-Weg (rechts, wenn man dem Weg folgt) ──
  if (river) {
    const fe = net.edge('fuss.0'), BL = 25;
    for (const t of [0.3, 0.62]) {
      const p = fe.at(fe.length * t), rh = river.route.nearest(p.x, p.z), q = river.route.at(rh.s);
      let ax = -q.dz, az = q.dx;                                  // quer zum Fluss; +z der Box zeigt zum Au-Weg (Ostufer)
      if ((p.x - q.x) * ax + (p.z - q.z) * az < 0) { ax = -ax; az = -az; }
      const b: SubHouse = { x: q.x, z: q.z, yaw: Math.atan2(ax, az), hx: 1.8, hz: BL / 2, h: 1.5, kind: 'steg', c: 0, roof: 0 };
      if (!ctr(b, 0).every(([px, pz]) => !net.onRoad(px, pz, 2))) continue;
      out.houses.push(b); taken.push(b);
      // Pfad vom Steg zum Au-Weg (nur Bodenfläche), gleiche Richtung
      const ex = q.x + ax * (BL / 2), ez = q.z + az * (BL / 2), n = net.nearest(ex, ez, 80);
      if (n) {
        const px = ex + (ax) * 0, pz = ez; void px; void pz;
        const l = Math.max(0, Math.hypot(p.x - ex, p.z - ez) - fe.half - 1.5), mx = ex + ax * l / 2, mz = ez + az * l / 2;
        if (l > 3) out.patches.push({ x: mx, z: mz, yaw: Math.atan2(ax, az), hx: 1.1, hz: l / 2, c: 'stub' });
      }
      const wx = q.x - ax * (BL / 2 + 5), wz = q.z - az * (BL / 2 + 5);
      out.patches.push({ x: wx, z: wz, yaw: Math.atan2(ax, az), hx: 1.1, hz: 5, c: 'stub' });
    }
  }
  return out;
}

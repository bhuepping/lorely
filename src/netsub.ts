// Bebauung am Straßennetz (ohne three): Häuser (erste + zweite Reihe), Vorgarten-Hecken, Gehwege/Parkstreifen, Alleen, Laternen,
// parkende Autos (Querstraßen-Art mit Lücken), Gewerbe am Damm und der Gebüschhügel (undurchdringlich) – alles aus dem NETZ, nicht aus der Rennstrecke.
// Deterministisch aus dem Seed. Eigene Blockmodelle, keine Namen, keine Schilder. Das Mesh steht in suburbmesh.ts.
import type { Net, NetEdge } from './net';
import type { River } from './river';
import type { SubData, SubHouse, SubKind } from './suburb';
import { planLandmarks, inClearZone } from './landmarks';

export interface NetSubCtx {
  net: Net; lim: number; seed: number; river: River | null;
  /** Punkte, die frei bleiben (Signalmasten usw.): [x, z, r] */
  keepOut: [number, number, number][];
  /** freie Kreise für Wahrzeichen: [x, z, r] */
  reserve?: [number, number, number][];
  /** Wahrzeichen planen und zuerst setzen */
  landmarks?: boolean;
}

/** Gehweg-/Parkstreifen entlang einer Kante: Seite (+1 links von a→b), Meter ab Knoten a, Abstände ab Fahrbahnrand */
export interface SubWalk { edge: number; side: 1 | -1; s0: number; s1: number; l0: number; l1: number; park: boolean }
/** Hang mit Gebüsch (undurchdringlich): Kanten, Seite, Höhe, Fußabstand/Gipfelabstand (m ab Fahrbahnrand) */
export interface SubHill { edges: number[]; side: 1 | -1; h: number; u0: number; u1: number }

const sm = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const PLASTER = [0xe8e2d2, 0xd9cfae, 0xcfd2cc, 0xefe9dc, 0xdcd6c4];
export const WALK_W = 2.2;          // Gehweg (m)
export const PARK_W = 2.2;          // Parkstreifen (m)

interface Style {
  /** Haustyp: brick = Backstein-Mehrfamilienhaus, bright = helles Haus, mix = beides, gewerbe = Flachbau */
  houses: 'brick' | 'bright' | 'mix' | 'gewerbe' | null;
  gap: number; fill: number; second: boolean; hedge: boolean;
  /** Allee: Abstand (m) zwischen Bäumen, Größe von/bis */
  tree?: { every: number; s: [number, number] };
  lamp: boolean; park: boolean; walk: boolean;
}
const NONE: Style = { houses: null, gap: 0, fill: 0, second: false, hedge: false, lamp: false, park: false, walk: false };

/** Stil je Kante und Seite (side +1 = links von a→b). Straßen heißen hier nur nach Art/Id (damm, obere, untere.n, quer, …). */
function styleOf(e: NetEdge, side: 1 | -1, east: 1 | -1, hillEdge: boolean): Style {
  const k = e.def.kind, id = e.id, n = +id.split('.')[1];
  if (k === 'fuss') return { ...NONE, tree: { every: 13, s: [0.9, 1.5] } };
  if (k === 'damm') {
    if (side === east) return hillEdge ? { ...NONE, lamp: true, walk: true } : { ...NONE, tree: { every: 15, s: [1.2, 1.8] }, lamp: true, walk: true };
    return { houses: 'gewerbe', gap: 7, fill: 0.5, second: false, hedge: false, tree: { every: 24, s: [1, 1.4] }, lamp: true, park: false, walk: true };
  }
  if (k === 'obere') return { houses: 'mix', gap: 7.5, fill: 0.55, second: false, hedge: true, tree: { every: 12, s: [1.2, 1.8] }, lamp: true, park: false, walk: true };
  if (k === 'untere') {
    if (id.startsWith('untere.1') || id.startsWith('untere.2'))   // Doppelhaus-Ecke: dunkle Allee, links helle hohe Häuser, rechts Backstein; zweite Reihe
      return { houses: side === 1 ? 'brick' : 'bright', gap: 4.5, fill: 0.95, second: true, hedge: true, tree: { every: 8, s: [1.5, 2.1] }, lamp: false, park: false, walk: true };
    if (n === 3 || n === 4)                                       // Allee zum Ziel
      return { houses: 'mix', gap: 5, fill: 0.8, second: true, hedge: true, tree: { every: 11, s: [1.3, 1.9] }, lamp: true, park: false, walk: true };
    if (n === 0) return { houses: 'mix', gap: 5, fill: 0.7, second: false, hedge: true, tree: { every: 14, s: [1.1, 1.6] }, lamp: true, park: false, walk: true };
    return { houses: 'mix', gap: 5.5, fill: 0.75, second: false, hedge: true, tree: { every: 15, s: [1.1, 1.5] }, lamp: true, park: false, walk: true };
  }
  if (id.startsWith('quer')) return side === east ? { houses: 'mix', gap: 8, fill: 0.8, second: true, hedge: false, tree: { every: 26, s: [1.1, 1.5] }, lamp: true, park: true, walk: true }
    : { houses: 'brick', gap: 3, fill: 0.9, second: true, hedge: true, tree: { every: 12, s: [1.3, 1.8] }, lamp: false, park: true, walk: true };
  return { houses: 'mix', gap: 5, fill: 0.8, second: true, hedge: true, tree: { every: 16, s: [1.1, 1.6] }, lamp: n % 2 === 0, park: false, walk: true };
}

type Box = { x: number; z: number; yaw: number; hx: number; hz: number };
/** Überlappung zweier gedrehter Rechtecke (SAT, lokale x-Achse = (cos yaw, −sin yaw), z = (sin yaw, cos yaw)), m = Mindestabstand */
export function boxesOverlap(A: Box, B: Box, m: number): boolean {
  if (Math.hypot(A.x - B.x, A.z - B.z) > Math.hypot(A.hx, A.hz) + Math.hypot(B.hx, B.hz) + m + 1) return false;
  for (const P of [A, B]) for (const ang of [P.yaw, P.yaw + Math.PI / 2]) {
    const ax = Math.cos(ang), az = -Math.sin(ang);
    const rp = (Q: Box) => Math.abs(Math.cos(Q.yaw) * ax - Math.sin(Q.yaw) * az) * Q.hx + Math.abs(Math.sin(Q.yaw) * ax + Math.cos(Q.yaw) * az) * Q.hz;
    if (Math.abs((B.x - A.x) * ax + (B.z - A.z) * az) > rp(A) + rp(B) + m) return false;
  }
  return true;
}

export interface NetSubOut { walks: SubWalk[]; hill: SubHill | null }
/** Seite (+1 links von a→b), auf der die Kante nach Osten (größeres x) liegt */
export function eastSide(e: NetEdge): 1 | -1 { const mid = e.at(e.length / 2); return e.route.offset(e.length / 2, 20)[0] > mid.x ? 1 : -1; }
/** Gebüschhang aus der Level-Beschreibung: Kantenliste (Ids), Höhe; Seite = Osten, Fuß 9 m / Gipfel 42 m vom Fahrbahnrand */
export function makeHill(net: Net, d: { edges: string[]; h: number } | undefined): SubHill | null {
  if (!d) return null;
  const idx = d.edges.map((id) => net.edges.findIndex((q) => q.id === id)).filter((i) => i >= 0);
  return idx.length ? { edges: idx, side: eastSide(net.edges[idx[0]]), h: d.h, u0: 9, u1: 42 } : null;
}

/** Fügt Bebauung des Netzes in `out` ein (Häuser, Hecken, Laternen, Bäume); liefert Gehwege + Hang. Nichts auf Fahrbahn/Kreuzung/Au-Ufer. */
export function planNetSuburb(out: SubData, c: NetSubCtx, hill: SubHill | null): NetSubOut {
  const { net, lim, river } = c;
  let st = (c.seed * 2246822519 + 99) >>> 0; const rnd = () => { st = (st + 0x6d2b79f5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const walks: SubWalk[] = [];
  const wr = river ? river.width / 2 : 0;
  const lm = c.landmarks ? planLandmarks(net, river, lim, c.keepOut) : null;
  if (lm) { out.houses.push(...lm.houses); out.trees.push(...lm.trees); out.hedges.push(...lm.hedges); out.patches.push(...lm.patches); }
  const taken: SubHouse[] = [...out.houses, ...(lm?.voids ?? []).map((b) => ({ ...b, h: 0, kind: 'garage' as SubKind, c: 0, roof: 0 }))];
  const corners = (b: Box, grow: number): [number, number][] => {
    const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw), o: [number, number][] = [];
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) { const x = lx * (b.hx + grow), z = lz * (b.hz + grow); o.push([b.x + cs * x + sn * z, b.z - sn * x + cs * z]); }
    return o;
  };
  /** Rechteck steht frei: nicht auf Fahrbahn/Kreuzung (Rand `road`), nicht am Ufer der Au, nicht auf Masten/Wahrzeichen-Plätzen */
  const freeBox = (b: Box, road: number): boolean => {
    if (Math.abs(b.x) > lim - 12 || Math.abs(b.z) > lim - 12) return false;
    for (const [px, pz] of corners(b, 0)) {
      if (net.onRoad(px, pz, road) || net.junctionAt(px, pz, road + 1)) return false;
      if (river && river.dist(px, pz) < wr + 14) return false;
    }
    for (const [x, z, r] of c.keepOut) if (Math.hypot(b.x - x, b.z - z) < r + Math.hypot(b.hx, b.hz)) return false;
    for (const [x, z, r] of c.reserve ?? []) if (Math.hypot(b.x - x, b.z - z) < r + Math.hypot(b.hx, b.hz)) return false;
    return true;
  };
  const put = (h: SubHouse, road = 3.2, m = 1.5): boolean => {
    if (!freeBox(h, road)) return false;
    for (const o of taken) if (boxesOverlap(h, o, m)) return false;
    taken.push(h); out.houses.push(h); return true;
  };
  const freePt = (x: number, z: number, road: number, rr = 0): boolean => {
    if (Math.abs(x) > lim - 6 || Math.abs(z) > lim - 6) return false;
    if (net.onRoad(x, z, road) || net.junctionAt(x, z, road + 1.5)) return false;
    if (river && river.dist(x, z) < wr + 9) return false;
    for (const [kx, kz, r] of c.keepOut) if (Math.hypot(x - kx, z - kz) < r + 1) return false;
    for (const [kx, kz, r] of c.reserve ?? []) if (Math.hypot(x - kx, z - kz) < r) return false;
    for (const h of taken) if (Math.abs(Math.cos(h.yaw) * (x - h.x) - Math.sin(h.yaw) * (z - h.z)) < h.hx + rr + 0.8 && Math.abs(Math.sin(h.yaw) * (x - h.x) + Math.cos(h.yaw) * (z - h.z)) < h.hz + rr + 0.8) return false;
    return true;
  };

  net.edges.forEach((e, ei) => {
    const L = e.length, c0 = e.a.cutOf(e), c1 = L - e.b.cutOf(e), half = e.half, R = e.route;
    // Osten = die Seite, auf der die Straße mit x wächst (Damm: Gebüschhügel / Alleen); an Querkanten (quer) „östlich“ = Seite mit größerem x
    const east = eastSide(e);
    const onDeck = (s: number) => e.onDeck(s) || e.deck.length > 0 && e.deck.some(([a, b]) => s > a - 14 && s < b + 14);
    for (const side of [1, -1] as const) {
      const sty = styleOf(e, side, east, !!hill && hill.edges.includes(ei) && side === hill.side);
      const walkW = sty.walk ? WALK_W : 0, parkW = sty.park ? PARK_W : 0;
      const sw = Math.max(c0 + 1, 1), se = c1 - 1;
      if (sty.walk) for (const [a, b] of [[sw, se]] as [number, number][]) walks.push({ edge: ei, side, s0: a, s1: b, l0: half + parkW, l1: half + parkW + walkW, park: false });
      if (sty.park) walks.push({ edge: ei, side, s0: sw, s1: se, l0: half, l1: half + parkW, park: true });
      const lat0 = half + parkW + walkW;       // hinter dem Gehweg

      // Gebüschhügel (Damm östlich zwischen unterer Straße und oberer Straße): zwei Reihen Gebüschblöcke am Fuß, undurchdringlich
      if (hill && hill.edges.includes(ei) && side === hill.side) {
        const s0 = Math.max(c0, 0), s1 = L - e.b.cutOf(e);
        for (const [off, hx, step, hh] of [[half + 6.2, 1.9, 0, 3.4], [half + 10.5, 2.6, 6, 4.0]] as [number, number, number, number][]) {
          for (let s = s0 + step + 6; s < s1 - 4; s += 11.5) {
            const [x, z] = R.offset(s, side * off), b: SubHouse = { x, z, yaw: R.yawAt(s), hx, hz: 6.1, h: hh, kind: 'busch', c: Math.floor(rnd() * 4), roof: 0 };
            if (Math.abs(x) > lim - 8 || Math.abs(z) > lim - 8) continue;
            // nicht in andere Straßen ragen (quer.0 u. a. liegen weiter östlich)
            let bad = false; for (const [px, pz] of corners(b, 0)) if (net.onRoad(px, pz, 2) || net.junctionAt(px, pz, 3)) bad = true;
            if (!bad && taken.every((o) => o.kind === 'busch' || !boxesOverlap(b, o, 1))) { out.houses.push(b); taken.push(b); }
          }
        }
        continue;
      }
      // Allee (Bäume auf der Gehwegkante) + Laternen
      if (sty.tree && !lm?.allee.has(e.id + ':' + side)) {
        let s = c0 + 6 + rnd() * sty.tree.every * 0.5;
        for (; s < c1 - 5; s += sty.tree.every * (0.85 + rnd() * 0.3)) {
          if (onDeck(s)) continue;
          const [x, z] = R.offset(s, side * (lat0 + 0.7 + (e.def.kind === 'fuss' ? 1.5 + rnd() * 3 : e.def.kind === 'obere' ? 3.4 + rnd() * 0.8 : rnd() * 0.5)));
          if (!freePt(x, z, 1.6, 1.4) || (lm && inClearZone(lm, x, z))) continue;
          out.trees.push({ x, z, s: sty.tree.s[0] + rnd() * (sty.tree.s[1] - sty.tree.s[0]) });
        }
      }
      if (sty.lamp) for (let s = c0 + 12 + (side > 0 ? 18 : 0); s < c1 - 6; s += 36) {
        if (onDeck(s)) continue;
        const [x, z] = R.offset(s, side * (half + parkW + 0.6));
        if (freePt(x, z, 0.6)) out.lamps.push({ x, z, yaw: R.yawAt(s), side });
      }
      // parkende Autos im Parkstreifen, mit Lücken
      if (sty.park) {
        let run = rnd() < 0.5;
        for (let s = c0 + 11; s < c1 - 11; s += 5.8) {
          if (rnd() < 0.18) run = !run;
          if (!run || onDeck(s) || (e.def.ped ?? []).some((p) => Math.abs(p - s) < 9)) continue;
          const [x, z] = R.offset(s, side * (half + parkW / 2));
          const cr: SubHouse = { x, z, yaw: R.yawAt(s), hx: 0.95, hz: 2.15, h: 1.5, kind: 'auto', c: Math.floor(rnd() * 6), roof: 0 };
          if (freeBox(cr, 0.1) && taken.every((o) => !boxesOverlap(cr, o, 0.3)) && c.keepOut.every(([kx, kz, r]) => Math.hypot(x - kx, z - kz) > r)) { out.houses.push(cr); taken.push(cr); }
        }
      }
      if (!sty.houses) continue;
      // Häuserzeile: Lücke vorne = Vorgarten (+ Hecke), danach optional zweite Reihe dahinter
      let s = c0 + 5 + rnd() * 6;
      while (s < c1 - 4) {
        let kind: SubKind = 'reihe', hz: number, hx: number, h: number, roof = 3.4, wc: number | undefined;
        const bright = sty.houses === 'bright' || (sty.houses === 'mix' && rnd() < 0.5);
        if (sty.houses === 'gewerbe') { kind = 'gewerbe'; hz = 7 + rnd() * 8; hx = 8 + rnd() * 5; h = 5.2 + rnd() * 2.6; roof = 0; }
        else if (bright) { kind = rnd() < 0.5 ? 'reihe' : 'haus'; hz = kind === 'reihe' ? 7 + rnd() * 5 : 5.4 + rnd() * 1.8; hx = 5.2 + rnd() * 1.2; h = kind === 'reihe' ? 8.6 + rnd() * 1.0 : 6.9 + rnd() * 0.8; roof = kind === 'reihe' ? 3.4 : 3.2; wc = PLASTER[Math.floor(rnd() * PLASTER.length)]; }
        else { hz = 8 + rnd() * 8; hx = 5.2 + rnd() * 1.4; h = 8.4 + rnd() * 1.0; }
        const sm2 = s + hz;
        if (sm2 > c1 - 3) break;
        if (onDeck(sm2) || rnd() > sty.fill) { s += 6 + rnd() * 6; continue; }
        const lat = lat0 + sty.gap + hx, [x, z] = R.offset(sm2, side * lat), yaw = R.yawAt(sm2);
        const house: SubHouse = { x, z, yaw, hx, hz, h, kind, c: Math.floor(rnd() * 6), roof, wc };
        if (!put(house)) { s += 4; continue; }
        if (sty.hedge && sty.gap >= 3 && rnd() < 0.75) {      // Hecke vor dem Haus an der Gehwegkante, mit Lücke für die Einfahrt
          const len = hz * 1.1 * (0.7 + rnd() * 0.25), [hx0, hz0] = R.offset(sm2 + (rnd() - 0.5) * hz * 0.4, side * (lat0 + 0.55));
          if (freePt(hx0, hz0, 0.3)) out.hedges.push({ x: hx0, z: hz0, yaw: yaw + Math.PI / 2, len, c: Math.floor(rnd() * 4) });
        }
        if (sty.second) {   // zweite Reihe: ähnliches Haus direkt dahinter (gleiche Mitte, Abstand Hinterhof)
          const hx2 = hx * (0.9 + rnd() * 0.2), lat2 = lat + hx + 5 + hx2, [x2, z2] = R.offset(sm2, side * lat2);
          put({ x: x2, z: z2, yaw, hx: hx2, hz: hz * (0.85 + rnd() * 0.2), h: h * (0.92 + rnd() * 0.12), kind, c: house.c + 1, roof, wc: wc ?? undefined });
        }
        s += hz * 2 + 1.5 + rnd() * (kind === 'haus' ? 6 : 2.5);
      }
    }
  });
  return { walks, hill };
}

/** Anhebung des Gebüschhangs bei (x,z): 0 außerhalb; nutzt die Hang-Kanten, hält 14–30 m Abstand zu allen anderen Straßen frei */
export function hillLift(net: Net, hill: SubHill | null, x: number, z: number): number {
  if (!hill) return 0;
  let best = 0;
  for (const ei of hill.edges) {
    const e = net.edges[ei], h = e.route.nearestWithin(x, z, 110); if (!h) continue;
    const q = e.at(h.s), lat = (x - q.x) * q.dz - (z - q.z) * q.dx, u = lat * hill.side - e.half;
    if (u < hill.u0 - 1) continue;
    const along = sm(0, 16, h.s - e.a.cutOf(e)) * sm(0, 16, e.length - e.b.cutOf(e) - h.s);
    let v = hill.h * sm(hill.u0, hill.u1, u) * (1 - sm(hill.u1 + 8, hill.u1 + 44, u)) * along;
    if (v > 0) {
      let other = 99; for (const q2 of net.hits(x, z, 34)) if (!hill.edges.includes(net.edges.indexOf(q2.edge))) other = Math.min(other, q2.d - q2.edge.half);
      v *= sm(8, 24, other);
    }
    if (v > best) best = v;
  }
  return best;
}

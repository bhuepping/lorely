// Vorstadt: Planung der Bebauung (Reihen-/Einfamilienhäuser, Gewerbe, Wahrzeichen), Hecken, Laternen, Ampeln, Schilder,
// Bushaltestellen und Querstraßen. Reine Planung ohne three, deterministisch aus dem Seed; das Mesh steht in suburbmesh.ts.
// Nur Stilisierung nach einer Kartenvorlage – keine echten Grundrisse oder Adressen.
import type { Route } from './level';
import type { SubWalk, SubHill } from './netsub';

export type SubKind = 'reihe' | 'haus' | 'gewerbe' | 'schule' | 'kita' | 'villa' | 'buero' | 'zentrum' | 'auto' | 'busch'
  // Wahrzeichen (eigene Blockmodelle): Restaurant, Apotheke-Haus, Doppelhaus, Garage, Holzhaus, Bungalow, großer weißer Kasten, Fußgängersteg (h = Buckelhöhe)
  | 'restaurant' | 'apotheke' | 'doppel' | 'garage' | 'holz' | 'bungalow' | 'kasten' | 'steg';
/** flache Bodenfläche (Pflaster, Weg, Vorplatz): Mitte, yaw wie bei Häusern (lokal x = quer, z = längs), Halbmaße, Art */
export interface SubPatch { x: number; z: number; yaw: number; hx: number; hz: number; c: 'plaza' | 'court' | 'lane' | 'stub' }
/** Einzelbau (Wahrzeichen/Kulisse) in Weltkoordinaten; yaw wie bei Box (lokale x-Achse = (cos yaw, −sin yaw) in (x,z)) */
export interface SubSpecial { kind: SubKind; x: number; z: number; hx: number; hz: number; yaw: number; h: number }
/** Häuserzeile: Streckenmeter s0…s1, Seite (+1 links), Art, Abstand Fahrbahnrand → Hausfront */
export interface SubRow { s: [number, number]; side: 1 | -1; kind: SubKind; gap: number }
/** Querstraße: Streckenmeter, Seite (+1 links, −1 rechts, 0 beide), Länge ab Fahrbahnrand, Breite, Schild-Text */
/** `dir` = Richtung der Einmündung (Einheitsvektor in x/z, hat Vorrang), sonst `ang` = Schräglage gegen die Quer-Normale (rad) */
export interface SubCross { s: number; side: 0 | 1 | -1; len: number; w: number; name?: string; ang?: number; dir?: [number, number] }
/** Bebauung nach Vorlage: x, z, hx, hz (lokal z = lange Achse), yaw, Höhe, Art, Dachhöhe (0 = flach), Wandfarbe (−1 = Standard), Dachfarbe (−1 = Standard) */
export type SubBlock = [number, number, number, number, number, number, SubKind, number, number, number];
export interface SubDef {
  /** Netzlevel: Bebauung, Gehwege, Alleen, Parkstreifen und Hang aus dem Straßennetz (planNetSuburb) */
  net?: boolean;
  /** freie Kreise für Wahrzeichen: [x, z, r] */
  reserve?: [number, number, number][];
  /** Wahrzeichen (planLandmarks): Startecke, Doppelhaus-Ecke, Damm-Ecke, Einkaufszentrum, Villa, Alleen, Fußgängerstege */
  landmarks?: boolean;
  /** Gebüschhang: Netzkanten-Ids (Seite = Osten) und Höhe (m) – undurchdringlich, Gelände steigt an */
  hill?: { edges: string[]; h: number };
  special: SubSpecial[];
  rows: SubRow[];
  /** feste Gebäude nach Vorlage (ersetzt die zufälligen Zeilen/Hecken) */
  blocks?: SubBlock[];
  /** feste Heckenstücke [x, z, yaw, Länge] */
  hedges?: [number, number, number, number][];
  /** Straßenbäume im Raster der Laternenabschnitte (Standard an) */
  litTrees?: boolean;
  /** feste Bäume [x, z, Größe] (Kronendach der Vorlage) */
  trees?: [number, number, number][];
  /** Ampelkreuzungen: Streckenmeter */
  signals: number[];
  /** Straßenschilder: [Streckenmeter, Seite, Text] */
  signs: [number, 1 | -1, string][];
  bus: [number, 1 | -1][];
  cross: SubCross[];
  /** Straßenabschnitte mit Laternen + Straßenbäumen [s0, s1] */
  lit: [number, number][];
  /** Ausschnitte ohne Zeilen (Park, Wiese): [s0, s1, Seite] */
  open?: [number, number, number][];
  /** Park: Baumgruppen (Mitte x,z, Radius, Anzahl) */
  groves?: [number, number, number, number][];
}

export interface SubHouse { x: number; z: number; yaw: number; hx: number; hz: number; h: number; kind: SubKind; c: number; roof: number; wc?: number; rc?: number }
/** Höhenprofil des Fußgängerstegs: Boden an den Kastenenden gy(lz) und Deckhöhe yAt(u) (u = Längsabstand von der Mitte, ±L); an den Enden bündig (+0,03 m) mit dem Gelände, in der Mitte ein flacher Buckel (h) */
export function stegProfile(T: { height(x: number, z: number): number }, h: SubHouse) {
  const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw), gy = (lz: number) => T.height(h.x + sn * lz, h.z + cs * lz);
  const L = h.hz - 0.7, yA = gy(-L), yB = gy(L);
  const yAt = (u: number) => yA + (yB - yA) * (u + L) / (2 * L) + 0.03 + h.h * (1 - (u / L) * (u / L));
  return { L, gy, yAt };
}
export interface SubLamp { x: number; z: number; yaw: number; side: number }
export interface SubHedge { x: number; z: number; yaw: number; len: number; c: number }
export interface SubSignal { s: number; x: number; z: number; yaw: number }
export interface SubSign { x: number; z: number; yaw: number; text: string }
export interface SubBus { x: number; z: number; yaw: number; side: number }
export interface SubArm { x: number; z: number; tx: number; tz: number; yaw: number; len: number; w: number; side: number; s: number }
export interface SubData { houses: SubHouse[]; lamps: SubLamp[]; hedges: SubHedge[]; signals: SubSignal[]; signs: SubSign[]; bus: SubBus[]; arms: SubArm[]; trees: { x: number; z: number; s: number }[]; walks: SubWalk[]; hill: SubHill | null; patches: SubPatch[] }

/** Ampelphase der k-ten Ampel zur Zeit t (s): 0 grün, 1 gelb, 2 rot; Verkehr hält bei gelb + rot (Gate), die Köpfe zeigen dieselbe Phase */
export const SIG_CYCLE = 26;
export const sigPhase = (t: number, k: number): 0 | 1 | 2 => { const u = (t + k * 7) % SIG_CYCLE; return u < 13 ? 0 : u < 15 ? 1 : 2; };

/** Querstraßen-Arme als Rechtecke (Mitte lokal: entlang der Querachse ab dem Fahrbahnrand) */
export function planArms(def: SubDef | undefined, route: Route, half: number): SubArm[] {
  const out: SubArm[] = [];
  for (const c of def?.cross ?? []) {
    const a = route.at(c.s);
    for (const side of c.side === 0 ? [1, -1] : [c.side]) {
      // Querachse nach links (+1) bzw. rechts (−1): (dz, −dx) ist „links“
      const bx = a.dz * side, bz = -a.dx * side, r = (c.ang ?? 0) * side, co0 = Math.cos(r), si = Math.sin(r);
      const nx = c.dir ? c.dir[0] : bx * co0 - bz * si, nz = c.dir ? c.dir[1] : bx * si + bz * co0, co = c.dir ? nx * bx + nz * bz : co0;
      const mid = half / Math.max(0.5, co) + c.len / 2;   // Schräge: Fahrbahnrand liegt weiter weg
      out.push({ x: a.x + nx * mid, z: a.z + nz * mid, tx: nx, tz: nz, yaw: Math.atan2(nx, nz), len: c.len, w: c.w, side, s: c.s });
    }
  }
  return out;
}
/** (x,z) liegt auf einem Querstraßen-Arm (m = Rand dazu); der Fahrbahnstreifen selbst zählt nicht */
export function onArm(arms: SubArm[], x: number, z: number, m = 0): boolean {
  for (const a of arms) {
    const dx = x - a.x, dz = z - a.z, along = dx * a.tx + dz * a.tz, lat = dx * a.tz - dz * a.tx;
    if (Math.abs(along) < a.len / 2 + m && Math.abs(lat) < a.w / 2 + m) return true;
  }
  return false;
}

interface Ctx { route: Route; half: number; lim: number; seed: number }

export function planSuburb(def: SubDef, a: Ctx): SubData {
  const { route, half, lim } = a;
  let st = (a.seed * 2654435761 + 17) >>> 0; const rnd = () => { st = (st + 0x6d2b79f5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out: SubData = { houses: [], lamps: [], hedges: [], signals: [], signs: [], bus: [], arms: planArms(def, route, half), trees: [], walks: [], hill: null, patches: [] };

  // Hilfen: Rechteck-Überlappung (SAT) + Abstand zur Strecke
  const corners = (x: number, z: number, yaw: number, hx: number, hz: number, grow = 0): [number, number][] => {
    const cs = Math.cos(yaw), sn = Math.sin(yaw), o: [number, number][] = [];
    for (const [lx, lz] of [[0, 0], [-hx - grow, -hz - grow], [hx + grow, -hz - grow], [hx + grow, hz + grow], [-hx - grow, hz + grow], [0, -hz - grow], [0, hz + grow], [-hx - grow, 0], [hx + grow, 0]]) o.push([x + cs * lx + sn * lz, z - sn * lx + cs * lz]);
    return o;
  };
  const sat = (A: { x: number; z: number; yaw: number; hx: number; hz: number }, B: { x: number; z: number; yaw: number; hx: number; hz: number }, m: number): boolean => {
    if (Math.hypot(A.x - B.x, A.z - B.z) > Math.hypot(A.hx, A.hz) + Math.hypot(B.hx, B.hz) + m + 1) return false;
    for (const P of [A, B]) for (const ang of [P.yaw, P.yaw + Math.PI / 2]) {
      const ax = Math.cos(ang), az = -Math.sin(ang);
      const rp = (Q: typeof A) => Math.abs(Math.cos(Q.yaw) * ax - Math.sin(Q.yaw) * az) * Q.hx + Math.abs(Math.sin(Q.yaw) * ax + Math.cos(Q.yaw) * az) * Q.hz;
      if (Math.abs((B.x - A.x) * ax + (B.z - A.z) * az) > rp(A) + rp(B) + m) return false;
    }
    return true;
  };
  const free = (x: number, z: number, yaw: number, hx: number, hz: number, gap: number): boolean => {
    if (Math.abs(x) > lim - 14 || Math.abs(z) > lim - 14) return false;
    for (const [px, pz] of corners(x, z, yaw, hx, hz)) {
      if (route.nearestWithin(px, pz, half + Math.max(2.5, gap - 1.5))) return false;
      if (onArm(out.arms, px, pz, 3)) return false;
    }
    return true;
  };
  const put = (h: SubHouse): boolean => {
    if (!free(h.x, h.z, h.yaw, h.hx, h.hz, 5)) return false;
    for (const o of out.houses) if (sat(h, o, 1.2)) return false;
    out.houses.push(h); return true;
  };

  // 1) Wahrzeichen zuerst (feste Lage, nur gegen die Strecke geprüft – sie stehen bewusst nah)
  for (const s of def.special) out.houses.push({ x: s.x, z: s.z, yaw: s.yaw, hx: s.hx, hz: s.hz, h: s.h, kind: s.kind, c: Math.floor(rnd() * 5), roof: s.kind === 'villa' ? 5.5 : s.kind === 'haus' || s.kind === 'reihe' ? 3.4 : 0 });

  // 1b) feste Gebäude nach Vorlage (Position/Größe/Farbe aus dem Generator); nichts auf Fahrbahn/Querstraße
  for (const b of def.blocks ?? []) {
    const [x, z, hx, hz, yaw, h, kind, roof, wc, rc] = b;
    if (Math.abs(x) > lim - 6 || Math.abs(z) > lim - 6) continue;
    let bad = false;
    for (const [px, pz] of corners(x, z, yaw, hx, hz)) if (route.nearestWithin(px, pz, half + 1) || onArm(out.arms, px, pz, 1)) { bad = true; break; }
    if (bad) continue;
    out.houses.push({ x, z, yaw, hx, hz, h, kind, c: Math.abs(Math.floor(x * 7 + z * 13)) % 6, roof, wc: wc >= 0 ? wc : undefined, rc: rc >= 0 ? rc : undefined });
  }
  // 1c) Querstraßen enden an einer Hauswand (Kulisse, fest)
  if (def.blocks) for (const ar of out.arms) {
    const e = half + ar.len + 4.5, ex = ar.x + ar.tx * (e - (half + ar.len / 2)), ez = ar.z + ar.tz * (e - (half + ar.len / 2));
    out.houses.push({ x: ex, z: ez, yaw: ar.yaw, hx: ar.w / 2 + 8, hz: 4, h: 7.5, kind: 'gewerbe', c: Math.abs(Math.floor(ex + ez)) % 4, roof: 0 });
  }

  // 2) Zeilen entlang der Strecke
  const openAt = (s: number, side: number) => (def.open ?? []).some(([a0, a1, sd]) => s >= a0 && s <= a1 && (sd === 0 || sd === side));
  for (const row of def.rows) {
    let s = row.s[0];
    while (s < row.s[1]) {
      let hz: number, hx: number, h: number, kind = row.kind, roof = 0;
      if (kind === 'reihe') { hz = 8 + rnd() * 9; hx = 5.2 + rnd() * 1.4; h = 8.4 + rnd() * 2.8; roof = 3.4; }
      else if (kind === 'haus') { hz = 5.2 + rnd() * 1.8; hx = 5 + rnd() * 1.6; h = 6.2 + rnd() * 1.6; roof = 3.2; }
      else if (kind === 'gewerbe') { hz = 7 + rnd() * 8; hx = 8 + rnd() * 5; h = 6 + rnd() * 5; }
      else { hz = 10; hx = 8; h = 8; }
      const sm = s + hz;
      if (openAt(sm, row.side)) { s += 4; continue; }
      const yaw = route.yawAt(sm), [x, z] = route.offset(sm, row.side * (half + row.gap + hx));
      const ok = put({ x, z, yaw: yaw + (row.side > 0 ? 0 : 0), hx, hz, h, kind, c: Math.floor(rnd() * 6), roof });
      if (!ok) { s += 3; continue; }
      s += hz * 2 + 1.5 + rnd() * (kind === 'haus' ? 7 : 2.5);
    }
  }

  // 3) Hecken: vor der der Strecke zugewandten Hausfront (Wohnhäuser), mit Lücke für die Einfahrt
  for (const [x, z, yaw, len] of def.hedges ?? []) if (!route.nearestWithin(x, z, half + 1) && !onArm(out.arms, x, z, 1)) out.hedges.push({ x, z, yaw, len, c: Math.abs(Math.floor(x + z)) % 4 });
  if (!def.blocks) for (const h of out.houses) {
    if (h.kind !== 'reihe' && h.kind !== 'haus' && h.kind !== 'villa') continue;
    const nr = route.nearestWithin(h.x, h.z, 90); if (!nr) continue;
    const q = route.at(nr.s), rx = q.x - h.x, rz = q.z - h.z, rl = Math.hypot(rx, rz) || 1;
    const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw), dx = (cs * rx - sn * rz) / rl, dz = (sn * rx + cs * rz) / rl;   // Richtung zur Strecke in lokalen Koordinaten
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const ext = alongX ? h.hx : h.hz, side = alongX ? Math.sign(dx) : Math.sign(dz), wid = alongX ? h.hz : h.hx;
    if (rnd() < 0.12) continue;
    const off = ext + 1.8, lx = alongX ? side * off : 0, lz = alongX ? 0 : side * off;
    const px = h.x + cs * lx + sn * lz, pz = h.z - sn * lx + cs * lz;
    if (route.nearestWithin(px, pz, half + 3.2) || onArm(out.arms, px, pz, 2)) continue;
    out.hedges.push({ x: px, z: pz, yaw: alongX ? h.yaw - Math.PI / 2 : h.yaw, len: wid * 2 * (0.7 + rnd() * 0.3), c: Math.floor(rnd() * 4) });
  }

  // 4) Laternen + Straßenbäume (Laub), im Wechsel links/rechts
  let k = 0;
  for (const [s0, s1] of def.lit) {
    for (let s = s0 + 6; s < s1 - 4; s += 36, k++) {
      const side = k % 2 ? 1 : -1, [x, z] = route.offset(s, side * (half + 1.3));
      if (onArm(out.arms, x, z, 2)) continue;
      out.lamps.push({ x, z, yaw: route.yawAt(s), side });
    }
    if (def.litTrees !== false) for (let s = s0 + 14; s < s1 - 6; s += 24) for (const side of [1, -1]) {
      const [x, z] = route.offset(s + (side > 0 ? 9 : 0), side * (half + 4.4));
      if (onArm(out.arms, x, z, 3) || out.houses.some((h) => sat(h, { x, z, yaw: 0, hx: 1.2, hz: 1.2 }, 0.5)) || out.bus.some((b) => Math.hypot(b.x - x, b.z - z) < 9)) continue;
      out.trees.push({ x, z, s: 0.8 + rnd() * 0.6 });
    }
  }
  for (const [x, z, sc] of def.trees ?? []) out.trees.push({ x, z, s: sc });
  // Park: Baumgruppen
  for (const [gx, gz, r, n] of def.groves ?? []) for (let i = 0; i < n; i++) {
    const an = rnd() * 6.283, d = Math.sqrt(rnd()) * r, x = gx + Math.cos(an) * d, z = gz + Math.sin(an) * d;
    if (route.nearestWithin(x, z, half + 4) || out.houses.some((h) => sat(h, { x, z, yaw: 0, hx: 1.4, hz: 1.4 }, 1))) continue;
    out.trees.push({ x, z, s: 0.9 + rnd() * 0.7 });
  }

  // 5) Ampeln, Schilder, Bushaltestellen
  for (const s of def.signals) { const a2 = route.at(s); out.signals.push({ s, x: a2.x, z: a2.z, yaw: route.yawAt(s) }); }
  for (const [s, side, text] of def.signs) { const [x, z] = route.offset(s, side * (half + 2.2)); out.signs.push({ x, z, yaw: route.yawAt(s), text }); }
  for (const [s, side] of def.bus) { const [x, z] = route.offset(s, side * (half + 2.2)); out.bus.push({ x, z, yaw: route.yawAt(s), side }); }
  return out;
}

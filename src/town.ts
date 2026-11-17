// Altstadt: Häuserzeilen, Kirchen, Kranhäuser am Ufer, Dom-Umbauung. Reine Planung (ohne three), deterministisch aus dem Seed; Mesh in townmesh.ts.
import type { Route } from './level';
import type { River } from './river';

export interface TownDef {
  /** Straßenabschnitte (Streckenmeter), links und rechts bebaut */
  streets: [number, number][];
  /** Bebauung am Fluss im Umkreis (m) um die Brücke; 0 = keine */
  bank?: number;
  /** Kirchen [s, Seite] an der Strecke; Kranhäuser [Flussmeter relativ zur Brücke, Seite] */
  churches?: [number, number][];
  kran?: [number, number][];
  /** Häuser rund um den Dom (Landmark 0) */
  dom?: boolean;
}
/** Geschosshöhe (m): 2 Geschosse = 6,6 m Traufe */
export const FLOOR_H = 3.3;
export type TownKind = 'giebel' | 'traufe' | 'kirche' | 'kran';
export interface TownHouse { x: number; z: number; yaw: number; hx: number; hz: number; h: number; kind: TownKind; c: number; /** zusätzliche Höhe des Dachs */ roof: number }

export function planTown(def: TownDef, a: {
  route: Route; half: number; lim: number; river: River | null; bridgeS: number | null; dom: { x: number; z: number; yaw: number; s: number } | null; seed: number;
  height: (x: number, z: number) => number;
}): TownHouse[] {
  const out: TownHouse[] = [], { route, half, lim, river } = a;
  let st = (a.seed * 2654435761) >>> 0; const rnd = () => { st = (st + 0x6d2b79f5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const dom = a.dom, dcs = dom ? Math.cos(dom.yaw) : 1, dsn = dom ? Math.sin(dom.yaw) : 0;
  const domLocal = (x: number, z: number): [number, number] => dom ? [dcs * (x - dom.x) - dsn * (z - dom.z), dsn * (x - dom.x) + dcs * (z - dom.z)] : [1e9, 1e9];
  const pts = (x: number, z: number, yaw: number, hx: number, hz: number): [number, number][] => {
    const cs = Math.cos(yaw), sn = Math.sin(yaw), o: [number, number][] = [];
    for (const [lx, lz] of [[0, 0], [-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [0, -hz], [0, hz], [-hx, 0], [hx, 0]]) o.push([x + cs * lx + sn * lz, z - sn * lx + cs * lz]);
    return o;
  };
  const place = (x: number, z: number, yaw: number, hx: number, hz: number, h: number, kind: TownKind, free = 3): boolean => {
    if (Math.abs(x) > a.lim - 12 || Math.abs(z) > a.lim - 12) return false;
    for (const [px, pz] of pts(x, z, yaw, hx + free, hz + free)) {
      if (route.nearestWithin(px, pz, half + 3.5)) return false;
      if (river && river.dist(px, pz) < river.width / 2 + 11) return false;
      if (dom) { const [lx, lz] = domLocal(px, pz); if (Math.abs(lx) < 28 * dom.s && lz > -52 * dom.s && lz < 75 * dom.s) return false; }
    }
    const R = Math.hypot(hx, hz) * 0.9;
    for (const o of out) if (Math.hypot(o.x - x, o.z - z) < R + Math.hypot(o.hx, o.hz) * 0.9) return false;
    out.push({ x, z, yaw, hx, hz, h, kind, c: Math.floor(rnd() * 10), roof: 0 });
    return true;
  };
  // Altstadt zweistöckig, ca. jedes 5. Haus dreistöckig; h = Stockwerke × FLOOR_H (townmesh setzt die Fensterreihen darauf)
  const house = (x: number, z: number, yaw: number, hx: number, hz: number): boolean =>
    place(x, z, yaw, hx, hz, (rnd() < 0.2 ? 3 : 2) * FLOOR_H, rnd() < 0.7 ? 'giebel' : 'traufe');

  // 1) Dom einbetten: Zeilen beidseits der Achse (Plaza vor der Westfront bleibt frei), dahinter eine Querzeile
  if (def.dom && dom) {
    const S = dom.s, cs = dcs, sn = dsn, W = (lx: number, lz: number): [number, number] => [dom.x + cs * lx + sn * lz, dom.z - sn * lx + cs * lz];
    for (const side of [1, -1]) for (let row = 0; row < 3; row++) {
      let lz = -105 * S;
      while (lz < 78 * S) {
        const hz = 4 + rnd() * 2.6, hx = 5 + rnd() * 2, lx = side * ((32 + row * 15) * S + hx);
        const [x, z] = W(lx, lz + hz);
        if (!house(x, z, dom.yaw, hx, hz)) { lz += 3; continue; }
        lz += hz * 2 + 0.5 + (rnd() < 0.1 ? 4 : 0);
      }
    }
    for (let row = 0; row < 2; row++) {
      let lx = -64 * S;
      while (lx < 64 * S) {
        const hz = 4 + rnd() * 2.6, hx = 5 + rnd() * 2, lz = (80 + row * 14) * S + hx;
        const [x, z] = W(lx + hz, lz);
        if (!house(x, z, dom.yaw + Math.PI / 2, hx, hz)) { lx += 3; continue; }
        lx += hz * 2 + 0.5;
      }
    }
  }
  // 2) Kirchen, Kranhäuser
  for (const [s, side] of def.churches ?? []) {
    const hx = 6.5, hz = 13, [x, z] = route.offset(s, side * (half + 8 + hx));
    const o = out.length; if (place(x, z, route.yawAt(s), hx, hz, 16, 'kirche')) out[o].roof = 36;
  }
  if (river) {
    const rt = river.route; let sb = 0;
    if (a.bridgeS !== null) { const b = route.at(a.bridgeS); let best = 1e9; for (let s = 0; s < rt.length; s += 4) { const p = rt.at(s), d = Math.hypot(p.x - b.x, p.z - b.z); if (d < best) { best = d; sb = s; } } }
    const nrm = (s: number, side: number, k: number): [number, number, number] => { const p = rt.at(s), l = side * (river.width / 2 + k); return [p.x + p.dz * l, p.z - p.dx * l, Math.atan2(p.dx, p.dz)]; };
    for (const [ds, side] of def.kran ?? []) {
      const hx = 8, hz = 12, [x, z, yaw] = nrm(sb + ds, side, 17 + hx);
      const o = out.length; if (place(x, z, yaw, hx, hz, 24, 'kran', 2)) out[o].roof = 18;
    }
    // 3) Straßenzeilen (zwei Reihen tief)
    for (const [s0, s1] of def.streets) for (const side of [1, -1]) for (let row = 0; row < 2; row++) {
      let s = s0;
      while (s < s1) {
        const hz = 3.2 + rnd() * 2.2, hx = 5 + rnd() * 2, sc = s + hz, lat = side * (half + 5.5 + (row ? 16 : 0) + hx);
        const [x, z] = route.offset(sc, lat);
        if (!house(x, z, route.yawAt(sc), hx, hz)) { s += 3; continue; }
        s += hz * 2 + 0.4 + (rnd() < 0.08 ? 5 : 0);
      }
    }
    // 4) Uferbebauung: Zeilen am Flussufer um die Brücke, Front zum Wasser
    if (def.bank && a.bridgeS !== null) {
      const b = route.at(a.bridgeS);
      for (const side of [1, -1]) for (let row = 0; row < 2; row++) {
        let s = 0;
        while (s < rt.length) {
          const hz = 3.4 + rnd() * 2.6, hx = 5.5 + rnd() * 2, sc = s + hz, [x, z, yaw] = nrm(sc, side, 13 + (row ? 17 : 0) + hx);
          if (Math.hypot(x - b.x, z - b.z) > def.bank || !house(x, z, yaw, hx, hz)) { s += 3; continue; }
          s += hz * 2 + 0.4;
        }
      }
    }
  } else {
    for (const [s0, s1] of def.streets) for (const side of [1, -1]) {
      let s = s0; while (s < s1) { const hz = 3.2 + rnd() * 2.2, hx = 5 + rnd() * 2, sc = s + hz; if (!house(...route.offset(sc, side * (half + 5.5 + hx)), route.yawAt(sc), hx, hz)) { s += 3; continue; } s += hz * 2 + 0.4; }
    }
  }
  return out;
}

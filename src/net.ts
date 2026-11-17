// Straßennetz (Vorstadt): Knoten = Kreuzungen/Ränder, Kanten = Straßenstücke zwischen zwei Knoten. Eigenständig, nicht von der Rennstrecke abhängig:
// die Strecke (Course.route) ist nur ein Pfad durch dieses Netz. Ohne three, headless testbar. Verkehr soll über `Net.nodes[].edges` routen
// (geradeaus/abbiegen an Knoten), Gelände + Straßenfläche + Belag kommen ebenfalls aus dem Netz.
import { Route } from './level';

export interface NetNodeDef { id: string; x: number; z: number; y: number; signal?: boolean }
export interface NetEdgeDef {
  id: string; a: string; b: string;
  /** Fahrbahnbreite (m) */
  w: number;
  /** Belag der Kante (Name wie in SURFACE_BY_NAME) */
  surf: string;
  /** Art: damm, obere, untere (breite Straßen), wohn, fuss */
  kind: string;
  /** Mittellinie von Knoten a nach Knoten b (dicht, ~6 m) */
  pts: [number, number][];
  /** Höhenprofil: [Anteil 0…1 der Länge, Höhe]; an den Enden = Knotenhöhe, dort läuft die Straße 14 m flach aus */
  prof: [number, number][];
  /** Wellen (tiefer, welliger Weg): Amplitude, Wellenlänge (m), Phase */
  waves?: { amp: number; len: number; phase?: number };
  /** Belag-Abschnitte [s0, s1, Name] (Meter ab Knoten a) */
  zones?: [number, number, string][];
  /** Fußgänger-Bedarfsampeln auf der Kante (m ab Knoten a); Verkehr hält dort bei Bedarf, Mast + Haltelinie */
  ped?: number[];
}
export interface NetDef { nodes: NetNodeDef[]; edges: NetEdgeDef[] }

export interface NetHit { edge: NetEdge; s: number; d: number; lat: number }
const sm = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** so weit (m) hinter der Kreuzungsfläche (Radius rj, dort alles eben) läuft die Straße sanft ins Profil */
export const NODE_FLAT = 14;
/** Integral der Steigungs-Einblendung (smoothstep über NODE_FLAT): 0 bis d=0, danach wachsend, später linear */
const ramp = (d: number): number => { if (d <= 0) return 0; const u = d / NODE_FLAT; return u >= 1 ? NODE_FLAT * 0.5 + (d - NODE_FLAT) : NODE_FLAT * (u * u * u - u * u * u * u / 2); };
/** Reichweite der Gelände-Mischung (m), entspricht R in buildCourse */
export const NET_REACH = 420;
/** Breite (m) neben dem Fahrbahnrand, in der das Gelände bündig auf Fahrbahnhöhe liegt (keine Böschung, keine Dämme) */
export const NET_FLUSH = 12;

export class NetEdge {
  readonly route: Route; readonly half: number; readonly length: number;
  /** unter einem Brückendeck (Straßenhöhe wirkt dort nicht aufs Gelände): [s0, s1] */
  deck: [number, number][] = [];
  constructor(readonly def: NetEdgeDef, readonly a: NetNode, readonly b: NetNode, readonly index: number) {
    this.route = new Route(def.pts); this.half = def.w / 2; this.length = this.route.length;
  }
  get id(): string { return this.def.id; }
  /** Straßenhöhe bei s (m ab Knoten a) */
  elev(s: number): number {
    const P = this.def.prof, L = this.length;
    // Gewichtete Strecke: Steigung 0 auf der Kreuzungsfläche (rj), danach über NODE_FLAT m sanft auf volle Steigung -> kein Knick, keine Wulst am Knoten
    const wa = ramp(s - this.a.rj), wb = ramp(L - s - this.b.rj), t = wa + wb > 1e-9 ? wa / (wa + wb) : 0.5;
    let y = P[P.length - 1][1];
    for (let i = 0; i + 1 < P.length; i++) if (t <= P[i + 1][0]) { const u = (t - P[i][0]) / Math.max(1e-9, P[i + 1][0] - P[i][0]); y = P[i][1] + (P[i + 1][1] - P[i][1]) * u; break; }
    const w = this.def.waves;
    if (w) y += w.amp * Math.sin(2 * Math.PI * s / w.len + (w.phase ?? 0)) * sm(0, 24, s) * sm(0, 24, L - s);
    return y;
  }
  /** Belag-Name bei s */
  surfAt(s: number): string { for (const z of this.def.zones ?? []) if (s >= z[0] && s <= z[1]) return z[2]; return this.def.surf; }
  onDeck(s: number): boolean { return this.deck.some(([a, b]) => s > a && s < b); }
  /** Punkt bei s: Mitte + Fahrtrichtung (a → b) */
  at(s: number) { return this.route.at(s); }
}

export class NetNode {
  /** Kanten an diesem Knoten: end 0 = Knoten ist Anfang (a) der Kante, 1 = Ende (b) */
  readonly edges: { edge: NetEdge; end: 0 | 1 }[] = [];
  /** Radius der Kreuzungsfläche (m); 0 = keine Kreuzung (Durchgang oder Rand) */
  rj = 0;
  /** Kreuzungsfläche (nur Knoten mit ≥ 3 Kanten): Umriss gegen den Uhrzeigersinn-Winkel sortiert, Armen-Schnitt je Kante (m ab Knoten) */
  poly: [number, number][] = [];
  cuts = new Map<NetEdge, number>();
  constructor(readonly def: NetNodeDef) {}
  /** Länge (m), die die Kante `e` an diesem Knoten vor der Kreuzungsfläche aufhört (0 = keine Kreuzung) */
  cutOf(e: NetEdge): number { return this.cuts.get(e) ?? 0; }
  /** Abstand (m) von (x,z) zur Kreuzungsfläche: negativ innen, positiv außen; 1e9 ohne Kreuzung */
  polyDist(px: number, pz: number): number {
    const P = this.poly, n = P.length; if (n < 3 || Math.hypot(px - this.x, pz - this.z) > this.rj + 40) return 1e9;
    let inside = false, d = 1e9;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [ax, az] = P[j], [bx, bz] = P[i];
      if ((az > pz) !== (bz > pz) && px < (bx - ax) * (pz - az) / (bz - az) + ax) inside = !inside;
      const ex = bx - ax, ez = bz - az, u = Math.min(1, Math.max(0, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez || 1e-9)));
      d = Math.min(d, Math.hypot(px - ax - ex * u, pz - az - ez * u));
    }
    return inside ? -d : d;
  }
  get id(): string { return this.def.id; }
  get x(): number { return this.def.x; } get z(): number { return this.def.z; } get y(): number { return this.def.y; }
  get signal(): boolean { return !!this.def.signal; }
  /** Straßenrichtung der Kante vom Knoten weg (Einheitsvektor) */
  dirOut(e: { edge: NetEdge; end: 0 | 1 }): [number, number] {
    const r = e.edge.route, s = Math.min(8, r.length / 2), p = e.end === 0 ? r.at(s) : r.at(r.length - s);
    const l = Math.hypot(p.x - this.x, p.z - this.z) || 1; return [(p.x - this.x) / l, (p.z - this.z) / l];
  }
}

const CELL = 16, CELLF = 48, STEPF = 4, RMAX = NET_REACH + 4, RNEAR = 46;   // zwei Raster: nah (Fahrbahn/Kreuzung/Treffer bis 46 m) und weit (Geländeanpassung bis NET_REACH)

export class Net {
  readonly nodes = new Map<string, NetNode>();
  readonly edges: NetEdge[] = [];
  private grid = new Map<number, number[]>();   // Zelle -> [Kante, Stützpunkt, …] (nah)
  private far = new Map<number, number[]>();
  private bd = new Float64Array(0); private bs = new Float64Array(0); private nd = new Float64Array(0); private ns = new Float64Array(0);   // Arbeitsfelder von blend()
  constructor(readonly def: NetDef) {
    for (const n of def.nodes) this.nodes.set(n.id, new NetNode(n));
    def.edges.forEach((e, i) => {
      const a = this.nodes.get(e.a), b = this.nodes.get(e.b); if (!a || !b) throw new Error('Netz: Knoten fehlt ' + e.id);
      const ed = new NetEdge(e, a, b, i); this.edges.push(ed); a.edges.push({ edge: ed, end: 0 }); b.edges.push({ edge: ed, end: 1 });
    });
    this.bd = new Float64Array(this.edges.length); this.bs = new Float64Array(this.edges.length); this.nd = new Float64Array(this.edges.length); this.ns = new Float64Array(this.edges.length);
    for (const n of this.nodes.values()) if (n.edges.length >= 3) this.layout(n);
    for (const [g, RM, C, ST] of [[this.grid, RNEAR, CELL, 2], [this.far, RMAX, CELLF, STEPF]] as [Map<number, number[]>, number, number, number][]) this.edges.forEach((ed, ei) => {
      const r = ed.route;
      for (let i = 0; i < r.n - 1; i += ST) {
        const j = Math.min(r.n - 1, i + ST), x0 = Math.min(r.x[i], r.x[j]) - RM, x1 = Math.max(r.x[i], r.x[j]) + RM, z0 = Math.min(r.z[i], r.z[j]) - RM, z1 = Math.max(r.z[i], r.z[j]) + RM;
        for (let cz = Math.floor(z0 / C); cz <= Math.floor(z1 / C); cz++) for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++) {
          const k = cx * 100003 + cz, a = g.get(k); if (a) a.push(ei, i); else g.set(k, [ei, i]);
        }
      }
    });
  }
  /** Kreuzungsfläche eines Knotens: Arme enden bündig am Schnitt, dazwischen Ausrundungen (Bézier durch die Schnittecke der Fahrbahnränder) */
  private layout(n: NetNode): void {
    const arms = n.edges.map((e) => { const d = n.dirOut(e); return { e, d, a: Math.atan2(d[1], d[0]), h: e.edge.half, nx: -d[1], nz: d[0], c: 2, sg: 1 }; }).sort((p, q) => p.a - q.a), m = arms.length;
    const F = 3.5, TMAX = 2.4 * Math.max(...arms.map((q) => q.h)) + 4, TWO = Math.PI * 2;
    const corner: ({ x: number; z: number } | null)[] = [];
    for (let i = 0; i < m; i++) {
      const A = arms[i], B = arms[(i + 1) % m]; let th = B.a - A.a; if (th <= 0) th += TWO;
      corner.push(null); if (th > 2.9) continue;
      const wx = -B.h * B.nx - A.h * A.nx, wz = -B.h * B.nz - A.h * A.nz, den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
      const t = (wx * B.d[1] - wz * B.d[0]) / den, u = (wx * A.d[1] - wz * A.d[0]) / den;
      if (!(t > 0 && u > 0) || t > TMAX || u > TMAX) continue;
      corner[i] = { x: n.x + A.h * A.nx + t * A.d[0], z: n.z + A.h * A.nz + t * A.d[1] };
      A.c = Math.max(A.c, t + F); B.c = Math.max(B.c, u + F);
    }
    for (const A of arms) {   // welche Seite von route.offset(+) liegt auf der +90°-Seite?
      const s = A.e.end === 0 ? 4 : A.e.edge.length - 4, q = A.e.edge.route.offset(s, 1), p = A.e.edge.route.at(s);
      A.sg = (q[0] - p.x) * A.nx + (q[1] - p.z) * A.nz > 0 ? 1 : -1; A.c = Math.min(A.c, A.e.edge.length * 0.45); n.cuts.set(A.e.edge, A.c);
    }
    const side = (A: (typeof arms)[number], plus: boolean): [number, number] => {
      const s = A.e.end === 0 ? A.c : A.e.edge.length - A.c, [x, z] = A.e.edge.route.offset(s, (plus ? A.sg : -A.sg) * A.h); return [x, z];
    };
    const ring: [number, number][] = [];
    for (let i = 0; i < m; i++) {
      const A = arms[i], B = arms[(i + 1) % m], P0 = side(A, true), P1 = side(B, false), C = corner[i];
      ring.push(side(A, false));
      ring.push(P0);
      if (C) for (let k = 1; k < 7; k++) { const u = k / 7, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u; ring.push([w0 * P0[0] + w1 * C.x + w2 * P1[0], w0 * P0[1] + w1 * C.z + w2 * P1[1]]); }
    }
    n.poly = ring; n.rj = Math.max(...ring.map((p) => Math.hypot(p[0] - n.x, p[1] - n.z)));
  }
  /** Kante nach Id */
  edge(id: string): NetEdge { const e = this.edges.find((q) => q.def.id === id); if (!e) throw new Error('Netz: Kante fehlt ' + id); return e; }
  /** je Kante der nächste Punkt innerhalb R (≤ RMAX) */
  hits(px: number, pz: number, R: number): NetHit[] {
    const far = R > RNEAR, C = far ? CELLF : CELL, ST = far ? STEPF : 2, l = (far ? this.far : this.grid).get(Math.floor(px / C) * 100003 + Math.floor(pz / C)); if (!l) return [];
    const best = new Map<number, NetHit>();
    for (let q = 0; q < l.length; q += 2) {
      const ed = this.edges[l[q]], r = ed.route, i = l[q + 1], j = Math.min(r.n - 1, i + ST);
      const ax = r.x[i], az = r.z[i], ex = r.x[j] - ax, ez = r.z[j] - az, l2 = ex * ex + ez * ez || 1e-9;
      const u = Math.min(1, Math.max(0, ((px - ax) * ex + (pz - az) * ez) / l2)), qx = ax + ex * u, qz = az + ez * u, d = Math.hypot(px - qx, pz - qz);
      if (d > R) continue;
      const b = best.get(l[q]);
      if (!b || d < b.d) best.set(l[q], { edge: ed, s: r.s[i] + (r.s[j] - r.s[i]) * u, d, lat: ex * (pz - az) - ez * (px - ax) < 0 ? d : -d });
    }
    return [...best.values()];
  }
  nearest(px: number, pz: number, R = RNEAR): NetHit | null {
    let b: NetHit | null = null; for (const h of this.hits(px, pz, R)) if (!b || h.d < b.d) b = h; return b;
  }
  /** Kreuzungsfläche, in der (x,z) liegt (Rand m dazu) */
  junctionAt(px: number, pz: number, m = 0): NetNode | null {
    for (const h of this.hits(px, pz, 40)) for (const n of [h.edge.a, h.edge.b]) if (n.rj > 0 && n.polyDist(px, pz) <= m) return n;
    return null;
  }
  /** (x,z) liegt auf Fahrbahn oder Kreuzungsfläche (Rand m dazu) */
  onRoad(px: number, pz: number, m = 0): boolean {
    for (const h of this.hits(px, pz, 24 + m)) {
      if (h.d <= h.edge.half + m) return true;
      for (const n of [h.edge.a, h.edge.b]) if (n.rj > 0 && n.polyDist(px, pz) <= m) return true;
    }
    return false;
  }
  /** Belag bei (x,z): Kantenbelag/Abschnitt; Kreuzungsfläche = Asphalt; null = nicht auf der Straße */
  surfAt(px: number, pz: number): string | null {
    let best: NetHit | null = null;
    for (const h of this.hits(px, pz, 24)) if (h.d <= h.edge.half && (!best || h.d < best.d)) best = h;
    const j = this.junctionAt(px, pz);
    if (j) { const asph = j.edges.find((e) => e.edge.def.surf === 'Asphalt'); if (asph && (!best || best.edge.def.surf === 'Asphalt' || best.d > best.edge.half - 0.5 || j.polyDist(px, pz) < -0.5)) return 'Asphalt'; }
    return best ? best.edge.surfAt(best.s) : null;
  }
  /** Geländehöhe aus dem Netz (kein Noise): inverse-Distanz-Mittel der Straßenhöhen aller Kanten in Reichweite; neben der Fahrbahn (NET_FLUSH) bündig auf Fahrbahnhöhe, dazwischen glatt; null = keine Straße in Reichweite */
  blend(px: number, pz: number, R = NET_REACH): { w: number; y: number } | null {
    // je Kante der nächste Punkt (weit grob, nah genau – nah überstimmt), ohne Allokation: dieser Aufruf läuft für jeden Geländepunkt (Ladezeit)
    const E = this.edges.length, bd = this.bd, bs = this.bs; bd.fill(Infinity);
    const far = this.far.get(Math.floor(px / CELLF) * 100003 + Math.floor(pz / CELLF)), R2 = R * R;
    if (far) for (let q = 0; q < far.length; q += 2) {
      const ei = far[q], r = this.edges[ei].route, i = far[q + 1], j = Math.min(r.n - 1, i + STEPF), ax = r.x[i], az = r.z[i], ex = r.x[j] - ax, ez = r.z[j] - az;
      const u = Math.min(1, Math.max(0, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez || 1e-9))), dx = px - ax - ex * u, dz = pz - az - ez * u, d2 = dx * dx + dz * dz;
      if (d2 <= R2 && d2 < bd[ei]) { bd[ei] = d2; bs[ei] = r.s[i] + (r.s[j] - r.s[i]) * u; }
    }
    const near = this.grid.get(Math.floor(px / CELL) * 100003 + Math.floor(pz / CELL));
    if (near) {
      const nd = this.nd, ns = this.ns; nd.fill(Infinity);
      for (let q = 0; q < near.length; q += 2) {
        const ei = near[q], r = this.edges[ei].route, i = near[q + 1], j = Math.min(r.n - 1, i + 2), ax = r.x[i], az = r.z[i], ex = r.x[j] - ax, ez = r.z[j] - az;
        const u = Math.min(1, Math.max(0, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez || 1e-9))), dx = px - ax - ex * u, dz = pz - az - ez * u, d2 = dx * dx + dz * dz;
        if (d2 <= RNEAR * RNEAR && d2 < nd[ei]) { nd[ei] = d2; ns[ei] = r.s[i] + (r.s[j] - r.s[i]) * u; }
      }
      for (let ei = 0; ei < E; ei++) if (nd[ei] < Infinity) { bd[ei] = nd[ei]; bs[ei] = ns[ei]; }
    }
    let sw = 0, sy = 0;
    for (let ei = 0; ei < E; ei++) {
      if (bd[ei] === Infinity) continue;
      const ed = this.edges[ei], d = Math.sqrt(bd[ei]), dd = Math.max(0, d - ed.half - NET_FLUSH) + 0.2, w = dd ** -1.5 * (1 - sm(R * 0.5, R, d));   // am Rand der Reichweite ausblenden (sonst Sprünge)
      sw += w; sy += w * ed.elev(bs[ei]);
    }
    return sw > 0 ? { w: sw, y: sy / sw } : null;
  }
  /** Höhe der Straße selbst (Mittellinie der nächsten Kante) */
  roadY(px: number, pz: number): number { const h = this.nearest(px, pz); return h ? h.edge.elev(h.s) : 0; }
  /** Kante zwischen zwei Knoten (beliebige Richtung) */
  between(a: string, b: string): { edge: NetEdge; rev: boolean } | null {
    for (const e of this.edges) { if (e.a.id === a && e.b.id === b) return { edge: e, rev: false }; if (e.a.id === b && e.b.id === a) return { edge: e, rev: true }; }
    return null;
  }
  /** Fahrpfad durch eine Knotenfolge (Mittellinie, Abbiegen mit Ausrundung ~ Kreuzungsfläche); für Tests und Verkehr; die Rennstrecke selbst steht im Level-JSON */
  path(ids: string[]): [number, number][] {
    let out: [number, number][] = [];
    for (let i = 0; i + 1 < ids.length; i++) {
      const bw = this.between(ids[i], ids[i + 1]); if (!bw) throw new Error(`Netz: keine Kante ${ids[i]}–${ids[i + 1]}`);
      const L = bw.edge.length, n = Math.max(2, Math.ceil(L / 4));
      for (let k = i ? 1 : 0; k <= n; k++) { const q = bw.edge.route.at(bw.rev ? L - L * k / n : L * k / n); out.push([q.x, q.z]); }
    }
    for (let i = 1; i + 1 < ids.length; i++) {
      const nd = this.nodes.get(ids[i])!, C: [number, number] = [nd.x, nd.z];
      const ci = out.reduce((b, p, k) => (Math.hypot(p[0] - C[0], p[1] - C[1]) < Math.hypot(out[b][0] - C[0], out[b][1] - C[1]) ? k : b), 0);
      const walk = (k: number, dir: number, dist: number) => { let acc = 0; while (k + dir >= 0 && k + dir < out.length && acc < dist) { acc += Math.hypot(out[k + dir][0] - out[k][0], out[k + dir][1] - out[k][1]); k += dir; } return k; };
      const ia = walk(ci, -1, 14), ib = walk(ci, 1, 14);
      let ux = C[0] - out[ia][0], uz = C[1] - out[ia][1], vx = out[ib][0] - C[0], vz = out[ib][1] - C[1];
      const ul = Math.hypot(ux, uz), vl = Math.hypot(vx, vz); ux /= ul; uz /= ul; vx /= vl; vz /= vl;
      const ang = Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz); if (Math.abs(ang) < 0.44) continue;
      const R = Math.max(6, Math.max(...nd.edges.map((e) => e.edge.def.w)) / 2 + 2), t = R * Math.tan(Math.abs(ang) / 2), sg = ang > 0 ? 1 : -1;
      const ja = walk(ci, -1, t), jb = walk(ci, 1, t);
      const P1: [number, number] = [C[0] - ux * t, C[1] - uz * t], O: [number, number] = [P1[0] - uz * sg * R, P1[1] + ux * sg * R], a0 = Math.atan2(P1[1] - O[1], P1[0] - O[0]), ns = Math.max(3, Math.floor(Math.abs(ang) / 0.21));
      const arc: [number, number][] = []; for (let q = 0; q <= ns; q++) { const aa = a0 + sg * Math.abs(ang) * q / ns; arc.push([O[0] + R * Math.cos(aa), O[1] + R * Math.sin(aa)]); }
      out = [...out.slice(0, ja), ...arc, ...out.slice(jb + 1)];
    }
    return out;
  }
  /** Kreuzungen (Knoten mit ≥ 3 Kanten) */
  get junctions(): NetNode[] { return [...this.nodes.values()].filter((n) => n.rj > 0); }
  /** Abbiege-Optionen an Knoten n für ein Fahrzeug, das auf Kante `from` ankommt (Ziel: Kanten außer from) – Grundlage für */
  exits(n: NetNode, from: NetEdge): { edge: NetEdge; end: 0 | 1 }[] { return n.edges.filter((e) => e.edge !== from); }
}

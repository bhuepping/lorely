// Ampeln am Straßennetz (ohne three): je Ampelknoten (NetNode.signal) für jede Zufahrt ein Signal (Mast, Kopf, Haltelinie).
// Zufahrten, die annähernd auf einer Achse liegen, bilden eine Gruppe; die Gruppen sind nacheinander grün (grün, gelb, Rot-Pause),
// kreuzende Richtungen sind also nie gleichzeitig grün. Dazu Fußgänger-Bedarfsampeln auf Kanten (`NetEdgeDef.ped`): meist grün für Autos.
// Spieler-Signale, Verkehr und Mesh fragen alle dieselbe Schaltung: `phase(node, edge, t)` bzw. `phaseOf(k, t)`.
import type { Net, NetEdge, NetNode } from './net';

export const SIG_GREEN = 10, SIG_YELLOW = 2, SIG_RED = 1.5;   // s je Gruppe: grün, gelb, alles rot
export const PED_CYCLE = 47;                                  // Bedarfsampel: alle 47 s eine Anforderung (grün 33, gelb 2, rot 8, dann wieder grün)
/** Phase wie sigPhase: 0 grün, 1 gelb, 2 rot */
export type SigPhase = 0 | 1 | 2;

export interface SigHead {
  /** laufende Nummer (Mesh und `phaseOf`) */
  k: number;
  node: NetNode | null; edge: NetEdge;
  /** Gruppe am Knoten (Bedarfsampel: 0) */
  group: number;
  /** Fahrtrichtung auf der Kante: +1 von a nach b, −1 von b nach a */
  dir: 1 | -1;
  /** Haltelinie: Mitte der Fahrbahn bei s (m ab Knoten a) */
  s: number;
  /** Mast (rechts neben der Fahrbahn), Kopf zeigt gegen die Fahrtrichtung (yaw wie Route.yawAt) */
  x: number; z: number; yaw: number;
  /** Einheitsvektoren Fahrtrichtung / rechts, Haltelinie-Mitte (x,z) */
  tx: number; tz: number; rx: number; rz: number; lx: number; lz: number;
  half: number; ped: boolean;
}

const PED_OFF = 11;
export class NetSignals {
  readonly heads: SigHead[] = [];
  private cyc = new Map<string, { n: number; off: number }>();
  private grp = new Map<string, number>();     // "Knoten|Kante" -> Gruppe
  private byKey = new Map<string, SigHead>();
  /** startGreen: diese Zufahrt ist bei t = 0 gerade grün geworden (Spieler startet dort) */
  constructor(readonly net: Net, opts: { startGreen?: { node: string; edge: string } } = {}) {
    let idx = 0;
    for (const nd of net.junctions) {
      if (!nd.signal) continue;
      const arms = nd.edges.map((e) => ({ e, d: nd.dirOut(e) })).sort((p, q) => q.e.edge.def.w - p.e.edge.def.w);
      const axes: number[] = [], ax = (d: [number, number]) => ((Math.atan2(d[1], d[0]) % Math.PI) + Math.PI) % Math.PI;
      for (const a of arms) {
        const w = ax(a.d); let g = axes.findIndex((q) => { const df = Math.abs(w - q); return Math.min(df, Math.PI - df) < 0.62; });
        if (g < 0) { axes.push(w); g = axes.length - 1; }
        this.grp.set(nd.id + '|' + a.e.edge.id, g);
      }
      const P = SIG_GREEN + SIG_YELLOW + SIG_RED;
      this.cyc.set(nd.id, { n: axes.length, off: (idx++ * 5.5) % (axes.length * P) });
      for (const { e } of arms) this.add(nd, e.edge, e.end === 0 ? -1 : 1, e.end === 0 ? nd.cutOf(e.edge) + 2.2 : e.edge.length - nd.cutOf(e.edge) - 2.2, this.grp.get(nd.id + '|' + e.edge.id)!, false);
    }
    for (const ed of net.edges) for (const s of ed.def.ped ?? []) for (const dir of [1, -1] as const) this.add(null, ed, dir, s + (dir > 0 ? -2.6 : 2.6), 0, true);
    if (opts.startGreen) {
      const c = this.cyc.get(opts.startGreen.node), g = this.grp.get(opts.startGreen.node + '|' + opts.startGreen.edge);
      if (c && g !== undefined) c.off = g * (SIG_GREEN + SIG_YELLOW + SIG_RED);
    }
  }
  private add(node: NetNode | null, edge: NetEdge, dir: 1 | -1, s: number, group: number, ped: boolean): void {
    const q = edge.at(s), tx = q.dx * dir, tz = q.dz * dir, rx = -tz, rz = tx, half = edge.half;
    const ms = s + dir * 1.2, m = edge.at(ms);
    const h: SigHead = { k: this.heads.length, node, edge, group, dir, s, x: m.x + rx * (half + 1.5), z: m.z + rz * (half + 1.5), yaw: Math.atan2(-tx, -tz), tx, tz, rx, rz, lx: q.x, lz: q.z, half, ped };
    this.heads.push(h); this.byKey.set((node ? node.id : 'ped') + '|' + edge.id + '|' + dir, h);
  }
  /** Zufahrten eines Ampelknotens (eine je Kante) */
  armsOf(node: string | NetNode): SigHead[] { const id = typeof node === 'string' ? node : node.id; return this.heads.filter((h) => h.node?.id === id); }
  /** Zahl der Gruppen (Phasen) am Knoten */
  groupsOf(node: string): number { return this.cyc.get(node)?.n ?? 0; }
  /** Ampelphase der Zufahrt `edge` am Knoten `node` zur Signalzeit t (s); t < 0 = alles rot (vor dem Start) */
  phase(node: string | NetNode, edge: string | NetEdge, t: number): SigPhase {
    const nid = typeof node === 'string' ? node : node.id, eid = typeof edge === 'string' ? edge : edge.id;
    const c = this.cyc.get(nid), g = this.grp.get(nid + '|' + eid); if (!c || g === undefined || t < 0) return 2;
    return this.groupPhase(c, g, t);
  }
  private groupPhase(c: { n: number; off: number }, g: number, t: number): SigPhase {
    const P = SIG_GREEN + SIG_YELLOW + SIG_RED, u = ((t + c.off) % (c.n * P) + c.n * P) % (c.n * P) - g * P, l = u < 0 ? u + c.n * P : u;
    return l < SIG_GREEN ? 0 : l < SIG_GREEN + SIG_YELLOW ? 1 : 2;
  }
  /** Bedarfsampel auf der Kante (beide Richtungen gleich): meist grün */
  pedPhase(t: number): SigPhase { if (t < 0) return 2; const u = (t + PED_OFF) % PED_CYCLE; return u < 33 ? 0 : u < 35 ? 1 : u < 43 ? 2 : 0; }
  /** Phase des Signals Nr. k (Mesh) */
  phaseOf(k: number, t: number): SigPhase { const h = this.heads[k]; return h.ped ? this.pedPhase(t) : t < 0 ? 2 : this.groupPhase(this.cyc.get(h.node!.id)!, h.group, t); }
  /** Haltepunkt für Verkehr: Zufahrt hält, solange `closed` */
  closed(node: string | NetNode, edge: string | NetEdge, t: number): boolean { return this.phase(node, edge, t) > 0; }
  /** Signal der Zufahrt (Position, Haltelinie) */
  head(node: string | NetNode, edge: string | NetEdge, dir: 1 | -1): SigHead | undefined { return this.byKey.get((typeof node === 'string' ? node : node.id) + '|' + (typeof edge === 'string' ? edge : edge.id) + '|' + dir); }
}

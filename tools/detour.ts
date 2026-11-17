// Kürzester befahrbarer Weg Start→Ziel auf einem Raster (Dijkstra, 8 Nachbarn): gesperrt = Hindernis (um die Autohalbbreite aufgebläht), zu steil, tiefes Wasser,
// optional tiefer Matsch (shallowAt > 0.3). Zeigt, ob es einen Umweg gibt, der kürzer ist als der gute Weg.
import type { Course } from '../src/level';

export interface DetourOpts { cell?: number; slope?: number; margin?: number; mud?: boolean; goalR?: number }
export function shortestPath(c: Course, o: DetourOpts = {}): { len: number; path: [number, number][] } {
  const cell = o.cell ?? 1.5, slope = o.slope ?? 0.5, margin = o.margin ?? 1.1, T = c.terrain, half = (T as any).half as number;
  const n = Math.floor(2 * half / cell), at = (i: number) => -half + (i + 0.5) * cell;
  const circ = c.obstacles.circles, boxes = c.obstacles.boxes;
  const bucket = new Map<number, number[]>(), K = 8;
  circ.forEach((q, k) => { const key = Math.floor((q.x + half) / K) * 1000 + Math.floor((q.z + half) / K); (bucket.get(key) ?? bucket.set(key, []).get(key)!).push(k); });
  const hit = (x: number, z: number): boolean => {
    const bx = Math.floor((x + half) / K), bz = Math.floor((z + half) / K);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const k of bucket.get((bx + a) * 1000 + bz + b) ?? []) { const q = circ[k]; if (Math.hypot(q.x - x, q.z - z) < q.r + margin) return true; }
    for (const q of boxes) {
      const dx = x - q.x, dz = z - q.z, cy = Math.cos(q.yaw), sy = Math.sin(q.yaw), lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
      if (Math.abs(lx) < q.hx + margin && Math.abs(lz) < q.hz + margin) return true;
    }
    return false;
  };
  const bad = new Uint8Array(n * n);
  const tmp: number[] = [0, 0, 0];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = at(i), z = at(j); let b = hit(x, z);
    if (!b) { T.normal(x, z, tmp); if (tmp[1] < 1 / Math.hypot(1, slope)) b = true; }
    if (!b && c.waterAt(x, z) > T.height(x, z) + 0.6) b = true;
    if (!b && !o.mud && c.shallowAt(x, z) > 0.6) b = true;
    if (!b && (Math.abs(x) > half - 12 || Math.abs(z) > half - 12)) b = true;
    bad[j * n + i] = b ? 1 : 0;
  }
  const idx = (x: number, z: number) => Math.min(n - 1, Math.max(0, Math.floor((z + half) / cell))) * n + Math.min(n - 1, Math.max(0, Math.floor((x + half) / cell)));
  const dist = new Float64Array(n * n).fill(Infinity), prev = new Int32Array(n * n).fill(-1);
  const heap: [number, number][] = [];
  const push = (d: number, v: number) => { heap.push([d, v]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const s0 = idx(c.start.x, c.start.z); bad[s0] = 0; dist[s0] = 0; push(0, s0);
  const g = c.goal!, R = o.goalR ?? 7;
  let end = -1;
  while (heap.length) {
    const [d, v] = pop(); if (d > dist[v]) continue;
    const vi = v % n, vj = (v / n) | 0;
    if (Math.hypot(at(vi) - g.x, at(vj) - g.z) < R) { end = v; break; }
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const i = vi + di, j = vj + dj; if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const w = j * n + i; if (bad[w]) continue;
      if (di && dj && (bad[vj * n + i] || bad[j * n + vi])) continue;   // keine Ecken schneiden
      const nd = d + (di && dj ? 1.4142 : 1) * cell; if (nd < dist[w]) { dist[w] = nd; prev[w] = v; push(nd, w); }
    }
  }
  if (end < 0) return { len: Infinity, path: [] };
  const path: [number, number][] = []; for (let v = end; v >= 0; v = prev[v]) path.push([at(v % n), at((v / n) | 0)]);
  return { len: dist[end], path: path.reverse() };
}

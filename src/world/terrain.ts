// Gelände-Mesh und Straßenband.
import * as THREE from 'three';
import type { GridTerrain } from '../physics/terrain';
import type { Course } from '../level';

/** Gelände in 4x4 Blöcken (Sichtkegel-Culling), ein gemeinsames Material. `colors` je Untergrund-Id. */
export function buildTerrainMesh(t: GridTerrain, colors: number[], blocks = 4, surf: Uint8Array = t.surf, sink?: (x: number, z: number) => number): THREE.Group {
  const n = t.n, c = t.cell, cells = n - 1;
  // nur fürs Auge: unter einem Brückendeck liegt das Gelände tiefer, damit es nicht in der Deckebene mitflimmert (Physik nutzt dort das Deck)
  const H = sink ? Float32Array.from(t.h) : t.h;
  if (sink) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] -= sink(i * c - t.half, j * c - t.half);
  const cols = colors.map((h) => new THREE.Color(h));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const group = new THREE.Group();
  const K = Math.ceil(cells / blocks);
  const hash = (i: number, j: number) => ((((i * 374761393) ^ (j * 668265263)) * 1274126177) >>> 0) / 4294967296;
  const patch = (i: number, j: number) => { const S = 6, x = i / S, y = j / S, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };   // weiches Wertrauschen 0..1
  for (let cj = 0; cj < cells; cj += K) for (let ci = 0; ci < cells; ci += K) {
    const ni = Math.min(K, cells - ci), nj = Math.min(K, cells - cj);
    const pos = new Float32Array(ni * nj * 6 * 3), nor = new Float32Array(pos.length), col = new Float32Array(pos.length);
    let o = 0;
    const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number,
                 cx: number, cy: number, cz: number, color: THREE.Color, shade: number) => {
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const P = [ax, ay, az, bx, by, bz, cx, cy, cz];
      for (let k = 0; k < 3; k++) {
        pos[o] = P[k * 3]; pos[o + 1] = P[k * 3 + 1]; pos[o + 2] = P[k * 3 + 2];
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
        col[o] = color.r * shade; col[o + 1] = color.g * shade; col[o + 2] = color.b * shade;
        o += 3;
      }
    };
    for (let j = cj; j < cj + nj; j++) for (let i = ci; i < ci + ni; i++) {
      const x0 = i * c - t.half, z0 = j * c - t.half, x1 = x0 + c, z1 = z0 + c;
      const h00 = H[j * n + i], h10 = H[j * n + i + 1], h01 = H[(j + 1) * n + i], h11 = H[(j + 1) * n + i + 1];
      const color = cols[surf[j * cells + i]] ?? cols[0];
      const shade = (0.94 + 0.06 * ((((i * 73856093) ^ (j * 19349663)) >>> 0) % 7) / 6) * (0.955 + 0.09 * patch(i, j));   // feines Pixel-Rauschen + flächige Farbvariation
      // gleiche Teilung wie die Physik: (00,10,01) und (10,11,01)
      tri(x0, h00, z0, x0 + 0, h01, z1, x1, h10, z0, color, shade);
      tri(x1, h10, z0, x0, h01, z1, x1, h11, z1, color, shade);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(new THREE.Mesh(g, mat));
  }
  return group;
}

/** Straße als glattes Band entlang der Strecke (liegt knapp über der Physikhöhe, 1 Draw Call); unter dem Brückendeck ausgespart. */
export function buildRoadMesh(course: Course): THREE.Mesh | null {
  const at = course.roadSurfAt;
  if (!at) return null;
  const R = course.route, T = course.terrain, half = course.roadWidth / 2, br = course.bridge, Y = 0.03;
  const beach = course.world === 'beach';
  // Strand: dunklere Fahrspur – Rand etwas dunkler als der Sand, zwei Reifenspuren ±1 m (am dunkelsten), Mittelrücken heller; Holz unverändert
  const LATS = beach ? [-1, -1, -0.5, -0.2, 0, 0.2, 0.5, 1, 1] : [-1, -1, -0.5, 0, 0.5, 1, 1], BAY = beach ? [1, 0, 0, 0, 0, 0, 0, 0, 1] : [1, 0, 0, 0, 0, 0, 1];
  const FAC = [1, 0.84, 0.7, 0.5, 0.66, 0.5, 0.7, 0.84, 1];
  const W = LATS.length + 2, pos: number[] = [], col: number[] = [], idx: number[] = [], bayC = new THREE.Color(course.surfaceColors[0] ?? 0x4b4e57);
  let prev = false;
  const n = Math.ceil(R.length / 2);
  for (let i = 0; i <= n; i++) {
    const s = R.length * i / n;
    const skip = br !== null && s > br.s0 + 0.5 && s < br.s1 - 0.5;
    if (skip) { prev = false; continue; }
    const sf = at(s), c = new THREE.Color(course.surfaceColors[sf.id] ?? 0x4b4e57), base = pos.length / 3, wood = sf.name === 'Holz';
    const eL = course.bayExt(s, -1), eR = course.bayExt(s, 1);      // Ausweichbuchten: zwei Randstreifen (Breite 0 = ausgeblendet), Bucht-Belag Asphalt
    const lats = [-half - eL, ...LATS.map((u) => u * half), half + eR], bay = [1, ...BAY, 1];
    lats.forEach((l, k) => { const [x, z] = R.offset(s, l); pos.push(x, T.height(x, z) + Y, z); const cc = bay[k] ? bayC : c; const f = beach && !wood && !bay[k] ? FAC[k - 1] ?? 1 : 1; col.push(cc.r * f, cc.g * f, cc.b * f); });
    if (prev) for (let k = 0; k + 1 < W; k++) { const a = base - W + k; idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1); }
    prev = true;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.frustumCulled = false; return m;
}

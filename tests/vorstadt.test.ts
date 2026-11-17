// Vorstadt: Straßennetz (Kreuzungen, Breiten, Höhen) + Rundkurs als Pfad im Netz, Bot mit allen Autos, Nebenstraße und zurück, kein Abkürzen.
import { describe, it, expect } from 'vitest';
import { WORLDS } from '../src/levels';
import { CARS } from '../src/physics/params';
import { driveBot } from '../tools/bot';
import { Route, Tracker, timeBudgetFor, type Course } from '../src/level';
import { Checkpoints, Run, ARROW_DELAY } from '../src/run';
import { edgeNormal, EdgeGuard } from '../src/edge';
import { Vehicle, DT } from '../src/physics/vehicle';

const lv = WORLDS.find((w) => w.id === 'vorstadt')!.levels[0];
const c = lv.make(), net = c.net!;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const N = (id: string) => net.nodes.get(id)!;
const LOOP = ['x_hu', 'x_bu', 'x_du', 'x_dh', 'x_do', 'x_oz', 'x_of', 'x_fu', 'x_su', 'x_hu'];

/** Kurs auf einem Netzpfad (eigene Route statt der Rennstrecke) – wie ein Spieler, der abbiegt */
function pathCourse(ids: string[]): Course {
  const route = new Route(net.path(ids).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1));
  const p = route.at(6), g = route.at(route.length - 8);
  return { ...c, route, length: route.length, start: { x: p.x, z: p.z, yaw: route.yawAt(6) }, goal: { s: route.length - 8, x: g.x, z: g.z, yaw: route.yawAt(route.length - 8) }, stars: [], bridgeSpans: [], bridge: null, tunnels: [], hints: { cp: [], arrow: [] } } as Course;
}

describe('Vorstadt: Straßennetz', () => {
  it('eine Strecke „Runde“', () => {
    expect(WORLDS.find((w) => w.id === 'vorstadt')!.levels.map((l) => l.id)).toEqual(['etappe_vorstadt']);
  });

  it('zusammenhängend, keine Stummel: Sackenden nur am Rand der Welt', () => {
    const seen = new Set<string>(), q = [[...net.nodes.keys()][0]];
    while (q.length) { const id = q.pop()!; if (seen.has(id)) continue; seen.add(id); for (const e of N(id).edges) q.push((e.end === 0 ? e.edge.b : e.edge.a).id); }
    expect(seen.size).toBe(net.nodes.size);
    // Sackgassen enden am Rand: gleich dahinter beginnt der Rand der Welt (Auto wird zurückgesetzt)
    for (const n of net.nodes.values()) if (n.edges.length === 1) { const [dx, dz] = n.dirOut(n.edges[0]); expect(edgeNormal(c.edge!, n.x - dx * 3, n.z - dz * 3), n.id).not.toBeNull(); expect(edgeNormal(c.edge!, n.x + dx * 6, n.z + dz * 6), n.id + ' Ende liegt am Rand, nicht davor').toBeNull(); }
  });

  it('Kreuzungen sind echt: ≥ 3 Arme, mindestens eine durchlaufende Fahrbahn, Asphaltfläche, 4-Wege an den Skizzenpunkten', () => {
    expect(net.junctions.length).toBeGreaterThanOrEqual(10);
    for (const n of net.junctions) {
      const d = n.edges.map((e) => n.dirOut(e)); let through = false;
      for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) if (d[i][0] * d[j][0] + d[i][1] * d[j][1] < -0.85) through = true;
      expect(through, n.id).toBe(true);
      expect(net.surfAt(n.x, n.z), n.id).toBe('Asphalt');
      for (const e of n.edges) { const q = e.edge.at(e.end === 0 ? n.cutOf(e.edge) + 1 : e.edge.length - n.cutOf(e.edge) - 1); expect(net.onRoad(q.x, q.z, 0), n.id + ' Arm').toBe(true); expect(n.cutOf(e.edge), n.id + ' Schnitt').toBeLessThan(e.edge.length / 2); }
    }
    for (const id of ['x_do', 'x_du', 'x_hs', 'x_hu', 'x_of']) expect(N(id).edges.length, id).toBe(4);
    for (const id of ['x_dh', 'x_bu', 'x_su', 'x_fu']) expect(N(id).edges.length, id).toBe(3);
  });

  it('Breiten: Damm 4-spurig > obere > untere > Wohnstraße > Fußweg; Fußweg Schotter + Matsch, keine Autos dort', () => {
    const w = (k: string) => Math.max(...net.edges.filter((e) => e.def.kind === k).map((e) => e.def.w));
    expect(w('damm')).toBeGreaterThanOrEqual(15); expect(w('obere')).toBeGreaterThanOrEqual(11); expect(w('damm')).toBeGreaterThan(w('obere'));
    expect(w('obere')).toBeGreaterThanOrEqual(w('untere')); expect(w('untere')).toBeGreaterThan(w('wohn')); expect(w('wohn')).toBeGreaterThan(w('fuss'));
    const f = net.edges.find((e) => e.def.kind === 'fuss')!; expect(f.def.surf).toBe('Schotter'); expect(f.def.zones!.some((z) => z[2] === 'Matsch')).toBe(true);
    const mid = f.at(f.def.zones!.find((z) => z[2] === 'Matsch')![0] + 5);
    expect(c.terrain.surface(mid.x, mid.z).name).toBe('Matsch');
  });

  it('Höhen: untere Straße ~6 % bergauf zum Damm, Damm → obere Straße → Au gleichmäßig fallend, Au-Niederung eben, Fußweg sanft wellig, Brücken ebenerdig + schlicht', () => {
    const slope = (a: string, b: string) => { const e = net.between(a, b)!.edge; return Math.abs(N(a).y - N(b).y) / e.length; };
    const up = (slope('x_hu', 'x_bu') * net.between('x_hu', 'x_bu')!.edge.length + slope('x_bu', 'x_du') * net.between('x_bu', 'x_du')!.edge.length) / (net.between('x_hu', 'x_bu')!.edge.length + net.between('x_bu', 'x_du')!.edge.length);
    expect(up).toBeGreaterThan(0.05); expect(up).toBeLessThan(0.07);
    const fall = ['x_du', 'x_dh', 'x_do', 'x_oz', 'x_of'].map((id) => N(id).y); for (let i = 0; i + 1 < fall.length; i++) expect(fall[i], 'Damm/obere fällt').toBeGreaterThan(fall[i + 1]);
    expect(N('x_fu').y).toBeLessThan(N('x_su').y); expect(N('x_su').y).toBeLessThan(N('x_hu').y); expect(N('x_hu').y - N('x_fu').y).toBeLessThan(2.5);
    for (const id of ['x_fu', 'x_of']) expect(N(id).y, id).toBeLessThan(0.6);
    const f = net.edges.find((e) => e.def.kind === 'fuss')!; let worst = 0, lo = 9; for (let s = 20; s < f.length - 20; s += 2) { worst = Math.max(worst, Math.abs(f.elev(s + 2) - 2 * f.elev(s) + f.elev(s - 2)) / 4); lo = Math.min(lo, f.elev(s)); }
    expect(worst, 'Fußweg: keine kurzen Buckel (Krümmung 1/m)').toBeLessThan(0.012); expect(lo).toBeLessThan(-0.3);
    expect(c.bridges.length).toBe(2);
    for (const b of c.bridges) { expect(b.def.plain).toBe(true); expect(b.def.wood).toBeFalsy(); expect(Math.abs(b.deckY(b.def.s) - (b.deckY(b.s0) + b.deckY(b.s1)) / 2), 'kein Buckel').toBeLessThan(0.05); }
  });

  it('Ampeln an den großen Ecken; ohne nur mittlere Schleife + Straße jenseits der Au; keine Kreisel-Scheiben', () => {
    expect(net.junctions.filter((n) => n.signal).map((n) => n.id).sort()).toEqual(['x_do', 'x_du', 'x_hu', 'x_oz']);
    for (const id of ['x_dh', 'x_hs', 'x_bu', 'x_su', 'x_of', 'x_fu']) expect(N(id).signal, id).toBe(false);
    expect(net.edge('quer.1').def.ped?.[0]).toBeGreaterThan(net.edge('quer.1').a.cutOf(net.edge('quer.1')));   // Fußgängerampel südlich von x_hs
    for (const n of net.junctions) { const r = n.poly.map((p) => Math.hypot(p[0] - n.x, p[1] - n.z)); expect(Math.max(...r) / Math.min(...r), n.id + ' nicht kreisrund').toBeGreaterThan(1.1); }
  });

  it('Kreuzungen: Arm-Schnitte bündig am Umriss, keine überlappenden Arme, Umriss ohne Selbstüberschneidung', () => {
    for (const n of net.junctions) {
      expect(n.poly.length, n.id).toBeGreaterThanOrEqual(2 * n.edges.length);
      for (const e of n.edges) { const q = e.edge.at(e.end === 0 ? n.cutOf(e.edge) : e.edge.length - n.cutOf(e.edge)); expect(n.polyDist(q.x, q.z), n.id + ' Schnittmitte auf dem Umriss').toBeLessThan(0.6); }
      let area = 0; for (let i = 0; i < n.poly.length; i++) { const a = n.poly[i], b = n.poly[(i + 1) % n.poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
      expect(Math.abs(area) / 2, n.id + ' Fläche').toBeGreaterThan(30);
    }
    for (const e of net.edges) expect(e.a.cutOf(e) + e.b.cutOf(e), e.id).toBeLessThan(e.length - 2);
  });
});

describe('Vorstadt: Rennstrecke (Pfad im Netz)', () => {
  it('Rundkurs 2,1–2,5 km, Start = Ziel an der Startkreuzung, ganz auf Straße, Knoten in Reihenfolge, Au zweimal über Brücken', () => {
    expect(c.length).toBeGreaterThan(2100); expect(c.length).toBeLessThan(2500);
    expect(dist(c.start, c.goal!)).toBeLessThan(40); expect(dist(c.start, N('x_hu'))).toBeLessThan(45);
    for (let s = 0; s <= c.length; s += 2) { const p = c.route.at(s); expect(net.onRoad(p.x, p.z), 's' + s).toBe(true); }
    let s0 = 0; for (const id of LOOP.slice(0, -1)) { let best = 1e9, bs = s0; for (let s = s0; s <= c.length; s += 1) { const d = dist(c.route.at(s), N(id)); if (d < best) { best = d; bs = s; } if (d > 40 && best < 11) break; } expect(best, id).toBeLessThan(11); expect(bs, id).toBeGreaterThanOrEqual(s0); s0 = bs; }
    expect(c.bridgeSpans.length).toBe(2); for (const [a, b] of c.bridgeSpans) expect(b - a).toBeGreaterThan(15);
    const used = new Set<string>(); for (let s = 0; s < c.length; s += 3) used.add(c.roadSurfAt!(s).name);
    for (const n of ['Asphalt', 'Schotter', 'Matsch']) expect(used.has(n), n).toBe(true);
  });

  it('Bot (alle Autos, mit Verkehr) fährt die Runde ohne verpasste Checkpoints, 1,2–2,5 min, im Zeitkonto', () => {
    for (const [cid, P] of Object.entries(CARS)) {
      const r = driveBot(c, P, { traffic: true });
      expect(r.finished, `${cid} @${Math.round(r.s)}`).toBe(true);
      expect(r.cpLeft, cid).toBe(0); expect(r.flips, cid).toBe(0); expect(r.drowned, cid).toBe(0);
      expect(r.time, cid).toBeGreaterThan(70); expect(r.time, cid).toBeLessThan(150); expect(r.time * 1.15, cid).toBeLessThan(timeBudgetFor(c, cid));
    }
  }, 240000);

  it('von der Strecke in eine Nebenstraße und zurück: Wohnstraße, Kreuzung, T-Einmündung, wieder auf den Damm', () => {
    const c2 = pathCourse(['x_hu', 'x_bu', 'x_hs', 'x_dh', 'x_do']);
    let off = 0;
    const r = driveBot(c2, CARS.hatch, { onStep: (car) => { if (!net.onRoad(car.pos[0], car.pos[2], 1.5)) off++; } });
    expect(r.finished, 'Ziel @' + Math.round(r.s)).toBe(true); expect(off).toBe(0); expect(r.flips).toBe(0);
    const e = c2.route.at(c2.length - 10), h = net.nearest(e.x, e.z)!; expect(h.edge.def.kind).toBe('damm');
  }, 60000);

  it('Abkürzen durchs Netz geht nicht: Checkpoints bleiben offen', () => {
    const cps = new Checkpoints(c), tr = new Tracker(c.route), P = net.path(['x_hu', 'x_hs', 'x_dh', 'x_do', 'x_oz', 'x_of', 'x_fu', 'x_su', 'x_hu']);
    for (const [x, z] of P) { tr.update(x, z); cps.update(x, z, tr.maxS); }
    expect(cps.all).toBe(false); expect(cps.missed(tr.maxS)).toBeGreaterThanOrEqual(0);
  });
});

describe('Vorstadt: Ampeln am Netz', () => {
  const sg = c.signals!;
  const SIG = ['x_do', 'x_du', 'x_hu', 'x_oz'];
  it('jede Zufahrt jedes Ampelknotens hat ein Signal rechts neben der Spur, vor dem Knoten', () => {
    for (const id of SIG) {
      const arms = sg.armsOf(id); expect(arms.length, id).toBe(N(id).edges.length);
      for (const h of arms) {
        const toNode = Math.hypot(h.lx - N(id).x, h.lz - N(id).z); expect(toNode, id + ' Haltelinie vor der Kreuzung').toBeGreaterThan(N(id).cutOf(h.edge) + 1);
        const rel = [h.x - h.lx, h.z - h.lz]; expect(rel[0] * h.rx + rel[1] * h.rz, id + ' Mast rechts').toBeGreaterThan(h.half);
        expect(h.tx * (N(id).x - h.lx) + h.tz * (N(id).z - h.lz), id + ' Fahrtrichtung zum Knoten').toBeGreaterThan(0);
      }
    }
    expect(sg.heads.filter((h) => !h.ped).length).toBe(SIG.reduce((a, id) => a + N(id).edges.length, 0));
  });
  it('kreuzende Richtungen sind nie gleichzeitig grün (auch nicht gelb gegen grün); jede Gruppe wird grün; vor dem Start alles rot', () => {
    for (const id of SIG) {
      const arms = sg.armsOf(id), seenGreen = new Set<number>();
      for (let t = 0; t < 400; t += 0.25) {
        const open = arms.filter((h) => sg.phase(id, h.edge, t) < 2);
        for (const a of open) { seenGreen.add(a.group); for (const b of open) expect(a.group, `${id} t${t}`).toBe(b.group); }
        for (const a of open) for (const b of open) expect(Math.abs(a.tx * b.tz - a.tz * b.tx), `${id} t${t} quer`).toBeLessThan(0.62);
        for (const h of arms) expect(sg.phaseOf(h.k, t)).toBe(sg.phase(id, h.edge, t));
      }
      expect(seenGreen.size, id).toBe(sg.groupsOf(id)); expect(sg.groupsOf(id), id).toBeGreaterThanOrEqual(2);
      for (const h of arms) expect(sg.phase(id, h.edge, -1)).toBe(2);
    }
  });
  it('Start: die Zufahrt von der Startampel her ist bei GO grün und bleibt es, bis der Spieler durch ist', () => {
    const h = sg.head('x_hu', net.between('x_hu', 'x_su')!.edge, -1)!;
    for (let t = 0; t < 9; t += 0.5) expect(sg.phaseOf(h.k, t), 't' + t).toBe(0);
  });
  it('Fußgängerampel südlich x_hs: Mast + Haltelinie in beide Richtungen, für Autos meist grün, kurz rot', () => {
    const ped = sg.heads.filter((h) => h.ped); expect(ped.length).toBe(2); expect(ped[0].dir).toBe(-ped[1].dir); expect(ped[0].edge.id).toBe('quer.1');
    let red = 0, n = 0; for (let t = 0; t < 470; t += 0.5, n++) { if (sg.phaseOf(ped[0].k, t) === 2) red++; expect(sg.phaseOf(ped[0].k, t)).toBe(sg.phaseOf(ped[1].k, t)); }
    expect(red / n).toBeGreaterThan(0.05); expect(red / n).toBeLessThan(0.3);
  });
});

describe('Vorstadt: Au-Abzweig', () => {
  const xo = N('x_of'), sOf = (() => { let b = 0, bd = 1e9; for (let s = 0; s < c.length; s += 0.5) { const p = c.route.at(s), d = dist(p, xo); if (d < bd) { bd = d; b = s; } } return b; })();
  it('Checkpoint kurz vor dem Bogen, 4 Sterne im Bogen, Pfeilzone', () => {
    const cps = new Checkpoints(c), before = cps.list.filter((q) => q.s < sOf && q.s > sOf - 60);
    expect(before.length, 'ein Checkpoint 15–35 m vor dem Abzweig').toBe(1); expect(sOf - before[0].s).toBeGreaterThan(15); expect(sOf - before[0].s).toBeLessThan(35);
    expect(cps.list.filter((q) => q.s >= sOf - 20 && q.s <= sOf + 60).length).toBe(0);
    const inArc = c.stars.filter(([x, z]) => dist({ x, z }, xo) < 26);
    expect(inArc.length).toBeGreaterThanOrEqual(3); expect(inArc.length).toBeLessThanOrEqual(4);
    for (const [x, z] of inArc) expect(net.onRoad(x, z, 0.5), 'Stern auf der Fahrbahn').toBe(true);
  });
  it('Verpasst man die Abzweigung (geradeaus auf der Oberen), kommt der Pfeil schon nach < 1,6 s – anderswo (hier: Obere vor der Brücke, quer weg) erst nach ~2 s', () => {
    const arrowAfter = (s0: number): number => {   // Route bis s0 sauber abfahren (Checkpoints), dann geradeaus weiter
      const run = new Run(c, 'time'), v = 12, dt = 1 / 60;
      for (let s = 1; s < s0; s += v * dt) { const a = c.route.at(s); run.update(dt, a.x, a.z, true, a.dx * v, a.dz * v); }
      const a = c.route.at(s0); expect(run.arrowOn, 'auf Kurs kein Pfeil').toBe(false);
      for (let t = 0; t < 5; t += dt) { run.update(dt, a.x + a.dx * v * t, a.z + a.dz * v * t, true, a.dx * v, a.dz * v); if (run.arrowOn) return t; }
      return 5;
    };
    const tAu = arrowAfter(sOf - 12), tElse = arrowAfter(1250);   // 300: gerade Strecke, quer weg
    expect(tAu).toBeLessThan(1.6); expect(tElse).toBeGreaterThan(ARROW_DELAY - 0.2);
  });
});

describe('Vorstadt: enger Rand', () => {
  // Wer an einer Ecke der Runde die Einbiegung verpasst, kommt an keine weitere Kreuzung: die Straße geradeaus endet am Rand (Sackgasse nach höchstens ~65 m)
  const ROUTE_NODES = ['x_do', 'x_du', 'x_of', 'x_fu'], onRoute = new Set(['damm.2', 'damm.3', 'obere.1', 'obere.2', 'untere.1', 'untere.4', 'fuss.0']);
  it('jede Straße, die an den Ecken x_do/x_du/x_of/x_fu von der Runde weiterführt, ist eine kurze Sackgasse am Rand', () => {
    let n = 0;
    for (const id of ROUTE_NODES) for (const e of N(id).edges) {
      if (onRoute.has(e.edge.id)) continue;
      const far = e.end === 0 ? e.edge.b : e.edge.a; n++;
      expect(far.edges.length, `${id} → ${e.edge.id} endet nicht in einer Sackgasse`).toBe(1);
      expect(e.edge.length, `${id} → ${e.edge.id} zu lang`).toBeLessThan(75); expect(e.edge.length, `${id} → ${e.edge.id} zu kurz`).toBeGreaterThan(35);
    }
    expect(n).toBeGreaterThanOrEqual(6);
  });
  it('am Damm geradeaus an der Einbiegung (x_do) vorbei: Rand (Kran) kommt, bevor die nächste Kreuzung erreicht ist', () => {
    const guard = new EdgeGuard(c.edge!), e = N('x_do').edges.find((q) => q.edge.id === 'damm.1')!, d = N('x_do').dirOut(e);
    const car = new Vehicle(CARS.rally, c.terrain); car.allowSleep = false; car.reset(N('x_do').x, N('x_do').z, Math.atan2(-d[0], -d[1])); car.launch(15);
    let out: [number, number] | null = null, fired = false;
    for (let k = 0; k < 10 / DT && !fired; k++) { car.step({ steer: 0, throttle: 1, brake: 0, handbrake: false }, DT); if (!out && edgeNormal(c.edge!, car.pos[0], car.pos[2])) out = [car.pos[0], car.pos[2]]; fired = guard.step(car, DT).fire; }
    expect(out, 'Rand erreicht').not.toBeNull(); expect(fired, 'Kran kommt').toBe(true);
    expect(Math.hypot(out![0] - N('x_do').x, out![1] - N('x_do').z), 'Abstand zur Ecke').toBeLessThan(65);
  });
  it('Netz, Gelände und Rand sind enger als früher (Gelände ≤ 490 m, Netz < 5 km)', () => {
    expect((c.terrain as unknown as { half: number }).half).toBeLessThan(490);
    expect(net.edges.reduce((a, q) => a + q.length, 0)).toBeLessThan(5000);
  });
});
